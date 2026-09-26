/**
 * Workload › Observed access. Rows are the server's. SQL is shown only when
 * a row with that action is present — the server omits it without database
 * or broker evidence.
 */

import { useMemo, useState } from "react";

import { useGetWorkloadObservedAccessQuery, type ObservedAccessRow } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { CursorPager } from "../shared/components/CursorPager";
import { Panel } from "../shared/components/Panel";
import { useGraphRevision } from "../shared/revision";
import { OUTCOME_LEGEND, isSqlAction, outcomeClass, outcomeLabel, sqlEvidenceLabel } from "../graph/v2/edgeClass";

function resourceText(row: ObservedAccessRow): string {
  const resource = row.resource;
  if (!resource) return "Resource not stated";
  if (typeof resource === "string") return resource;
  return resource.text || resource.native_kind || resource.ref || "Resource not stated";
}

export function ObservedAccessView({ rows }: { rows: ObservedAccessRow[] }) {
  const sql = rows.filter((row) => isSqlAction(row.action));
  return (
    <div className="space-y-3">
      <ul aria-label="Observed outcomes" className="flex flex-wrap gap-3 text-xs text-(--color-text-muted)">
        {OUTCOME_LEGEND.map((item) => (
          <li key={item.outcome} title={item.meaning}>
            {item.label}
          </li>
        ))}
      </ul>
      {sql.length ? (
        <p className="text-xs text-(--color-text-muted)">SQL is listed because the server returned database or broker evidence.</p>
      ) : (
        <p className="text-xs text-(--color-text-muted)">SQL is shown only when the server returns it with database or broker evidence.</p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-(--color-text-muted)">No observed access was returned for this filter.</p>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)" aria-label="Observed access">
          {rows.map((row, index) => {
            const outcome = outcomeClass(row.outcome);
            const sqlLabel = isSqlAction(row.action) ? sqlEvidenceLabel(row.attribution) : null;
            return (
              <li key={row.ref ?? `${row.action}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-(--color-text)">{row.action}</span>
                  <span className="ml-2 text-(--color-text-muted)">{resourceText(row)}</span>
                  {sqlLabel ? <span className="ml-2 text-xs text-(--color-text-muted)">{sqlLabel}</span> : null}
                </span>
                <StatusBadge tone={outcome === "denied" ? "warning" : outcome === "success" ? "info" : "neutral"}>
                  {outcomeLabel(row.outcome)}
                </StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function WorkloadObservedAccessTab({ ws, id }: { ws: string; id: string }) {
  const { rev, epoch } = useGraphRevision(ws);
  const [view, setView] = useState<"aggregate" | "events">("aggregate");
  const [outcome, setOutcome] = useState<string>("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [stack, setStack] = useState<(string | undefined)[]>([]);
  const args = useMemo(
    () => ({
      ws,
      rev,
      key: String(epoch),
      id,
      graph: "v2" as const,
      view,
      outcome: outcome || undefined,
      cursor: view === "events" ? cursor : undefined,
    }),
    [ws, rev, epoch, id, view, outcome, cursor],
  );
  const q = useGetWorkloadObservedAccessQuery(args);
  const rows = q.data?.data ?? [];
  const meta = q.data?.meta;

  return (
    <Panel
      title="Observed access"
      actions={
        <span className="flex items-center gap-2 text-xs">
          <label>
            View{" "}
            <select
              aria-label="Observed access view"
              value={view}
              onChange={(e) => {
                setView(e.target.value === "events" ? "events" : "aggregate");
                setCursor(undefined);
                setStack([]);
              }}
              className="rounded border border-(--color-border-subtle) bg-(--color-surface) px-1 py-0.5"
            >
              <option value="aggregate">Aggregate</option>
              <option value="events">Events</option>
            </select>
          </label>
          <label>
            Outcome{" "}
            <select
              aria-label="Observed outcome filter"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="rounded border border-(--color-border-subtle) bg-(--color-surface) px-1 py-0.5"
            >
              <option value="">Any</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="attempt">Attempt</option>
            </select>
          </label>
        </span>
      }
    >
      {q.isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading observed access" />
      ) : (
        <ObservedAccessView rows={rows} />
      )}
      {view === "events" && meta ? (
        <CursorPager
          meta={meta}
          pageIndex={stack.length}
          rowsOnPage={rows.length}
          onPrev={() => {
            const prev = stack[stack.length - 1];
            setStack((s) => s.slice(0, -1));
            setCursor(prev);
          }}
          onNext={() => {
            if (!meta.next_cursor) return;
            setStack((s) => [...s, cursor]);
            setCursor(meta.next_cursor);
          }}
        />
      ) : null}
    </Panel>
  );
}
