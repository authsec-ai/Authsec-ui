/**
 * Pause, Resume or End now, with the reason the history keeps. Each one changes
 * AWS: pausing and ending take AuthSec's IAM policy off every role, resuming
 * puts the current version back.
 */

import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Link } from "react-router-dom";

import {
  useEndAccessPolicyMutation,
  usePauseAccessPolicyMutation,
  useResumeAccessPolicyMutation,
  type AccessPolicy,
} from "@/app/api/igaAccessPoliciesApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { PolicyActionError, usePolicyAction } from "../shared";

import { inCloud, policyProvider } from "./model";

export type LifecycleAction = "pause" | "resume" | "end";

const COPY: Record<LifecycleAction, { title: string; button: string; done: string; reasonRequired: boolean }> = {
  pause: { title: "Pause this policy?", button: "Pause", done: "Paused. AuthSec is taking it out of AWS.", reasonRequired: true },
  resume: { title: "Resume this policy?", button: "Resume", done: "Resumed. AuthSec is putting it back into AWS.", reasonRequired: false },
  end: { title: "End this policy now?", button: "End now", done: "Ended. AuthSec is taking it out of AWS.", reasonRequired: true },
};

function body(action: LifecycleAction, p: AccessPolicy): string {
  const roles = p.roles.length === 1 ? p.roles[0].name : `${p.roles.length} roles`;
  const effect = p.effect === "block" ? "The block is lifted" : "The extra access is removed";
  switch (action) {
    case "pause":
      return `${effect} from ${roles} until you resume it. The policy and its history stay.`;
    case "resume":
      return `AuthSec puts the current version back on ${roles}. If its window has passed, it ends instead.`;
    default:
      return `${effect} from ${roles} for good. The record and its history are kept; it cannot be resumed.`;
  }
}

export function LifecycleDialog({
  policy,
  action,
  onClose,
}: {
  policy: AccessPolicy | null;
  action: LifecycleAction | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pause] = usePauseAccessPolicyMutation();
  const [resume] = useResumeAccessPolicyMutation();
  const [end] = useEndAccessPolicyMutation();
  const act = usePolicyAction("governance:enforce");
  const open = !!policy && !!action;

  useEffect(() => {
    if (open) {
      setReason("");
      act.clear();
    }
    // Only opening resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!policy || !action) return null;
  const c = COPY[action];
  const missing = c.reasonRequired && !reason.trim();

  // Resuming a policy whose window has already passed is refused with
  // `access_policy_invalid` on `ends_at` (contract). Editing the window is the
  // way forward, so offer it in place of a bare error.
  const resumeExpired =
    action === "resume" && act.failure?.code === "access_policy_invalid" && act.failure?.field === "ends_at";

  async function go() {
    if (!policy || !action || missing) return;
    const args = { id: policy.id, reason: reason.trim() };
    const run = action === "pause" ? () => pause(args) : action === "resume" ? () => resume(args) : () => end(args);
    const ok = await act.run(run);
    if (ok) {
      toast.success(inCloud(c.done, policyProvider(policy)));
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{body(action, policy)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="lifecycle-reason" className="text-[13px] font-medium text-(--color-text)">
            Why{c.reasonRequired ? "" : " (optional)"}
          </label>
          <Textarea id="lifecycle-reason" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the policy's history" />
        </div>
        {resumeExpired ? (
          <div className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
            <p className="font-semibold">This policy&rsquo;s window has already ended.</p>
            <p className="mt-0.5">Resuming it would do nothing. Edit it to set a new window instead.</p>
          </div>
        ) : (
          <PolicyActionError failure={act.failure} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          {resumeExpired ? (
            <Button asChild className="text-white">
              <Link to={`/iga/policy/${policy.id}/edit`}>Edit instead</Link>
            </Button>
          ) : (
            <Button
              variant={action === "end" ? "destructive" : "default"}
              className="text-white"
              onClick={() => void go()}
              disabled={act.pending || missing}
            >
              {act.pending ? "Working…" : c.button}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
