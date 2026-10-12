/**
 * What an approver or author can do about a review that is not finishing
 * (SPEC-iga-phase3-policy.md §7.4): **Remind** (`governance:author`: re-sends
 * the review to every owner who has not responded) and **Exception**
 * (`governance:approve`: let the version proceed without the missing owners or
 * answers, reason required; never the version's author). Each control is hidden
 * once the server has refused its permission, and every refusal is shown in
 * words under the control.
 */

import { useState } from "react";

import { useExceptGovReviewMutation, useRemindGovReviewMutation, type GovReviewView } from "@/app/api/igaPolicyAuthoringApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";
import { SessionManager } from "@/utils/sessionManager";

import { PolicyActionError, plural, usePolicyAction, usePolicyPermission } from "../shared";

export function ReviewAdminControls({ review }: { review: GovReviewView }) {
  const author = usePolicyPermission("governance:author");
  const approve = usePolicyPermission("governance:approve");
  const [remind] = useRemindGovReviewMutation();
  const [except] = useExceptGovReviewMutation();
  const remindAction = usePolicyAction("governance:author");
  const exceptAction = usePolicyAction("governance:approve");
  const [reminded, setReminded] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const takesReminders = review.status === "open" || review.status === "reopened";
  const isAuthor = SessionManager.getSession()?.user_id === review.version.created_by;
  const showRemind = author.offered && takesReminders;
  const showExcept = approve.offered && takesReminders && !isAuthor;
  if (!showRemind && !showExcept) return null;

  const silent = review.responses.filter((r) => !r.response);

  async function sendReminders() {
    const res = await remindAction.run(() => remind({ id: review.id }));
    if (res) {
      const names = new Map(review.responses.map((r) => [r.user_id, r.name || "an owner"]));
      setReminded(res.reminded_user_ids.map((u) => names.get(u) ?? "an owner"));
    }
  }

  async function recordException() {
    const res = await exceptAction.run(() => except({ id: review.id, reason: reason.trim() }));
    if (res) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <Panel title="Review controls" description="For people who can author or approve. Owners do not see these.">
      <div className="space-y-3">
        {showRemind ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => void sendReminders()} disabled={remindAction.pending || silent.length === 0}>
                Remind owners
              </Button>
              <Meta>
                {silent.length === 0
                  ? "Every owner has responded."
                  : `Re-sends the review to ${plural(silent.length, "owner")} who ${silent.length === 1 ? "has" : "have"} not responded, and asks owners added since.`}
              </Meta>
            </div>
            {reminded ? (
              <p role="status" className="text-xs text-(--color-success-text)">
                {reminded.length === 0 ? "Nobody needed a reminder." : `Reminded ${reminded.join(", ")}.`}
              </p>
            ) : null}
            <PolicyActionError failure={remindAction.failure} />
          </div>
        ) : null}

        {showExcept ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => setOpen(true)}>
                Record an exception…
              </Button>
              <Meta>Lets the version proceed without the missing owners or answers. Silence is not consent; the exception is recorded with your name and reason.</Meta>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={(o) => (exceptAction.pending ? undefined : setOpen(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Let this version proceed without the owners?</DialogTitle>
            <DialogDescription>
              Version {review.version.version_no} of {review.version.policy_name} can then be approved even though {plural(review.blockers.length, "owner step")} {review.blockers.length === 1 ? "is" : "are"} still open. An
              exception does not count as an owner&apos;s acknowledgement.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5 text-[13px] text-(--color-text)">
            {review.blockers.map((b, i) => (
              <li key={`${b.kind}-${b.user_id ?? b.target_id ?? i}`}>{b.name || b.kind.replace(/_/g, " ")}{b.detail ? `: ${b.detail}` : ""}</li>
            ))}
          </ul>
          <label className="block text-[13px] font-medium text-(--color-text)" htmlFor="exception-reason">
            Reason (required)
          </label>
          <Textarea id="exception-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="The owner is on leave; the role has had no traffic for a year" />
          <PolicyActionError failure={exceptAction.failure} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={exceptAction.pending}>
              Cancel
            </Button>
            <Button onClick={() => void recordException()} disabled={exceptAction.pending || reason.trim() === ""}>
              Record exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
