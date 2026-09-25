/**
 * An inventory's controls (SPEC-iga-phase2-graph.md §2.14.6): search first
 * and widest; the view controls (All · Agents · Unclassified) beside it;
 * then one Filters button with its count, Sort and Columns. Account, region
 * and runtime filters live inside Filters, and what is applied shows as
 * removable chips underneath, with Clear all.
 *
 * Every filter is the server's, over the whole result — never the page on
 * screen. State lives in the URL (`useListFilters`), so Back restores it.
 */

import type { ReactNode } from "react";

import {
  AppliedFilters,
  ConsoleFilterBar,
  ConsoleFiltersButton,
  type AppliedFilter,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  views,
  activeView,
  onViewChange,
  filters,
  applied,
  onClearAll,
  sort,
  columns,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  views?: ConsoleFilterOption[];
  activeView?: string;
  onViewChange?: (key: string) => void;
  /** The controls inside the Filters popover. */
  filters: ReactNode;
  applied: AppliedFilter[];
  onClearAll: () => void;
  sort: ReactNode;
  columns: ReactNode;
}) {
  return (
    <div data-graph-search>
      <ConsoleFilterBar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filters={views}
        activeFilter={activeView}
        onFilterChange={onViewChange}
        trailing={
          <>
            <ConsoleFiltersButton activeCount={applied.length}>{filters}</ConsoleFiltersButton>
            {sort}
            {columns}
          </>
        }
        below={<AppliedFilters filters={applied} onClearAll={onClearAll} />}
      />
    </div>
  );
}
