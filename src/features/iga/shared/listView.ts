/**
 * One reading of a paged graph query, so every list and paged tab answers the
 * §2.14.7 states the same way (SPEC-iga-phase2-graph.md).
 *
 * - A failure is never an empty list.
 * - A reload of rows already shown that fails keeps them, with the error in
 *   the footer ("Refresh failed").
 * - A NEXT page that fails, or reads a revision that has moved, keeps the
 *   page on screen, with the error in the footer ("Next page failed").
 * - Rows from other filters are never shown: while page one of a new filter
 *   loads, the view is loading.
 */

import { useEffect } from "react";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

import { classifyGraphError, type GraphFailure } from "./graphErrors";

export interface PagedResult<T, M> {
  currentData?: { data: T[]; meta: M };
  data?: { data: T[]; meta: M };
  error?: FetchBaseQueryError | SerializedError;
  isFetching: boolean;
}

export type PagedView<T, M> =
  | { kind: "loading" }
  | { kind: "failed"; failure: GraphFailure }
  | {
      kind: "rows";
      rows: T[];
      meta: M;
      /** The rows are the previous answer while a new one loads. */
      dim: boolean;
      /** Shown in the footer in place of the pager's Next. */
      footerFailure: GraphFailure | null;
      /** The rows belong to the page before the one that failed. */
      previousPage: boolean;
    };

export function resolvePagedView<T, M>(result: PagedResult<T, M>, pageIndex: number): PagedView<T, M> {
  const failure = classifyGraphError(result.error);
  const cur = result.currentData;
  if (cur) {
    return {
      kind: "rows",
      rows: cur.data,
      meta: cur.meta,
      dim: result.isFetching,
      footerFailure: failure,
      previousPage: false,
    };
  }
  // Paging, and the new page is not here: keep the page the customer was on.
  if (pageIndex > 0 && result.data) {
    return {
      kind: "rows",
      rows: result.data.data,
      meta: result.data.meta,
      dim: !failure,
      footerFailure: failure,
      previousPage: true,
    };
  }
  if (failure && failure.kind !== "listing_changed") return { kind: "failed", failure };
  return { kind: "loading" };
}

/** A listing that changed under its cursor restarts at a fresh page one. */
export function useRestartOnListingChanged(
  error: PagedResult<unknown, unknown>["error"],
  restart: () => void,
  onRestarted?: () => void,
) {
  const changed = classifyGraphError(error)?.kind === "listing_changed";
  useEffect(() => {
    if (!changed) return;
    restart();
    onRestarted?.();
    // Reacts to the failure alone; the callbacks are recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);
}
