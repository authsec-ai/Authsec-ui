/**
 * New policy (SPEC-iga-phase3-policy.md §9.3 S3, route `/iga/policy/new`): the
 * four-step flow in a left rail. Entry: `?finding=<id>[,<id>]`, `?object=<id>`
 * or `?template=right_size_services&key=<role ARN | role id | object id>`;
 * `?step=1..4`; `?policy=<id>` once the draft exists.
 *
 * The draft model (see useDraftSession.ts): opening the flow creates a draft
 * policy and its version 1; every later edit is a NEW version of that policy
 * (`POST /policies/:id/versions` with `base_version_no`). Input is kept in
 * this page across Back and Next and saved as a new version when the person
 * goes Next (or submits) with changes, so an edit never makes a version per
 * keystroke. A reload finds the same draft. Submit = `POST .../propose`, which
 * compiles against live AWS and opens the owner review; success lands on the
 * policy's Rollout tab. The page says all of this in words.
 */

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  govErrorDetail,
  useArchiveGovPolicyMutation,
  useCreateGovVersionMutation,
  useGetGovVersionQuery,
  useProposeGovVersionMutation,
  type GovRightSizeIntent,
  type GovVersionView,
} from "@/app/api/igaPolicyAuthoringApi";
import { useResolveGovTargetsQuery, govTargetKeyForRoleId } from "@/app/api/igaPolicyReadsApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyActionError, PolicyShell, plural, usePolicyAction, usePolicyCapabilities, usePolicyPermission } from "../shared";
import { BlockedView, DRAFT_NOTE, FailedView, StartScreen, SubmittedView, WorkingLine } from "./BootViews";
import { forgetDraft } from "./draftStore";
import { entryOf } from "./entry";
import { buildRoles, roleNames, type StepProps } from "./flow";
import { intentEquals, intentProblems } from "./intentEdit";
import { StepImpact } from "./StepImpact";
import { StepRecommend } from "./StepRecommend";
import { StepReview, SubmitFailure } from "./StepReview";
import { StepRollout } from "./StepRollout";
import { useDelivery } from "./useDelivery";
import { useDraftSession, type DraftSession } from "./useDraftSession";
import { useLeaveGuard } from "./useLeaveGuard";

const STEPS = [
  { title: "Recommendation", hint: "What to remove and keep" },
  { title: "Impact and owners", hint: "Who is affected and asked" },
  { title: "Rollout and delivery", hint: "How and when it changes" },
  { title: "Review and submit", hint: "Send it for owner review" },
] as const;

const POLICIES = "/iga/policy/policies";

function stepOf(raw: string | null): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return n >= 1 && n <= 4 ? n : 1;
}

