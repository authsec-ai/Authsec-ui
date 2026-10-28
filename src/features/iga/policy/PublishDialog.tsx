/**
 * PublishDialog — modal for publishing a runtime policy.
 *
 * Publication is observe mode. Enforce is refused while IGA_V2_ENFORCE is
 * off, and shadow is not a publication mode, so this dialog does not offer
 * either. The caller supplies a reason and the current ETag.
 *
 * Environment readiness checklist: green/red icons per requirement
 * (policy compiled, all controls valid, approval obtained).
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle, XCircle } from "lucide-react";

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
import { usePublishPolicyMutation } from "./policyApi";

// ── Readiness check ─────────────────────────────────────────────────────────

interface ReadinessItem {
  label: string;
  passed: boolean;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface RolloutTargetSummary {
  workload_id: string;
  instance_id: string;
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  etag: string;
  /** Rollout targets that will be affected by publication. */
  targets?: RolloutTargetSummary[];
  /** Pre-computed readiness state — if omitted the checklist is hidden. */
  readiness?: {
    policyCompiled: boolean;
    allControlsValid: boolean;
    approvalObtained: boolean;
  };
}

// ── Component ────────────────────────────────────────────────────────────────

function publishError(error: unknown): string {
  if (error && typeof error === "object") {
    const body = error as {
      data?: { error?: { message?: string } | string; message?: string };
    };
    const nested = body.data?.error;
    if (nested && typeof nested === "object" && nested.message) return nested.message;
    if (typeof nested === "string" && nested) return nested;
    if (typeof body.data?.message === "string" && body.data.message) return body.data.message;
  }
  return "Could not publish the policy.";
}

export function PublishDialog({
  open,
  onOpenChange,
  policyId,
  etag,
  readiness,
}: PublishDialogProps) {
  const [reason, setReason] = useState("");
  const [publishPolicy, { isLoading }] = usePublishPolicyMutation();

  const canSubmit = reason.trim().length > 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await publishPolicy({
        id: policyId,
        etag,
        mode: "observe",
        reason: reason.trim(),
      }).unwrap();
      toast.success("Policy published.");
      setReason("");
      onOpenChange(false);
    } catch (error) {
      toast.error(publishError(error));
    }
  };

  // Build readiness checklist items when readiness data is provided
  const readinessItems: ReadinessItem[] = readiness
    ? [
        { label: "Policy compiled", passed: readiness.policyCompiled },
        { label: "All controls valid", passed: readiness.allControlsValid },
        { label: "Approval obtained", passed: readiness.approvalObtained },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Policy</DialogTitle>
          <DialogDescription>
            Publish this approved policy in observe mode. Decisions are recorded.
            Traffic is not blocked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Environment readiness checklist ───────────────────────────── */}
          {readinessItems.length > 0 && (
            <div className="space-y-1.5">
              <Label>Environment Readiness</Label>
              <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2">
                <ul className="space-y-1">
                  {readinessItems.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center gap-2 text-xs"
                    >
                      {item.passed ? (
                        <CheckCircle className="size-3.5 shrink-0 text-(--color-success-text)" />
                      ) : (
                        <XCircle className="size-3.5 shrink-0 text-(--color-danger-text)" />
                      )}
                      <span
                        className={
                          item.passed
                            ? "text-(--color-text)"
                            : "text-(--color-danger-text)"
                        }
                      >
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="publish-reason">
              Reason <span className="text-(--color-danger-text)">*</span>
            </Label>
            <Textarea
              id="publish-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe why this policy is being published..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isLoading ? "Publishing..." : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
