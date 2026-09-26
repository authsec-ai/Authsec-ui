import * as React from "react";
import { flexRender, getCoreRowModel, useReactTable, type Row } from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  ResponsiveDataTable,
  type ResponsiveColumnDef,
  type ResponsiveTableConfig,
} from "./responsive-data-table";
import { ResponsiveTableProvider } from "./responsive-table";
import { DataTableSkeleton } from "./table-skeleton";
import { AdaptiveVisibleContext } from "./adaptive-table-context";

type AdaptiveLayout = "minimal" | "compact" | "medium" | "standard" | "full";

export interface AdaptiveColumn<TData, TValue = unknown>
  extends ResponsiveColumnDef<TData, TValue> {
  priority?: number;
  alwaysVisible?: boolean;
  approxWidth?: number;
  /**
   * `sizing="fit"` only. The object's own column (its name and a way to
   * open it): never hidden, and it takes whatever width the other visible
   * columns leave, down to `minWidth`. Without one marked, the first column
   * that is not `actions` is it.
   */
  primary?: boolean;
  /** `sizing="fit"`: the least width the primary column may shrink to. Default 240. */
  minWidth?: number;
  /** What the field is called in the Columns menu and in row details, when `header` is not a string. */
  label?: string;
  /** Off until the customer chooses it in the Columns menu. */
  defaultHidden?: boolean;
  /** How the field reads in row details and cards, when its table cell is not right there. */
  detail?: (row: TData) => React.ReactNode;
  /** Card layout: shown beside the name on the card itself rather than in its details. */
  cardSummary?: boolean;
}

/** Which columns a fitted table is showing, and which fields went to row details. */
export interface AdaptiveColumnsLayout {
  shown: string[];
  /** Chosen by the customer, but moved to row details for want of room. */
  inDetails: string[];
}

interface AdaptiveTableProps<TData> {
  tableId: string;
  data: TData[];
  columns: AdaptiveColumn<TData, any>[];
  rowClassName?: ResponsiveTableConfig<TData>["rowClassName"];
  enableSelection?: boolean;
  selectedRowIds?: string[];
  onRowSelectionChange?: (selectedIds: string[]) => void;
  onSelectAll?: () => void;
  enableExpansion?: boolean;
  expandedRowIds?: string[];
  onExpandedRowsChange?: (expandedIds: string[]) => void;
  renderExpandedRow?: (row: Row<TData>) => React.ReactNode;
  onRowClick?: ResponsiveTableConfig<TData>["onRowClick"];
  enableSorting?: boolean;
  enableResizing?: boolean;
  enablePagination?: boolean;
  pagination?: ResponsiveTableConfig<TData>["pagination"];
  pageIndex?: number;
  onPageIndexChange?: (page: number) => void;
  serverTotalItems?: number;
  getRowId: (row: TData) => string;
  className?: string;
  /**
   * "auto" (default): the original behaviour — `alwaysVisible` columns are
   * reserved, optional ones added while they fit, the browser sizes cells.
   *
   * "fit": the table is exactly its container's width and never scrolls
   * sideways. Only the `primary` column is reserved; the others are added in
   * `priority` order while their `approxWidth` fits the measured container
   * (re-measured when the sidebar or an inspector changes it), are rendered
   * at exactly that width, and clip their content. Every field that is not
   * shown stays reachable in the row's details.
   */
  sizing?: "auto" | "fit";
  /** `sizing="fit"`: the optional columns the customer chose (see `useColumnPreferences`). */
  chosenColumns?: string[];
  onColumnsLayout?: (layout: AdaptiveColumnsLayout) => void;
  /** `sizing="fit"`: below this container width, rows become concise cards with expandable details. */
  cardsBelow?: number;
  /**
   * Loading, failed and empty are three different answers. Without these
   * props a table says "No results." for all three; with them it shows a
   * skeleton while loading, the failure with Retry (never an empty table),
   * and `emptyState` only when the request succeeded with nothing.
   */
  loading?: boolean;
  /** `onRetry` may return the refetch; Retry stays busy until it settles. */
  failure?: { message: React.ReactNode; onRetry: () => unknown };
  emptyState?: React.ReactNode;
}

const DEFAULT_COLUMN_WIDTH = 220;
const SELECTION_COLUMN_WIDTH = 56;
const EXPAND_COLUMN_WIDTH = 48;
const DETAILS_COLUMN_WIDTH = 44;
const PRIMARY_MIN_WIDTH = 240;

function labelOf<TData>(c: AdaptiveColumn<TData>): string {
  return c.label ?? (typeof c.header === "string" ? c.header : c.id);
}

