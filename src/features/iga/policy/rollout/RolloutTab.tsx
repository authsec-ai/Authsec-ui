/**
 * A policy's Rollout tab (SPEC-iga-phase3-policy.md §9.3 S5 "Rollout", §8.4,
 * §8.6): where the rollout is, what the canary gates say, and what a person can
 * do now.
 *
 * Stages: observe, awaiting approval, canary, expand, complete (plus partial
 * and paused), the current one marked in words. `404 rollout_not_started` is
 * "Not started", never a failure. Gates carry their evidence and their
 * `not_available` reason; one that AuthSec cannot evaluate must be accepted
 * (which gate, and why) before expanding. Actions come from the server's
 * `actions` list and are hidden when the server refused governance:enforce.
 * The result is per target: Partial is stated as Partial, never as success.
 *
 * Usage: `<RolloutTab ws={ws} policyId={policy.id} />`
 */

import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { useGetGovPolicyQuery } from "@/app/api/igaPolicyAuthoringApi";
import {
  useGetGovRolloutQuery,
  useListGovDeploymentsQuery,
  type GovCanaryGate,
  type GovGateResult,
  type GovRolloutStage,
  type GovRolloutView,
} from "@/app/api/igaPolicyDeploymentsApi";
import { DecisionBanner } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { cn } from "@/lib/utils";

import { PolicyLoadFailure, POLICY_ERROR_COPY, StateChip, classifyPolicyError, deploymentState, humanize, plural, roleNameOf, rolloutStage, usePolicyPermission } from "../shared";
import { useMemberNames } from "../policies/useMemberNames";
import { UndoDialog } from "../deployments/UndoDialog";
import {
  GATE_WORDS,
  ROLLOUT_STEPS,
  UNEVALUATED_GATES,
  clock,
  deploymentHref,
  gateLabel,
  gateOutcome,
  pauseWords,
  reasonWords,
} from "../deployments/deploymentModel";
import { ExpandDialog, ReasonDialog, StartDialog } from "./RolloutDialogs";

const STEP_LABEL: Record<string, string> = {
  observe: "Observe",
  awaiting_approval: "Awaiting approval",
  canary: "Canary",
  expand: "Expand",
  complete: "Complete",
};

/** Where in the five steps a stage sits; -1 for none (undone). */
function stepIndex(view: GovRolloutView): number {
  const stage = view.rollout.stage as GovRolloutStage | "";
  const at = stage === "paused" ? (view.results.pause?.from ?? "") : stage;
  if (at === "partial") return ROLLOUT_STEPS.indexOf("complete");
  if (at === "") return stage === "paused" ? 0 : -1;
  return ROLLOUT_STEPS.indexOf(at as (typeof ROLLOUT_STEPS)[number]);
}

function Stepper({ view }: { view: GovRolloutView }) {
  const current = stepIndex(view);
  const stage = view.rollout.stage;
  return (
    <ol aria-label="Rollout stages" className="grid gap-2 sm:grid-cols-5">
      {ROLLOUT_STEPS.map((s, i) => {
        const here = i === current;
        const done = current >= 0 && i < current;
        const label = s === "complete" && stage === "partial" ? "Partial" : STEP_LABEL[s];
        const status = here ? (stage === "paused" ? "Paused here" : stage === "partial" ? "Ended partial" : "Current") : done ? "Done" : "Not reached";
        return (
          <li
            key={s}
            aria-current={here ? "step" : undefined}
            className={cn(
              "rounded-md border px-3 py-2",
              here ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-subtle) bg-(--color-surface-raised)",
            )}
          >
            <p className="text-[13px] font-medium">
              {i + 1}. {label}
            </p>
            <p className="text-xs text-(--color-text-muted)">{status}</p>
          </li>
        );
      })}
    </ol>
  );
}

