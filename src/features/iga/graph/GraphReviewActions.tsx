/**
 * GraphReviewActions — attest / remediate / reject actions for graph review.
 *
 * Provides three action buttons. Each opens a dialog asking for a reason,
 * then fires a placeholder handler (toast notification) until the backend
 * graph-review API is available (Batch 11).
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle2, Wrench, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Types ────────────────────────────────────────────────────────────────────

type ReviewAction = "attest" | "remediate" | "reject";

interface GraphReviewActionsProps {
  entityId: string;
  entityType: string;
  graphRevision: number;
}

// ── Action metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<
  ReviewAction,
  {
    label: string;
    pastLabel: string;
    dialogTitle: string;
    dialogDescription: string;
    placeholder: string;
    buttonVariant: "default" | "outline" | "destructive";
    icon: typeof CheckCircle2;
  }
> = {
  attest: {
    label: "Attest",
    pastLabel: "attested",
    dialogTitle: "Attest Entity",
    dialogDescription:
      "Confirm that this entity's current graph state is correct and expected. Provide a reason for the attestation.",
    placeholder: "This entity's access paths are as expected because...",
    buttonVariant: "default",
    icon: CheckCircle2,
  },
  remediate: {
    label: "Remediate",
    pastLabel: "flagged for remediation",
    dialogTitle: "Remediate Entity",
    dialogDescription:
      "Flag this entity for remediation. Describe the issue and the expected corrective action.",
    placeholder: "This entity requires remediation because...",
    buttonVariant: "outline",
    icon: Wrench,
  },
  reject: {
    label: "Reject",
    pastLabel: "rejected",
    dialogTitle: "Reject Entity",
    dialogDescription:
      "Reject this entity's current graph state. This will flag it for immediate review and possible revocation.",
    placeholder: "This entity is rejected because...",
    buttonVariant: "destructive",
    icon: XCircle,
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export function GraphReviewActions({
  entityId,
  entityType,
  graphRevision,
}: GraphReviewActionsProps) {
  const [activeAction, setActiveAction] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const openDialog = (action: ReviewAction) => {
    setReason("");
    setActiveAction(action);
  };

  const closeDialog = () => {
    if (submitting) return;
    setActiveAction(null);
    setReason("");
  };

  const handleSubmit = async () => {
    if (!activeAction || reason.trim().length === 0) return;
    setSubmitting(true);

    const meta = ACTION_META[activeAction];

    // Placeholder: toast until the backend graph-review API ships (Batch 11).
    // The real handler will call a mutation like useSubmitGraphReviewMutation().
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      toast.success(
        `${entityType} ${entityId.slice(0, 8)}... ${meta.pastLabel} at revision ${graphRevision}.`,
      );
      closeDialog();
    } catch {
      toast.error(`Failed to ${activeAction} entity.`);
    } finally {
      setSubmitting(false);
    }
  };

  const meta = activeAction ? ACTION_META[activeAction] : null;

  return (
    <>
      {/* ── Action buttons ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="mr-2 text-xs tabular-nums text-(--color-text-muted)">
          rev {graphRevision}
        </span>

        <Button
          size="sm"
          variant="default"
          className="gap-1.5"
          onClick={() => openDialog("attest")}
        >
          <CheckCircle2 className="size-3.5" />
          Attest
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => openDialog("remediate")}
        >
          <Wrench className="size-3.5" />
          Remediate
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => openDialog("reject")}
        >
          <XCircle className="size-3.5" />
          Reject
        </Button>
      </div>

      {/* ── Reason dialog ─────────────────────────────────────────────── */}
      <Dialog open={activeAction != null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{meta?.dialogTitle}</DialogTitle>
            <DialogDescription>{meta?.dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2">
              <p className="text-xs text-(--color-text-muted)">
                <span className="font-medium text-(--color-text)">Entity:</span>{" "}
                <span className="font-mono">{entityId}</span>
              </p>
              <p className="mt-1 text-xs text-(--color-text-muted)">
                <span className="font-medium text-(--color-text)">Type:</span> {entityType}
                {" \u00B7 "}
                <span className="font-medium text-(--color-text)">Revision:</span> {graphRevision}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="review-reason">
                Reason <span className="text-(--color-danger-text)">*</span>
              </Label>
              <Textarea
                id="review-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={meta?.placeholder}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={closeDialog}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant={meta?.buttonVariant ?? "default"}
              disabled={reason.trim().length === 0 || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Submitting..." : meta?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