export function AdaptiveTable<TData>({
  tableId,
  data,
  columns,
  rowClassName,
  enableSelection = true,
  selectedRowIds,
  onRowSelectionChange,
  onSelectAll,
  enableExpansion = false,
  expandedRowIds,
  onExpandedRowsChange,
  renderExpandedRow,
  onRowClick,
  enableSorting = true,
  enableResizing = true,
  enablePagination = true,
  pagination = {
    pageSize: 10,
    pageSizeOptions: [5, 10, 25, 50, 100],
    alwaysVisible: true,
  },
  pageIndex,
  onPageIndexChange,
  serverTotalItems,
  getRowId,
  className,
  sizing = "auto",
  chosenColumns,
  onColumnsLayout,
  cardsBelow,
  loading,
  failure,
  emptyState,
}: AdaptiveTableProps<TData>) {
  const fit = sizing === "fit";
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);

  // Measured before paint, so a fitted table never flashes a wider layout.
  React.useLayoutEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;
    const el = containerRef.current;
    setContainerWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const columnIds = React.useMemo(() => columns.map((column) => column.id), [columns]);
  // The object's own column: the one marked `primary`, else the first that
  // is not the actions menu — every consumer lists the object's name first.
  const primaryId = React.useMemo(
    () => columns.find((c) => c.primary)?.id ?? columns.find((c) => c.id !== "actions")?.id,
    [columns]
  );
  const isPrimary = React.useCallback((c: AdaptiveColumn<TData>) => fit && c.id === primaryId, [fit, primaryId]);

  const alwaysVisibleColumns = React.useMemo(
    () => columns.filter((column) => column.alwaysVisible || isPrimary(column)),
    [columns, isPrimary]
  );

  const optionalColumns = React.useMemo(
    () =>
      columns
        .filter((column) => !(column.alwaysVisible || isPrimary(column)))
        .filter((column) => !fit || (chosenColumns ? chosenColumns.includes(column.id) : !column.defaultHidden))
        .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10)),
    [columns, fit, chosenColumns, isPrimary]
  );

  const visibleColumnSet = React.useMemo(() => {
    const fallbackSet = new Set(alwaysVisibleColumns.map((column) => column.id));

    if (containerWidth <= 0) {
      return fallbackSet;
    }

    const reservedWidth = fit
      ? alwaysVisibleColumns.reduce(
          (sum, column) => sum + (isPrimary(column) ? column.minWidth ?? PRIMARY_MIN_WIDTH : column.approxWidth ?? DEFAULT_COLUMN_WIDTH),
          0
        ) + DETAILS_COLUMN_WIDTH
      : alwaysVisibleColumns.reduce(
          (sum, column) => sum + (column.approxWidth ?? DEFAULT_COLUMN_WIDTH),
          0
        ) +
        (enableSelection ? SELECTION_COLUMN_WIDTH : 0) +
        (enableExpansion && renderExpandedRow ? EXPAND_COLUMN_WIDTH : 0);

    let remainingWidth = Math.max(containerWidth - reservedWidth, 0);
    const dynamicSet = new Set(alwaysVisibleColumns.map((column) => column.id));

    for (const column of optionalColumns) {
      const width = column.approxWidth ?? DEFAULT_COLUMN_WIDTH;
      if (remainingWidth >= width) {
        dynamicSet.add(column.id);
        remainingWidth -= width;
      } else {
        break;
      }
    }

    return dynamicSet.size > 0 ? dynamicSet : fallbackSet;
  }, [
    alwaysVisibleColumns,
    optionalColumns,
    containerWidth,
    enableSelection,
    enableExpansion,
    renderExpandedRow,
    fit,
    isPrimary,
  ]);

  // Everything a fitted row does not show is in its details: chosen fields
  // that did not fit, and the ones the customer has not chosen.
  const detailColumns = React.useMemo(
    () => (fit ? columns.filter((c) => !visibleColumnSet.has(c.id) && c.id !== "actions" && !isPrimary(c)) : []),
    [fit, columns, visibleColumnSet, isPrimary]
  );
  const hasDetails = fit && detailColumns.length > 0;

  const layoutKey = `${[...visibleColumnSet].join(",")}|${optionalColumns.filter((c) => !visibleColumnSet.has(c.id)).map((c) => c.id).join(",")}`;
  React.useEffect(() => {
    if (!fit || !onColumnsLayout || containerWidth <= 0) return;
    onColumnsLayout({
      shown: columnIds.filter((id) => visibleColumnSet.has(id)),
      inDetails: optionalColumns.filter((c) => !visibleColumnSet.has(c.id)).map((c) => c.id),
    });
    // The key is the layout itself; the callback identity does not matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, fit, containerWidth > 0]);

  // Every column, for cells drawn outside the table's own column set: a
  // card's fields and a row's details get real cell contexts from here.
  const allCellsTable = useReactTable({
    data: fit ? data : [],
    columns: columns as never,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });
  const renderField = React.useCallback(
    (rowId: string, column: AdaptiveColumn<TData>) => {
      const r = allCellsTable.getRowModel().rowsById[rowId];
      if (!r) return null;
      if (column.detail) return column.detail(r.original);
      const cell = r.getAllCells().find((c) => c.column.id === column.id);
      return cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null;
    },
    [allCellsTable]
  );

  const renderDetails = React.useCallback(
    (row: Row<TData>) => (
      <dl className="grid gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2">
        {detailColumns.map((c) => (
          <div key={c.id} className="min-w-0">
            <dt className="mb-0.5 text-[11px] font-medium text-(--color-text-muted)">{labelOf(c)}</dt>
            <dd className="min-w-0 break-words">{renderField(row.id, c)}</dd>
          </div>
        ))}
      </dl>
    ),
    [detailColumns, renderField]
  );

  const visibilityConfig = React.useMemo(() => {
    const layouts: AdaptiveLayout[] = ["minimal", "compact", "medium", "standard", "full"];

    const baseVisibility: Record<string, boolean> = {};
    columnIds.forEach((id) => {
      baseVisibility[id] = visibleColumnSet.has(id);
    });
    baseVisibility.checkbox = enableSelection;
    baseVisibility.dragHandle = false;
    baseVisibility.expand = fit ? hasDetails : enableExpansion && Boolean(renderExpandedRow);

    return layouts.reduce<Record<AdaptiveLayout, Record<string, boolean>>>((acc, layout) => {
      acc[layout] = { ...baseVisibility };
      return acc;
    }, {} as Record<AdaptiveLayout, Record<string, boolean>>);
  }, [
    columnIds,
    visibleColumnSet,
    enableSelection,
    enableExpansion,
    renderExpandedRow,
    fit,
    hasDetails,
  ]);

  // The primary column takes about a third of the table, never all of what is
  // left: the width beyond that is shared out among the other columns in
  // proportion to their own width, so a wide table does not push every other
  // value to the far right of a very wide name column.
  const columnWidths = React.useMemo(() => {
    if (!fit) return undefined;
    const out: Record<string, number | undefined> = {};
    for (const c of columns) out[c.id] = isPrimary(c) ? undefined : c.approxWidth ?? DEFAULT_COLUMN_WIDTH;
    if (containerWidth <= 0) return out;
    const primary = columns.find((c) => isPrimary(c));
    const shown = columns.filter((c) => visibleColumnSet.has(c.id) && !isPrimary(c));
    const data = shown.filter((c) => c.id !== "actions");
    const used = shown.reduce((sum, c) => sum + (c.approxWidth ?? DEFAULT_COLUMN_WIDTH), 0) + DETAILS_COLUMN_WIDTH;
    const primaryTarget = Math.max(primary?.minWidth ?? PRIMARY_MIN_WIDTH, Math.min(460, Math.round(containerWidth * 0.34)));
    const extra = containerWidth - used - primaryTarget;
    const dataWidth = data.reduce((sum, c) => sum + (c.approxWidth ?? DEFAULT_COLUMN_WIDTH), 0);
    if (extra > 0 && dataWidth > 0) {
      for (const c of data) {
        const w = c.approxWidth ?? DEFAULT_COLUMN_WIDTH;
        out[c.id] = Math.floor(w + (extra * w) / dataWidth);
      }
    }
    return out;
  }, [fit, columns, isPrimary, containerWidth, visibleColumnSet]);

  const tableConfig: ResponsiveTableConfig<TData> = React.useMemo(
    () => ({
      data,
      columns,
      features: {
        selection: enableSelection,
        dragDrop: false,
        expandable: fit ? hasDetails : enableExpansion && Boolean(renderExpandedRow),
        pagination: enablePagination,
        sorting: enableSorting,
        resizing: fit ? false : enableResizing,
      },
      pagination,
      selectedRowIds,
      onRowSelectionChange,
      onSelectAll,
      expandedRowIds,
      onExpandedRowsChange,
      renderExpandedRow: fit ? (hasDetails ? renderDetails : undefined) : renderExpandedRow,
      onRowClick,
      getRowId,
      rowClassName,
      className,
      pageIndex,
      onPageIndexChange,
      serverTotalItems,
      layout: fit ? "fixed" : "auto",
      columnWidths,
      // A fitted row's click is the caller's (usually: open the object);
      // its details open from their own button.
      expandOnRowClick: fit ? !onRowClick : true,
      emptyState,
    }),
    [
      data,
      columns,
      enableSelection,
      enableExpansion,
      renderExpandedRow,
      onRowClick,
      enablePagination,
      enableSorting,
      enableResizing,
      pagination,
      selectedRowIds,
      onRowSelectionChange,
      onSelectAll,
      expandedRowIds,
      onExpandedRowsChange,
      getRowId,
      rowClassName,
      className,
      pageIndex,
      onPageIndexChange,
      serverTotalItems,
      fit,
      hasDetails,
      renderDetails,
      columnWidths,
      emptyState,
    ]
  );

  const cards = fit && cardsBelow !== undefined && containerWidth > 0 && containerWidth < cardsBelow;

  return (
    <ResponsiveTableProvider
      tableType={`adaptive-${tableId}`}
      visibilityConfig={visibilityConfig}
    >
      <AdaptiveVisibleContext.Provider value={fit ? (cards ? CARD_SHOWN : visibleColumnSet) : null}>
        <div ref={containerRef} className="w-full min-w-0">
          {loading ? (
            <div className="p-4" aria-busy="true" aria-label="Loading">
              <DataTableSkeleton columns={Math.min(columns.length, 6)} rows={5} showSelection={false} showActions={false} />
            </div>
          ) : failure ? (
            <FailureRow message={failure.message} onRetry={failure.onRetry} />
          ) : cards && !allCellsTable.getRowModel().rows.length ? (
            // A narrow container still says why it is empty.
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyState ?? "No results."}</div>
          ) : cards ? (
            <AdaptiveCards
              rows={allCellsTable.getRowModel().rows}
              columns={columns}
              primaryId={primaryId}
              renderField={renderField}
              onRowClick={onRowClick}
            />
          ) : (
            <ResponsiveDataTable {...tableConfig} />
          )}
        </div>
      </AdaptiveVisibleContext.Provider>
    </ResponsiveTableProvider>
  );
}

