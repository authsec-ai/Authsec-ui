/**
 * ActionsTab — virtualized actions history for a workload (UG05).
 *
 * Features:
 *  - Virtualized table (simple virtual scrolling — no react-window dep).
 *  - Columns: observed_at, event_family, operation, resource,
 *    execution_identity, outcome, policy/control match, runtime instance,
 *    count.
 *  - Default: last hour, newest first.
 *  - Live mode with 3 s polling; pause/resume toggle.
 *  - "N new actions" badge when paused.
 *  - Cursor-based infinite scroll (loads next page at scroll bottom).
 *  - Filter bar + health bar.
 *  - Collector view: workload column + Unattributed filter.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";
import {
  ChevronDown,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  useListActionsQuery,
  useGetActionChangesQuery,
  useGetActionsHealthQuery,
  type ActionFilter,
  type ActionSummary,
} from "./ActionsApi";
import { ActionFilters, type TimeRange } from "./ActionFilters";
import { ActionsHealthBar } from "./ActionsHealthBar";
import { ActionDetailDrawer } from "./ActionDetailDrawer";

/* ─────────────────────────── Constants ──────────────────────────────────── */

const ROW_HEIGHT = 36;
const OVERSCAN = 8;
const LIVE_POLL_MS = 3_000;
const PAGE_SIZE = 100;

/** Map TimeRange to an ISO `from` timestamp. */
function timeRangeToFrom(tr: TimeRange): string | undefined {
  if (tr === "custom") return undefined;
  const now = Date.now();
  const offsets: Record<string, number> = {
    "1h": 3_600_000,
    "6h": 21_600_000,
    "24h": 86_400_000,
    "7d": 604_800_000,
    "30d": 2_592_000_000,
  };
  return new Date(now - (offsets[tr] ?? 3_600_000)).toISOString();
}

/* ─────────────────────────── Outcome badge ───────────────────────────────── */

const OUTCOME_TONE: Record<string, string> = {
  completed: "bg-(--color-success-soft) text-(--color-success-text)",
  attempted: "bg-(--color-info-soft) text-(--color-info-text)",
  failed: "bg-(--color-danger-soft) text-(--color-danger-text)",
  denied: "bg-(--color-warning-soft) text-(--color-warning-text)",
  contained: "bg-(--color-warning-soft) text-(--color-warning-text)",
  unknown: "bg-(--color-surface-subtle) text-(--color-text-muted)",
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
        OUTCOME_TONE[outcome] ?? OUTCOME_TONE.unknown,
      )}
    >
      {outcome}
    </span>
  );
}

/* ─────────────────────── Virtual scroll hook ─────────────────────────────── */

function useVirtualScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  totalRows: number,
  rowHeight: number,
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
    [],
  );

  const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const visibleCount =
    Math.ceil(containerHeight / rowHeight) + 2 * OVERSCAN;
  const endIdx = Math.min(totalRows, startIdx + visibleCount);
  const totalHeight = totalRows * rowHeight;
  const offsetY = startIdx * rowHeight;

  return { startIdx, endIdx, totalHeight, offsetY, onScroll, containerHeight };
}

/* ─────────────────────── Table columns ──────────────────────────────────── */

interface Column {
  key: string;
  label: string;
  width: string;
  render: (row: ActionSummary) => React.ReactNode;
}

