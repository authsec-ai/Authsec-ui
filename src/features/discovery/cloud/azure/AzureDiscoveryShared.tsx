import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import type { SerializedError } from "@reduxjs/toolkit";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { DetailGrid, DetailRow, DrawerEmpty } from "@/components/console/detail";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { TableCard } from "@/theme/components/cards";

import { TruncationLine } from "../aws/AWSInventoryNotices";
import { attrLabel, connectorLabel, type DirectoryRef } from "./azureDiscoveryLabels";

export const ALL = "all";

/** Relative time, the exact instant on hover; "Unknown" rather than an invented time. */
export function RelativeDate({ iso }: { iso: string | null | undefined }) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return <span className="text-xs text-muted-foreground">Unknown</span>;
  return (
    <span className="text-xs text-muted-foreground" title={at.toLocaleString()}>
      {formatDistanceToNow(at, { addSuffix: true })}
    </span>
  );
}

/** Narrows a list to one tenant (identities) or one subscription (resources, workloads). */
export function AzureSourceSelect({
  options,
  value,
  onChange,
  allLabel,
}: {
  options: CloudConnector[];
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
}) {
  if (options.length < 2) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Source" className="h-8 w-[240px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {connectorLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Names of the references, or the dash when there are none. */
export function RefNames({ refs, max = 2 }: { refs: DirectoryRef[]; max?: number }) {
  if (!refs.length) return <span className="text-xs text-muted-foreground">None recorded</span>;
  const names = refs.map((r) => r.name || r.id);
  const shown = names.slice(0, max).join(", ");
  return (
    <span className="text-xs" title={names.join(", ")}>
      {shown}
      {names.length > max ? <span className="text-muted-foreground"> +{names.length - max}</span> : null}
    </span>
  );
}

function factValue(v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "id" in (x as object))) {
    return (v as DirectoryRef[]).map((r) => r.name || r.id).join(", ");
  }
  if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) {
    return v.length ? v.join(", ") : <span className="text-muted-foreground">None</span>;
  }
  return <code className="break-all text-xs">{JSON.stringify(v)}</code>;
}

/** Every attribute Microsoft returned for an object, as name/value pairs, in
 * the order given. Nothing is interpreted or rated. */
export function AttrFacts({ attrs, skip = [] }: { attrs: Record<string, unknown> | null | undefined; skip?: string[] }) {
  const entries = Object.entries(attrs ?? {}).filter(([k]) => !skip.includes(k));
  if (!entries.length) return <p className="text-xs text-muted-foreground">No further attributes were recorded.</p>;
  return (
    <DetailGrid>
      {entries.map(([k, v]) => (
        <DetailRow key={k} label={attrLabel(k)} value={factValue(v)} full={typeof v === "object" && v !== null ? true : typeof v === "string" && v.length > 36} />
      ))}
    </DetailGrid>
  );
}

/** The table card with its loading, failed, empty and no-match states. */
export function ListFrame({
  loading,
  failed,
  error,
  onRetry,
  empty,
  noMatch,
  emptyText,
  children,
}: {
  loading: boolean;
  failed: boolean;
  error?: FetchBaseQueryError | SerializedError;
  onRetry: () => void;
  empty: boolean;
  noMatch: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  let body: ReactNode = children;
  if (loading) {
    body = (
      <div className="p-4">
        <DataTableSkeleton columns={5} rows={6} showSelection={false} showActions={false} />
      </div>
    );
  } else if (failed) {
    body = (
      <div className="p-4">
        <LoadFailurePanel failure={loadFailureOf(error) ?? "failed"} subject="this list" permission="discovery:read" onRetry={onRetry} />
      </div>
    );
  } else if (empty) {
    body = <p className="px-6 py-14 text-center text-xs text-muted-foreground">{emptyText}</p>;
  } else if (noMatch) {
    body = <p className="px-6 py-14 text-center text-xs text-muted-foreground">Nothing in the loaded rows matches that search or filter.</p>;
  }
  return (
    <TableCard>
      <CardContent variant="flush">{body}</CardContent>
    </TableCard>
  );
}

/** A compact list inside a drawer tab, with its own loading, failed and empty states. */
export function DrawerList<T>({
  query,
  empty,
  render,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error?: FetchBaseQueryError | SerializedError;
    refetch?: () => unknown;
    data?: { rows: T[]; total: number; totalKnown: boolean };
  };
  empty: string;
  render: (row: T) => ReactNode;
}) {
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (query.isError) {
    return <LoadFailurePanel failure={loadFailureOf(query.error) ?? "failed"} subject="this list" permission="discovery:read" onRetry={() => void query.refetch?.()} />;
  }
  const rows = query.data?.rows ?? [];
  if (!rows.length) return <DrawerEmpty title={empty} />;
  const total = query.data?.total ?? rows.length;
  const totalKnown = !!query.data?.totalKnown;
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border">{rows.map((r, i) => <li key={i} className="px-3 py-2 text-[13px]">{render(r)}</li>)}</ul>
      <TruncationLine truncation={{ truncated: totalKnown && total > rows.length, shown: rows.length, total, totalKnown }} noun="entries" />
    </div>
  );
}
