/**
 * The decision panel of a version (SPEC-iga-phase3-policy.md §9.3 S6, §7.5,
 * §2.8, §2.10), embedded in the policy's Overview. For a version in review it
 * shows what the version does, the owner review result, observation, evidence
 * trust, what undo does and the hashes the approval binds, then takes the
 * decision: **Approve** and **Reject** (reason required).
 *
 * Approving binds exactly what the approver saw: the intent hash, the impact,
 * plan and material hashes (`buildGovApproveRequest`, which the server compares
 * as multisets) and one acceptance, with a reason, for every unanalysed form and
 * evidence gap (`GovAcceptanceItem`), accepted item by item. Before the
 * confirmation opens the plans are read again; if any hash or required item
 * moved, nothing is sent and the approver is told "This plan changed — review
 * the new version". Every server refusal is shown in words. The author never
 * decides (403 self_approval, admins included), so the controls are not offered
 * to them; a role the server has refused (`governance:approve`) sees the
 * evidence and no controls.
 *
 * Approval is not deployment: it changes nothing in AWS. An owner's
 * acknowledgement is a separate decision from this one.
 *
 * Usage: `<ApprovalPanel ws={ws} policyId={policy.id} versionNo={version.no} />`
 */

import { useEffect, useMemo, useState } from "react";

import {
  buildGovApproveRequest,
  govErrorDetail,
  govMissingAcceptances,
  useApproveGovVersionMutation,
  useGetGovReviewQuery,
  useGetGovVersionPlansQuery,
  useGetGovVersionQuery,
  useListGovReviewsQuery,
  useRejectGovVersionMutation,
} from "@/app/api/igaPolicyAuthoringApi";
import { DecisionBanner } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";

import {
  PolicyActionError,
  PolicyLoadFailure,
  StateChip,
  classifyPolicyError,
  markPolicyDenied,
  plural,
  roleNameOf,
  serviceList,
  shortHash,
  usePolicyPermission,
  versionStatus,
  type PolicyFailure,
} from "../shared";
import { blockerText, dateTimeText } from "../reviews/reviewCopy";
import { currentUserId } from "../policies/policyModel";
import { AcceptItems } from "./AcceptItems";
import { EvidenceBlock, HashesBlock, ObservationBlock, ReviewBlock, SummaryBlock, UndoBlock, type ReviewLookup } from "./ApprovalSections";
import { acceptancesGiven, forwardPlans, itemWords, plansChanged, undoPlans, type AcceptState } from "./approvalCopy";

type Done = { kind: "approved"; until: string; accepted: number } | { kind: "rejected" };

/** A server refusal in words, with the detail that tells the approver what to do about it. */
function Refusal({ failure }: { failure: PolicyFailure }) {
  if (failure.code === "plan_changed" || failure.code === "impact_changed") {
    return (
      <DecisionBanner
        tone="warning"
        title="This plan changed — review the new version"
        body="The plans, who they affect, or the items to accept are different from what you were looking at. The panel now shows the current version. Nothing was approved."
      />
    );
  }
  const missing = govErrorDetail(failure, "residuals_not_accepted")?.missing ?? govErrorDetail(failure, "evidence_gaps_not_accepted")?.missing;
  const age = govErrorDetail(failure, "age_unconfirmed")?.items;
  const routes = govErrorDetail(failure, "route_unconfirmed")?.items;
  const incomplete = govErrorDetail(failure, "review_incomplete");
  const conflict = govErrorDetail(failure, "version_conflict");
  const ineligible = govErrorDetail(failure, "target_ineligible")?.targets;
  return (
    <PolicyActionError failure={failure}>
      {missing && missing.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {missing.map((m) => (
            <li key={`${m.plan_id}-${m.item_key}`}>{itemWords(m, "").title}</li>
          ))}
        </ul>
      ) : null}
      {age && age.length > 0 ? <p className="mt-1">Not confirmed: {serviceList([...new Set(age.map((a) => a.service))], 8)}.</p> : null}
      {routes && routes.length > 0 ? <p className="mt-1">{plural(routes.length, "route")} not confirmed by an owner.</p> : null}
      {incomplete?.blockers && incomplete.blockers.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {incomplete.blockers.map((b, i) => (
            <li key={`${b.kind}-${b.user_id ?? b.target_id ?? i}`}>{blockerText(b)}</li>
          ))}
        </ul>
      ) : incomplete?.reason ? (
        <p className="mt-1">
          {incomplete.reason === "no_review" ? "No owner review exists for this version." : incomplete.reason === "cancelled" ? "The owner review was cancelled." : "Who this affects changed after the owners were asked; they are asked again."}
        </p>
      ) : null}
      {conflict?.status ? <p className="mt-1">The version is now {versionStatus(conflict.status).label.toLowerCase()}.</p> : null}
      {ineligible && ineligible.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {ineligible.map((t, i) => (
            <li key={t.target_id ?? t.role_id ?? i}>
              {t.role_id ?? "A target"}: {t.reason === "not_compiled" ? "no plan has been compiled" : (t.reason ?? t.reasons?.map((r) => (typeof r === "string" ? r : r.code)).join(", "))}
            </li>
          ))}
        </ul>
      ) : null}
    </PolicyActionError>
  );
}

