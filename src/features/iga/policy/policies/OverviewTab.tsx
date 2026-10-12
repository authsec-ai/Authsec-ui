/**
 * Policy › detail › Overview (SPEC-iga-phase3-policy.md §9.3 S5): the next
 * action in one sentence, where the version is in its journey, four status
 * lines that never stand in for one another, what the change does, and the
 * findings it covers. Detail (the findings' own states, ARNs) is one click
 * down; the approver's panel appears here while the version is in review.
 */

import { AlertTriangle, Check, Circle, CircleDot, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useProposeGovVersionMutation,
  type GovPolicyView,
  type GovVersionView,
} from "@/app/api/igaPolicyAuthoringApi";
import { useGetGovFindingQuery } from "@/app/api/igaPolicyReadsApi";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";

import { ApprovalPanel } from "../approvals/ApprovalPanel";
import { PolicyActionError, StateChip, findingStatus, plural, usePolicyAction, usePolicyPermission } from "../shared";
import { isRightSize } from "../new/intentEdit";
import { intentLines } from "./intentDiff";
import { changeSummary, currentUserId, nextSentence, progressSteps, statusLines, type ProgressInput, type StepState } from "./policyModel";
import type { PolicyRollout, VersionReview } from "./usePolicyFacts";

const STEP: Record<StepState, { icon: typeof Check; word: string; cls: string }> = {
  done: { icon: Check, word: "Done", cls: "text-(--color-success-text)" },
  current: { icon: CircleDot, word: "In progress", cls: "text-(--color-info-text)" },
  pending: { icon: Circle, word: "Not yet", cls: "text-(--color-text-muted)" },
  blocked: { icon: AlertTriangle, word: "Needs attention", cls: "text-(--color-warning-text)" },
  unknown: { icon: HelpCircle, word: "Unknown", cls: "text-(--color-text-muted)" },
};

