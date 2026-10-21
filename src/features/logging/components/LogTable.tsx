/**
 * LogTable — the one table every log tab renders: Time · Who · Event ·
 * Result, newest first, server-paginated. A failed or denied row shows the
 * reason the log entry carries right in the Result cell ("Denied · no
 * permission"); the rest of the entry's real fields open under the row.
 */

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import type { PaginationMetadata } from "@/app/api/logsApi";

export type LogResultTone = "allowed" | "denied" | "failed" | "recorded" | "pending";

export interface LogRow {
  id: string;
  /** ISO timestamp. */
  time: string;
  who: string;
  whoDetail?: string;
  event: string;
  eventDetail?: string;
  result: { tone: LogResultTone; label: string; reason?: string };
  /** Real fields of the entry, shown when the row is opened. Empty values are skipped. */
  details: Array<[label: string, value: ReactNode]>;
}

const TONE_CLASS: Record<LogResultTone, string> = {
  allowed: "badge--success",
  denied: "badge--danger",
  failed: "badge--danger",
  recorded: "badge--muted",
  pending: "badge--warning",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LogResult({ result }: { result: LogRow["result"] }) {
  const text = result.reason ? `${result.label} · ${result.reason}` : result.label;
  return (
    <span className={`badge ${TONE_CLASS[result.tone]} max-w-full`} title={text}>
      <span className="bdot" />
      <span className="truncate">{text}</span>
    </span>
  );
}

const COLUMNS: AdaptiveColumn<LogRow>[] = [
  {
    id: "time",
    header: "Time",
    alwaysVisible: true,
    approxWidth: 160,
    cell: ({ row }) => (
      <span className="time-cell whitespace-nowrap text-xs tabular-nums text-muted-foreground" title={row.original.time}>
        {formatTime(row.original.time)}
      </span>
    ),
  },
  {
    id: "who",
    header: "Who",
    alwaysVisible: true,
    approxWidth: 240,
    cell: ({ row }) => <EntityCell label={row.original.who} detail={row.original.whoDetail} />,
  },
  {
    id: "event",
    header: "Event",
    priority: 1,
    approxWidth: 260,
    cell: ({ row }) => <EntityCell label={row.original.event} detail={row.original.eventDetail} />,
  },
  {
    id: "result",
    header: "Result",
    alwaysVisible: true,
    approxWidth: 220,
    cell: ({ row }) => <LogResult result={row.original.result} />,
  },
];

function RowDetails({ row }: { row: LogRow }) {
  const items = row.details.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (items.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="mb-0.5 text-[11px] font-medium text-(--color-text-muted)">{k}</dt>
          <dd className="min-w-0 break-words font-mono text-xs">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LogTable({
  tableId,
  rows,
  loading,
  isRefreshing,
  onRefresh,
  pagination,
  onPageChange,
  emptyTitle,
  emptyHint,
}: {
  tableId: string;
  rows: LogRow[];
  loading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  pagination?: PaginationMetadata;
  onPageChange?: (page: number) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  const total = pagination?.total_items ?? rows.length;
  return (
    <TableCard>
      <CardContent variant="flush">
        <div className="flex items-center justify-between gap-3 border-b border-(--color-border-subtle) px-4 py-2.5">
          <span className="text-xs text-muted-foreground tabular-nums">
            {total} {total === 1 ? "entry" : "entries"}
          </span>
          {onRefresh ? (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing}>
              <RotateCcw className={`mr-1.5 size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          ) : null}
        </div>
        <AdaptiveTable
          tableId={tableId}
          data={rows}
          columns={COLUMNS}
          enableSelection={false}
          enableSorting={false}
          enableExpansion
          renderExpandedRow={(r) => <RowDetails row={r.original} />}
          getRowId={(r) => r.id}
          loading={loading}
          emptyState={
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{emptyHint}</p>
            </div>
          }
          pagination={{
            pageSize: pagination?.page_size ?? 50,
            pageSizeOptions: [pagination?.page_size ?? 50],
            alwaysVisible: true,
          }}
          serverTotalItems={pagination?.total_items}
          pageIndex={pagination?.page}
          onPageIndexChange={onPageChange}
        />
      </CardContent>
    </TableCard>
  );
}
