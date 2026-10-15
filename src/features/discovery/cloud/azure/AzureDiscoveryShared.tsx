import type { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";

import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { TableCard } from "@/theme/components/cards";

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
  return <code className="break-all text-[11px]">{JSON.stringify(v)}</code>;
}

/** Every attribute Microsoft returned for an object, as name/value pairs, in
 * the order given. Nothing is interpreted or rated. */
export function AttrFacts({ attrs, skip = [] }: { attrs: Record<string, unknown> | null | undefined; skip?: string[] }) {
  const entries = Object.entries(attrs ?? {}).filter(([k]) => !skip.includes(k));
  if (!entries.length) return <p className="text-xs text-muted-foreground">No further attributes were recorded.</p>;
  return (
    <dl className="grid grid-cols-[minmax(120px,40%)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-muted-foreground">{attrLabel(k)}</dt>
          <dd className="min-w-0 break-words">{factValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The table card with its loading, failed, empty and no-match states. */
export function ListFrame({
  loading,
  failed,
  onRetry,
  empty,
  noMatch,
  emptyText,
  children,
}: {
  loading: boolean;
  failed: boolean;
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
      <div className="px-6 py-10 text-center text-xs text-muted-foreground">
        The request failed, so nothing is listed. This is not an empty inventory.{" "}
        <button className="font-semibold text-(--color-primary-text) underline" onClick={onRetry}>
          Retry
        </button>
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
  query: { isLoading: boolean; isError: boolean; data?: { rows: T[]; total: number; totalKnown: boolean } };
  empty: string;
  render: (row: T) => ReactNode;
}) {
  if (query.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (query.isError) return <p className="text-xs text-(--color-danger-text)">Could not load this list.</p>;
  const rows = query.data?.rows ?? [];
  if (!rows.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const more = query.data && query.data.totalKnown && query.data.total > rows.length ? query.data.total - rows.length : 0;
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border">{rows.map((r, i) => <li key={i} className="px-3 py-2 text-[13px]">{render(r)}</li>)}</ul>
      {more ? <p className="text-[11px] text-muted-foreground">{more} more not shown.</p> : null}
    </div>
  );
}
