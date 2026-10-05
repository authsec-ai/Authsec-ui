/**
 * A connector's scan history (SPEC-iga-phase2-graph.md §2.14.7, T7.9): how
 * each run ended, what it could read, and whether — and at which revision —
 * it reached the identity graph. A failed run keeps the earlier results; the
 * history says so rather than implying the account is now empty.
 */

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

import { useListAwsScanRunsQuery, type CloudScanRunHistoryItem as CloudScanRun } from "@/app/api/cloudDiscoveryApi";
import { Button } from "@/components/ui/button";
import { surfaceStateText } from "@/features/iga/shared/labels";
import { CloudPill } from "../CloudPill";
import { RUN_LABEL, RUN_TONE, graphOutcome } from "./awsScanRunLabels";

const HISTORY_POLL_MS = 5_000;

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

/** How many gaps to show before folding the rest behind "+N more". Two is
 * about one line at drawer width; the full list ran to fifteen-plus entries on
 * a real scan and made every card taller than the result it was qualifying. */
const GAPS_SHOWN = 2;

/** What the run could not read, and the AWS call that refused — one entry per
 * gap, so the card can fold the tail instead of rendering a paragraph. */
function gapItems(run: CloudScanRun): string[] {
  return (run.coverage?.not_reached ?? []).map(
    (g) => `${g.surface.replace(/_/g, " ")} ${surfaceStateText(g.state)}${g.api ? ` (${g.api})` : ""}`,
  );
}

export function AWSScanHistory({
  connectorId,
  runHref,
}: {
  connectorId: string;
  /** Where one run opens in full. Absent: the run is not a link. */
  runHref?: (runId: string) => string;
}) {
  const [cursors, setCursors] = useState<string[]>([]);
  const [poll, setPoll] = useState(0);
  // Which runs have their full gap list open. Per-run rather than one flag, so
  // expanding the newest scan does not lengthen every card below it.
  const [openGaps, setOpenGaps] = useState<Record<string, boolean>>({});
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
          const gaps = gapItems(run);
          const gapsOpen = openGaps[run.id] === true;
          const shownGaps = gapsOpen ? gaps : gaps.slice(0, GAPS_SHOWN);
          const hiddenGaps = gaps.length - shownGaps.length;
          return (
            <li key={run.id} className="rounded-md border px-3 py-2.5">
              {/* When and how it ended — the line a reader scans first, so it
                  carries the only strong type in the card. */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold leading-5 text-foreground">
                  {run.queued_at ? format(new Date(run.queued_at), "d MMM yyyy, HH:mm") : "Queued"}
                </span>
                <span className="flex flex-none items-center gap-2">
                  {runHref ? (
                    <Link
                      to={runHref(run.id)}
                      className="text-[11px] font-medium text-(--color-primary-text) hover:underline"
                      aria-label={`Open the scan from ${run.queued_at ? format(new Date(run.queued_at), "d MMM yyyy, HH:mm") : "this run"}`}
                    >
                      Details
                    </Link>
                  ) : null}
                  <CloudPill tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</CloudPill>
                </span>
              </div>

              {/* Everything below is supporting detail, one step down in weight
                  and colour. Previously the timing, the surfaces and the gap
                  list were all the same size, and the gap list was the loudest
                  colour on the card — it out-shouted the status pill that was
                  the point of the row. */}
              <div className="mt-1 space-y-0.5">
                <p className="text-[11px] leading-[1.5] text-muted-foreground">
                  <span className="text-(--color-text-muted)">{run.trigger}</span>
                  {" · "}
                  {run.started_at
                    ? `started ${formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}`
                    : "not started yet"}
                  {run.finished_at ? ` → finished ${format(new Date(run.finished_at), "HH:mm")}` : ""}
                  {run.attempts > 1 ? ` · ${run.attempts} attempts` : ""}
                </p>
                {run.last_error && (run.status === "failed" || run.status === "abandoned") ? (
                  <p className="text-[11px] leading-[1.5] text-(--color-danger-text)">
                    {run.last_error}. Earlier results are still shown, and marked stale where affected.
                  </p>
                ) : null}
                {cov ? <p className="text-[11px] leading-[1.5] text-muted-foreground">{cov}</p> : null}
                {gaps.length ? (
                  // Only the label is warning-coloured. A whole paragraph of
                  // orange competed with the green "Finished" pill and made an
                  // ordinary partial read look like the headline.
                  <p className="text-[11px] leading-[1.5] text-muted-foreground">
                    <span className="font-medium text-(--color-warning-text)">Not read:</span>{" "}
                    {shownGaps.join("; ")}
                    {hiddenGaps > 0 ? "… " : " "}
                    {gaps.length > GAPS_SHOWN ? (
                      <button
                        type="button"
                        onClick={() => setOpenGaps((o) => ({ ...o, [run.id]: !gapsOpen }))}
                        className="font-medium text-(--color-primary-text) underline-offset-2 hover:underline"
                      >
                        {gapsOpen ? "Show less" : `+${hiddenGaps} more`}
                      </button>
                    ) : null}
                  </p>
                ) : null}
                {graph ? <p className="text-[11px] leading-[1.5] text-muted-foreground">{graph}</p> : null}
              </div>
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