export function ApprovalPanel({ ws, policyId, versionNo }: { ws: string; policyId: string; versionNo: number }) {
  const ref = { ws, policyId, versionNo };
  const versionQ = useGetGovVersionQuery(ref);
  const version = versionQ.data;
  const inReview = version?.status === "in_review";
  const plansQ = useGetGovVersionPlansQuery(ref, { skip: !inReview });
  const plans = plansQ.data;

  // The review of this version: `GET /reviews` has no version filter, so the newest 200 are searched.
  const reviewsQ = useListGovReviewsQuery({ ws, limit: 200 }, { skip: !inReview });
  const hit = reviewsQ.data?.data.find((r) => r.version_id === version?.id);
  const reviewQ = useGetGovReviewQuery({ ws, id: hit?.id ?? "" }, { skip: !hit });
  const lookup: ReviewLookup = useMemo(() => {
    if (reviewsQ.isLoading || (hit && reviewQ.isLoading)) return { state: "loading" };
    if (reviewsQ.isError || reviewQ.isError) return { state: "failed", retry: () => void (reviewsQ.isError ? reviewsQ.refetch() : reviewQ.refetch()) };
    if (!hit || !reviewQ.data) return { state: "not_found" };
    return { state: "ok", review: reviewQ.data };
  }, [reviewsQ, reviewQ, hit]);
  const review = lookup.state === "ok" ? lookup.review : null;

  const approvePerm = usePolicyPermission("governance:approve");
  const [approve] = useApproveGovVersionMutation();
  const [reject] = useRejectGovVersionMutation();

  const [accept, setAccept] = useState<AcceptState>({});
  const [confirm, setConfirm] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<"checking" | "approving" | "rejecting" | null>(null);
  const [failure, setFailure] = useState<PolicyFailure | null>(null);
  const [changed, setChanged] = useState(false);
  const [staleRead, setStaleRead] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const planFailure = classifyPolicyError(plansQ.error);
  const versionFailure = classifyPolicyError(versionQ.error);
  const isAuthor = !!version && currentUserId() === version.created_by;
  const canDecide = approvePerm.offered && !isAuthor;

  // A 403 from a decision means this role cannot approve; the Policy navigation stops offering Approvals.
  useEffect(() => {
    if (failure?.kind === "forbidden" && failure.code !== "self_approval") markPolicyDenied("governance:approve");
  }, [failure]);

  const items = useMemo(() => plans?.acceptance_items ?? [], [plans]);
  const given = useMemo(() => acceptancesGiven(items, accept), [items, accept]);
  const missing = useMemo(() => govMissingAcceptances(items, given), [items, given]);

  const forward = plans ? forwardPlans(plans.plans) : [];
  const undo = plans ? undoPlans(plans.plans) : [];
  const ineligible = forward.filter((p) => p.eligibility === "ineligible");
  const gateFailed = review?.gate && !review.gate.passed ? review.gate : null;

  const blockedBy: string[] = [];
  if (plans && forward.length === 0) blockedBy.push("No plan has been compiled for this version.");
  if (ineligible.length > 0) blockedBy.push(`${plural(ineligible.length, "role")} cannot be changed as things stand (${ineligible.map((p) => roleNameOf(p.role_arn)).join(", ")}).`);
  if (missing.length > 0) blockedBy.push(`${plural(missing.length, "item")} still need${missing.length === 1 ? "s" : ""} your acceptance and a reason.`);
  if (gateFailed) blockedBy.push("The owner review is not complete: approval would be refused until every owner responds or an approver records an exception.");

  function refetchAll() {
    void versionQ.refetch();
    void plansQ.refetch();
    void reviewsQ.refetch();
    if (hit) void reviewQ.refetch();
  }

  async function startApprove() {
    if (!plans) return;
    setFailure(null);
    setChanged(false);
    setStaleRead(false);
    setBusy("checking");
    try {
      // The server compares hashes, but an approver should not be sent to a refusal they could have been told about.
      const fresh = await plansQ.refetch();
      if (fresh.isError || !fresh.data) {
        setStaleRead(true);
        return;
      }
      if (plansChanged(plans, fresh.data)) {
        setChanged(true);
        return;
      }
      setConfirm(true);
    } finally {
      setBusy(null);
    }
  }

  async function submitApprove() {
    if (!plans) return;
    setBusy("approving");
    setFailure(null);
    try {
      const res = await approve({ policyId, versionNo, body: buildGovApproveRequest(plans, given, note) }).unwrap();
      setConfirm(false);
      setNote("");
      setDone({ kind: "approved", until: res.approval.expires_at, accepted: res.acceptances.length });
    } catch (e) {
      const f = classifyPolicyError(e);
      const moved = f?.code === "plan_changed" || f?.code === "impact_changed";
      // A moved plan is told once, by the banner above; any other refusal is shown where the approver is looking.
      setFailure(moved ? null : f);
      if (f && ["plan_changed", "impact_changed", "residuals_not_accepted", "evidence_gaps_not_accepted", "review_incomplete", "age_unconfirmed", "route_unconfirmed", "version_conflict"].includes(f.code)) {
        refetchAll();
      }
      if (moved) {
        setConfirm(false);
        setChanged(true);
      }
    } finally {
      setBusy(null);
    }
  }

  async function submitReject() {
    setBusy("rejecting");
    setFailure(null);
    try {
      await reject({ policyId, versionNo, reason: rejectReason.trim() }).unwrap();
      setRejecting(false);
      setRejectReason("");
      setDone({ kind: "rejected" });
    } catch (e) {
      setFailure(classifyPolicyError(e));
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------------------------------------------------------ */

  const status = version ? versionStatus(version.status) : null;
  return (
    <Panel
      title={version ? `Approval · version ${version.no}` : "Approval"}
      actions={status ? <StateChip state={status} /> : null}
      description="Approving is a decision about deploying this change; an owner's acknowledgement is a separate decision. Approving changes nothing in AWS by itself."
    >
      <div className="space-y-4">
        {done?.kind === "approved" ? (
          <DecisionBanner
            tone="success"
            title="Version approved"
            body={`${done.accepted > 0 ? `${plural(done.accepted, "item")} accepted with your reasons. ` : ""}The approval is valid until ${dateTimeText(done.until)}. Nothing has changed in AWS yet: someone who can run rollouts starts it from the Rollout tab.`}
          />
        ) : null}
        {done?.kind === "rejected" ? (
          <DecisionBanner tone="neutral" title="Version rejected" body="The version is closed with your reason. The author can write a new version." />
        ) : null}

        {versionQ.isLoading ? (
          <p role="status" className="text-[13px] text-(--color-text-muted)">
            Loading the version…
          </p>
        ) : versionFailure && !version ? (
          <PolicyLoadFailure failure={versionFailure} subject="this version" onRetry={() => void versionQ.refetch()} />
        ) : version && !inReview ? (
          <NotInReview status={version.status} />
        ) : version && inReview ? (
          <>
            {plansQ.isLoading ? (
              <p role="status" className="text-[13px] text-(--color-text-muted)">
                Loading the plans…
              </p>
            ) : planFailure && !plans ? (
              <PolicyLoadFailure failure={planFailure} subject="the plans" onRetry={() => void plansQ.refetch()} />
            ) : plans ? (
              <>
                {changed ? (
                  <DecisionBanner
                    tone="warning"
                    title="This plan changed — review the new version"
                    body="The plans, who they affect, or the items to accept are different from what you were looking at. The panel now shows the current version; check it again before deciding. Nothing was approved."
                  />
                ) : null}
                {planFailure ? <p role="alert" className="text-xs text-(--color-danger-text)">The plans could not be refreshed; what is shown loaded earlier.</p> : null}

                <SummaryBlock version={version} plans={plans} review={review} />
                <ReviewBlock lookup={lookup} />
                <ObservationBlock ws={ws} policyId={policyId} versionNo={versionNo} version={version} />
                <EvidenceBlock ws={ws} plans={plans} />
                {canDecide ? <AcceptItems plans={plans} state={accept} onChange={setAccept} disabled={busy !== null} /> : null}
                <UndoBlock plans={plans} />
                <HashesBlock version={version} plans={plans} />

                {!canDecide ? (
                  <DecisionBanner
                    tone="neutral"
                    title={isAuthor ? "You wrote this version, so someone else decides" : "Your role cannot approve"}
                    body={
                      isAuthor
                        ? "A person never approves their own version, administrators included. Another approver sees this in Policy › Approvals."
                        : "Approving or rejecting a version needs the governance:approve permission. An administrator can grant it. What you see above is for reference."
                    }
                  />
                ) : (
                  <div className="space-y-2 border-t border-(--color-border-subtle) pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={() => void startApprove()} disabled={busy !== null || blockedBy.length > 0}>
                        {busy === "checking" ? "Checking the plans…" : "Approve…"}
                      </Button>
                      <Button variant="outline" onClick={() => { setFailure(null); setRejecting(true); }} disabled={busy !== null}>
                        Reject…
                      </Button>
                      <Button variant="ghost" onClick={refetchAll} disabled={busy !== null}>
                        Check again
                      </Button>
                    </div>
                    {blockedBy.length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-5 text-xs text-(--color-text-muted)">
                        {blockedBy.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : null}
                    {staleRead ? <p role="alert" className="text-xs text-(--color-danger-text)">The plans could not be re-read, so approval was not started. Try again.</p> : null}
                    {!confirm && !rejecting && failure ? <Refusal failure={failure} /> : null}
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <Dialog open={confirm} onOpenChange={(o) => (busy === "approving" ? undefined : setConfirm(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve version {versionNo}?</DialogTitle>
            <DialogDescription>You are approving exactly what is on this page. If any of it changes before you confirm, the server refuses.</DialogDescription>
          </DialogHeader>
          {plans && version ? (
            <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-(--color-text)">
              <li>
                <span className="font-medium">Intent:</span>{" "}
                {version.intent.kind === "right_size_services"
                  ? `restrict ${plural(version.intent.remove.length, "AWS service")} (${serviceList(version.intent.remove.map((r) => r.service), 8)}) for ${plural(forward.length, "role")}, keeping ${serviceList(version.intent.retain.map((r) => r.service), 8)}`
                  : version.intent.kind === "dedicated_identity"
                    ? `move a workload to a new dedicated role (${version.intent.new_role.name})`
                    : `remove AuthSec's control from ${plural(forward.length, "role")}`}{" "}
                <span className="font-mono text-xs text-(--color-text-muted)">{shortHash(plans.hashes.intent_hash)}</span>
              </li>
              <li>
                <span className="font-medium">Plans:</span> {plural(forward.length, "change plan")} and {plural(undo.length, "undo plan")}, for {forward.map((p) => roleNameOf(p.role_arn)).join(", ")}.
              </li>
              <li>
                <span className="font-medium">Evidence:</span> revision {version.evidence_rev}
                {items.length > 0 ? `, with ${plural(items.length, "item")} you accepted individually` : ", with no item to accept"}.
              </li>
            </ul>
          ) : null}
          <Meta>
            Approving does not change AWS. Someone who can run rollouts starts it separately, and the approval lapses after the workspace&apos;s approval period. The owners&apos; acknowledgements stay a separate decision.
          </Meta>
          <label className="block text-xs text-(--color-text-muted)">
            Note (optional)
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
          </label>
          {failure ? <Refusal failure={failure} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy === "approving"}>
              Cancel
            </Button>
            <Button onClick={() => void submitApprove()} disabled={busy === "approving"}>
              {busy === "approving" ? "Approving…" : "Approve version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={(o) => (busy === "rejecting" ? undefined : setRejecting(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject version {versionNo}?</DialogTitle>
            <DialogDescription>The version is closed and nothing is deployed. The author sees your reason and can write a new version.</DialogDescription>
          </DialogHeader>
          <label className="block text-[13px] font-medium text-(--color-text)" htmlFor="reject-reason">
            Reason (required)
          </label>
          <Textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="What needs to change before this can be approved" />
          {failure ? <Refusal failure={failure} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy === "rejecting"}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void submitReject()} disabled={busy === "rejecting" || rejectReason.trim() === ""}>
              {busy === "rejecting" ? "Rejecting…" : "Reject version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function NotInReview({ status }: { status: string }) {
  const words: Record<string, string> = {
    draft: "This version has not been proposed for review, so there is nothing to decide yet.",
    approved: "This version is approved. It deploys when someone who can run rollouts starts one.",
    rejected: "This version was rejected. The author can write a new version.",
    superseded: "A newer approved version replaced this one.",
    withdrawn: "This version was withdrawn.",
  };
  return <p className="text-[13px] text-(--color-text)">{words[status] ?? `This version is ${status}; no decision is pending.`}</p>;
}
