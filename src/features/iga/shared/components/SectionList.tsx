/**
 * One independently paged section of a tab — a workload's execution
 * identity, other roles, groups and assumable roles; an identity's workloads,
 * principals and members (§5.3). The first page arrives with the tab; "Show
 * more" continues this section alone through its own cursor, at the pinned
 * revision. A newer publication pauses it (§2.14.5); a failure keeps what is
 * already shown and offers Retry.
 */

import { useEffect, useState, type ReactNode } from "react";

import type { PagedSection } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";

import { classifyGraphError, type GraphFailure } from "../graphErrors";
import { Panel } from "./Panel";

export function SectionList<T>({
  label,
  first,
  loadMore,
  onStale,
  itemKey,
  render,
  empty,
}: {
  label: string;
  first: PagedSection<T>;
  /** Fetch the page after `cursor` for this section only. */
  loadMore: (cursor: string) => Promise<PagedSection<T>>;
  onStale: (failure: Extract<GraphFailure, { kind: "revision_stale" }>) => void;
  itemKey: (item: T) => string;
  render: (item: T) => ReactNode;
  /** The Empty answer; null hides the section when it has nothing. */
  empty: ReactNode | null;
}) {
  const [extra, setExtra] = useState<T[]>([]);
  const [cursor, setCursor] = useState(first.next_cursor);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<GraphFailure | null>(null);

  // A new first page (a refresh, a new revision) starts the section over.
  useEffect(() => {
    setExtra([]);
    setCursor(first.next_cursor);
    setFailure(null);
  }, [first]);

  const items = [...first.items, ...extra];
  if (!items.length && empty === null) return null;

  const more = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailure(null);
    try {
      const page = await loadMore(cursor);
      setExtra((prev) => [...prev, ...page.items]);
      setCursor(page.next_cursor);
    } catch (e) {
      const f = classifyGraphError(e as Parameters<typeof classifyGraphError>[0]) ?? { kind: "failed" as const };
      if (f.kind === "revision_stale") onStale(f);
      setFailure(f);
    } finally {
      setLoading(false);
    }
  };

  const total = first.total_known && first.total !== undefined ? first.total : first.total_at_least;
  return (
    <Panel
      title={label}
      flush
      count={
        total !== undefined && items.length
          ? `${items.length} of ${first.total_known ? total : `more than ${total?.toLocaleString()}`}`
          : undefined
      }
    >
      {items.length ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {items.map((it) => (
            <li key={itemKey(it)} className="px-4 py-3 text-[13px]">
              {render(it)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3 text-[13px] text-(--color-text-muted)">{empty}</div>
      )}
      {cursor || failure ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border-subtle) px-4 py-2 text-xs">
          {failure ? (
            <span role="alert" className="text-(--color-warning-text)">
              {failure.kind === "revision_stale"
                ? "A newer scan published. Refresh to see the rest."
                : "Could not load more."}
            </span>
          ) : null}
          {cursor && failure?.kind !== "revision_stale" ? (
            <Button variant="outline" size="sm" onClick={() => void more()} disabled={loading}>
              {failure ? "Retry" : loading ? "Loading…" : "Show more"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