/** In card layout only the name and summary fields are on the card itself. */
const CARD_SHOWN: ReadonlySet<string> = new Set<string>();

function AdaptiveCards<TData>({
  rows,
  columns,
  primaryId,
  renderField,
  onRowClick,
}: {
  rows: Row<TData>[];
  columns: AdaptiveColumn<TData>[];
  primaryId?: string;
  renderField: (rowId: string, column: AdaptiveColumn<TData>) => React.ReactNode;
  onRowClick?: (row: TData) => void;
}) {
  const [open, setOpen] = React.useState<Set<string>>(new Set());
  const primary = columns.find((c) => c.id === primaryId) ?? columns[0];
  const actions = columns.find((c) => c.id === "actions");
  const summary = columns.filter((c) => c.cardSummary && c !== primary);
  const rest = columns.filter((c) => c !== primary && c !== actions && !c.cardSummary);
  return (
    <ul className="divide-y divide-(--color-border-subtle)">
      {rows.map((row) => {
        const expanded = open.has(row.id);
        const toggle = () =>
          setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(row.id)) next.delete(row.id);
            else next.add(row.id);
            return next;
          });
        return (
          <li
            key={row.id}
            data-mobile-row
            className={cn("space-y-2 px-4 py-3", onRowClick && "cursor-pointer")}
            onClick={
              onRowClick
                ? (e) => {
                    if ((e.target as HTMLElement).closest("a,button,[role=menu],.no-row-click")) return;
                    onRowClick(row.original);
                  }
                : undefined
            }
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{renderField(row.id, primary)}</div>
              {actions ? <div className="shrink-0">{renderField(row.id, actions)}</div> : null}
            </div>
            {summary.length ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {summary.map((c) => (
                  <span key={c.id}>{renderField(row.id, c)}</span>
                ))}
              </div>
            ) : null}
            {rest.length ? (
              <>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-(--color-primary-text) hover:underline"
                >
                  {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  {expanded ? "Hide details" : "Details"}
                </button>
                {expanded ? (
                  <dl className="grid gap-y-2 text-sm">
                    {rest.map((c) => (
                      <div key={c.id} className="min-w-0">
                        <dt className="text-[11px] font-medium text-(--color-text-muted)">{labelOf(c)}</dt>
                        <dd className="min-w-0 break-words">{renderField(row.id, c)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function FailureRow({ message, onRetry }: { message: React.ReactNode; onRetry: () => unknown }) {
  // RTK Query keeps the error while a retry is in flight: show the retry is running.
  const [busy, setBusy] = React.useState(false);
  const retry = () => {
    setBusy(true);
    void Promise.resolve(onRetry()).finally(() => setBusy(false));
  };
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm">
      <span className="text-(--color-danger-text)">{message}</span>
      <button type="button" onClick={retry} disabled={busy} className="font-semibold text-(--color-primary-text) hover:underline disabled:opacity-60">
        {busy ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
