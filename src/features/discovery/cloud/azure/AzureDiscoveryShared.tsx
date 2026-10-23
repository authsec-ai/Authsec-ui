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

import { Copy } from "lucide-react";

import { copyToClipboard } from "@/lib/clipboard";

import { TruncationLine } from "../aws/AWSInventoryNotices";
import { attrLabel, connectorLabel, shortId, type DirectoryRef } from "./azureDiscoveryLabels";

export const ALL = "all";

/** A truncated technical id, shown only where the id itself matters (a row's
 * subtitle, a Technical IDs field): click copies the full value. Not for
 * every shortened string — only ones worth pasting into another tool. */
export function CopyableId({ value, what = "ID" }: { value: string; what?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void copyToClipboard(value, what);
      }}
      title={`${value} — click to copy`}
      className="group inline-flex min-w-0 max-w-full items-center gap-1 font-mono text-(--color-text-muted) hover:text-(--color-text)"
    >
      <span className="truncate">{shortId(value)}</span>
      <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden="true" />
    </button>
  );
}

/** A tenant's or subscription's name, exactly where `connectorLabel` would
 * fall back to a raw id — this is that same fallback, but with the id made
 * copyable instead of sitting there as plain, unpasteable text. For a Fact
 * row whose own label already says "Directory"/"Azure subscription": never
 * repeats that word, so the row doesn't read "Directory: Directory …". */
export function ConnectorNameOrId({ c, what }: { c: CloudConnector | undefined; what: string }) {
  if (!c) return <>Unknown</>;
  const attrs = (c.attrs ?? {}) as Record<string, unknown>;
  const name =
    c.scope_kind === "tenant"
      ? typeof attrs["tenant_display_name"] === "string" && attrs["tenant_display_name"]
        ? (attrs["tenant_display_name"] as string)
        : ""
      : typeof attrs["display_name"] === "string" && attrs["display_name"]
        ? (attrs["display_name"] as string)
        : "";
  if (name) return <>{name}</>;
  return (
    <span className="inline-flex items-center gap-1 text-(--color-text-muted)">
      <CopyableId value={c.scope_id} what={what} /> <span>(name not read)</span>
    </span>
  );
}

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A person's name for a reference; a reference with no name is "Unnamed owner", never its id. */
function refName(r: DirectoryRef): string {
  return r.name || "Unnamed owner";
}

/** Names of the references, each once, or `empty` when there are none. */
export function RefNames({ refs, max = 2, empty = "None listed" }: { refs: DirectoryRef[]; max?: number; empty?: string }) {
  if (!refs.length) return <span className="text-xs text-muted-foreground">{empty}</span>;
  const names = [...new Set(refs.map(refName))];
  const shown = names.slice(0, max).join(", ");
  return (
    // block + truncate: a long name (or several joined by commas) clips with "…"
    // at the column's own width instead of running on past it; the full list
    // is still one hover away.
    <span className="block truncate text-xs" title={names.join(", ")}>
      {shown}
      {names.length > max ? <span className="text-muted-foreground"> +{names.length - max}</span> : null}
    </span>
  );
}

/** Azure tags as small "Key: Value" pills instead of one run-on line. */
function TagPills({ tags }: { tags: Record<string, unknown> }) {
  const entries = Object.entries(tags).filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean");
  if (!entries.length) return <span className="text-muted-foreground">Recorded</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-full border border-(--color-border-subtle) bg-(--color-surface-subtle) px-2 py-0.5 text-xs">
          <span className="font-medium">{k}</span>: {String(v)}
        </span>
      ))}
    </div>
  );
}

