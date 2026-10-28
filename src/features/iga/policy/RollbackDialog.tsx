/**
 * RollbackDialog — modal for rolling back a published runtime policy.
 *
 * Simpler than PublishDialog: only a required reason textarea.
 * Fires `rollbackPolicy` with the current ETag on submit.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

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

import { useRollbackPolicyMutation } from "./policyApi";

// ── Props ────────────────────────────────────────────────────────────────────

interface RollbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyId: string;
  etag: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RollbackDialog({
  open,
  onOpenChange,
  policyId,
  etag,
}: RollbackDialogProps) {
  const [reason, setReason] = useState("");
  const [rollbackPolicy, { isLoading }] = useRollbackPolicyMutation();

  const canSubmit = reason.trim().length > 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      await rollbackPolicy({
        id: policyId,
        etag,
        reason: reason.trim(),
      }).unwrap();
      toast.success("Policy rolled back successfully.");
      // Reset and close
      setReason("");
      onOpenChange(false);
    } catch {
      toast.error("Failed to roll back policy.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rollback Policy</DialogTitle>
          <DialogDescription>
            This will revert the published policy to its previous state.
            Provide a reason for the rollback.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rollback-reason">
              Reason <span className="text-(--color-danger-text)">*</span>
            </Label>
            <Textarea
              id="rollback-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe why this policy is being rolled back..."
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
            variant="destructive"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isLoading ? "Rolling back..." : "Rollback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
