/**
 * Every classification decision on a workload, newest first
 * (SPEC-iga-phase2-graph.md §2.14.3 *Audit*). The decision table is the audit
 * record; an undo is its own entry, never a deletion.
 */

import { format } from "date-fns";

import { useGetWorkloadClassificationHistoryQuery } from "@/app/api/igaGraphApi";

import { CLASSIFICATION_LABEL } from "../shared/labels";

export function ClassificationHistory({ ws, id }: { ws: string; id: string }) {
  const q = useGetWorkloadClassificationHistoryQuery({ ws, id });
  if (q.isLoading) return <p className="text-xs text-(--color-text-muted)">Loading decisions…</p>;
  if (q.error) {
    return (
      <p className="text-xs text-(--color-warning-text)">
        Could not load the decision history.{" "}
        <button type="button" onClick={() => void q.refetch()} className="font-semibold hover:underline">
          Retry
        </button>
      </p>
    );
  }
  const rows = q.data?.data ?? [];
  if (!rows.length) return <p className="text-xs text-(--color-text-muted)">No decision has been recorded.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((d, i) => (
        <li key={d.id ?? i} className="text-sm">
          <span className="font-medium">{d.undoes_decision_id ? "Undone" : CLASSIFICATION_LABEL[d.decision]}</span>
          <span className="text-(--color-text-muted)">
            {" "}
            by {d.decided_by.display}{d.decided_at ? ` · ${format(new Date(d.decided_at), "d MMM yyyy, HH:mm")}` : ""}
          </span>
          {d.purpose ? <span className="block text-xs">Purpose: {d.purpose}</span> : null}
          <span className="block text-xs text-(--color-text-muted)">"{d.reason}"</span>
        </li>
      ))}
    </ol>
  );
}
