/**
 * The frame every Discovery list sits in (SPEC-console-revamp.md *Layout*):
 * the search box, the filter row — then whatever notices apply — then the list
 * with its preview. The type switcher sits above it, owned by the page, so it
 * keeps its focus when the reader changes type or view.
 *
 * It measures its own content width (not the viewport's): the filter row
 * collapses to a sheet below 900 px, the preview becomes a drawer below 1100 px.
 */

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

import { useElementWidth } from "../shared/components/useElementWidth";
import { FacetBar, type FacetSpec } from "./FacetBar";
import type { DiscoveryUrl } from "./useDiscoveryUrl";

export function ScreenFrame({
  url,
  searchPlaceholder,
  searchHint,
  facets,
  trailing,
  onClearAll,
  notices,
  children,
}: {
  url: DiscoveryUrl;
  searchPlaceholder: string;
  /** Said under the search box: "Search the 120 loaded rows", or why a short query is not sent. */
  searchHint?: ReactNode;
  facets: FacetSpec[];
  /** Columns, at the end of the toolbar row. */
  trailing?: ReactNode;
  onClearAll: () => void;
  /** Coverage, collection state: between the filters and the list. */
  notices?: ReactNode;
  children: (width: number) => ReactNode;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  // Every filter, Classification included, lives in the one Filters menu;
  // applied filters show as removable chips in the row below. (A one-tap
  // "Unclassified only" chip beside the search read as part of the search.)
  return (
    <div ref={ref} className="min-w-0">
      {/* One row: search, Filters and Columns. */}
      <div data-graph-search data-compact-toolbar className="flex flex-wrap items-center gap-2.5 border-b border-(--color-border-subtle) px-4 py-3">
        <label className="relative flex min-w-[220px] max-w-[380px] flex-1 basis-[260px] items-center">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={url.searchText}
            onChange={(e) => url.setSearchText(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 pl-9"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <span className="flex-1" />
        <FacetBar part="button" facets={facets} width={width} removed={url.removed} onDismissRemoved={url.dismissRemoved} onClearAll={onClearAll} />
        {trailing}
      </div>
      {searchHint || url.removed.length || facets.some((f) => f.value !== undefined) ? (
        <div className="space-y-2 px-4 py-3">
          {searchHint ? <p className="text-xs text-(--color-text-muted)">{searchHint}</p> : null}
          <FacetBar part="status" facets={facets} width={width} removed={url.removed} onDismissRemoved={url.dismissRemoved} onClearAll={onClearAll} />
        </div>
      ) : null}
      {/* Coverage and collection notices; takes no room when there are none. */}
      <div className="space-y-2 px-4 empty:hidden [&:not(:empty)]:py-3">{notices}</div>
      {children(width)}
    </div>
  );
}