/** One attribute value as plain text: names for people, a count for long lists, a short line for an object. Never JSON. */
function factValue(v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (ISO_DATE.test(v)) return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    return shortId(v);
  }
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">None</span>;
    if (v.every((x) => x && typeof x === "object" && "id" in (x as object))) return <RefNames refs={v as DirectoryRef[]} max={3} />;
    if (v.every((x) => typeof x === "string" || typeof x === "number")) return v.map((x) => shortId(String(x))).join(", ");
    return `${v.length} ${v.length === 1 ? "item" : "items"} recorded`;
  }
  if (typeof v === "object") {
    const plain = Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string" || typeof x === "number" || typeof x === "boolean");
    if (!plain.length) return <span className="text-muted-foreground">Recorded</span>;
    return plain.map(([k, x]) => `${attrLabel(k)}: ${factValue(x) as string}`).join(" · ");
  }
  return String(v);
}

/** Technical identifiers an admin may cross-reference in the Azure portal or a
 * script. All of them stay one click away, with copy, never hidden entirely —
 * only the ones specific to a secondary object (a blueprint, a creator app)
 * are tucked under "Technical IDs" so they do not crowd out the object's own. */
const ID_KEY = /(^|_)(object|app|principal|tenant|identity)_id$/;

/** `object_id` and `app_id` are the object's own identifiers: kept visible,
 * in place, with copy — never demoted alongside a blueprint's or creator's. */
const PRIMARY_ID_KEY = new Set(["object_id", "app_id"]);

/** Every attribute Microsoft returned for an object, as name/value pairs, in
 * the order given. Nothing is interpreted or rated. A secondary-object's ID
 * fields collapse under their own toggle; every ID, shown or collapsed, is
 * click-to-copy rather than plain truncated text. */
export function AttrFacts({ attrs, skip = [] }: { attrs: Record<string, unknown> | null | undefined; skip?: string[] }) {
  const entries = Object.entries(attrs ?? {}).filter(([k]) => !skip.includes(k));
  if (!entries.length) return <p className="text-xs text-muted-foreground">No further attributes were recorded.</p>;
  const main = entries.filter(([k]) => !ID_KEY.test(k) || PRIMARY_ID_KEY.has(k));
  const ids = entries.filter(([k]) => ID_KEY.test(k) && !PRIMARY_ID_KEY.has(k));
  const idValue = (k: string, v: unknown) => (typeof v === "string" && v ? <CopyableId value={v} what={attrLabel(k)} /> : factValue(v));
  return (
    <div className="space-y-2">
      {main.length ? (
        <DetailGrid>
          {main.map(([k, v]) =>
            k === "tags" && v && typeof v === "object" ? (
              <DetailRow key={k} label={attrLabel(k)} value={<TagPills tags={v as Record<string, unknown>} />} full />
            ) : ID_KEY.test(k) ? (
              <DetailRow key={k} label={attrLabel(k)} value={idValue(k, v)} full />
            ) : (
              <DetailRow key={k} label={attrLabel(k)} value={factValue(v)} full={typeof v === "object" && v !== null ? true : typeof v === "string" && v.length > 36} />
            ),
          )}
        </DetailGrid>
      ) : null}
      {ids.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-(--color-primary-text)">Technical IDs ({ids.length})</summary>
          <div className="mt-2">
            <DetailGrid>
              {ids.map(([k, v]) => (
                <DetailRow key={k} label={attrLabel(k)} value={idValue(k, v)} full />
              ))}
            </DetailGrid>
          </div>
        </details>
      ) : null}
    </div>
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
  if (query.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (query.isError) {
    return <LoadFailurePanel failure={loadFailureOf(query.error) ?? "failed"} subject="this list" permission="discovery:read" onRetry={() => void query.refetch?.()} />;
  }
  const rows = query.data?.rows ?? [];
  if (!rows.length) return <DrawerEmpty title={empty} />;
  const total = query.data?.total ?? rows.length;
  const totalKnown = !!query.data?.totalKnown;
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border">{rows.map((r, i) => <li key={i} className="px-3 py-2 text-xs">{render(r)}</li>)}</ul>
      <TruncationLine truncation={{ truncated: totalKnown && total > rows.length, shown: rows.length, total, totalKnown }} noun="entries" />
    </div>
  );
}
