/**
 * The body every Published list shares (SPEC-console-revamp.md *Control contract*):
 * the frame, the states, the preview and the investigation context. The three
 * types differ only in their query, their filters and their columns.
 */
import { useEffect, type ReactNode } from "react";
import type { GraphList, GraphListMeta } from "@/app/api/igaGraphApi";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { TableCard } from "@/theme/components/cards";

import { CoverageSummary } from "../coverage/CoverageSummary";
import { PreviewLayout, type PreviewModel } from "../shared/components/ObjectPreview";
import { classifyGraphError } from "../shared/graphErrors";
import { incompleteAccounts, unfilteredEmpty, useAccountNames } from "../shared/listSummary";
import { resolvePagedView } from "../shared/listView";
import { useRestoreScroll } from "../shared/paging";
import { DiscoveryTable } from "./DiscoveryTable";
import { facetSummary } from "./facets";
import type { FacetSpec } from "./FacetBar";
import {
  EmptyList,
  FailurePanel,
  FilteredEmpty,
  SourceHasNoRows,
  UnknownSource,
} from "./ListStates";
import type { ListChrome, Common } from "./publishedCommon";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenProps } from "./screenTypes";

const MUTED = "text-(--color-text-muted)";

/** The chip that says where a row stands without needing the Last confirmed column. */
export function LifecycleCell({ lifecycle, state }: { lifecycle: "active" | "retired"; state: "current" | "stale" | "ended" }) {
  if (lifecycle === "retired") return <StatusBadge tone="neutral">Retired</StatusBadge>;
  if (state === "stale") return <StatusBadge tone="warning">Stale</StatusBadge>;
  return <span className={`text-sm ${MUTED}`}>Current</span>;
}

export interface BodyProps<Row> {
  p: ScreenProps;
  c: Common;
  list: {
    currentData?: GraphList<Row>;
    data?: GraphList<Row>;
    error?: Parameters<typeof classifyGraphError>[0];
    isFetching: boolean;
    refetch: () => unknown;
  };
  tableId: string;
  subject: string;
  columns: AdaptiveColumn<Row>[];
  getRowId: (r: Row) => string;
  facets: FacetSpec[];
  searchPlaceholder: string;
  preview: (row: Row, meta: GraphListMeta | undefined) => PreviewModel;
  clearKeys: string[];
  describeEmpty: string;
  restarted: boolean;
  chrome: ListChrome<Row>;
}

