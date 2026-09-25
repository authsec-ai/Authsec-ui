/**
 * The body of a cursor-paged graph table: exactly one §2.14.7 state at a time
 * (loading, failed, empty, rows), with the pager — or the footer failure that
 * replaces its Next — below the rows. See `listView.ts` for how a query result
 * becomes one of these states.
 */

import type { ReactNode, KeyboardEvent } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";

import type { PagedView } from "../listView";
import { useAnnounce } from "../announce";
import { CursorPager, type PagerMeta } from "./CursorPager";
import { GraphStatePanel } from "./GraphStatePanel";

export function PagedTable<T, M extends PagerMeta>({
  tableId,
  view,
  columns,
  getRowId,
  onRowClick,
  pageIndex,
  onPrev,
  onNext,
  onRetry,
  onRefresh,
  subject,
  empty,
  incompleteAccounts,
}: {
  tableId: string;
  view: PagedView<T, M>;
  columns: AdaptiveColumn<T>[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageIndex: number;
  onPrev: () => void;
  onNext: (cursor: string) => void;
  onRetry: () => void;
  onRefresh: () => void;
  /** What the table lists, in the customer's words: "identities". */
  subject: string;
  /** The Empty answer: we looked, completely, and there is nothing. */
  empty: ReactNode;
  incompleteAccounts?: string[];
}) {
  const mobileTable = useReactTable({ data: view.kind === "rows" ? view.rows : [], columns, getRowId, getCoreRowModel: getCoreRowModel() });
  const rowKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches("input,textarea,select") || target.isContentEditable) return;
    const row = target.closest<HTMLElement>("tbody tr, [data-mobile-row]");
    if (!row) return;
    if (event.key === ".") {
      const menu = row.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
      if (menu) { event.preventDefault(); menu.focus(); menu.click(); }
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      const parent = row.parentElement;
      if (!parent) return;
      const rows = [...parent.querySelectorAll<HTMLElement>(":scope > tr, :scope > [data-mobile-row]")];
      const index = rows.indexOf(row);
      const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      const focus = rows[next]?.querySelector<HTMLElement>("a[href],button:not(:disabled)");
      if (focus) { event.preventDefault(); focus.focus(); }
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      const link = row.querySelector<HTMLAnchorElement>("a[href]");
      if (link) { event.preventDefault(); window.open(link.href, "_blank", "noopener,noreferrer"); }
    }
  };
  useAnnounce(
    view.kind === "failed"
      ? `Could not load ${subject}.`
      : view.kind === "rows" && !view.dim && !view.footerFailure
        ? view.rows.length
          ? `Showing ${view.rows.length} ${subject}${view.meta.total_known && view.meta.total !== undefined ? ` of ${view.meta.total} found` : ""}.`
          : `No ${subject} in this scope.`
        : null,
  );

  if (view.kind === "loading") {
    return (
      <div className="p-4" aria-busy="true">
        <DataTableSkeleton columns={Math.min(columns.length, 6)} rows={6} showSelection={false} showActions={false} />
      </div>
    );
  }
  if (view.kind === "failed") {
    return <GraphStatePanel failure={view.failure} subject={subject} onRetry={onRetry} onRefresh={onRefresh} />;
  }
  if (!view.rows.length && !view.footerFailure) return <>{empty}</>;
  return (
    <>
      <div onKeyDown={rowKeys} className={view.dim ? "opacity-60 transition-opacity" : undefined}>
        <div className="hidden md:block">
        <AdaptiveTable
          tableId={tableId}
          columns={columns}
          data={view.rows}
          getRowId={getRowId}
          enableSelection={false}
          enableExpansion={false}
          enableSorting={false}
          enablePagination={false}
          onRowClick={onRowClick}
        />
        </div>
        <div className="divide-y divide-(--color-border-subtle) md:hidden" aria-label={subject}>
          {mobileTable.getRowModel().rows.map((row) => <article key={row.id} data-mobile-row className="space-y-3 p-4">
            {row.getVisibleCells().map((cell, index) => <div key={cell.id} className={index === 0 ? "font-medium" : "text-sm"}>
              {index > 0 && typeof cell.column.columnDef.header === "string" && cell.column.id !== "actions" ? <p className="mb-1 text-xs text-(--color-text-muted)">{cell.column.columnDef.header}</p> : null}
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>)}
          </article>)}
        </div>
      </div>
      <CursorPager
        meta={view.meta}
        pageIndex={pageIndex}
        rowsOnPage={view.rows.length}
        onPrev={onPrev}
        onNext={onNext}
        incompleteAccounts={incompleteAccounts}
        failure={view.footerFailure}
        onRetry={onRetry}
        onRefresh={onRefresh}
        previousPage={view.previousPage}
      />
    </>
  );
}

/** "No … in this scope", naming what narrows it — or, with no filter, what was read. */
export function EmptyScope({
  subject,
  narrowing,
  unfiltered,
  onClear,
}: {
  subject: string;
  narrowing: string[];
  unfiltered: string;
  onClear: () => void;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-semibold text-(--color-text)">No {subject} in this scope</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">
        {narrowing.length ? `Narrowed by ${narrowing.join(", ")}.` : unfiltered}
      </p>
      {narrowing.length ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 text-sm font-semibold text-(--color-primary-text) hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
