/**
 * One-click classification from the Discovery details panel (2026-10-06
 * design; decided by the product owner over the reason dialog).
 *
 * The backend still requires a reason — it is the audit record — so a click
 * sends a fixed one that says how the decision was made. Who decided and when
 * are recorded by the server as for any decision. Two choices, because the
 * backend has two values: Agent (classified_agent) and Not an agent
 * (unclassified, undoing an earlier Agent decision when there is one).
 *
 * The workload's detail read supplies what a decision needs and the row does
 * not carry: the reader's permission, the version to decide against, and the
 * decision an undo refers to. It is the detail page's own cache entry.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { useStore } from "react-redux";

import {
  igaGraphApi,
  refId,
  useClassifyWorkloadMutation,
  useGetGraphWorkloadQuery,
  type ClassificationConflict,
  type ClassifyRequest,
  type GraphRef,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { graphSessionGeneration, useGraphRevision } from "../shared/revision";

const ONE_CLICK_REASON = "Classified with one click from Discovery";

/** Attempts whose answer never arrived, kept so a retry resends the same operation id. Session memory only. */
const uncertain = new Map<string, ClassifyRequest>();

export function QuickClassify({ ws, workloadRef, name }: { ws: string; workloadRef: GraphRef; name: string }) {
  const id = refId(workloadRef);
  const { rev, epoch } = useGraphRevision(ws);
  const detail = useGetGraphWorkloadQuery({ ws, rev, key: String(epoch), id }, { skip: rev == null });
  const [classify, { isLoading }] = useClassifyWorkloadMutation();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [problem, setProblem] = useState<string | null>(null);

  const w = detail.currentData?.data;
  const canClassify = !!detail.currentData?.meta?.capabilities?.can_classify;
  if (!w || !canClassify || w.classification === "provider_native_agent" || w.lifecycle !== "active") return null;

  // An unclassified workload has no decision either way: neither choice is shown
  // as made. "Not an agent" is a decision only as the undo of an Agent one.
  const current: "agent" | "none" = w.classification === "classified_agent" ? "agent" : "none";

  // Write a classification into every cached copy of this workload at once (as
  // the dialog does): a refetch at the pinned revision may be refused as stale.
  const patchCaches = (next: { classification: string; classification_version: number }, decision?: Record<string, unknown>) => {
    const state = store.getState();
    for (const args of igaGraphApi.util.selectCachedArgsForQuery(state, "getGraphWorkload")) {
      if (args.ws !== ws || args.id !== id) continue;
      dispatch(
        igaGraphApi.util.updateQueryData("getGraphWorkload", args, (d) => {
          if (d.data.classification_version <= next.classification_version) Object.assign(d.data, next, decision ? { decision } : {});
        }),
      );
    }
    for (const args of igaGraphApi.util.selectCachedArgsForQuery(state, "listGraphWorkloads")) {
      if (args.ws !== ws) continue;
      dispatch(
        igaGraphApi.util.updateQueryData("listGraphWorkloads", args, (d) => {
          for (const row of d.data) if (row.ref === workloadRef && row.classification_version <= next.classification_version) Object.assign(row, next);
        }),
      );
    }
  };

  const decide = async (choice: "agent" | "not_agent") => {
    if (isLoading || (choice === "agent" && current === "agent") || (choice === "not_agent" && current !== "agent")) return;
    setProblem(null);
    // A retry after an uncertain answer sends the SAME request (same operation
    // id), so the server records it at most once — as the dialog does.
    const attemptKey = `${graphSessionGeneration()}|${ws}|${workloadRef}|${choice}`;
    const body: ClassifyRequest = uncertain.get(attemptKey) ?? {
      operation_id: crypto.randomUUID(),
      decision: choice === "agent" ? "classified_agent" : "unclassified",
      purpose: "",
      reason: ONE_CLICK_REASON,
      expected_version: w.classification_version,
      undoes_decision_id: choice === "not_agent" ? (w.decision?.id ?? null) : null,
    };
    uncertain.set(attemptKey, body);
    const generation = graphSessionGeneration();
    try {
      const res = await classify({ ws, id, body }).unwrap();
      if (generation !== graphSessionGeneration() || ws !== getWorkspaceId()) return;
      uncertain.delete(attemptKey);
      patchCaches({ classification: res.classification, classification_version: res.classification_version }, { ...res.decision, decision: body.decision });
      toast.success(
        res.replayed
          ? "Your earlier decision was recorded. The latest classification is being refreshed."
          : choice === "agent"
            ? `${name} classified as agent`
            : `Classification of ${name} undone`,
      );
    } catch (e) {
      if (generation !== graphSessionGeneration() || ws !== getWorkspaceId()) return;
      const x = e as { status?: number | string; data?: { error?: { code?: string; message?: string; current?: ClassificationConflict } } };
      const status = x.status;
      const err = x.data?.error;
      // A definite refusal ends this attempt; a network or server failure keeps it for a retry.
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429) uncertain.delete(attemptKey);
      if (status === 409 && err?.code === "classification_conflict" && err.current) {
        setProblem(`${err.current.decided_by?.display ?? "Someone"} changed this classification. It now shows theirs; choose again if you still disagree.`);
        patchCaches({ classification: err.current.classification, classification_version: err.current.classification_version });
        // Their decision record, so a later undo refers to it.
        void detail.refetch();
      } else if (status === 403) {
        setProblem("Classifying needs the iga:review permission.");
      } else if (status === 422 && err?.code === "provider_native") {
        setProblem("AWS identifies this as an agent service, so its classification is not editable.");
      } else if (status === 422 && err?.code === "operation_id_reused") {
        setProblem("This request id belongs to another decision. Review the current classification, then choose again.");
      } else if (status === 422) {
        setProblem(err?.message ?? "The decision was not accepted.");
      } else {
        setProblem("The result is uncertain. Choosing again sends the exact same decision, so it cannot be recorded twice.");
      }
    }
  };

  const option = (choice: "agent" | "not_agent", label: string) => {
    const on = choice === "agent" && current === "agent";
    const inert = choice === "not_agent" && current !== "agent";
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={isLoading || inert}
        title={inert ? "Not recorded as an agent already" : undefined}
        onClick={() => void decide(choice)}
        className={cn(
          "h-9 rounded-md border px-3 text-[13px] font-medium disabled:opacity-60",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)",
          on
            ? "border-(--color-primary) bg-(--color-primary) text-white"
            : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text) hover:bg-(--color-surface-subtle)",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-(--color-text)">Classify this workload</span>
      <div role="group" aria-label="Classification" className="flex flex-wrap gap-1.5">
        {option("agent", "Agent")}
        {option("not_agent", "Not an agent")}
      </div>
      {problem ? (
        <p role="alert" className="text-xs text-(--color-danger-text)">
          {problem}
        </p>
      ) : (
        <p className="text-xs text-(--color-text-muted)">Recorded with your name and the time, as any decision is.</p>
      )}
    </div>
  );
}
