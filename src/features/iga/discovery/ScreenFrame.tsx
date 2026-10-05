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

import { ConsoleFilterBar } from "@/components/console/iam-console";

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
  /** Sort and Columns, beside the search box (so sorting is reachable when its column is hidden). */
  trailing?: ReactNode;
  onClearAll: () => void;
  /** Coverage, collection state: between the filters and the list. */
  notices?: ReactNode;
  children: (width: number) => ReactNode;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="min-w-0 space-y-3">
      <div data-graph-search>
        <ConsoleFilterBar
          search={url.searchText}
          onSearchChange={url.setSearchText}
          searchPlaceholder={searchPlaceholder}
          trailing={trailing}
          below={searchHint ? <p className="text-xs text-(--color-text-muted)">{searchHint}</p> : undefined}
        />
      </div>
      <FacetBar facets={facets} width={width} removed={url.removed} onDismissRemoved={url.dismissRemoved} onClearAll={onClearAll} />
      {notices}
      {children(width)}
    </div>
  );
}
