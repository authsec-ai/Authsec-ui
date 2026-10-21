/**
 * Paging for the Azure lists: the page size chosen in the URL (`size`, the same
 * 25 / 50 / 100 as AWS) and, where a list is read whole and paged here, the
 * rows of the current page. The pager under the rows is AWS's `CursorPager`.
 */

import { useState } from "react";

import { PAGE_SIZES, type PagerMeta } from "@/features/iga/shared/components/CursorPager";

/** The page size a `size` URL value names; anything else is the default (25). */
export function parsePageSize(raw: string | null | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : PAGE_SIZES[0];
}

/** The `size` value to write for a page size: the default is not written at all. */
export function pageSizeParam(n: number): string | null {
  return n === PAGE_SIZES[0] ? null : String(n);
}

/**
 * Pages rows the screen already holds. `resetKey` names everything that restarts
 * the list at page one (search, filters, source, page size).
 */
export function pageSlice<T>(rows: T[], pageSize: number, page: number): { rows: T[]; pageIndex: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.min(Math.max(page, 0), pages - 1);
  return { rows: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), pageIndex, pages };
}

export function useClientPaging<T>(rows: T[], pageSize: number, resetKey: string) {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const page = state.key === resetKey ? state.page : 0;
  const slice = pageSlice(rows, pageSize, page);
  const meta: PagerMeta = { next_cursor: slice.pageIndex < slice.pages - 1 ? "next" : null, limit: pageSize, total_known: true, total: rows.length };
  return {
    pageRows: slice.rows,
    pageIndex: slice.pageIndex,
    meta,
    onPrev: () => setState({ key: resetKey, page: Math.max(0, slice.pageIndex - 1) }),
    onNext: () => setState({ key: resetKey, page: slice.pageIndex + 1 }),
  };
}
