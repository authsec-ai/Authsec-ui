/**
 * Undo one deployment (SPEC-iga-phase3-policy.md §8.9, §9.3 S5 "Undo dialog").
 *
 * Says exactly what undo does, from the undo plan compiled and approved with
 * the version (`GET /policies/:id/versions/:no/plans`, the plan of kind `undo`
 * for this control): "The boundary returns to version 1's document: ec2, sqs
 * stay removed; dynamodb is no longer excluded" or "The role had no boundary
 * before. AuthSec's boundary is detached and deleted." `canUndo` /
 * `undoBlocker` (the API file) explain why not before the request; the server
 * still decides, and its three refusals are explained here: not the latest
 * deployment, AWS changed since approval, and a boundary now shared with
 * another role (a role-only recovery plan, which needs its own approval or an
 * emergency undo).
 *
 * The result never says "access restored": AuthSec's change was undone; other
 * controls may still restrict the role.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  undoBlocker,
  useEmergencyUndoGovDeploymentMutation,
  useUndoGovDeploymentMutation,
  type GovChangedOutsideDetail,
  type GovConsumersChangedDetail,
  type GovDeploymentView,
  type GovNotLatestDetail,
  type GovUndoBlocker,
} from "@/app/api/igaPolicyDeploymentsApi";
import { useGetGovVersionPlansQuery, type GovPlanView } from "@/app/api/igaPolicyAuthoringApi";
import { Button } from "@/components/ui/button";

import { PolicyLoadFailure, classifyPolicyError, serviceList, usePolicyAction, usePolicyPermission } from "../shared";
import { ActionFrame, ReasonField } from "./ActionFrame";
import { CLASSIFICATION_WORDS, deploymentHref, roleLabel } from "./deploymentModel";

const SCOPE_NOTE =
  "AuthSec restricts whole AWS services for selected roles. It does not narrow actions or resources within the services a role keeps.";

const UNDO_BLOCKER_WORDS: Record<GovUndoBlocker, string> = {
  not_apply: "Only a deployment that applied a boundary can be undone. A removal or a dedicated-identity move is reversed by its own change.",
  in_flight: "Another change is in progress on this role. Wait for it to finish; nothing else changes this role meanwhile.",
  not_latest: "Only the latest change on this role can be undone. Undo the later change first.",
};

function removedServices(plan: GovPlanView | undefined): string[] {
  return (plan?.impact?.removed ?? []).map((s) => s.service).sort();
}
function restoredServices(plan: GovPlanView | undefined): string[] {
  return (plan?.impact?.restored ?? []).map((s) => s.service).sort();
}

/** The version whose boundary document this undo returns to: the control's previous applied deployment. */
function previousVersionNo(d: GovDeploymentView, siblings: readonly GovDeploymentView[]): number | undefined {
  if (!d.applied_at) return undefined;
  const at = new Date(d.applied_at).getTime();
  let best: GovDeploymentView | undefined;
  for (const s of siblings) {
    if (s.id === d.id || s.control_id !== d.control_id || s.kind === "undo" || !s.applied_at) continue;
    if (!["verified", "superseded", "applied_unverified", "drifted"].includes(s.state)) continue;
    if (new Date(s.applied_at).getTime() >= at) continue;
    if (!best || new Date(s.applied_at) > new Date(best.applied_at as string)) best = s;
  }
  return best?.version_no;
}

