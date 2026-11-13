/**
 * Suggested agent: "Classify as agent" (the existing classification decision,
 * confirmed from a suggestion) and "Dismiss". A suggestion never sets a
 * classification by itself; only these two do, and both are recorded.
 *
 * Confirm sends `operation_id` (a client UUID, kept for the life of the dialog
 * so a retry replays rather than decides twice) and `version`, the workload's
 * `classification_version` the person saw (agent_runtime_controller.go:298).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";

import { useAppDispatch } from "@/app/hooks";
import { igaAgentRuntimeApi, useConfirmAgentSuggestionMutation, useDismissAgentSuggestionMutation, type AgentSuggestion } from "@/app/api/igaAgentRuntimeApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { newOperationId } from "./model";
import { ActionError } from "./parts";
import { useArAction } from "./useArAction";

export type SuggestionDecision = "confirm" | "dismiss";

export function SuggestionDialog({
  suggestion,
  decision,
  onClose,
  onDone,
}: {
  suggestion: AgentSuggestion | null;
  decision: SuggestionDecision | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm] = useConfirmAgentSuggestionMutation();
  const [dismiss] = useDismissAgentSuggestionMutation();
  const act = useArAction();
  const dispatch = useAppDispatch();
  const op = useRef(newOperationId());
  const open = !!suggestion && !!decision;

  useEffect(() => {
    if (open) {
      setReason("");
      act.clear();
      op.current = newOperationId();
    }
    // Only opening resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestion?.id]);

  if (!suggestion || !decision) return null;
  const isConfirm = decision === "confirm";
  const missing = !isConfirm && !reason.trim();

  async function go() {
    if (!suggestion || missing) return;
    const ok = isConfirm
      ? await act.run(() => confirm({ id: suggestion.id, operation_id: op.current, version: suggestion.workload.classification_version, reason: reason.trim() || undefined }))
      : await act.run(() => dismiss({ id: suggestion.id, reason: reason.trim() }));
    if (ok !== undefined) {
      toast.success(isConfirm ? "Classified as an agent." : "Suggestion dismissed.");
      onDone?.();
      onClose();
      return;
    }
    // The decision did not apply to what the person saw (409 classification_conflict, suggestion_not_pending):
    // read the suggestion and the AI workloads again, and never replay this operation id.
    const f = act.lastFailure.current;
    if (f && (f.kind === "conflict" || f.code === "classification_conflict" || f.code === "suggestion_not_pending")) {
      op.current = newOperationId();
      dispatch(igaAgentRuntimeApi.util.invalidateTags([{ type: "AgentRuntime", id: "AI" }, { type: "AgentRuntime", id: "SUGGESTIONS" }]));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isConfirm ? "Classify as agent?" : "Dismiss this suggestion?"}</DialogTitle>
          <DialogDescription>
            {isConfirm
              ? `${suggestion.workload.name} will be classified as an agent. This is your decision, recorded with your name.`
              : `${suggestion.workload.name} will not be suggested again while it stays the same workload. The reason is kept.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="suggestion-reason" className="text-[13px] font-medium text-(--color-text)">
            Why{isConfirm ? " (optional)" : ""}
          </label>
          <Textarea
            id="suggestion-reason"
            rows={3}
            maxLength={500}
            value={reason}
            disabled={act.pending}
            // A changed reason is a different decision: it needs its own operation id, or the backend answers 422 operation_id_reused.
            onChange={(e) => {
              op.current = newOperationId();
              setReason(e.target.value);
            }} placeholder="Kept in the history" />
        </div>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending || missing}>
            {act.pending ? "Working…" : isConfirm ? "Classify as agent" : "Dismiss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
