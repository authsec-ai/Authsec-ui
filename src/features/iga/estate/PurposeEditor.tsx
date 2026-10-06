/**
 * A workload's purpose, on its Overview: shown when recorded, explained and
 * offered when not.
 *
 * The backend keeps a purpose on a classification decision, and only an
 * Agent decision carries one. So adding or editing a purpose records a new
 * Agent decision with it — for a workload already classified as an agent,
 * nothing else changes; for one that is not, saving classifies it, and the
 * editor says so before the click. The fixed reason is the audit record, as
 * the one-click classification's is.
 */

import { useState } from "react";
import { useStore } from "react-redux";

import { igaGraphApi, refId, useClassifyWorkloadMutation, type ClassificationConflict, type ClassifyRequest, type WorkloadDetail } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getWorkspaceId } from "@/utils/workspace";

import { graphSessionGeneration } from "../shared/revision";

/** The backend's limit (services.MaxClassificationPurpose). */
const MAX_PURPOSE = 500;

/**
 * Saves whose answer never arrived, by workload and text, kept for the
 * session so a retry — even after Cancel and reopening — resends the same
 * operation id and is recorded at most once (as ClassifyDialog does).
 */
const uncertain = new Map<string, ClassifyRequest>();

export function PurposeEditor({
  ws,
  w,
  editable,
  locked,
}: {
  ws: string;
  w: WorkloadDetail;
  /** The reader may classify, and the workload can still be classified. */
  editable: boolean;
  /** Why no one can add a purpose here (retired, not in the publication), said instead of the permission hint. */
  locked?: string;
}) {
  const [classify, { isLoading }] = useClassifyWorkloadMutation();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const agent = w.classification === "classified_agent";
  const purpose = agent ? (w.decision?.purpose ?? "").trim() : "";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(purpose);
  const [problem, setProblem] = useState<string | null>(null);

  const open = () => {
    setText(purpose);
    setProblem(null);
    setEditing(true);
  };

  const unchanged = text.trim() === purpose;

  const save = async () => {
    const next = text.trim();
    if (!next || unchanged || isLoading) return;
    setProblem(null);
    const attemptKey = `${graphSessionGeneration()}|${ws}|${w.ref}|${next}`;
    const body: ClassifyRequest =
      uncertain.get(attemptKey) ?? {
            operation_id: crypto.randomUUID(),
            decision: "classified_agent",
            purpose: next,
            reason: agent ? "Purpose updated from the workload's Overview" : "Classified as an agent with a purpose from the workload's Overview",
            expected_version: w.classification_version,
            undoes_decision_id: null,
          };
    uncertain.set(attemptKey, body);
    const generation = graphSessionGeneration();
    const id = refId(w.ref);
    try {
      const res = await classify({ ws, id, body }).unwrap();
      if (generation !== graphSessionGeneration() || ws !== getWorkspaceId()) return;
      const state = store.getState();
      for (const args of igaGraphApi.util.selectCachedArgsForQuery(state, "getGraphWorkload")) {
        if (args.ws !== ws || args.id !== id) continue;
        dispatch(
          igaGraphApi.util.updateQueryData("getGraphWorkload", args, (d) => {
            if (d.data.classification_version <= res.classification_version)
              Object.assign(d.data, { classification: res.classification, classification_version: res.classification_version, decision: { ...res.decision, decision: body.decision } });
          }),
        );
      }
      for (const args of igaGraphApi.util.selectCachedArgsForQuery(state, "listGraphWorkloads")) {
        if (args.ws !== ws) continue;
        dispatch(
          igaGraphApi.util.updateQueryData("listGraphWorkloads", args, (d) => {
            for (const row of d.data)
              if (row.ref === w.ref && row.classification_version <= res.classification_version)
                Object.assign(row, { classification: res.classification, classification_version: res.classification_version });
          }),
        );
      }
      uncertain.delete(attemptKey);
      setEditing(false);
    } catch (e) {
      if (generation !== graphSessionGeneration() || ws !== getWorkspaceId()) return;
      const x = e as { status?: number | string; data?: { error?: { code?: string; message?: string; current?: ClassificationConflict } } };
      const err = x.data?.error;
      // A definite refusal ends this attempt; a network or server failure keeps it for a retry.
      if (typeof x.status === "number" && x.status >= 400 && x.status < 500 && x.status !== 408 && x.status !== 429) uncertain.delete(attemptKey);
      if (x.status === 409 && err?.code === "classification_conflict") {
        setProblem(`${err.current?.decided_by?.display ?? "Someone"} changed this workload's classification. Refresh the page to see it, then save again.`);
      } else if (x.status === 403) {
        setProblem("Adding a purpose needs the iga:review permission.");
      } else if (x.status === 422 || x.status === 400) {
        setProblem(err?.message ?? "The purpose was not accepted.");
      } else {
        setProblem("The result is uncertain. Saving again sends the exact same request, so it cannot be recorded twice.");
      }
    }
  };

  if (editing) {
    const left = MAX_PURPOSE - text.length;
    return (
      <div className="space-y-2">
        <label htmlFor="workload-purpose" className="text-xs font-medium text-(--color-text)">
          What is this workload for, and what should it be allowed to do?
        </label>
        <Textarea
          id="workload-purpose"
          value={text}
          maxLength={MAX_PURPOSE}
          rows={3}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="For example: Summarises support tickets each night. Should only read the tickets table."
          className="text-[13px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-text-muted)">
          <span>
            {agent ? "Recorded with your name and the time." : "Saving also classifies this workload as an agent: AuthSec records a purpose only for agents."}
          </span>
          <span className="tabular-nums">{left} characters left</span>
        </div>
        {problem ? (
          <p role="alert" className="text-xs text-(--color-danger-text)">
            {problem}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button size="sm" className="text-white" disabled={!text.trim() || unchanged || isLoading} onClick={() => void save()}>
            {isLoading ? "Saving…" : agent ? "Save purpose" : "Classify as agent and save"}
          </Button>
          <Button size="sm" variant="ghost" disabled={isLoading} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (purpose) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 whitespace-pre-line break-words text-[13px] leading-5 text-(--color-text)">{purpose}</p>
        {editable ? (
          <button type="button" onClick={open} className="shrink-0 text-xs font-medium text-(--color-primary-text) hover:underline">
            Edit
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-(--color-border-strong) px-3 py-3">
      <p className="text-[13px] font-medium text-(--color-text)">No purpose recorded</p>
      <p className="mt-0.5 text-xs leading-5 text-(--color-text-muted)">
        A purpose says what this workload is for and what it should be allowed to do. Reviewers compare it with the access it
        actually has, so access it does not need stands out.
      </p>
      {editable ? (
        <Button size="sm" variant="outline" className="mt-2.5" onClick={open}>
          Add purpose
        </Button>
      ) : (
        <p className="mt-1.5 text-xs text-(--color-text-muted)">{locked ?? "Someone with the iga:review permission can add one."}</p>
      )}
    </div>
  );
}