/** What undo will do, in one or two sentences, from the approved undo plan. */
function effectWords(
  d: GovDeploymentView,
  undoPlan: GovPlanView | undefined,
  applyPlan: GovPlanView | undefined,
  priorNo: number | undefined,
): string[] {
  const role = roleLabel(d.role_arn, d.role_id);
  if (!undoPlan) {
    return [`AuthSec returns ${role} to exactly the state recorded before this deployment, using the undo plan approved with it.`];
  }
  const removed = removedServices(applyPlan);
  const restored = restoredServices(undoPlan);
  const stay = removed.filter((s) => !restored.includes(s));
  const out: string[] = [];
  if (undoPlan.desired_attachment === "absent") {
    out.push(
      undoPlan.artifact_disposition === "retain_shared"
        ? `AuthSec's boundary is detached from ${role} only. The policy is kept because other roles use it, and AuthSec no longer changes it.`
        : "The role had no boundary before. AuthSec's boundary is detached and deleted.",
    );
  } else if (undoPlan.delivery === "direct") {
    const doc = priorNo ? `version ${priorNo}'s document` : "the earlier document recorded for this role";
    out.push(
      undoPlan.artifact_disposition === "retain_shared"
        ? `A new boundary holding ${doc} is attached to ${role} only; the shared boundary is not changed.`
        : `The boundary returns to ${doc}.`,
    );
  } else {
    out.push(
      `${undoPlan.delivery === "iac_pr" ? "A pull request" : "An export"} restores the previous boundary document on ${role}. AuthSec verifies it once your pipeline applies it.`,
    );
  }
  if (stay.length > 0) out.push(`${serviceList(stay, 8)} stay removed.`);
  if (restored.length > 0) out.push(`${serviceList(restored, 8)} ${restored.length === 1 ? "is" : "are"} no longer excluded, so access to ${restored.length === 1 ? "it" : "them"} returns.`);
  return out;
}