function GateList({ gates, accepted }: { gates: GovGateResult[]; accepted: GovCanaryGate[] }) {
  return (
    <ul className="divide-y divide-(--color-border-subtle)">
      {gates.map((g) => {
        const isAccepted = accepted.includes(g.gate);
        const view = isAccepted ? { label: "Accepted by an approver", tone: "success" as const, hint: "AuthSec could not evaluate this; an approver accepted it with a reason." } : gateOutcome(g.outcome);
        const needsAccepting = g.outcome === "not_available" && !isAccepted;
        return (
          <li key={g.gate} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-[11rem] text-[13px] font-medium">{gateLabel(g.gate)}</span>
              <StateChip state={view} />
              {needsAccepting ? <span className="text-xs font-medium text-(--color-warning-text)">Needs accepting to expand</span> : null}
            </div>
            <p className="text-xs text-(--color-text-muted)">{GATE_WORDS[g.gate]?.checks}</p>
            {g.reason ? <p className="text-[13px]">{reasonWords(g.reason)}</p> : null}
            {g.evidence && g.evidence.length > 0 ? (
              <details className="text-xs">
                <summary className="cursor-pointer text-(--color-text-muted) hover:text-(--color-text)">Evidence ({g.evidence.length})</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-(--color-text-muted)">
                  {g.evidence.map((e, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      {e}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The one sentence of what is happening and what comes next. */
function stageSentence(view: GovRolloutView): string {
  const r = view.rollout;
  switch (r.stage) {
    case "observe":
      return r.observe_until
        ? `Observing until ${clock(r.observe_until)}. Nothing has changed in AWS. If a service marked for removal is attempted, the version goes back to draft.`
        : "Observing. Nothing has changed in AWS.";
    case "awaiting_approval":
      return "Observation is complete. Start the canary to change the first role; nothing else is touched until its gates pass.";
    case "canary":
      return "The canary is running. Expansion waits for every gate to pass; a gate AuthSec cannot evaluate needs an approver.";
    case "expand":
      return "Expanding: the remaining roles are being deployed. Each role's result is below.";
    case "complete":
      return "The rollout is complete. The state of each role is below.";
    case "partial":
      return "Partial: some roles were verified and others failed or were blocked. This is not a success; see each role below.";
    case "paused":
      return view.results.pause ? pauseWords(view.results.pause.kind) : "Paused.";
    case "undone":
      return "Every role's latest change was undone. Other controls may still restrict these roles.";
    default:
      return "This version removes AuthSec's control: there is no observation or canary. The removal deployments are below.";
  }
}

export function RolloutTab({ ws, policyId }: { ws: string; policyId: string }) {
  const [live, setLive] = useState(false);
  const query = useGetGovRolloutQuery({ ws, policyId }, { pollingInterval: live ? 30_000 : 0, skipPollingIfUnfocused: true });
  const policy = useGetGovPolicyQuery({ ws, policyId });
  const deps = useListGovDeploymentsQuery({ ws, policy_id: policyId, limit: 200 });
  const nameOf = useMemberNames(ws);
  const enforce = usePolicyPermission("governance:enforce");

  const [dialog, setDialog] = useState<"start" | "expand" | "pause" | "resume" | "undo" | null>(null);

  const view = query.data;
  const stage = view?.rollout.stage;
  useEffect(() => setLive(stage === "observe" || stage === "canary" || stage === "expand"), [stage]);

  const failure = classifyPolicyError(query.error);
  const notStarted = !view && failure?.code === "rollout_not_started";

  const roleNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of policy.data?.controls ?? []) m.set(c.role_id, roleNameOf(c.role_arn) || c.role_id);
    for (const t of policy.data?.current_version?.targets ?? []) m.set(t.role_id, roleNameOf(t.role_arn) || t.role_id);
    for (const d of deps.data?.data ?? []) if (!m.has(d.role_id)) m.set(d.role_id, roleNameOf(d.role_arn) || d.role_id);
    return m;
  }, [policy.data, deps.data]);
  const roleName = (id: string) => roleNames.get(id) ?? `Role ${id.slice(0, 8)}`;
  const targetCount = policy.data?.current_version?.targets.length;

  if (failure && !view && !notStarted) {
    return <PolicyLoadFailure failure={failure} subject="the rollout" onRetry={() => void query.refetch()} />;
  }
  if (query.isLoading) {
    return (
      <p role="status" className="text-sm text-(--color-text-muted)">
        Loading the rollout…
      </p>
    );
  }

  /* ------------------------------ not started ------------------------------ */
  if (notStarted || !view) {
    return (
      <div className="space-y-4">
        <Panel title="Not started">
          <div className="space-y-3">
            <p className="text-[13px]">
              This policy has no rollout yet. Starting it begins observation: AuthSec watches the roles&apos; activity first, and nothing changes in AWS.
              After observation and approval, a canary role is changed first, then the rest.
            </p>
            <Meta>The version must be in review or approved, with its owner review complete.</Meta>
            {enforce.offered ? <Button onClick={() => setDialog("start")}>Start the rollout</Button> : <Meta>Your role cannot start a rollout.</Meta>}
          </div>
        </Panel>
        <StartDialog policyId={policyId} variant="observe" open={dialog === "start"} onOpenChange={(o) => !o && setDialog(null)} />
      </div>
    );
  }

  /* -------------------------------- started -------------------------------- */
  const r = view.rollout;
  const g = view.results;
  const canary = g.canary;
  const actions = enforce.refused ? [] : view.actions;
  const canaryDep = view.deployments.find((d) => d.canary);
  const canaryRole = canaryDep ? roleName(canaryDep.role_id) : undefined;
  const gates = canary ? (canary.gates.length > 0 ? canary.gates : UNEVALUATED_GATES) : [];
  const accepted = canary?.accepted ?? [];
  const verified = view.deployments.filter((d) => d.state === "verified").length;
  const trouble = view.deployments.filter((d) => ["failed", "blocked", "drifted", "outcome_unresolved"].includes(d.state)).length;
  const obs = g.observation?.result;
  const gateAcceptances = view.acceptances.filter((a) => a.kind === "gate_not_available");
  const undoOffer = g.undo_offered?.[0];
  const undoRow = undoOffer ? deps.data?.data.find((d) => d.id === undoOffer.deployment_id) : undefined;
  const bannerTone = r.stage === "partial" ? "warning" : r.stage === "paused" ? "warning" : r.stage === "complete" ? "success" : "info";

  return (
    <div className="space-y-4">
      <DecisionBanner
        tone={bannerTone}
        title={`${r.stage ? rolloutStage(r.stage).label : "Removal of AuthSec control"} · version ${view.version_no}`}
        body={stageSentence(view)}
      />

      {r.stage ? <Stepper view={view} /> : null}

      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions.includes("start") ? <Button onClick={() => setDialog("start")}>Start the canary</Button> : null}
          {actions.includes("expand") ? <Button onClick={() => setDialog("expand")}>{targetCount === 1 ? "Complete the rollout" : "Expand"}</Button> : null}
          {actions.includes("resume") ? <Button onClick={() => setDialog("resume")}>Resume</Button> : null}
          {actions.includes("undo_canary") ? (
            <Button variant="outline" disabled={!undoRow} onClick={() => setDialog("undo")} title={undoRow ? undefined : "This deployment is not in the lists read here. Open it from Deployments to undo it."}>
              Undo canary
            </Button>
          ) : null}
          {actions.includes("pause") ? (
            <Button variant="outline" onClick={() => setDialog("pause")}>
              Pause
            </Button>
          ) : null}
        </div>
      ) : null}

      {g.pause ? (
        <Panel title="Paused">
          <Facts>
            <Fact label="Why">{pauseWords(g.pause.kind)}</Fact>
            {g.pause.reason ? <Fact label="Reason">{g.pause.reason}</Fact> : null}
            <Fact label="When">
              <Timestamp iso={g.pause.at} />
              {g.pause.from ? ` · while ${humanize(g.pause.from).toLowerCase()}` : ""}
            </Fact>
          </Facts>
          {g.pause.kind === "returned_to_draft" ? (
            <Meta className="mt-2">Edit the policy to create a new version and propose it again; this version cannot continue.</Meta>
          ) : null}
        </Panel>
      ) : null}

      {r.observe_until || obs ? (
        <Panel title="Observation" description="Nothing changes in AWS while AuthSec observes.">
          <Facts>
            {r.observe_until ? (
              <Fact label="Observation ends">
                {clock(r.observe_until)} (<Timestamp iso={r.observe_until} />)
              </Fact>
            ) : null}
            {r.observe_evidence_required_after ? (
              <Fact label="Fresh report needed">
                An activity report generated after {clock(r.observe_evidence_required_after)} for every role
              </Fact>
            ) : null}
            {obs ? (
              <Fact label="Result">
                {obs.complete
                  ? "Complete: the period has passed and every role has a fresh report."
                  : obs.awaiting_report.length > 0
                    ? `Waiting for a fresh report for ${plural(obs.awaiting_report.length, "role")}: ${obs.awaiting_report.map(roleName).join(", ")}.`
                    : "Not complete: the observation period has not ended."}
                {obs.needs_refresh ? " AuthSec is refreshing activity." : ""}
              </Fact>
            ) : null}
            {obs && obs.back_to_draft.length > 0 ? (
              <Fact label="Attempted">
                {obs.back_to_draft.map((a) => `${a.service} on ${roleName(a.role_id)} (${clock(a.at)})`).join("; ")}: a removed service was attempted, so the version goes back to draft.
              </Fact>
            ) : null}
          </Facts>
          <Meta className="mt-2">
            Observation ends when the period has passed and every role has an activity report generated four hours after it, so a report from before the
            last hours cannot count as covering them.
          </Meta>
        </Panel>
      ) : null}

      {canary ? (
        <Panel
          title={`Canary${canaryRole ? ` · ${canaryRole}` : ""}`}
          description="Each gate is its own evidence. A gate that has not been evaluated yet is not a failure; one AuthSec cannot evaluate needs an approver to accept it."
          flush
          actions={<StateChip state={deploymentState(canary.state)} />}
        >
          <div className="space-y-1 border-b border-(--color-border-subtle) px-4 py-3">
            <Facts>
              {canary.window_start && canary.window_end ? (
                <Fact label="Canary window">
                  {clock(canary.window_start)} to {clock(canary.window_end)}
                </Fact>
              ) : (
                <Fact label="Canary window">Starts when the canary is applied</Fact>
              )}
              <Fact label="Last evaluated">
                <Timestamp iso={canary.evaluated_at} />
                {canary.rev ? ` · scan revision ${canary.rev}` : ""}
              </Fact>
              <Fact label="Gates">{canary.pass ? "All gates pass" : "Not all gates pass yet"}</Fact>
            </Facts>
            {canaryDep ? (
              <p className="pt-1 text-xs">
                <Link to={deploymentHref(canaryDep.id, policyId)} className="font-medium text-(--color-primary-text) hover:underline">
                  Open the canary deployment
                </Link>
              </p>
            ) : null}
          </div>
          <GateList gates={gates as GovGateResult[]} accepted={accepted} />
        </Panel>
      ) : null}

      {gateAcceptances.length > 0 ? (
        <Panel title="Gates accepted" flush>
          <ul className="divide-y divide-(--color-border-subtle)">
            {gateAcceptances.map((a) => (
              <li key={a.id} className="space-y-0.5 px-4 py-3 text-[13px]">
                <p className="font-medium">{gateLabel(a.item_key)}</p>
                <p>{a.reason}</p>
                <Meta>
                  {nameOf(a.accepted_by)} · <Timestamp iso={a.accepted_at} />
                </Meta>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {view.deployments.length > 0 || (g.expansion?.refused.length ?? 0) > 0 ? (
        <Panel
          title="Roles"
          count={view.deployments.length > 0 ? `${verified} of ${view.deployments.length} verified` : undefined}
          description="The result is per role. A role that was not verified is not hidden behind the rollout's stage."
          flush
        >
          <ul className="divide-y divide-(--color-border-subtle)">
            {view.deployments.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <Link to={deploymentHref(d.id, policyId)} className="min-w-[10rem] text-[13px] font-medium text-(--color-primary-text) hover:underline">
                  {roleName(d.role_id)}
                </Link>
                {d.canary ? <span className="text-xs text-(--color-text-muted)">Canary</span> : null}
                <StateChip state={deploymentState(d.state)} />
                {d.applied_at ? (
                  <span className="text-xs text-(--color-text-muted)">
                    applied <Timestamp iso={d.applied_at} />
                  </span>
                ) : null}
              </li>
            ))}
            {(g.expansion?.refused ?? []).map((x) => (
              <li key={x.target_id} className="space-y-0.5 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{roleName(x.role_id)}</span>
                  <StateChip state={{ label: "No deployment created", tone: "danger" }} />
                </div>
                <p className="text-(--color-text-muted)">{POLICY_ERROR_COPY[x.code]?.title ?? x.message}</p>
              </li>
            ))}
          </ul>
          {trouble > 0 || (g.expansion?.refused.length ?? 0) > 0 ? (
            <p className="border-t border-(--color-border-subtle) px-4 py-2.5 text-xs text-(--color-warning-text)">
              {plural(trouble + (g.expansion?.refused.length ?? 0), "role")} did not complete. The rollout is not reported as a success.
            </p>
          ) : null}
        </Panel>
      ) : null}

      <StartDialog policyId={policyId} variant="canary" canaryRole={canaryRole} open={dialog === "start"} onOpenChange={(o) => !o && setDialog(null)} />
      <ExpandDialog
        policyId={policyId}
        gates={gates as GovGateResult[]}
        accepted={accepted}
        remainingRoles={targetCount === undefined ? undefined : Math.max(0, targetCount - 1)}
        open={dialog === "expand"}
        onOpenChange={(o) => !o && setDialog(null)}
      />
      <ReasonDialog policyId={policyId} mode="pause" open={dialog === "pause"} onOpenChange={(o) => !o && setDialog(null)} />
      <ReasonDialog policyId={policyId} mode="resume" open={dialog === "resume"} onOpenChange={(o) => !o && setDialog(null)} />
      {dialog === "undo" && undoRow ? (
        <UndoDialog ws={ws} deployment={undoRow} siblings={deps.data?.data ?? []} siblingsPartial={!!deps.data?.meta.next_cursor} open onOpenChange={(o) => !o && setDialog(null)} />
      ) : null}
    </div>
  );
}
