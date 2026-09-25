/**
 * Classify as agent, and its undo (SPEC-iga-phase2-graph.md §2.14.3, §5.5).
 *
 * - One `operation_id` per intent, generated when the dialog opens and reused
 *   on every retry of that intent. A retry whose first attempt did commit is
 *   answered with the stored outcome (`replayed`), so a lost response never
 *   records the decision twice.
 * - Concurrent edits are optimistic: the request carries the version it was
 *   made against. On `409` the second person sees the first person's
 *   decision; replacing it is a NEW intent with a new operation id and the
 *   version the 409 returned.
 * - Undo records its own decision; nothing is deleted.
 */

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "react-hot-toast";
import { useStore } from "react-redux";

import {
  igaGraphApi,
  refId,
  useClassifyWorkloadMutation,
  type ClassificationConflict,
  type ClassifyRequest,
  type GraphErrorBody,
  type WorkloadDetail,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { getWorkspaceId } from "@/utils/workspace";
import { graphSessionGeneration, onGraphSessionReset } from "../shared/revision";
import { CLASSIFICATION_LABEL } from "../shared/labels";

type Mode = "classify" | "undo";
// Closing an uncertain request must not give its retry a new operation id.
// This is session memory only; classification reasons never enter storage.
const uncertainAttempts = new Map<string, ClassifyRequest>();
onGraphSessionReset(() => uncertainAttempts.clear());

function errorOf(e: unknown): { status?: number | string; body?: GraphErrorBody["error"] } {
  const x = e as { status?: number | string; data?: Partial<GraphErrorBody> };
  return { status: x?.status, body: x?.data?.error };
}

export function ClassifyDialog({
  workload,
  mode,
  open,
  onOpenChange,
}: {
  workload: WorkloadDetail;
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [classify, { isLoading }] = useClassifyWorkloadMutation();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const ws = getWorkspaceId() ?? "";
  const attemptKey = `${graphSessionGeneration()}|${ws}|${workload.ref}|${mode}`;
  const savedAttempt = uncertainAttempts.get(attemptKey);
  const [attempt, setAttempt] = useState<ClassifyRequest | null>(() => savedAttempt ?? null);
  const [purpose, setPurpose] = useState(() => savedAttempt?.purpose ?? "");
  const [reason, setReason] = useState(() => savedAttempt?.reason ?? "");
  // The intent: its operation id and the version it is made against.
  const [intent, setIntent] = useState(() => ({
    operationId: savedAttempt?.operation_id ?? crypto.randomUUID(),
    expectedVersion: savedAttempt?.expected_version ?? workload.classification_version,
  }));
  const [conflict, setConflict] = useState<ClassificationConflict | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setAttempt(null);
    setPurpose("");
    setReason("");
    setConflict(null);
    setProblem(null);
    setIntent({ operationId: crypto.randomUUID(), expectedVersion: workload.classification_version });
  };

  const submit = async () => {
    setProblem(null);
    const body: ClassifyRequest = attempt ?? uncertainAttempts.get(attemptKey) ?? {
      operation_id: intent.operationId,
      decision: mode === "classify" ? "classified_agent" : "unclassified",
      purpose: mode === "classify" ? purpose.trim() : "",
      reason: reason.trim(),
      expected_version: intent.expectedVersion,
      undoes_decision_id: mode === "undo" ? (workload.decision?.id ?? null) : null,
    };
    setAttempt(body);
    uncertainAttempts.set(attemptKey, body);
    const generation = graphSessionGeneration();
    try {
      const id = refId(workload.ref);
      const res = await classify({ ws, id, body }).unwrap();
      if (generation !== graphSessionGeneration() || ws !== getWorkspaceId()) return;
      // Classification is not part of a graph revision (§5.5): the decision is
      // written into every cached copy of this workload at once. The refetch
      // the save triggers reads at the pinned revision and may be refused as
      // stale; without this the old classification and version would stay on
      // screen, and the next save would conflict with the customer's own.
      const state = store.getState();
      const patch = { classification: res.classification, classification_version: res.classification_version };
      for (const args of igaGraphApi.util.selectCachedArgsForQuery(state, "getGraphWorkload")) {
        if (args.ws !== ws || args.id !== id) continue;
        dispatch(
          igaGraphApi.util.updateQueryData("getGraphWorkload", args, (d) => {
            if (d.data.classification_version <= res.classification_version) Object.assign(d.data, patch, { decision: { ...res.decision, decision: body.decision } });
          }),
        );
      }
      for (const args of igaGraphApi.util.selectCachedArgsForQuery(state, "listGraphWorkloads")) {
        if (args.ws !== ws) continue;
        dispatch(
          igaGraphApi.util.updateQueryData("listGraphWorkloads", args, (d) => {
            for (const row of d.data) if (row.ref === workload.ref && row.classification_version <= res.classification_version) Object.assign(row, patch);
          }),
        );
      }
      toast.success(
        res.replayed ? "Your earlier decision was recorded. The latest classification is being refreshed." : mode === "classify"
          ? `${workload.name} classified as agent`
          : `Classification of ${workload.name} undone`,
      );
      uncertainAttempts.delete(attemptKey);
      reset();
      onOpenChange(false);
    } catch (e) {
      if (generation !== graphSessionGeneration() || ws !== getWorkspaceId()) return;
      const { status, body: err } = errorOf(e);
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        uncertainAttempts.delete(attemptKey);
        setAttempt(null);
        setIntent({ operationId: crypto.randomUUID(), expectedVersion: body.expected_version });
      }
      if (status === 409 && err?.code === "classification_conflict" && err.current) {
        setConflict(err.current);
      } else if (status === 403) {
        setProblem("Classifying needs the iga:review permission and a signed-in workspace member.");
      } else if (status === 422 && err?.code === "provider_native") {
        setProblem("AWS identifies this as an agent service, so its classification is not editable.");
      } else if (status === 422 && err?.code === "operation_id_reused") {
        setProblem("This request id belongs to another decision. Review the current classification before submitting a new decision.");
      } else if (status === 422) {
        setProblem(err?.message ?? "The decision was not accepted.");
      } else {
        // Network or server failure: the same intent, the same operation id, on retry.
        setProblem("The result is uncertain. Retry sends the exact same decision and request id, so it cannot be recorded twice.");
      }
    }
  };

  /** Replace their decision: a new intent against the version the 409 returned. */
  const replace = () => {
    if (!conflict) return;
    setAttempt(null);
    setIntent({ operationId: crypto.randomUUID(), expectedVersion: conflict.classification_version });
    setConflict(null);
  };

  const canSave = reason.trim().length > 0 && !isLoading && !conflict;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (isLoading) return;
        if (!o && !uncertainAttempts.has(attemptKey)) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "classify" ? "Classify as agent" : "Undo classification"}</DialogTitle>
          <DialogDescription>
            {mode === "classify"
              ? `Record that ${workload.name} is an AI agent. The decision is audited with your name, and changes no access conclusion.`
              : `Record that ${workload.name} is no longer classified as an agent. The earlier decision stays in the history.`}
          </DialogDescription>
        </DialogHeader>

        {conflict ? (
          <div className="space-y-2 rounded-md border border-(--color-border-subtle) px-3 py-3 text-sm" role="alert">
            <p className="font-medium">Someone else decided first</p>
            <p className="text-(--color-text-muted)">
              It is now "{CLASSIFICATION_LABEL[conflict.classification]}"
              {conflict.decided_by ? `, recorded by ${conflict.decided_by.display}` : ""}
              {conflict.decided_at ? ` on ${format(new Date(conflict.decided_at), "d MMM, HH:mm")}` : ""}
              {conflict.reason ? `: ${conflict.reason}` : "."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Keep their decision
              </Button>
              <Button variant="outline" size="sm" onClick={replace}>
                Replace it with mine
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {mode === "classify" ? (
            <div className="space-y-1.5">
              <Label htmlFor="classify-purpose">Purpose (optional)</Label>
              <Input
                id="classify-purpose"
                disabled={!!attempt || isLoading}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Customer support triage"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="classify-reason">Reason</Label>
            <Textarea
              id="classify-reason"
              disabled={!!attempt || isLoading}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "classify" ? "Owns tier-1 ticket routing" : "Not an agent: a scheduled export job"}
              rows={3}
            />
          </div>
          {attempt && !problem && !isLoading ? <p className="text-sm text-(--color-text-muted)">An earlier attempt has no confirmed result. Retry sends that same decision unchanged.</p> : null}
          {problem ? (
            <p className="text-sm text-(--color-warning-text)" role="alert">
              {problem}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={isLoading} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSave}>
            {isLoading ? "Saving…" : attempt ? "Retry same decision" : mode === "classify" ? "Classify as agent" : "Undo classification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