export function UndoDialog({
  ws,
  deployment: d,
  siblings,
  siblingsPartial = false,
  open,
  onOpenChange,
}: {
  ws: string;
  deployment: GovDeploymentView;
  /** The deployments of the same policy (the control's siblings are among them). */
  siblings: GovDeploymentView[];
  /** More deployments exist than were read: the "latest" check is then advisory. */
  siblingsPartial?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [undo] = useUndoGovDeploymentMutation();
  const [emergencyUndo] = useEmergencyUndoGovDeploymentMutation();
  const normal = usePolicyAction("governance:enforce");
  const urgent = usePolicyAction("governance:emergency");
  const emergencyAccess = usePolicyPermission("governance:emergency");
  const [emergency, setEmergency] = useState(false);
  const [reason, setReason] = useState("");
  const [recoveryPlanId, setRecoveryPlanId] = useState<string | undefined>();

  const plans = useGetGovVersionPlansQuery({ ws, policyId: d.policy_id, versionNo: d.version_no }, { skip: !open });
  const undoPlan = plans.data?.plans.find((p) => p.kind === "undo" && p.control_id === d.control_id);
  const applyPlan = plans.data?.plans.find((p) => p.kind === "apply" && p.control_id === d.control_id);
  const priorNo = useMemo(() => previousVersionNo(d, siblings), [d, siblings]);
  const blocker = undoBlocker(d, siblings);
  // A partial sibling list cannot prove "not latest"; leave that to the server.
  const advisoryBlocker = blocker === "not_latest" && siblingsPartial ? null : blocker;

  useEffect(() => {
    if (!open) {
      setEmergency(false);
      setReason("");
      setRecoveryPlanId(undefined);
      normal.clear();
      urgent.clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const action = emergency ? urgent : normal;
  const failure = action.failure;
  const role = roleLabel(d.role_arn, d.role_id);
  const planFailure = classifyPolicyError(plans.error);

  async function confirm() {
    const body = { id: d.id, plan_id: recoveryPlanId, reason: reason.trim() || undefined };
    const res = emergency
      ? await urgent.run(() => emergencyUndo({ ...body, reason: reason.trim() }))
      : await normal.run(() => undo(body));
    if (res) {
      toast.success(emergency ? "Emergency undo queued" : "Undo queued");
      onOpenChange(false);
      navigate(deploymentHref(res.id, d.policy_id));
    }
  }

  // The server's detail, when it refused in one of the three documented ways (§8.9).
  useEffect(() => {
    if (failure?.code === "artifact_consumers_changed") {
      const detail = failure.detail as unknown as GovConsumersChangedDetail;
      setRecoveryPlanId(detail.recovery_plan_id);
    }
  }, [failure]);

  const extra = (() => {
    if (!failure) return null;
    if (failure.code === "not_latest_deployment") {
      const latest = (failure.detail as unknown as GovNotLatestDetail).latest_deployment_id;
      return latest ? (
        <p className="mt-1">
          <Link to={deploymentHref(latest, d.policy_id)} className="font-medium underline">
            Open the latest deployment
          </Link>
        </p>
      ) : null;
    }
    if (failure.code === "artifact_consumers_changed") {
      const c = (failure.detail as unknown as GovConsumersChangedDetail).classification;
      return (
        <div className="mt-1 space-y-1">
          <p>
            The boundary this deployment attached is now also used by another role, so undoing it would change that role without a review. AuthSec
            can instead remove the boundary from {role} only, leaving the shared policy and the other role as they are.
          </p>
          <p>
            {recoveryPlanId
              ? "A role-only recovery plan was prepared. It needs its own approval, or an emergency undo with a reason."
              : "A role-only recovery plan could not be prepared."}
            {c ? ` ${CLASSIFICATION_WORDS[c.class] ?? ""}.` : ""}
          </p>
        </div>
      );
    }
    if (failure.code === "plan_changed" || failure.code === "artifact_changed_outside_authsec") {
      const c = (failure.detail as unknown as GovChangedOutsideDetail).classification;
      return (
        <p className="mt-1">
          AWS changed since this deployment, so AuthSec will not overwrite it blindly.
          {c ? ` ${CLASSIFICATION_WORDS[c.class] ?? ""}.` : ""} Review the difference on this deployment, then try again.
        </p>
      );
    }
    return null;
  })();

  const effect = effectWords(d, undoPlan, applyPlan, priorNo);

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title={emergency ? "Emergency undo" : "Undo this deployment"}
      description={`Undo deployment of version ${d.version_no} on ${role}.`}
      confirmLabel={emergency ? "Emergency undo" : recoveryPlanId ? "Undo with the role-only plan" : "Undo"}
      busyLabel="Queuing…"
      destructive={emergency}
      pending={action.pending}
      failure={failure}
      failureExtra={extra}
      onConfirm={() => void confirm()}
      confirmDisabled={!!advisoryBlocker || (emergency && !reason.trim())}
      extraActions={
        emergencyAccess.offered && !emergency ? (
          <Button variant="outline" onClick={() => setEmergency(true)} disabled={action.pending}>
            Emergency undo…
          </Button>
        ) : null
      }
    >
      {advisoryBlocker ? (
        <p role="status" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-(--color-warning-text)">
          {UNDO_BLOCKER_WORDS[advisoryBlocker]}
        </p>
      ) : null}

      {plans.isLoading ? <p className="text-(--color-text-muted)">Reading the undo plan…</p> : null}
      {planFailure && !plans.data ? (
        <PolicyLoadFailure failure={planFailure} subject="the undo plan" onRetry={() => void plans.refetch()} />
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {effect.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <p className="text-(--color-text-muted)">
        AuthSec checks AWS first and stops if the role is not as the deployment left it. When the undo is verified the result reads: AuthSec&apos;s
        change was undone; other controls may still restrict this role. {SCOPE_NOTE}
      </p>

      {emergency ? (
        <p className="rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-(--color-danger-text)">
          An emergency undo skips the approval that named the undo plan. It is recorded with your reason and notified. AuthSec still reads AWS first
          and refuses if the role is not in the state the undo starts from.
        </p>
      ) : null}

      <ReasonField id="undo-reason" value={reason} onChange={setReason} required={emergency} />

      {emergency ? (
        <Button variant="link" className="h-auto px-0 text-xs" onClick={() => setEmergency(false)} disabled={action.pending}>
          Use the ordinary undo instead
        </Button>
      ) : null}
    </ActionFrame>
  );
}