export function PublishedBody<Row>(b: BodyProps<Row>) {
  const { p, c, list } = b;
  const view = resolvePagedView(list, c.paging.pageIndex);
  useRestoreScroll(`discovery-${p.type}`, view.kind === "rows");

  const meta = list.currentData?.meta;
  const facetAccounts = meta?.facets?.account;
  const nameOf = useAccountNames(c.pipeline, facetAccounts ?? undefined);
  const gaps = meta?.coverage ?? [];
  const incomplete = incompleteAccounts(gaps, nameOf);

  const narrowing = [
    p.url.q && `search "${p.url.q}"`,
    p.scope.kind === "one" && `source ${p.scope.source.label}`,
    ...b.facets.filter((f) => f.key !== "source" && f.value !== undefined).map(facetSummary),
  ].filter(Boolean) as string[];

  const selectedId = p.url.sel;
  const rows = view.kind === "rows" ? view.rows : [];
  const selected = selectedId ? rows.find((r) => b.getRowId(r) === selectedId) : undefined;

  // A selection that is no longer on the page (a refreshed publication, another
  // filter) is dropped once the list has settled — never left pointing at nothing.
  const settled = view.kind === "rows" && !view.dim && !view.footerFailure;
  const dropSelection = settled && !!selectedId && !selected;
  const { select } = p.url;
  useEffect(() => {
    if (dropSelection) select(null);
  }, [dropSelection, select]);

  // The deployment does not serve this view, or the role may not read it: said in
  // place of the list — never a list that stays "loading", never an empty one.
  const gateFailure = c.gate.unauthorized ? ({ kind: "unauthorized" } as const) : c.gate.off ? ({ kind: "unavailable" } as const) : null;
  const notPublished = meta?.graph_state === "not_published";
  const body = gateFailure ? (
    <FailurePanel failure={gateFailure} subject={b.subject} permission="iga:read" />
  ) : notPublished ? (
    <div className="px-6 py-14 text-center" role="status">
      <p className="text-sm font-semibold text-(--color-text)">Nothing is published yet</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">
        The graph appears here once the first scan of a connected account finishes and its results are added. This is not an empty result.
      </p>
    </div>
  ) : (
    <DiscoveryTable
      tableId={b.tableId}
      view={view}
      columns={b.columns}
      getRowId={b.getRowId}
      selectedId={selectedId}
      onSelect={(r) => p.url.select(b.getRowId(r))}
      pageIndex={c.paging.pageIndex}
      onPrev={c.paging.prev}
      onNext={c.paging.next}
      onRetry={() => void list.refetch()}
      onRefresh={c.refresh}
      subject={b.subject}
      permission="iga:read"
      incompleteAccounts={incomplete}
      chosenColumns={b.chrome.chosen}
      onColumnsLayout={b.chrome.setLayout}
      empty={
        narrowing.length ? (
          <FilteredEmpty subject={b.subject} narrowing={narrowing} onClear={() => p.url.patch(Object.fromEntries([...b.clearKeys, "q", "source"].map((k) => [k, null])))} />
        ) : (
          <EmptyList subject={b.subject} detail={unfilteredEmpty(b.describeEmpty, incomplete)} />
        )
      }
    />
  );

  return (
    <ScreenFrame
      url={p.url}
      searchPlaceholder={b.searchPlaceholder}
      searchHint={p.url.qTooShort ? "Type at least 2 characters to search." : undefined}
      facets={b.facets}
      trailing={
        <>
          <ColumnsMenu optional={b.chrome.prefs.optional} chosen={b.chrome.prefs.chosen} onChange={b.chrome.prefs.setChosen} onReset={b.chrome.prefs.reset} layout={b.chrome.layout} />
        </>
      }
      onClearAll={() => p.url.patch(Object.fromEntries(b.clearKeys.map((k) => [k, null])))}
      notices={
        <>
          {b.restarted ? (
            <p role="status" className="text-xs text-(--color-text-muted)">
              The list restarted at the first page: it changed while you were paging, so the next page could not continue where the last one ended.
            </p>
          ) : null}
          {c.paging.resetByRevision ? (
            <p className="text-xs text-(--color-text-muted)">The list was refreshed because a newer publication is current.</p>
          ) : null}
          <CoverageSummary subject={b.subject} ws={p.ws} gaps={gaps} accountName={nameOf} pipeline={c.pipeline} />
        </>
      }
    >
      {(width) => (
        <PreviewLayout
          width={width}
          model={selected ? b.preview(selected, meta) : null}
          onClose={() => p.url.select(null)}
          list={
            <TableCard>
              <CardContent variant="flush">{body}</CardContent>
            </TableCard>
          }
        />
      )}
    </ScreenFrame>
  );
}

/** What the page says when the source cannot be listed: never "everything". */
export function SourceGate({ p, children }: { p: ScreenProps; children: ReactNode }) {
  if (p.scope.kind === "unknown") return <UnknownSource id={p.scope.id} provider={p.provider} onClear={() => p.url.patch({ source: null })} />;
  if (p.scope.kind === "no_rows") return <SourceHasNoRows label={p.scope.source.label} onClear={() => p.url.patch({ source: null })} />;
  return <>{children}</>;
}

/** A row's actions menu. It renders in a portal, so its clicks still bubble to the row through
 * React; they are stopped here or the row is selected too. */
export function RowActions({ items }: { items: { label: string; onSelect: () => void }[] }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ConsoleRowActions items={items} />
    </div>
  );
}
