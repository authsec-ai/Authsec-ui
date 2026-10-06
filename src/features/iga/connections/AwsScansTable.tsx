/**
 * An AWS account's scans as a table (2026-10-06 design): when, how it ended,
 * how long it took, what it read, and which graph revision it produced. A
 * failed scan says why on its own row; every row opens the scan in full.
 *
 * "Failed only" filters the page that is loaded — it says so — because the
 * scan-run route has no status filter.
 */

import { useEffect, useState } from "react";
import { format, formatDistanceStrict } from "date-fns";
import { Link, useNavigate } from "react-router-dom";

import { useListAwsScanRunsQuery, type CloudScanRunHistoryItem } from "@/app/api/cloudDiscoveryApi";
import { Button } from "@/components/ui/button";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { RUN_LABEL, RUN_TONE } from "@/features/discovery/cloud/aws/awsScanRunLabels";
import { safeErrorProse } from "@/features/discovery/cloud/cloudConnectorErrorCopy";
import { surfaceStateText } from "@/features/iga/shared/labels";
import { cn } from "@/lib/utils";

import { scanHref } from "./connectionModel";
import { graphCell } from "./scanCells";

const POLL_MS = 5_000;

const failed = (r: CloudScanRunHistoryItem) => r.status === "failed" || r.status === "abandoned";


/** "20 read · 1 not supported": the run's surfaces by how they ended, read first. */
function surfacesText(r: CloudScanRunHistoryItem): string {
  const counts = r.coverage?.counts;
  if (!counts) return "—";
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a === "reached" ? -1 : b === "reached" ? 1 : a.localeCompare(b)))
    .map(([state, n]) => `${n} ${surfaceStateText(state)}`);
  return parts.length ? parts.join(" · ") : "—";
}

function duration(r: CloudScanRunHistoryItem): string {
  if (!r.started_at) return "—";
  const end = r.finished_at ?? (r.status === "running" ? null : r.updated_at);
  if (!end) return "Running";
  return formatDistanceStrict(new Date(r.started_at), new Date(end));
}

export function AwsScansTable({ connectionId }: { connectionId: string }) {
  // An AWS connection's id is its connector's id.
  const connectorId = connectionId;
  const navigate = useNavigate();
  const [cursors, setCursors] = useState<string[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [poll, setPoll] = useState(0);
  const q = useListAwsScanRunsQuery({ connectorId, cursor: cursors[cursors.length - 1] }, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const all = q.currentData?.data ?? [];
  // As long as the scan or its graph build is moving: queued, running, or a failed build that will be retried.
  const inFlight = all.some(
    (r) =>
      r.status === "queued" ||
      r.status === "running" ||
      r.projection?.status === "queued" ||
      r.projection?.status === "running" ||
      r.projection?.retrying === true,
  );
  useEffect(() => setPoll(inFlight ? POLL_MS : 0), [inFlight]);

  const rows = onlyFailed ? all.filter(failed) : all;
  const failedCount = all.filter(failed).length;

  const seg = (on: boolean) =>
    cn(
      "h-7 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-(--color-primary)",
      on ? "bg-(--color-surface-raised) text-(--color-text) shadow-[0_1px_2px_rgb(15_23_42/0.08)]" : "text-(--color-text-secondary) hover:text-(--color-text)",
    );

  return (
    <section className="overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <div className="flex flex-wrap items-center gap-3 border-b border-(--color-border-subtle) px-4 py-3">
        <div role="group" aria-label="Show" className="inline-flex rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) p-0.5">
          <button type="button" aria-pressed={!onlyFailed} onClick={() => setOnlyFailed(false)} className={seg(!onlyFailed)}>
            All
          </button>
          <button type="button" aria-pressed={onlyFailed} onClick={() => setOnlyFailed(true)} className={seg(onlyFailed)}>
            Failed · {failedCount}
            {q.currentData?.meta.next_cursor ? " on this page" : ""}
          </button>
        </div>
        <span className="text-xs text-(--color-text-muted)">Failed scans keep previous results, marked stale.</span>
      </div>

      {q.isLoading || (q.isFetching && !q.currentData) ? (
        <div aria-busy="true" aria-label="Loading scan history">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-(--color-border-subtle) px-4 py-3.5 last:border-b-0">
              <span className="h-3 w-32 animate-pulse rounded bg-(--color-surface-subtle)" />
              <span className="h-3 w-20 animate-pulse rounded bg-(--color-surface-subtle)" />
              <span className="ml-auto h-3 w-16 animate-pulse rounded bg-(--color-surface-subtle)" />
            </div>
          ))}
        </div>
      ) : q.error && !q.currentData ? (
        <p className="px-4 py-6 text-sm text-(--color-danger-text)">
          Couldn't load scan history.{" "}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      ) : !rows.length ? (
        <p className="px-4 py-6 text-sm text-(--color-text-muted)">{onlyFailed ? "No failed scans on this page." : "No scan has run yet."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-(--color-text-muted)">
                <th className="px-4 py-2.5 font-medium">Started</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
                <th className="px-4 py-2.5 font-medium">Surfaces</th>
                <th className="px-4 py-2.5 font-medium">Graph</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={(e) => {
                    // Not while selecting text, and leave modified clicks to the link.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || window.getSelection()?.toString()) return;
                    navigate(scanHref(connectionId, r.id));
                  }}
                  className="cursor-pointer border-t border-(--color-border-subtle) align-top hover:bg-(--color-surface-subtle)"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={scanHref(connectionId, r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium tabular-nums text-(--color-text) hover:underline"
                    >
                      {r.queued_at ? format(new Date(r.queued_at), "d MMM, HH:mm") : "Queued"}
                    </Link>
                    <div className="text-xs capitalize text-(--color-text-muted)">{r.trigger}</div>
                  </td>
                  <td className="px-4 py-3">
                    <CloudPill tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</CloudPill>
                    {failed(r) && r.last_error ? <div className="mt-1 max-w-[360px] text-xs text-(--color-danger-text)">{safeErrorProse(r.last_error)}.</div> : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-(--color-text)">{duration(r)}</td>
                  <td className="px-4 py-3 text-(--color-text)">{surfacesText(r)}</td>
                  <td className="px-4 py-3 text-(--color-text)" title={graphCell(r).title}>
                    {graphCell(r).text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursors.length || q.currentData?.meta.next_cursor ? (
        <div className="flex gap-2 border-t border-(--color-border-subtle) px-4 py-3">
          {cursors.length ? (
            <Button variant="outline" size="sm" onClick={() => setCursors((c) => c.slice(0, -1))}>
              Newer
            </Button>
          ) : null}
          {q.currentData?.meta.next_cursor ? (
            <Button
              variant="outline"
              size="sm"
              disabled={q.isFetching}
              onClick={() => {
                const next = q.currentData?.meta.next_cursor;
                if (next) setCursors((c) => [...c, next]);
              }}
            >
              Older
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
