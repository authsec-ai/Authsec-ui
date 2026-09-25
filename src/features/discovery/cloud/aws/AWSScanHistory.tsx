/**
 * A connector's scan history (SPEC-iga-phase2-graph.md §2.14.7, T7.9): how
 * each run ended, what it could read, and whether — and at which revision —
 * it reached the identity graph. A failed run keeps the earlier results; the
 * history says so rather than implying the account is now empty.
 */

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";

import { useListAwsScanRunsQuery, type CloudScanRunHistoryItem as CloudScanRun } from "@/app/api/cloudDiscoveryApi";
import { Button } from "@/components/ui/button";
import { surfaceStateText } from "@/features/iga/shared/labels";
import type { StatusTone } from "@/components/ui/status-badge";
import { CloudPill } from "../CloudPill";

const HISTORY_POLL_MS = 5_000;

const RUN_TONE: Record<CloudScanRun["status"], StatusTone> = {
  queued: "muted",
  running: "info",
  published: "success",
  failed: "danger",
  abandoned: "danger",
};

const RUN_LABEL: Record<CloudScanRun["status"], string> = {
  queued: "Queued",
  running: "Scanning",
  published: "Finished",
  failed: "Failed",
  abandoned: "Abandoned",
};

function graphOutcome(run: CloudScanRun): string | null {
  const p = run.projection;
  if (run.status !== "published" || !p) return null;
  switch (p.status) {
    case "queued":
      return "Waiting to build the graph from this scan…";
    case "running":
      return p.attempts > 1 ? `Building the graph from this scan (attempt ${p.attempts})…` : "Building the graph from this scan…";
    case "complete":
      return p.rev != null ? `Added to the graph as revision ${p.rev}.` : "Added to the graph.";
    case "failed":
      return p.retrying
        ? `Building the graph failed on attempt ${p.attempts}${p.last_error ? ` (${p.last_error})` : ""}; it will be tried again.`
        : `Building the graph from this scan failed${p.last_error ? ` (${p.last_error})` : ""}; the graph still shows the previous result.`;
    case "abandoned":
      return "Building the graph from this scan was abandoned; the graph still shows the previous result.";
  }
}

/** Surfaces by how they ended, most-read first. */
function coverageText(run: CloudScanRun): string | null {
  const counts = run.coverage?.counts;
  if (!counts) return null;
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a === "reached" ? -1 : b === "reached" ? 1 : a.localeCompare(b)))
    .map(([state, n]) => `${n} ${surfaceStateText(state)}`);
  return parts.length ? `Surfaces: ${parts.join(" · ")}` : null;
}

/** What the run could not read, and the AWS call that refused. */
function gapsText(run: CloudScanRun): string | null {
  const gaps = run.coverage?.not_reached ?? [];
  if (!gaps.length) return null;
  const shown = gaps
    .slice(0, 3)
    .map((g) => `${g.surface.replace(/_/g, " ")} ${surfaceStateText(g.state)}${g.api ? ` (${g.api})` : ""}`);
  return `Not read: ${shown.join("; ")}${gaps.length > 3 ? `; and ${gaps.length - 3} more` : ""}.`;
}

export function AWSScanHistory({ connectorId }: { connectorId: string }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [poll, setPoll] = useState(0);
  const q = useListAwsScanRunsQuery(
    { connectorId, cursor: cursors[cursors.length - 1] },
    { pollingInterval: poll },
  );
  // Poll only while a run is queued or scanning, or its graph is being built.
  const inFlight = (q.currentData?.data ?? []).some(
    (r) =>
      r.status === "queued" ||
      r.status === "running" ||
      r.projection?.status === "queued" ||
      r.projection?.status === "running" ||
      r.projection?.retrying === true,
  );
  useEffect(() => setPoll(inFlight ? HISTORY_POLL_MS : 0), [inFlight]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading scan history…</p>;
  // `currentData`: a failed Older page must say so, not show the newer page.
  if (q.error && !q.currentData) {
    return (
      <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-[11.5px]">
        <strong className="font-medium">Could not load the scan history.</strong> This is a failed request, not an
        account that was never scanned.{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Retry
        </button>
        {cursors.length ? (
          <>
            {" · "}
            <button className="underline" onClick={() => setCursors((c) => c.slice(0, -1))}>
              Back to newer runs
            </button>
          </>
        ) : null}
      </div>
    );
  }
  const runs = q.currentData?.data ?? [];
  if (!runs.length) return <p className="text-sm text-muted-foreground">This account has not been scanned yet.</p>;

  return (
    <div className="space-y-2">
      <ol className="space-y-1.5">
        {runs.map((run) => {
          const graph = graphOutcome(run);
          const cov = coverageText(run);
          const gaps = gapsText(run);
          return (
            <li key={run.id} className="space-y-1 rounded-md border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  {run.queued_at ? format(new Date(run.queued_at), "d MMM yyyy, HH:mm") : "Queued"}
                  <span className="ml-1.5 font-normal text-muted-foreground">· {run.trigger}</span>
                </span>
                <CloudPill tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</CloudPill>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {run.started_at ? `Started ${formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}` : "Not started yet"}
                {run.finished_at ? ` · finished ${format(new Date(run.finished_at), "HH:mm")}` : ""}
                {run.attempts > 1 ? ` · ${run.attempts} attempts` : ""}
              </p>
              {run.last_error && (run.status === "failed" || run.status === "abandoned") ? (
                <p className="text-[11px] text-(--color-danger-text)">
                  {run.last_error}. Earlier results are still shown, and marked stale where affected.
                </p>
              ) : null}
              {cov ? <p className="text-[11px] text-muted-foreground">{cov}</p> : null}
              {gaps ? <p className="text-[11px] text-(--color-warning-text)">{gaps}</p> : null}
              {graph ? <p className="text-[11px] text-muted-foreground">{graph}</p> : null}
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        {cursors.length ? (
          <Button variant="outline" size="sm" onClick={() => setCursors((c) => c.slice(0, -1))}>
            Newer
          </Button>
        ) : null}
        {q.currentData?.meta.next_cursor ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = q.currentData?.meta.next_cursor;
              if (next) setCursors((c) => [...c, next]);
            }}
            disabled={q.isFetching}
          >
            Older
          </Button>
        ) : null}
      </div>
    </div>
  );
}
