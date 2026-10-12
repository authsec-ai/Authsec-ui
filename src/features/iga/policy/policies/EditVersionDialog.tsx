/**
 * Edit a policy (SPEC-iga-phase3-policy.md §9.3 S5 `⋯` menu): a policy is never
 * changed in place, so Edit writes the NEXT version from the latest one
 * (`POST /policies/:id/versions`, `base_version_no` = the latest version, else
 * 409 version_conflict and the page reloads). Only what an author may change
 * without new evidence is offered: keep a service instead of removing it
 * (with a reason and a review date), remove one an earlier edit kept, the
 * observation window, the canary and the delivery. The roles and the services
 * AuthSec proposed removing are not edited here; compile re-justifies every
 * removal from fresh evidence.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import {
  GOV_DELIVERIES,
  useCreateGovVersionMutation,
  type GovPolicyView,
  type GovRightSizeIntent,
  type GovVersionView,
} from "@/app/api/igaPolicyAuthoringApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Meta } from "@/features/iga/shared/components/Panel";

import { PolicyActionError, delivery, roleNameOf, usePolicyAction } from "../shared";
import {
  CANARY_HOURS,
  OBSERVATION_DAYS,
  intentEquals,
  intentProblems,
  isRightSize,
  removedServicesOf,
  restorableServices,
  withCanary,
  withDelivery,
  withObservationDays,
  withRemoved,
  withRetained,
} from "../new/intentEdit";
import { editBlockedReason, policyHref } from "./policyModel";

const fieldClass =
  "h-9 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

export function EditVersionDialog({
  policy,
  versions,
  open,
  onOpenChange,
  onReload,
}: {
  policy: GovPolicyView;
  /** Newest first, as the server lists them. */
  versions: GovVersionView[] | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Re-read the policy and its versions (after a 409). */
  onReload: () => void;
}) {
  const latest = versions?.[0];
  const intent = latest && isRightSize(latest.intent) ? latest.intent : null;
  const baseline = useMemo(() => {
    const first = versions?.[versions.length - 1];
    return first && isRightSize(first.intent) ? first.intent : null;
  }, [versions]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {latest && intent ? (
          <EditForm policy={policy} latest={latest} intent={intent} baseline={baseline} onClose={() => onOpenChange(false)} onReload={onReload} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Edit {policy.name}</DialogTitle>
              <DialogDescription>{editBlockedReason(latest)}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  policy,
  latest,
  intent,
  baseline,
  onClose,
  onReload,
}: {
  policy: GovPolicyView;
  latest: GovVersionView;
  intent: GovRightSizeIntent;
  baseline: GovRightSizeIntent | null;
  onClose: () => void;
  onReload: () => void;
}) {
  const navigate = useNavigate();
  const [create] = useCreateGovVersionMutation();
  const act = usePolicyAction("governance:author");

  const removed = removedServicesOf(intent);
  const restorable = restorableServices(intent, baseline);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [restore, setRestore] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [reviewBy, setReviewBy] = useState("");
  const [days, setDays] = useState(String(intent.observation_days));
  const [hours, setHours] = useState(intent.rollout?.canary_hours ? String(intent.rollout.canary_hours) : "");
  const [target, setTarget] = useState(intent.rollout?.canary_target ?? "");
  const [deliveryKind, setDelivery] = useState(intent.delivery);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setter(n);
  };

  const next = useMemo(() => {
    let n = intent;
    if (keep.size > 0) n = withRetained(n, [...keep], { reason, review_by: reviewBy });
    if (restore.size > 0) n = withRemoved(n, baseline, [...restore]);
    const d = Number(days);
    n = withObservationDays(n, Number.isFinite(d) && days.trim() !== "" ? d : Number.NaN);
    n = withCanary(n, { hours: hours.trim() === "" ? null : Number(hours), target: target === "" ? null : target });
    return withDelivery(n, deliveryKind);
  }, [intent, keep, restore, reason, reviewBy, days, hours, target, deliveryKind, baseline]);

  const problems = intentProblems(next);
  const unchanged = intentEquals(next, intent);
  const replaces = latest.status === "draft" || latest.status === "in_review";

  async function save() {
    const res = await act.run(() => create({ policyId: policy.id, intent: next, baseVersionNo: latest.no }));
    if (res) {
      toast.success(`Version ${res.no} created`);
      onClose();
      navigate(policyHref(policy.id, "versions", `version=${res.no}`));
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {policy.name}</DialogTitle>
        <DialogDescription>
          This creates version {latest.no + 1} from version {latest.no}.{" "}
          {replaces
            ? `Version ${latest.no} is ${latest.status === "draft" ? "a draft" : "in review"} and is withdrawn when you save; ${latest.status === "in_review" ? "its owner review is cancelled and a new one opens when you propose the new version." : "the new version starts as a draft."}`
            : "Nothing already approved or deployed changes until the new version is proposed, reviewed and approved."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-(--color-text)">Services to keep</legend>
          <Meta>Keep a service this version removes. An owner&apos;s keep needs a reason and a date to review it by.</Meta>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {removed.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <Checkbox id={`keep-${s}`} checked={keep.has(s)} onCheckedChange={() => toggle(keep, setKeep, s)} />
                <label htmlFor={`keep-${s}`} className="text-[13px] text-(--color-text)">
                  Keep <span className="font-mono text-xs">{s}</span>
                </label>
              </li>
            ))}
            {removed.length === 0 ? <li className="text-xs text-(--color-text-muted)">This version removes no service.</li> : null}
          </ul>
          {keep.size > 0 ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <label className="block text-xs text-(--color-text-muted)">
                Why {keep.size === 1 ? "is it" : "are they"} kept
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-9" placeholder="Used by the nightly export" />
              </label>
              <label className="block text-xs text-(--color-text-muted)">
                Review by
                <Input type="date" value={reviewBy} onChange={(e) => setReviewBy(e.target.value)} className="mt-1 h-9" />
              </label>
            </div>
          ) : null}
        </fieldset>

        {restorable.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-semibold text-(--color-text)">Kept by an owner</legend>
            <Meta>An earlier edit or an owner kept these. Remove them again as version 1 proposed.</Meta>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {restorable.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <Checkbox id={`restore-${s}`} checked={restore.has(s)} onCheckedChange={() => toggle(restore, setRestore, s)} />
                  <label htmlFor={`restore-${s}`} className="text-[13px] text-(--color-text)">
                    Remove <span className="font-mono text-xs">{s}</span> again
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-[13px] font-semibold text-(--color-text)">Rollout</legend>
          <label className="block text-xs text-(--color-text-muted)">
            Observe for (days, {OBSERVATION_DAYS.min} to {OBSERVATION_DAYS.max})
            <Input type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 h-9" min={OBSERVATION_DAYS.min} max={OBSERVATION_DAYS.max} />
          </label>
          <label className="block text-xs text-(--color-text-muted)">
            Canary window (hours, {CANARY_HOURS.min} to {CANARY_HOURS.max}; blank for the workspace default)
            <Input type="number" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 h-9" min={CANARY_HOURS.min} max={CANARY_HOURS.max} />
          </label>
          <label className="block text-xs text-(--color-text-muted)">
            Canary role
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${fieldClass} mt-1`}>
              <option value="">Chosen by AuthSec</option>
              {intent.subjects.map((s) => (
                <option key={s.role_id} value={s.role_id}>
                  {roleNameOf(latest.targets.find((t) => t.role_id === s.role_id)?.role_arn) || s.role_id} ({s.account_id})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-(--color-text-muted)">
            Delivery
            <select value={deliveryKind} onChange={(e) => setDelivery(e.target.value as GovRightSizeIntent["delivery"])} className={`${fieldClass} mt-1`}>
              {GOV_DELIVERIES.map((d) => (
                <option key={d} value={d}>
                  {delivery(d)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {!unchanged && problems.length > 0 ? (
          <ul role="alert" className="list-disc space-y-0.5 pl-5 text-xs text-(--color-danger-text)">
            {problems.map((p) => (
              <li key={`${p.field}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        ) : null}
        <PolicyActionError failure={act.failure}>
          {act.failure?.code === "version_conflict" ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                onReload();
                onClose();
              }}
            >
              Reload the policy
            </Button>
          ) : null}
        </PolicyActionError>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={act.pending}>
          Cancel
        </Button>
        <Button className="text-white" onClick={() => void save()} disabled={act.pending || unchanged || problems.length > 0}>
          {act.pending ? "Saving…" : `Create version ${latest.no + 1}`}
        </Button>
      </DialogFooter>
    </>
  );
}
