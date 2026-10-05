/**
 * The table every Discovery list renders through: exactly one answer at a time
 * (loading, failed, empty, rows), a pager under the rows, and the interaction
 * rule of the console — a click or Space SELECTS (the preview opens beside the
 * list), the name is a real link, and Enter on it opens the details.
 *
 * Selection is shown, not implied: the selected row is tinted and its name link
 * carries `aria-current`. Arrow keys walk the rows' links.
 */

import type { KeyboardEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

import { AdaptiveTable, type AdaptiveColumn, type AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { useAdaptiveColumnShown } from "@/components/ui/adaptive-table-context";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

import { useAnnounce } from "../shared/announce";
import { CursorPager, type PagerMeta } from "../shared/components/CursorPager";
import type { PagedView } from "../shared/listView";
import { FailurePanel } from "./ListStates";

/** A row's name: a real link, the keyboard handle of its row, and its one line of context. */
export function RowName({
  to,
  state,
  name,
  rowKey,
  selected,
  context,
  account,
  badge,
}: {
  to: string;
  state?: unknown;
  name: string;
  rowKey: string;
  selected: boolean;
  /** Kind, region or namespace — never an identifier. */
  context: (string | null | undefined)[];
  /** The account or cluster, added to the line only while its column is hidden. */
  account?: string | null;
  badge?: ReactNode;
}) {
  const accountShown = useAdaptiveColumnShown("account");
  const line = [...context, accountShown ? null : account].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={to}
          state={state}
          data-row-link={rowKey}
          aria-current={selected ? "true" : undefined}
          className="block min-w-0 truncate font-medium text-(--color-text) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
          title={name}
        >
          {name}
        </Link>
        {badge}
      </div>
      {line ? (
        <p className="truncate text-xs text-(--color-text-muted)" title={line}>
          {line}
        </p>
      ) : null}
    </div>
  );
}

export function DiscoveryTable<T>({
  tableId,
  view,
  columns,
  getRowId,
  selectedId,
  onSelect,
  pageIndex,
  onPrev,
  onNext,
  onRetry,
  onRefresh,
  subject,
  permission,
  empty,
  chosenColumns,
  onColumnsLayout,
  incompleteAccounts,
  rowFilter,
  filterNote,
}: {
  tableId: string;
  view: PagedView<T, PagerMeta>;
  columns: AdaptiveColumn<T>[];
  getRowId: (row: T) => string;
  selectedId: string | undefined;
  /** Select a row — the preview opens. */
  onSelect: (row: T) => void;
  pageIndex: number;
  onPrev: () => void;
  onNext: (cursor: string) => void;
  onRetry: () => void;
  onRefresh?: () => void;
  subject: string;
  permission: string;
  empty: ReactNode;
  chosenColumns?: string[];
  onColumnsLayout?: (layout: AdaptiveColumnsLayout) => void;
  incompleteAccounts?: string[];
  /**
   * A client-side narrowing of the rows LOADED (a search the server has no `q`
   * for, a namespace). The pager still describes the server's page, so the
   * counts under it stay the server's; `filterNote` says what was narrowed.
   */
  rowFilter?: (row: T) => boolean;
  filterNote?: (shown: number, loaded: number) => string;
}) {
  useAnnounce(
    view.kind === "failed"
      ? `Could not load ${subject}.`
      : view.kind === "rows" && !view.dim && !view.footerFailure
        ? view.rows.length
          ? `Showing ${view.rows.length} ${subject}.`
          : `No ${subject} in this view.`
        : null,
  );

  const rowKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (view.kind !== "rows") return;
    const target = event.target as HTMLElement;
    if (target.matches("input,textarea,select") || target.isContentEditable) return;
    const row = target.closest<HTMLElement>("tbody tr, [data-mobile-row]");
    if (!row) return;
    if (event.key === " " && target.matches("a[data-row-link]")) {
      // Space selects, as a click does; Enter on the link opens the details.
      const key = target.getAttribute("data-row-link");
      const found = view.rows.find((r) => getRowId(r) === key);
      if (found) {
        event.preventDefault();
        onSelect(found);
      }
    } else if (event.key === ".") {
      const menu = row.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
      if (menu) {
        event.preventDefault();
        menu.focus();
        menu.click();
      }
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      const parent = row.parentElement;
      if (!parent) return;
      const rows = [...parent.querySelectorAll<HTMLElement>(":scope > tr, :scope > [data-mobile-row]")];
      const index = rows.indexOf(row);
      const next =
        event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      const focus = rows[next]?.querySelector<HTMLElement>("a[href]");
      if (focus) {
        event.preventDefault();
        focus.focus();
      }
    }
  };

  if (view.kind === "loading") {
    return (
      <div className="p-4" aria-busy="true" aria-label={`Loading ${subject}`}>
        <DataTableSkeleton columns={Math.min(columns.length, 6)} rows={6} showSelection={false} showActions={false} />
      </div>
    );
  }
  if (view.kind === "failed") {
    return <FailurePanel failure={view.failure} subject={subject} permission={permission} onRetry={onRetry} onRefresh={onRefresh} />;
  }
  const shown = rowFilter ? view.rows.filter(rowFilter) : view.rows;
  if (!shown.length && !view.footerFailure) return <>{empty}</>;

  return (
    <>
      <div onKeyDown={rowKeys} aria-label={subject} className={cn(view.dim && "opacity-60 transition-opacity")}>
        <AdaptiveTable
          tableId={tableId}
          columns={columns}
          data={shown}
          getRowId={getRowId}
          enableSelection={false}
          enableExpansion={false}
          enableSorting={false}
          enablePagination={false}
          onRowClick={onSelect}
          rowClassName={(r) => (getRowId(r) === selectedId ? "bg-(--color-primary-soft)" : undefined)}
          sizing="fit"
          chosenColumns={chosenColumns}
          onColumnsLayout={onColumnsLayout}
          cardsBelow={640}
        />
      </div>
      {rowFilter && filterNote ? (
        <p role="status" className="border-t border-(--color-border-subtle) px-4 py-2 text-xs text-(--color-text-muted)">
          {filterNote(shown.length, view.rows.length)}
        </p>
      ) : null}
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