function Flow({
  ws,
  entrySig,
  session,
  onSaved,
  step,
  setStep,
}: {
  ws: string;
  entrySig: string;
  session: DraftSession;
  onSaved: (v: GovVersionView) => void;
  step: number;
  setStep: (n: number) => void;
}) {
  const navigate = useNavigate();
  const author = usePolicyPermission("governance:author");
  const [intent, setIntent] = useState<GovRightSizeIntent>(session.saved);
  const [furthest, setFurthest] = useState(step);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const action = usePolicyAction("governance:author");
  const [createVersion] = useCreateGovVersionMutation();
  const [propose] = useProposeGovVersionMutation();
  const [archive] = useArchiveGovPolicyMutation();

  const dirty = !intentEquals(intent, session.saved);
  const guard = useLeaveGuard(dirty);

  const resolved = useResolveGovTargetsQuery(
    { ws, keys: session.saved.subjects.map((s) => govTargetKeyForRoleId(s.role_id)) },
    { skip: session.saved.subjects.length === 0 },
  );
  const roles = useMemo(() => buildRoles(session, intent, resolved.data), [session, intent, resolved.data]);
  const v1 = useGetGovVersionQuery({ ws, policyId: session.policyId, versionNo: 1 }, { skip: session.versionNo === 1 });
  const baseline: GovRightSizeIntent | null =
    session.versionNo === 1 ? session.saved : v1.data?.intent.kind === "right_size_services" ? v1.data.intent : null;
  const delivery = useDelivery(ws, roles);
  const nameOf = (roleId: string) => roles.find((r) => r.subject.role_id === roleId)?.name ?? roleId;

  const problems = intentProblems(intent);
  const deliveryBlock = delivery[intent.delivery].available === false ? `${intent.delivery === "direct" ? "AuthSec applies it" : intent.delivery === "iac_pr" ? "Pull request" : "Export"} is not available: ${delivery[intent.delivery].reason ?? ""}` : null;
  // Step 1 and 3 hold the controls; a problem blocks going on, never going back.
  const blocker = problems[0]?.message ?? (step >= 3 ? deliveryBlock : null);

  const shared: StepProps = { ws, session, intent, onIntent: setIntent, roles, rolesLoading: resolved.isLoading, baseline };

  /** Saves the edit as the next version; resolves to the version number to continue with, or null when the save was refused. */
  const save = async (): Promise<number | null> => {
    if (!dirty) return session.versionNo;
    const v = await action.run(() => createVersion({ policyId: session.policyId, intent, baseVersionNo: session.versionNo }));
    if (!v) return null;
    onSaved(v);
    if (v.intent.kind === "right_size_services") setIntent(v.intent);
    return v.no;
  };

  const go = (n: number) => {
    setFurthest((f) => Math.max(f, n));
    setStep(n);
  };

  const next = async () => {
    action.clear();
    if (problems.length > 0) return;
    if ((await save()) === null) return;
    go(step + 1);
  };

  const submit = async () => {
    const versionNo = await save();
    if (versionNo === null) {
      setConfirmSubmit(false);
      return;
    }
    const ok = await action.run(() => propose({ policyId: session.policyId, versionNo }));
    if (!ok) {
      setConfirmSubmit(false);
      return;
    }
    forgetDraft(ws, entrySig, session.policyId);
    navigate(`${POLICIES}/${encodeURIComponent(session.policyId)}/rollout`);
  };

  const discard = async () => {
    const ok = await action.run(() => archive({ policyId: session.policyId, reason: "Draft discarded from the new-policy flow" }));
    if (!ok) return;
    forgetDraft(ws, entrySig, session.policyId);
    navigate(POLICIES);
  };

  const versionConflict = govErrorDetail(action.failure, "version_conflict");
  const conflict = action.failure?.code === "version_conflict";

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        <nav aria-label="Steps">
          <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
            {STEPS.map((s, i) => {
              const n = i + 1;
              const current = n === step;
              const reachable = n <= furthest;
              const done = n < furthest;
              return (
                <li key={s.title} className="shrink-0">
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    onClick={() => go(n)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-(--color-primary)",
                      current ? "bg-(--color-primary-soft)" : reachable ? "hover:bg-(--color-surface-subtle)" : "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                        current ? "border-(--color-primary) bg-(--color-primary) text-white" : done ? "border-(--color-success) text-(--color-success-text)" : "border-(--color-border-strong) text-(--color-text-muted)",
                      )}
                    >
                      {done && !current ? <Check className="size-3" aria-hidden="true" /> : n}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-[13px] font-medium", current ? "text-(--color-text)" : "text-(--color-text)")}>{s.title}</span>
                      <span className="hidden text-xs text-(--color-text-muted) lg:block">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) p-3 text-xs text-(--color-text-muted)">
          <p className="flex flex-wrap items-center gap-2 text-(--color-text)">
            <span className="font-medium">{session.name}</span>
            <StatusBadge tone="neutral">Draft v{session.versionNo}</StatusBadge>
          </p>
          <p className="mt-1">{DRAFT_NOTE}</p>
          {author.offered ? (
            <Button variant="ghost" size="sm" className="-ml-2 mt-1 text-(--color-danger-text)" onClick={() => setConfirmDiscard(true)}>
              Discard this draft
            </Button>
          ) : null}
        </div>
      </aside>

      <section className="min-w-0 space-y-4" aria-labelledby="step-title">
        <header>
          <p className="text-xs text-(--color-text-muted)">Step {step} of 4</p>
          <h2 id="step-title" className="text-base font-semibold text-(--color-text)">
            {step === 1 ? `Right-size ${roleNames(roles)}` : STEPS[step - 1].title}
          </h2>
        </header>

        {conflict ? (
          <DecisionBanner
            tone="warning"
            title="This policy changed since you opened it"
            body={
              <>
                {versionConflict?.current_version_no ? `Version ${versionConflict.current_version_no} exists now. ` : ""}Reload to see the latest version, then apply your edit again.
              </>
            }
            actionLabel="Reload"
            onAction={() => window.location.reload()}
          />
        ) : null}

        {step === 1 ? <StepRecommend {...shared} /> : step === 2 ? <StepImpact {...shared} /> : step === 3 ? <StepRollout {...shared} delivery={delivery} /> : <StepReview {...shared} />}

        <SubmitFailure failure={conflict ? null : action.failure} nameOf={nameOf} />
        {blocker && step < 4 ? (
          <p role="alert" className="text-xs font-medium text-(--color-danger-text)">
            {blocker}
          </p>
        ) : null}

        <footer className="flex flex-wrap items-center gap-2 border-t border-(--color-border-subtle) pt-3">
          <Button variant="outline" disabled={step === 1 || action.pending} onClick={() => go(step - 1)}>
            Back
          </Button>
          {step < 4 ? (
            <Button disabled={action.pending || !!blocker || author.refused} onClick={() => void next()}>
              {action.pending ? "Saving…" : `Next: ${["impact", "rollout", "review"][step - 1]}`}
            </Button>
          ) : author.refused ? (
            <span className="text-xs text-(--color-text-muted)">Your role cannot submit changes for review.</span>
          ) : (
            <Button disabled={action.pending || problems.length > 0 || !!deliveryBlock} onClick={() => setConfirmSubmit(true)}>
              Submit for owner review
            </Button>
          )}
          {dirty ? <span className="text-xs text-(--color-text-muted)">Edits are saved as version {session.versionNo + 1} when you go on.</span> : null}
          {step === 4 && (problems.length > 0 || deliveryBlock) ? (
            <span role="alert" className="text-xs font-medium text-(--color-danger-text)">
              {problems[0]?.message ?? deliveryBlock}
            </span>
          ) : null}
          <Link to={POLICIES} className="ml-auto text-xs font-medium text-(--color-text-muted) hover:underline">
            Leave the flow
          </Link>
        </footer>
      </section>

      <Dialog open={confirmSubmit} onOpenChange={(o) => (action.pending ? undefined : setConfirmSubmit(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for owner review?</DialogTitle>
            <DialogDescription>Here is exactly what happens.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-(--color-text)">
            <li>
              AuthSec reads AWS and compiles the plans for {plural(roles.length, "role")}. If any role cannot be changed, nothing is submitted and the reason is listed.
            </li>
            <li>The owners of these roles and of what runs as them are notified and asked to review. Silence is not consent.</li>
            <li>Nothing is changed in AWS. A different member must approve before any rollout.</li>
          </ul>
          <PolicyActionError failure={action.failure} />
          <DialogFooter>
            <Button variant="outline" disabled={action.pending} onClick={() => setConfirmSubmit(false)}>
              Cancel
            </Button>
            <Button disabled={action.pending} onClick={() => void submit()}>
              {action.pending ? "Submitting…" : "Submit for owner review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={(o) => (action.pending ? undefined : setConfirmDiscard(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this draft?</DialogTitle>
            <DialogDescription>
              The draft policy &quot;{session.name}&quot; is archived. Findings it addressed go back to open. Nothing was sent to anyone and nothing changed in AWS.
            </DialogDescription>
          </DialogHeader>
          <PolicyActionError failure={action.failure} />
          <DialogFooter>
            <Button variant="outline" disabled={action.pending} onClick={() => setConfirmDiscard(false)}>
              Keep the draft
            </Button>
            <Button variant="destructive" disabled={action.pending} onClick={() => void discard()}>
              {action.pending ? "Discarding…" : "Discard draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guard.pending !== null} onOpenChange={(o) => (o ? undefined : guard.stay())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave with unsaved changes?</DialogTitle>
            <DialogDescription>
              Your edits since the last step are not saved. The draft keeps its last saved version (version {session.versionNo}) under Policy › Policies.
            </DialogDescription>
          </DialogHeader>
          <PolicyActionError failure={action.failure} />
          <DialogFooter>
            <Button variant="outline" onClick={guard.stay}>
              Stay
            </Button>
            <Button variant="outline" onClick={guard.leave}>
              Leave without saving
            </Button>
            <Button
              disabled={action.pending || problems.length > 0}
              onClick={async () => {
                if ((await save()) !== null) guard.leave();
              }}
            >
              Save and leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NewPolicyPage() {
  const ws = getWorkspaceId() ?? "";
  const [params, setParams] = useSearchParams();
  // Only the starting point decides which draft this is; `step` and `policy` must not restart the boot.
  const entryQuery = new URLSearchParams();
  for (const k of ["finding", "object", "template"]) if (params.get(k)) entryQuery.set(k, params.get(k)!);
  for (const v of params.getAll("key")) entryQuery.append("key", v);
  const entryString = entryQuery.toString();
  const entry = useMemo(() => entryOf(new URLSearchParams(entryString)), [entryString]);
  const urlPolicy = params.get("policy");

  const caps = usePolicyCapabilities(ws);
  const author = usePolicyPermission("governance:author");
  const { boot, retry, continueWith, adopt } = useDraftSession(
    ws,
    entry,
    urlPolicy,
    (id) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set("policy", id);
          return n;
        },
        { replace: true },
      ),
    caps.state === "on" && caps.feature("proposals") && !author.refused,
  );

  const step = stepOf(params.get("step"));
  const setStep = (n: number) =>
    setParams(
      (p) => {
        const q = new URLSearchParams(p);
        q.set("step", String(n));
        return q;
      },
      { replace: false },
    );

  return (
    <PolicyShell
      title="New policy"
      description="Restrict whole AWS services a role has not used. Recommendation first; nothing changes in AWS until it is approved and rolled out."
      nav={false}
    >
      {author.refused ? (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Your role cannot start a policy. Ask someone who can author policy.
        </p>
      ) : boot.phase === "none" ? (
        <StartScreen />
      ) : boot.phase === "working" ? (
        <WorkingLine what={boot.what} />
      ) : boot.phase === "blocked" ? (
        <BlockedView
          targets={boot.targets}
          canContinue={boot.canContinue}
          onContinue={() => continueWith(boot.targets.filter((t) => t.status === "resolved" && t.eligible && !t.control && t.identity).map((t) => t.identity!.role_id))}
        />
      ) : boot.phase === "failed" ? (
        <FailedView boot={boot} nameOf={(id) => id} onRetry={retry} />
      ) : boot.phase === "submitted" || boot.phase === "not_a_draft" ? (
        <SubmittedView boot={boot} />
      ) : (
        <Flow key={boot.session.policyId} ws={ws} entrySig={entry.sig} session={boot.session} onSaved={adopt} step={step} setStep={setStep} />
      )}
    </PolicyShell>
  );
}