export function OverviewTab({
  ws,
  policy,
  version,
  review,
  rollout,
  approval,
}: {
  ws: string;
  policy: GovPolicyView;
  version: GovVersionView | undefined;
  review: VersionReview;
  rollout: PolicyRollout;
  approval: ProgressInput["approval"];
}) {
  const approve = usePolicyPermission("governance:approve");
  const canApprove = approve.offered && !!version && version.created_by !== currentUserId();
  const input: ProgressInput = { version, review: review.facts, rollout: rollout.rollout, approval };
  const steps = progressSteps(input);
  const lines = statusLines(rollout.rollout === "unknown" ? null : rollout.rollout);
  const summary = changeSummary(version?.intent);
  const findingIds = version && isRightSize(version.intent) ? (version.intent.finding_ids ?? []) : [];
  const archived = policy.lifecycle === "archived";

  return (
    <div className="space-y-4">
      <div className="rounded-md border-l-2 border-l-(--color-primary) bg-(--color-surface-subtle) px-4 py-3">
        <p className="text-[13px] leading-5 text-(--color-text)">
          <strong className="font-semibold">Next:</strong> {nextSentence(policy, { ...input, canApprove })}
        </p>
        {version?.status === "draft" && !archived ? <ProposeAction policyId={policy.id} versionNo={version.no} /> : null}
      </div>

      {version && version.status === "in_review" && canApprove && !archived ? <ApprovalPanel ws={ws} policyId={policy.id} versionNo={version.no} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Progress" description={version ? `Version ${version.no}` : undefined}>
          <ol className="space-y-2.5">
            {steps.map((s) => {
              const v = STEP[s.state];
              const Icon = v.icon;
              return (
                <li key={s.key} className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${v.cls}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-[13px] leading-5 text-(--color-text)">
                      {s.label} <span className={`text-xs font-medium ${v.cls}`}>{v.word}</span>
                    </p>
                    {s.detail ? <Meta>{s.detail}</Meta> : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {review.summary ? (
            <p className="mt-3 text-xs">
              <Link to={`/iga/policy/reviews/${encodeURIComponent(review.summary.id)}`} className="font-medium text-(--color-primary-text) hover:underline">
                Open the owner review
              </Link>
            </p>
          ) : null}
        </Panel>

        <Panel title="Status" description="Four separate facts. One being good says nothing about the others.">
          {rollout.failure ? <p className="mb-2 text-xs text-(--color-warning-text)">The rollout could not be read, so these lines show no evidence.</p> : null}
          <dl className="space-y-2.5">
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-start gap-x-3">
                <dt className="pt-0.5 text-xs text-(--color-text-muted)">{l.label}</dt>
                <dd className="min-w-0">
                  <StatusBadge tone={l.tone as ConsoleTone}>{l.text}</StatusBadge>
                  {l.note ? <Meta className="mt-0.5">{l.note}</Meta> : null}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {version ? (
        <Panel title="What this version does" description={`Version ${version.no}`}>
          {summary ? (
            <p className="text-[13px] leading-5 text-(--color-text)">
              Removed {summary.removed}
              {summary.withRoute.length > 0 ? ` · excluded with a remaining route ${summary.withRoute.length} (${summary.withRoute.join(", ")})` : ""} · keeps {summary.keeps} · nothing granted
            </p>
          ) : null}
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-(--color-text)">
            {intentLines(version.intent).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {summary?.withRoute.length ? (
            <Meta className="mt-2">
              A service listed as excluded with a remaining route is out of the role&apos;s IAM permissions, but a resource policy can still reach it. It is not &quot;no longer callable&quot;.
            </Meta>
          ) : null}
          <Meta className="mt-2">R1a restricts whole AWS services for selected roles; it does not narrow actions or resources within kept services.</Meta>
        </Panel>
      ) : null}

      {findingIds.length > 0 ? <FindingsCovered ws={ws} ids={findingIds} /> : null}
    </div>
  );
}

function ProposeAction({ policyId, versionNo }: { policyId: string; versionNo: number }) {
  const [propose] = useProposeGovVersionMutation();
  const act = usePolicyAction("governance:author");
  const author = usePolicyPermission("governance:author");
  if (author.refused) return null;
  return (
    <div className="mt-2 space-y-2">
      <Button
        size="sm"
        className="text-white"
        disabled={act.pending}
        onClick={async () => {
          const res = await act.run(() => propose({ policyId, versionNo }));
          if (res) toast.success(`Version ${versionNo} is in owner review`);
        }}
      >
        {act.pending ? "Checking AWS…" : "Propose for owner review"}
      </Button>
      <Meta>Compiles the change against live AWS and asks the owners. Nothing in AWS changes yet.</Meta>
      <PolicyActionError failure={act.failure} />
    </div>
  );
}

const MAX_FINDINGS_SHOWN = 25;

/** The findings this version was proposed from. Their states are read only when the list is opened. */
function FindingsCovered({ ws, ids }: { ws: string; ids: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel title="Findings covered" count={plural(ids.length, "finding")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-(--color-primary-text) hover:underline">
        {open ? "Hide the findings" : "Show the findings and where they stand"}
      </button>
      {open ? (
        <>
          <ul className="mt-2 divide-y divide-(--color-border-subtle)">
            {ids.slice(0, MAX_FINDINGS_SHOWN).map((id) => (
              <FindingLine key={id} ws={ws} id={id} />
            ))}
          </ul>
          {ids.length > MAX_FINDINGS_SHOWN ? <Meta className="mt-2">{ids.length - MAX_FINDINGS_SHOWN} more are in Findings.</Meta> : null}
        </>
      ) : null}
    </Panel>
  );
}

function FindingLine({ ws, id }: { ws: string; id: string }) {
  const q = useGetGovFindingQuery({ ws, id });
  const f = q.data?.data;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
      <Link to={`/iga/policy/findings?finding=${encodeURIComponent(id)}`} className="min-w-0 font-medium text-(--color-primary-text) hover:underline">
        {f ? `${f.role_name || "Role"}${f.detail_key ? ` · ${f.detail_key}` : ""}` : "Finding"}
      </Link>
      {f ? <StateChip state={findingStatus(f.current.status)} /> : q.isError ? <span className="text-xs text-(--color-text-muted)">Could not be read</span> : <span className="text-xs text-(--color-text-muted)">Loading…</span>}
    </li>
  );
}
