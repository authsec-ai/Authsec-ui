import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { GraphFailure } from "../graphErrors";

/** The paging fields every graph list's `meta` carries (§5.2). */
export interface PagerMeta {
  next_cursor: string | null;
  limit: number;
  total_known?: boolean;
  total?: number;
  total_at_least?: number;
}

/**
 * Prev / Next over a cursor-paged graph list (SPEC-iga-phase2-graph.md §2.14.6).
 *
 * There are no page numbers: a cursor cannot jump. Prev is client-side — the
 * caller keeps the stack of cursors it has used. The count is "found", never
 * "total", and appears only when the server could count (`total_known`).
 *
 * When the next page failed, or the revision moved, the rows above stay and
 * this footer says so in place of Next (§2.14.7).
 */
export function CursorPager({
  meta,
  pageIndex,
  rowsOnPage,
  onPrev,
  onNext,
  incompleteAccounts = [],
  failure,
  onRetry,
  onRefresh,
  previousPage = false,
}: {
  meta: PagerMeta;
  pageIndex: number;
  rowsOnPage: number;
  onPrev: () => void;
  onNext: (cursor: string) => void;
  /** Accounts whose collection is partial, stated beside the count. */
  incompleteAccounts?: string[];
  failure?: GraphFailure | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  /** The rows shown are the page before the one that failed to load. */
  previousPage?: boolean;
}) {
  const shownIndex = previousPage ? pageIndex - 1 : pageIndex;
  const from = rowsOnPage === 0 ? 0 : shownIndex * meta.limit + 1;
  const to = shownIndex * meta.limit + rowsOnPage;

  let count: string;
  if (meta.total_known && meta.total !== undefined) {
    count = `${from}–${to} of ${meta.total.toLocaleString()} found`;
  } else if (meta.total_at_least !== undefined) {
    count = `${from}–${to} of more than ${meta.total_at_least.toLocaleString()}`;
  } else {
    count = meta.next_cursor ? `${from}–${to} · more available` : `${from}–${to}`;
  }

  const stale = failure?.kind === "revision_stale";
  const next = meta.next_cursor;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--color-border-subtle) px-4 py-3 text-sm">
      <p className="tabular-nums text-(--color-text-muted)">
        {count}
        {incompleteAccounts.length > 0 ? (
          <span className="text-(--color-warning-text)"> · {incompleteAccounts.join(", ")} incomplete</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {failure ? (
          <span role="alert" className="text-(--color-warning-text)">
            {stale
              ? "A newer scan published. Refresh to keep paging."
              : previousPage
                ? "Could not load the next page."
                : "Could not refresh these results."}
          </span>
        ) : null}
        {failure && stale && onRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
        ) : null}
        {failure && !stale && onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={onPrev}
          disabled={shownIndex === 0 && !previousPage}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => next && onNext(next)}
          disabled={!next || !!failure || previousPage}
          aria-label="Next page"
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
