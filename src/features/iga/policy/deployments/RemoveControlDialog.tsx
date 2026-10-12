/**
 * Remove AuthSec control (SPEC-iga-phase3-policy.md §8.10, §9.3 S5 "⋯" menu):
 * ending AuthSec's involvement with a role restores the boundary state the
 * role had before AuthSec's first change. It usually widens access, so it is a
 * separate, deliberate change: it says which controls, the access that
 * RETURNS, the owners who will be asked, and submits for owner review
 * (`POST /policies/:id/remove-control`). An emergency variant
 * (`POST .../emergency-remove-control`, governance:emergency) skips review and
 * approval, never the live-state check, and needs a reason.
 *
 * The exact access that returns is computed by the server from AWS when the
 * request is made. Before it, the dialog shows what the policy's boundary
 * removes now (the approved version's apply plan), because that is the access
 * the baseline gives back, and says so.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import { useGetGovPolicyQuery, useGetGovVersionPlansQuery, type GovControlRow, type GovPlanView } from "@/app/api/igaPolicyAuthoringApi";
import {
  useEmergencyRemoveGovControlMutation,
  useRemoveGovControlMutation,
  type GovDelivery,
  type GovRemoveControlResult,
} from "@/app/api/igaPolicyDeploymentsApi";
import { Checkbox } from "@/components/ui/checkbox";

import { PolicyLoadFailure, classifyPolicyError, delivery, plural, roleNameOf, serviceList, usePolicyAction, usePolicyPermission } from "../shared";
import { ActionFrame, ReasonField } from "./ActionFrame";

const SCOPE_NOTE =
  "AuthSec restricts whole AWS services for selected roles. It does not narrow actions or resources within the services a role keeps.";

const DELIVERIES: GovDelivery[] = ["direct", "iac_pr", "export"];

function controlLabel(c: GovControlRow): string {
  return roleNameOf(c.role_arn) || c.role_id;
}

export function RemoveControlDialog({
  ws,
  policyId,
  open,
  onOpenChange,
}: {
  ws: string;
  policyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const policy = useGetGovPolicyQuery({ ws, policyId }, { skip: !open });
  const versionNo = policy.data?.approved_version_no ?? policy.data?.current_version?.no;
  const plans = useGetGovVersionPlansQuery({ ws, policyId, versionNo: versionNo ?? 0 }, { skip: !open || !versionNo });

  const [remove] = useRemoveGovControlMutation();
  const [emergencyRemove] = useEmergencyRemoveGovControlMutation();
  const normal = usePolicyAction("governance:author");
  const urgent = usePolicyAction("governance:emergency");
  const emergencyAccess = usePolicyPermission("governance:emergency");

  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [how, setHow] = useState<GovDelivery>("direct");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<GovRemoveControlResult | null>(null);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setEmergency(false);
      setHow("direct");
      setReason("");
      setResult(null);
      normal.clear();
      urgent.clear();
    }
    // `clear` only resets local state; closing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const controls = useMemo(() => (policy.data?.controls ?? []).filter((c) => c.state !== "removed"), [policy.data]);
  const selectable = controls.filter((c) => c.state !== "removing");
  const chosen = picked ?? new Set(selectable.map((c) => c.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  const applyPlans = (plans.data?.plans ?? []).filter((p) => p.kind === "apply");
  const planOf = (c: GovControlRow): GovPlanView | undefined => applyPlans.find((p) => p.control_id === c.id);
  const chosenControls = controls.filter((c) => chosen.has(c.id));
  const owners = new Set<string>();
  const consumers = new Set<string>();
  for (const c of chosenControls) {
    for (const o of planOf(c)?.impact?.owners ?? []) owners.add(o);
    for (const w of planOf(c)?.impact?.consumers ?? []) consumers.add(w.workload_id);
  }

  const action = emergency ? urgent : normal;
  const loadFailure = classifyPolicyError(policy.error);
  const canSubmit = chosen.size > 0 && (!emergency || reason.trim() !== "");

  async function submit() {
    const body = { policyId, control_ids: [...chosen], reason: reason.trim(), delivery: how };
    const res = emergency ? await urgent.run(() => emergencyRemove(body)) : await normal.run(() => remove(body));
    if (res) {
      setResult(res);
      toast.success(emergency ? "Emergency removal started" : "Submitted for owner review");
    }
  }

  if (result) {
    return (
      <ActionFrame
        open={open}
        onOpenChange={onOpenChange}
        title={emergency ? "Emergency removal started" : "Submitted for review"}
        description="What AuthSec did with your request."
      >
        {result.review ? (
          <p>
            Version {result.version_no} removes AuthSec&apos;s control. It needs an owner review and an approval from someone other than you before
            anything changes in AWS.{" "}
            <Link to={`/iga/policy/reviews/${encodeURIComponent(result.review.review_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
              Open the review
            </Link>
          </p>
        ) : null}
        {result.deployments.length > 0 ? (
          <p>
            {plural(result.deployments.length, "removal deployment")} {result.deployments.length === 1 ? "was" : "were"} created and queued. AuthSec
            reads AWS first and stops if a role is not as expected.{" "}
            <Link to="/iga/policy/deployments" className="font-medium text-(--color-primary-text) hover:underline">
              Open Deployments
            </Link>
          </p>
        ) : null}
        {result.retired_without_plan.length > 0 ? (
          <p>
            {plural(result.retired_without_plan.length, "control")} had no AuthSec boundary in AWS and {result.retired_without_plan.length === 1 ? "was" : "were"}{" "}
            retired at once. Nothing changed in AWS for {result.retired_without_plan.length === 1 ? "it" : "them"}.
          </p>
        ) : null}
        <p className="text-(--color-text-muted)">Services AuthSec no longer excludes may appear again as findings after the next scan.</p>
      </ActionFrame>
    );
  }

  return (
    <ActionFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Remove AuthSec control"
      description="Return the roles to the state they had before AuthSec's first change."
      confirmLabel={emergency ? "Remove now (emergency)" : "Submit for review"}
      busyLabel="Submitting…"
      destructive={emergency}
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void submit()}
      confirmDisabled={!canSubmit}
    >
      <p>
        Removing control gives access back: what AuthSec excluded is no longer excluded. It never removes a restriction AuthSec did not add. {SCOPE_NOTE}
      </p>

      {policy.isLoading ? <p className="text-(--color-text-muted)">Reading the policy…</p> : null}
      {loadFailure && !policy.data ? <PolicyLoadFailure failure={loadFailure} subject="this policy" onRetry={() => void policy.refetch()} /> : null}

      {controls.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Controls to remove</legend>
          <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
            {controls.map((c) => {
              const p = planOf(c);
              const returns = (p?.impact?.removed ?? []).map((s) => s.service).sort();
              const busy = c.state === "removing";
              return (
                <li key={c.id} className="flex items-start gap-3 px-3 py-2">
                  <Checkbox
                    id={`rc-${c.id}`}
                    checked={chosen.has(c.id)}
                    disabled={busy}
                    onCheckedChange={(v) => toggle(c.id, v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor={`rc-${c.id}`} className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-[13px] font-medium">{controlLabel(c)}</span>
                    <span className="block text-xs text-(--color-text-muted)">
                      {busy
                        ? "A removal is already in progress."
                        : c.state === "planned"
                          ? "No boundary in AWS yet: it is retired at once and nothing changes."
                          : returns.length > 0
                            ? `Access that returns: ${serviceList(returns, 8)} (what the boundary excludes now).`
                            : plans.isLoading
                              ? "Reading what the boundary excludes…"
                              : "The exact access that returns is calculated from AWS when you submit."}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : policy.data ? (
        <p className="text-(--color-text-muted)">This policy has no live controls to remove.</p>
      ) : null}

      <p className="text-(--color-text-muted)">
        {emergency
          ? "An emergency removal skips owner review and approval. AuthSec still reads AWS first and stops if a boundary is not as it last applied it."
          : owners.size > 0 || consumers.size > 0
            ? `${plural(owners.size, "owner")} of ${plural(consumers.size, "workload")} that use ${chosenControls.length === 1 ? "this role" : "these roles"} will be asked to review. The change needs an approval from someone other than you.`
            : "The owners of every workload that uses these roles are asked to review. The change needs an approval from someone other than you."}
      </p>

      <div className="space-y-1">
        <label htmlFor="rc-delivery" className="text-xs font-medium">
          How it is delivered
        </label>
        <select
          id="rc-delivery"
          value={how}
          onChange={(e) => setHow(e.target.value as GovDelivery)}
          className="h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-sm"
        >
          {DELIVERIES.map((d) => (
            <option key={d} value={d}>
              {delivery(d)}
            </option>
          ))}
        </select>
      </div>

      {emergencyAccess.offered ? (
        <label className="flex items-start gap-2">
          <Checkbox checked={emergency} onCheckedChange={(v) => setEmergency(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">Emergency removal.</span> Skip review and approval. Recorded with your reason and notified.
          </span>
        </label>
      ) : null}

      <ReasonField id="rc-reason" value={reason} onChange={setReason} required={emergency} />
    </ActionFrame>
  );
}