function buildColumns(showWorkload: boolean): Column[] {
  const cols: Column[] = [
    {
      key: "observed_at",
      label: "Observed",
      width: "w-[140px]",
      render: (r) => (
        <time dateTime={r.observed_at} className="tabular-nums">
          {format(new Date(r.observed_at), "HH:mm:ss.SSS")}
        </time>
      ),
    },
    {
      key: "event_family",
      label: "Family",
      width: "w-[90px]",
      render: (r) => (
        <span className="capitalize">{r.event_family.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "operation",
      label: "Operation",
      width: "w-[140px]",
      render: (r) => (
        <span className="truncate" title={r.operation}>
          {r.operation}
        </span>
      ),
    },
    {
      key: "resource",
      label: "Resource",
      width: "min-w-[160px] flex-1",
      render: (r) => (
        <span className="truncate" title={r.resource}>
          {r.resource}
        </span>
      ),
    },
    {
      key: "execution_identity",
      label: "Exec identity",
      width: "w-[140px]",
      render: (r) => (
        <span className="truncate" title={r.execution_identity}>
          {r.execution_identity}
        </span>
      ),
    },
    {
      key: "outcome",
      label: "Outcome",
      width: "w-[90px]",
      render: (r) => <OutcomeBadge outcome={r.outcome} />,
    },
    {
      key: "policy_match",
      label: "Policy / Control",
      width: "w-[140px]",
      render: (r) => (
        <span className="truncate" title={r.policy_match ?? r.control_match ?? ""}>
          {r.policy_match ?? r.control_match ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "runtime_instance",
      label: "Runtime",
      width: "w-[110px]",
      render: (r) => (
        <span className="truncate" title={r.runtime_instance ?? ""}>
          {r.runtime_instance ?? "\u2014"}
        </span>
      ),
    },
    {
      key: "count",
      label: "Count",
      width: "w-[60px]",
      render: (r) => <span className="tabular-nums">{r.count}</span>,
    },
  ];

  if (showWorkload) {
    cols.splice(2, 0, {
      key: "workload",
      label: "Workload",
      width: "w-[130px]",
      render: (r) => (
        <span className="truncate" title={r.workload_name ?? r.workload_id ?? "Unattributed"}>
          {r.workload_name ?? r.workload_id ?? "Unattributed"}
        </span>
      ),
    });
  }

  return cols;
}

/* ─────────────────────── Props ───────────────────────────────────────────── */

interface ActionsTabProps {
  workspaceId: string;
  workloadId: string;
  /** Collector mode: show workload column + unattributed filter. */
  collectorView?: boolean;
}

/* ─────────────────────── Component ──────────────────────────────────────── */

function ActionsTabInner({
  workspaceId,
  workloadId,
  collectorView = false,
}: ActionsTabProps) {
  // ── Detail drawer ──────────────────────────────────────────────────────
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  // ── Filter state ───────────────────────────────────────────────────────
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [filters, setFilters] = useState<ActionFilter>({
    sort: "-observed_at",
    limit: PAGE_SIZE,
  });

  // ── Live mode ──────────────────────────────────────────────────────────
  const [live, setLive] = useState(true);
  const [pendingActions, setPendingActions] = useState<ActionSummary[]>([]);
  const [liveCursor, setLiveCursor] = useState<string | null>(null);

  // ── Build query filters ────────────────────────────────────────────────
  const queryFilters = useMemo<ActionFilter>(() => {
    const from = timeRangeToFrom(timeRange);
    return { ...filters, from, sort: "-observed_at", limit: PAGE_SIZE };
  }, [filters, timeRange]);

  // ── Main list query (polled in live mode) ──────────────────────────────
  const listQuery = useListActionsQuery(
    { workloadId, filters: queryFilters },
    { pollingInterval: live ? LIVE_POLL_MS : 0 },
  );

  // ── Track live cursor ──────────────────────────────────────────────────
  useEffect(() => {
    if (listQuery.data?.meta.live_cursor) {
      setLiveCursor(listQuery.data.meta.live_cursor);
    }
  }, [listQuery.data?.meta.live_cursor]);

  // ── Forward catch-up when paused ───────────────────────────────────────
  const changesQuery = useGetActionChangesQuery(
    { liveCursor: liveCursor ?? "", workloadId },
    {
      skip: live || !liveCursor,
      pollingInterval: LIVE_POLL_MS,
    },
  );

  useEffect(() => {
    if (!live && changesQuery.data?.data.length) {
      setPendingActions((prev) => [...changesQuery.data!.data, ...prev]);
      if (changesQuery.data.live_cursor) {
        setLiveCursor(changesQuery.data.live_cursor);
      }
    }
  }, [live, changesQuery.data]);

  // ── Health ─────────────────────────────────────────────────────────────
  const healthQuery = useGetActionsHealthQuery(
    { workloadId },
    { pollingInterval: live ? LIVE_POLL_MS * 3 : 0 },
  );

  // ── Merged rows ────────────────────────────────────────────────────────
  const rows = useMemo<ActionSummary[]>(() => {
    const base = listQuery.data?.data ?? [];
    return base;
  }, [listQuery.data?.data]);

  // ── Infinite scroll: load more ─────────────────────────────────────────
  const [pages, setPages] = useState<ActionSummary[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    // Reset pages when query changes
    setPages([]);
    setNextCursor(listQuery.data?.meta.next_cursor ?? null);
  }, [listQuery.data?.meta.next_cursor, queryFilters.from, queryFilters.outcome]);

  const allRows = useMemo(() => {
    const extras = pages.flat();
    return [...rows, ...extras];
  }, [rows, pages]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      // Trigger a new query with the cursor by updating the filter state.
      // For simplicity, we append a cursor page marker and fetch.
      const resp = await fetch(
        `/api/iga/v1/workloads/${encodeURIComponent(workloadId)}/actions?cursor=${encodeURIComponent(nextCursor)}&limit=${PAGE_SIZE}&sort=-observed_at`,
        { credentials: "include" },
      );
      if (resp.ok) {
        const json = await resp.json();
        if (json.data?.length) {
          setPages((prev) => [...prev, json.data]);
        }
        setNextCursor(json.meta?.next_cursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, workloadId]);

  // ── Virtual scroll ─────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => buildColumns(collectorView), [collectorView]);

  const { startIdx, endIdx, totalHeight, offsetY, onScroll, containerHeight } =
    useVirtualScroll(scrollRef, allRows.length, ROW_HEIGHT);

  const visibleRows = allRows.slice(startIdx, endIdx);

  // ── Infinite scroll trigger ────────────────────────────────────────────
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      onScroll(e);
      const el = e.currentTarget;
      if (
        nextCursor &&
        !loadingMore &&
        el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_HEIGHT * 3
      ) {
        void loadMore();
      }
    },
    [onScroll, nextCursor, loadingMore, loadMore],
  );

  // ── Resume: merge pending ──────────────────────────────────────────────
  const resumeLive = useCallback(() => {
    setPendingActions([]);
    setLive(true);
    void listQuery.refetch();
  }, [listQuery]);

  const pendingCount = pendingActions.length;

  // ── Loading state ──────────────────────────────────────────────────────
  const isLoading = listQuery.isLoading;
  const isError = listQuery.isError;

  return (
    <div className="flex h-full flex-col">
      {/* Health bar */}
      <ActionsHealthBar
        health={healthQuery.data?.data}
        loading={healthQuery.isLoading}
      />

      {/* Filters */}
      <ActionFilters
        filters={filters}
        onFiltersChange={setFilters}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        showWorkloadFilter={collectorView}
      />

      {/* Toolbar: live toggle + new actions badge */}
      <div className="flex items-center gap-2 border-b border-(--color-border-subtle) px-3 py-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1.5 text-xs",
                live && "text-(--color-success-text)",
              )}
              onClick={() => (live ? setLive(false) : resumeLive())}
              aria-pressed={live}
            >
              {live ? (
                <>
                  <Pause className="size-3" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="size-3" />
                  Resume
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {live
              ? "Polling every 3 s. Click to pause."
              : "Paused. Click to resume live polling."}
          </TooltipContent>
        </Tooltip>

        {/* Pending badge */}
        {!live && pendingCount > 0 ? (
          <button
            type="button"
            onClick={resumeLive}
            className="inline-flex items-center gap-1.5 rounded-full bg-(--color-primary-soft) px-2.5 py-0.5 text-xs font-medium text-(--color-primary-text) hover:bg-(--color-primary-soft)/80"
          >
            <ChevronDown className="size-3" />
            {pendingCount} new action{pendingCount !== 1 ? "s" : ""}
          </button>
        ) : null}

        {live ? (
          <span className="flex items-center gap-1.5 text-xs text-(--color-text-muted)">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--color-success) opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-(--color-success)" />
            </span>
            Live
          </span>
        ) : null}

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void listQuery.refetch()}
            disabled={listQuery.isFetching}
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                listQuery.isFetching && "animate-spin",
              )}
            />
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex-1 p-4">
          <div
            className="h-64 animate-pulse rounded-md bg-(--color-surface-subtle)"
            aria-busy="true"
            aria-label="Loading actions"
          />
        </div>
      ) : isError ? (
        <div className="flex-1 p-6 text-center">
          <p className="text-sm text-(--color-danger-text)">
            Could not load actions.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void listQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : allRows.length === 0 ? (
        <div className="flex-1 px-6 py-14 text-center">
          <p className="text-sm text-(--color-text-muted)">
            No actions recorded in the selected time range.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div
            className="flex shrink-0 items-center border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-muted)"
            style={{ height: ROW_HEIGHT }}
            role="row"
          >
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn("shrink-0 truncate px-2", col.width)}
                role="columnheader"
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Virtualized body */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            onScroll={handleScroll}
            role="rowgroup"
          >
            <div style={{ height: totalHeight, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  top: offsetY,
                  left: 0,
                  right: 0,
                }}
              >
                {visibleRows.map((row, i) => (
                  <div
                    key={row.id ?? `${startIdx + i}`}
                    className="flex cursor-pointer items-center border-b border-(--color-border-subtle)/50 px-3 text-xs hover:bg-(--color-surface-subtle)/60"
                    style={{ height: ROW_HEIGHT }}
                    role="row"
                    onClick={() => row.id && setSelectedActionId(row.id)}
                  >
                    {columns.map((col) => (
                      <div
                        key={col.key}
                        className={cn("shrink-0 truncate px-2", col.width)}
                        role="cell"
                      >
                        {col.render(row)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Load more indicator */}
            {loadingMore ? (
              <div className="flex items-center justify-center py-3 text-xs text-(--color-text-muted)">
                <RefreshCw className="mr-1.5 size-3 animate-spin" />
                Loading more...
              </div>
            ) : null}
          </div>

          {/* Footer: row count */}
          <div className="flex shrink-0 items-center justify-between border-t border-(--color-border-subtle) px-4 py-1.5 text-xs text-(--color-text-muted)">
            <span>
              {allRows.length.toLocaleString()} action
              {allRows.length !== 1 ? "s" : ""}
              {listQuery.data?.meta.total != null
                ? ` of ${listQuery.data.meta.total.toLocaleString()}`
                : ""}
            </span>
            {nextCursor ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                Load more
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* Detail drawer — opens on row click */}
      <ActionDetailDrawer
        actionId={selectedActionId}
        workspaceId={workspaceId}
        workloadId={workloadId}
        onClose={() => setSelectedActionId(null)}
      />
    </div>
  );
}

const ActionsTab = React.memo(ActionsTabInner);
export default ActionsTab;
