/**
 * AWS, Published: the §5.3 graph lists — what AuthSec concluded from the scans,
 * pinned to one publication (SPEC-console-revamp.md *Control contract*).
 *
 * Search is the server's `q` over name, full ARN and account id. Source, Region,
 * Lifecycle, Classification, Runtime, Kind, Representation and External are the
 * server's filters; their counts are the server's facets, which reflect every
 * other filter. Paging is a signed keyset cursor kept in history state, so Back
 * restores the page, and sort is the server's.
 *
 * The three types differ only in their query, their filters and their columns;
 * the frame, the states, the preview and the investigation context are shared
 * (`PublishedBody`).
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  igaGraphApi,
  refId,
  useListGraphIdentitiesQuery,
  useListGraphResourcesQuery,
  useListGraphWorkloadsQuery,
  type ClassificationFilter,
  type GraphList,
  type GraphListMeta,
  type IdentityKind,
  type IdentityRow,
  type IdentitySort,
  type ListIdentitiesArgs,
  type ListResourcesArgs,
  type ListWorkloadsArgs,
  type ResourceKind,
  type ResourceRow,
  type ResourceSort,
  type RuntimeKind,
  type WorkloadRow,
  type WorkloadSort,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { HelpTooltip } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/clipboard";
import { TableCard } from "@/theme/components/cards";

import { CoverageSummary } from "../coverage/CoverageSummary";
import { useLoadFirstPublication, usePipeline } from "../pipeline/usePipeline";
import { useGraphFeature } from "../shared/capabilities";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { CountText } from "../shared/components/CountText";
import { SortSelect } from "../shared/components/FacetSelect";
import { PreviewLayout, type PreviewModel } from "../shared/components/ObjectPreview";
import { AccountCell } from "../shared/components/InventoryCells";
import { classifyGraphError } from "../shared/graphErrors";
import { accountCoverageNote } from "../shared/lifecycle";
import {
  CLASSIFICATION_MEANING,
  CLASSIFICATION_SHORT,
  CLASSIFICATION_TONE,
  DIRECT_BINDINGS_LABEL,
  DIRECT_BINDINGS_MEANING,
  IDENTITY_KIND_LABEL,
  RESOURCE_KIND_LABEL,
  RESOURCE_KIND_NOTE,
  RUNTIME_LABEL,
  RUNTIME_SHORT,
  accountLabel,
  accountWithId,
} from "../shared/labels";
import { incompleteAccounts, unfilteredEmpty, useAccountNames } from "../shared/listSummary";
import { resolvePagedView, useRestartOnListingChanged } from "../shared/listView";
import { usePaging, useRestoreScroll } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { countOfExact, countWithNoun } from "../shared/components/countValue";
import { DiscoveryTable, RowName } from "./DiscoveryTable";
import { facetSummary, fixedFacet, reportedFacet, sourceFacet, type FacetOptions } from "./facets";
import type { FacetSpec } from "./FacetBar";
import { EmptyList, FailurePanel, FilteredEmpty, SourceHasNoRows, UnknownSource } from "./ListStates";
import { ResourceHolders, WorkloadFact } from "./PublishedPreviewFacts";
import { ScreenFrame } from "./ScreenFrame";
import type { ScreenProps } from "./screenTypes";

const MUTED = "text-(--color-text-muted)";

function valid<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

const LIFECYCLE_OPTIONS = [
  { value: "retired", label: "Retired" },
  { value: "all", label: "All (active and retired)" },
] as const;

const LIFECYCLE_NOTE = "Active includes current and stale rows; a stale row says so and is never hidden or removed. Retired rows are objects no scan confirms any more.";

/** The chip that says where a row stands without needing the Last confirmed column. */
function LifecycleCell({ lifecycle, state }: { lifecycle: "active" | "retired"; state: "current" | "stale" | "ended" }) {
  if (lifecycle === "retired") return <StatusBadge tone="neutral">Retired</StatusBadge>;
  if (state === "stale") return <StatusBadge tone="warning">Stale</StatusBadge>;
  return <span className={`text-sm ${MUTED}`}>Current</span>;
}

/** Was this row's account not fully read? One test for every type, from the list's own coverage notes. */
function accountHasGap(meta: GraphListMeta | undefined, account: { id: string } | null | undefined): boolean {
  return accountCoverageNote(meta?.coverage, account?.id) !== null;
}

/* --------------------------------- shared --------------------------------- */

function usePublishedCommon(p: ScreenProps, feature: "workloads" | "identities" | "resources") {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(p.ws);
  const gate = useGraphFeature(p.ws, feature);
  const paging = usePaging(`discovery-${feature}`, epoch);
  const pipeline = usePipeline(p.ws, gate.off);
  const blocked = p.scope.kind === "unknown" || p.scope.kind === "no_rows";
  const account = p.scope.kind === "one" ? [p.scope.source.scopeId] : undefined;
  return { dispatch, rev, epoch, refresh, gate, paging, pipeline, blocked, account };
}
type Common = ReturnType<typeof usePublishedCommon>;

interface BodyProps<Row> {
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
  sortControl: ReactNode;
  searchPlaceholder: string;
  preview: (row: Row, meta: GraphListMeta | undefined) => PreviewModel;
  clearKeys: string[];
  describeEmpty: string;
  restarted: boolean;
  chosenColumns?: string[];
  columnsMenu: ReactNode;
  onColumnsLayout: (l: AdaptiveColumnsLayout) => void;
}

function PublishedBody<Row>(b: BodyProps<Row>) {
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
      chosenColumns={b.chosenColumns}
      onColumnsLayout={b.onColumnsLayout}
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
          {b.sortControl}
          {b.columnsMenu}
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
function SourceGate({ p, children }: { p: ScreenProps; children: ReactNode }) {
  if (p.scope.kind === "unknown") return <UnknownSource id={p.scope.id} provider={p.provider} onClear={() => p.url.patch({ source: null })} />;
  if (p.scope.kind === "no_rows") return <SourceHasNoRows label={p.scope.source.label} onClear={() => p.url.patch({ source: null })} />;
  return <>{children}</>;
}

function useListChrome<T>(tableId: string, columns: AdaptiveColumn<T>[]) {
  const prefs = useColumnPreferences(tableId, columns);
  const [layout, setLayout] = useState<AdaptiveColumnsLayout | undefined>();
  return {
    chosen: prefs.chosen,
    setLayout,
    menu: <ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={layout} />,
  };
}

function sourceSpec(p: ScreenProps, fo: FacetOptions): FacetSpec {
  return {
    key: "source",
    label: "Source",
    kind: "choice",
    value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
    options: fo.options,
    countsUnavailable: fo.countsUnavailable,
    anyLabel: "Every AWS account",
    onChange: (v) => p.url.patch({ source: v }),
  };
}

function actions(items: { label: string; onSelect: () => void }[]) {
  // The menu renders in a portal, so its clicks still bubble to the row through
  // React; stop them here or the row is selected too.
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ConsoleRowActions items={items} />
    </div>
  );
}

/* -------------------------------- workloads -------------------------------- */

const RUNTIMES = Object.keys(RUNTIME_LABEL) as RuntimeKind[];
const WORKLOAD_SORTS: { value: WorkloadSort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "account", label: "Account" },
  { value: "classification", label: "Classification" },
  { value: "last_confirmed", label: "Last confirmed" },
];
const CLASSIFICATION_VALUES: { value: string; label: string }[] = [
  { value: "classified_agent", label: "Agent — classified by a person" },
  { value: "provider_native_agent", label: "Agent — provider-native" },
  { value: "unclassified", label: "Unclassified" },
];

function PublishedWorkloads(p: ScreenProps) {
  const navigate = useNavigate();
  const c = usePublishedCommon(p, "workloads");
  const [restarted, setRestarted] = useState(false);
  const region = p.url.get("region");
  const runtime = valid(p.url.get("runtime"), RUNTIMES);
  const classification = valid(p.url.get("classification"), ["classified_agent", "provider_native_agent", "unclassified"] as const);
  const lifecycle = valid(p.url.get("lifecycle"), ["retired", "all"] as const);
  const sort = valid(p.url.get("sort"), WORKLOAD_SORTS.map((s) => s.value)) ?? "name";

  const args: ListWorkloadsArgs = {
    ws: p.ws,
    rev: c.rev,
    key: c.paging.cacheKey,
    q: p.url.q,
    account: c.account,
    region,
    runtime_kind: runtime,
    classification: classification as ClassificationFilter | undefined,
    lifecycle,
    sort,
    cursor: c.paging.cursor,
  };
  const list = useListGraphWorkloadsQuery(args, { skip: c.gate.off || c.blocked });
  useTrackRevision(p.ws, list.currentData, classifyGraphError(list.error), (r, d) =>
    c.dispatch(igaGraphApi.util.upsertQueryData("listGraphWorkloads", { ...args, rev: r }, d)),
  );
  useLoadFirstPublication(p.ws, c.pipeline?.current_rev, list.currentData?.meta.graph_state === "not_published", list.refetch);
  useRestartOnListingChanged(list.error, c.paging.restart, () => setRestarted(true));
  const facets = list.currentData?.meta.facets;

  const columns = useMemo<AdaptiveColumn<WorkloadRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <RowName
            to={`/iga/estate/${refId(row.original.ref)}`}
            name={row.original.name}
            rowKey={refId(row.original.ref)}
            selected={p.url.sel === refId(row.original.ref)}
            context={[RUNTIME_SHORT[row.original.runtime_kind], row.original.region]}
            account={row.original.account ? accountLabel(row.original.account) : "Unknown account"}
          />
        ),
      },
      {
        id: "classification",
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            Classification
            <HelpTooltip content="Whether this workload is recorded as an agent. Provider-native agents are agents by what they are; anything else stays unclassified until someone records a decision. Unclassified is not a problem." />
          </span>
        ),
        label: "Classification",
        priority: 1,
        approxWidth: 128,
        cardSummary: true,
        cell: ({ row }) => (
          <span title={CLASSIFICATION_MEANING[row.original.classification]}>
            <StatusBadge tone={CLASSIFICATION_TONE[row.original.classification]}>{CLASSIFICATION_SHORT[row.original.classification]}</StatusBadge>
          </span>
        ),
        detail: (r) => (
          <span>
            {CLASSIFICATION_SHORT[r.classification]} <span className={MUTED}>— {CLASSIFICATION_MEANING[r.classification]}</span>
          </span>
        ),
      },
      {
        id: "lifecycle",
        header: "Lifecycle",
        priority: 1,
        approxWidth: 100,
        cardSummary: true,
        cell: ({ row }) => <LifecycleCell lifecycle={row.original.lifecycle} state={row.original.state} />,
      },
      { id: "account", header: "Account", priority: 2, approxWidth: 170, cell: ({ row }) => <AccountCell account={row.original.account} /> },
      {
        id: "region",
        header: "Region",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => <span className={`text-xs ${MUTED}`}>{row.original.region ?? "Not stated"}</span>,
      },
      {
        id: "confirmed",
        header: "Last confirmed",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <ConfirmedCell state={row.original.state} lastConfirmedAt={row.original.last_confirmed_at} staleReason={row.original.stale_reason} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 64,
        cellClassName: "pr-3",
        cell: ({ row }) => {
          const base = `/iga/estate/${refId(row.original.ref)}`;
          return actions([
            { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
            { label: "Open details", onSelect: () => navigate(base) },
            { label: "Copy ARN", onSelect: () => void copyToClipboard(row.original.arn, "ARN") },
          ]);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.url.sel, navigate],
  );
  const chrome = useListChrome("discovery-published-workloads", columns);

  const specs: FacetSpec[] = [
    sourceSpec(p, sourceFacet(p.sources, facets?.account)),
    { key: "region", label: "Region", kind: "choice", value: region, anyLabel: "Any region", ...reportedFacet(facets, "region", (v, l) => (v === "not_stated" ? "Region not stated" : l)), onChange: (v) => p.url.patch({ region: v }) },
    {
      key: "lifecycle",
      label: "Lifecycle",
      kind: "choice",
      value: lifecycle,
      anyLabel: "Active (default)",
      options: [...LIFECYCLE_OPTIONS],
      note: LIFECYCLE_NOTE,
      onChange: (v) => p.url.patch({ lifecycle: v }),
    },
    {
      key: "classification",
      label: "Classification",
      kind: "choice",
      value: classification,
      anyLabel: "Any classification",
      note: "Each workload is in exactly one of these; they never overlap.",
      ...fixedFacet(facets, "classification", CLASSIFICATION_VALUES),
      onChange: (v) => p.url.patch({ classification: v }),
    },
    {
      key: "runtime",
      label: "Runtime",
      kind: "choice",
      value: runtime,
      anyLabel: "Any runtime",
      ...fixedFacet(facets, "runtime_kind", RUNTIMES.map((v) => ({ value: v, label: RUNTIME_LABEL[v] }))),
      onChange: (v) => p.url.patch({ runtime: v }),
    },
  ];

  return (
    <SourceGate p={p}>
      <PublishedBody<WorkloadRow>
        p={p}
        c={c}
        list={list}
        tableId="discovery-published-workloads"
        subject="workloads"
        columns={columns}
        getRowId={(r) => refId(r.ref)}
        facets={specs}
        sortControl={<SortSelect value={sort} options={WORKLOAD_SORTS} onChange={(v) => p.url.patch({ sort: v === "name" ? null : v })} />}
        searchPlaceholder="Search workloads by name, ARN or account"
        clearKeys={["region", "lifecycle", "classification", "runtime", "source"]}
        describeEmpty="compute or agent runtimes"
        restarted={restarted}
        chosenColumns={chrome.chosen}
        columnsMenu={chrome.menu}
        onColumnsLayout={chrome.setLayout}
        preview={(r, meta) => {
          const acctGap = accountHasGap(meta, r.account);
          const facts = [{ label: "Runs as", value: <WorkloadFact ws={p.ws} row={r} which="runs_as" /> }];
          if (r.runtime_kind === "ecs_task_definition") facts.push({ label: "ECS agent uses as task execution role", value: <WorkloadFact ws={p.ws} row={r} which="task_role" /> });
          return {
            key: refId(r.ref),
            name: r.name,
            kindLabel: RUNTIME_LABEL[r.runtime_kind],
            provider: "aws",
            context: [accountWithId(r.account) ?? "Account not stated", r.region ?? "Region not stated"],
            facts,
            exception:
              r.lifecycle === "retired"
                ? `Retired${r.retired_reason ? ` — ${r.retired_reason}` : ""}. Last confirmed ${r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : "at a time not known"}.`
                : r.state === "stale"
                  ? `Stale since ${r.stale_reason?.[0]?.since ? new Date(r.stale_reason[0].since).toLocaleDateString() : "an unknown date"}: not reconfirmed by the latest scan.`
                  : acctGap
                    ? "Account coverage partial."
                    : undefined,
            detailsHref: `/iga/estate/${refId(r.ref)}`,
            graphHref: `/iga/estate/${refId(r.ref)}/graph`,
          };
        }}
      />
    </SourceGate>
  );
}

/* -------------------------------- identities -------------------------------- */

const IDENTITY_SORTS: { value: IdentitySort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "kind", label: "Kind" },
  { value: "account", label: "Account" },
  { value: "last_confirmed", label: "Last confirmed" },
];
const IDENTITY_KINDS: IdentityKind[] = ["iam_role", "iam_user", "iam_group"];

function usedByText(r: IdentityRow): string {
  if (r.kind === "iam_group") return "Groups are not run as";
  const c = countOfExact(r.used_by_count);
  if (c.kind === "exact" && c.value === 0) return "None";
  return countWithNoun(c, "workload", "workloads");
}

function PublishedIdentities(p: ScreenProps) {
  const navigate = useNavigate();
  const c = usePublishedCommon(p, "identities");
  const [restarted, setRestarted] = useState(false);
  const kind = valid(p.url.get("kind"), IDENTITY_KINDS);
  const bound = p.url.get("bound") ? ("workloads" as const) : undefined;
  const lifecycle = valid(p.url.get("lifecycle"), ["retired", "all"] as const);
  const sort = valid(p.url.get("sort"), IDENTITY_SORTS.map((s) => s.value)) ?? "name";

  const args: ListIdentitiesArgs = { ws: p.ws, rev: c.rev, key: c.paging.cacheKey, q: p.url.q, account: c.account, kind, used_by: bound, lifecycle, sort, cursor: c.paging.cursor };
  const list = useListGraphIdentitiesQuery(args, { skip: c.gate.off || c.blocked });
  useTrackRevision(p.ws, list.currentData, classifyGraphError(list.error), (r, d) =>
    c.dispatch(igaGraphApi.util.upsertQueryData("listGraphIdentities", { ...args, rev: r }, d)),
  );
  useLoadFirstPublication(p.ws, c.pipeline?.current_rev, list.currentData?.meta.graph_state === "not_published", list.refetch);
  useRestartOnListingChanged(list.error, c.paging.restart, () => setRestarted(true));
  const facets = list.currentData?.meta.facets;

  const columns = useMemo<AdaptiveColumn<IdentityRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <RowName
            to={`/iga/identities/${refId(row.original.ref)}`}
            name={row.original.name}
            rowKey={refId(row.original.ref)}
            selected={p.url.sel === refId(row.original.ref)}
            context={[IDENTITY_KIND_LABEL[row.original.kind]]}
            account={row.original.account ? accountLabel(row.original.account) : "Unknown account"}
          />
        ),
      },
      {
        id: "used_by",
        header: "Bindings",
        label: DIRECT_BINDINGS_LABEL,
        priority: 1,
        approxWidth: 150,
        cardSummary: true,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums" title={DIRECT_BINDINGS_MEANING}>
            {usedByText(row.original)}
          </span>
        ),
        detail: (r) => (r.kind === "iam_group" ? "Groups are not run as" : `${usedByText(r)} — ${DIRECT_BINDINGS_MEANING}`),
      },
      {
        id: "lifecycle",
        header: "Lifecycle",
        priority: 1,
        approxWidth: 100,
        cardSummary: true,
        cell: ({ row }) => <LifecycleCell lifecycle={row.original.lifecycle} state={row.original.state} />,
      },
      { id: "account", header: "Account", priority: 2, approxWidth: 170, cell: ({ row }) => <AccountCell account={row.original.account} /> },
      {
        id: "confirmed",
        header: "Last confirmed",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <ConfirmedCell state={row.original.state} lastConfirmedAt={row.original.last_confirmed_at} staleReason={row.original.stale_reason} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 64,
        cell: ({ row }) => {
          const base = `/iga/identities/${refId(row.original.ref)}`;
          return actions([
            { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
            { label: "Open details", onSelect: () => navigate(base) },
            { label: "Copy ARN", onSelect: () => void copyToClipboard(row.original.arn, "ARN") },
          ]);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.url.sel, navigate],
  );
  const chrome = useListChrome("discovery-published-identities", columns);

  const specs: FacetSpec[] = [
    sourceSpec(p, sourceFacet(p.sources, facets?.account)),
    {
      key: "lifecycle",
      label: "Lifecycle",
      kind: "choice",
      value: lifecycle,
      anyLabel: "Active (default)",
      options: [...LIFECYCLE_OPTIONS],
      note: LIFECYCLE_NOTE,
      onChange: (v) => p.url.patch({ lifecycle: v }),
    },
    {
      key: "kind",
      label: "Kind",
      kind: "choice",
      value: kind,
      anyLabel: "Any kind",
      ...fixedFacet(facets, "kind", IDENTITY_KINDS.map((v) => ({ value: v, label: IDENTITY_KIND_LABEL[v] }))),
      onChange: (v) => p.url.patch({ kind: v }),
    },
    { key: "bound", label: "Bound to a workload", kind: "toggle", value: bound ? "1" : undefined, onChange: (v) => p.url.patch({ bound: v }) },
  ];

  return (
    <SourceGate p={p}>
      <PublishedBody<IdentityRow>
        p={p}
        c={c}
        list={list}
        tableId="discovery-published-identities"
        subject="identities"
        columns={columns}
        getRowId={(r) => refId(r.ref)}
        facets={specs}
        sortControl={<SortSelect value={sort} options={IDENTITY_SORTS} onChange={(v) => p.url.patch({ sort: v === "name" ? null : v })} />}
        searchPlaceholder="Search identities by name, ARN or account"
        clearKeys={["lifecycle", "kind", "bound", "source"]}
        describeEmpty="IAM roles, users or groups"
        restarted={restarted}
        chosenColumns={chrome.chosen}
        columnsMenu={chrome.menu}
        onColumnsLayout={chrome.setLayout}
        preview={(r, meta) => {
          const acctGap = accountHasGap(meta, r.account);
          return {
            key: refId(r.ref),
            name: r.name,
            kindLabel: IDENTITY_KIND_LABEL[r.kind],
            provider: "aws",
            context: [accountWithId(r.account) ?? "Account not stated", "Global (IAM has no region)"],
            facts: [
              {
                label: "Workloads bound",
                value: r.kind === "iam_group" ? <span className={MUTED}>Groups are not run as</span> : <CountText count={countOfExact(r.used_by_count)} />,
              },
            ],
            exception:
              r.lifecycle === "retired"
                ? `Retired${r.retired_reason ? ` — ${r.retired_reason}` : ""}.`
                : r.state === "stale"
                  ? `Stale since ${r.stale_reason?.[0]?.since ? new Date(r.stale_reason[0].since).toLocaleDateString() : "an unknown date"}: not reconfirmed by the latest scan.`
                  : acctGap
                    ? "Account coverage partial."
                    : undefined,
            detailsHref: `/iga/identities/${refId(r.ref)}`,
            graphHref: `/iga/identities/${refId(r.ref)}/graph`,
          };
        }}
      />
    </SourceGate>
  );
}

/* -------------------------------- resources -------------------------------- */

const RESOURCE_SORTS: { value: ResourceSort; label: string }[] = [
  { value: "kind", label: "Kind" },
  { value: "name", label: "Name" },
  { value: "service", label: "Service" },
  { value: "account", label: "Account" },
];

/** A reference's readable part: an ARN's resource segment; anything else as written. */
function referenceName(text: string): string {
  if (!text.startsWith("arn:")) return text;
  const rest = text.split(":").slice(5).join(":");
  return rest || text;
}

function PublishedResources(p: ScreenProps) {
  const navigate = useNavigate();
  const c = usePublishedCommon(p, "resources");
  const [restarted, setRestarted] = useState(false);
  const region = p.url.get("region");
  const service = p.url.get("service");
  const lifecycle = valid(p.url.get("lifecycle"), ["retired", "all"] as const);
  const representation = valid(p.url.get("representation"), ["exact", "selector"] as const);
  const external = p.url.get("external") ? true : false;
  const sort = valid(p.url.get("sort"), RESOURCE_SORTS.map((s) => s.value)) ?? "kind";
  // The server has one `kind` — exact, selector or external — and an external
  // reference is neither of the first two, so the two facets share it: External
  // only overrides Representation, and says so.
  const kind: ResourceKind | undefined = external ? "external" : representation;

  const args: ListResourcesArgs = { ws: p.ws, rev: c.rev, key: c.paging.cacheKey, q: p.url.q, account: c.account, region, kind, service, lifecycle, sort, cursor: c.paging.cursor };
  const list = useListGraphResourcesQuery(args, { skip: c.gate.off || c.blocked });
  useTrackRevision(p.ws, list.currentData, classifyGraphError(list.error), (r, d) =>
    c.dispatch(igaGraphApi.util.upsertQueryData("listGraphResources", { ...args, rev: r }, d)),
  );
  useLoadFirstPublication(p.ws, c.pipeline?.current_rev, list.currentData?.meta.graph_state === "not_published", list.refetch);
  useRestartOnListingChanged(list.error, c.paging.restart, () => setRestarted(true));
  const facets = list.currentData?.meta.facets;

  const columns = useMemo<AdaptiveColumn<ResourceRow>[]>(
    () => [
      {
        id: "text",
        header: "Resource or selector",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <RowName
            to={`/iga/resources/${refId(row.original.ref)}`}
            name={referenceName(row.original.text)}
            rowKey={refId(row.original.ref)}
            selected={p.url.sel === refId(row.original.ref)}
            context={[row.original.type !== "unknown" ? row.original.type.replace(/_/g, " ") : row.original.service, row.original.region]}
            account={row.original.account ? accountLabel(row.original.account) : "Unknown account"}
          />
        ),
      },
      {
        id: "kind",
        header: "Representation",
        priority: 1,
        approxWidth: 150,
        cardSummary: true,
        cell: ({ row }) => (
          <span title={RESOURCE_KIND_NOTE[row.original.kind]}>
            <StatusBadge tone={row.original.kind === "external" ? "warning" : "neutral"}>{RESOURCE_KIND_LABEL[row.original.kind]}</StatusBadge>
          </span>
        ),
        detail: (r) => (
          <span>
            {RESOURCE_KIND_LABEL[r.kind]} <span className={MUTED}>— {RESOURCE_KIND_NOTE[r.kind]}</span>
          </span>
        ),
      },
      {
        id: "lifecycle",
        header: "Lifecycle",
        priority: 1,
        approxWidth: 100,
        cardSummary: true,
        cell: ({ row }) => <LifecycleCell lifecycle={row.original.lifecycle} state={row.original.state} />,
      },
      { id: "account", header: "Account", priority: 2, approxWidth: 160, cell: ({ row }) => <AccountCell account={row.original.account} /> },
      {
        id: "region",
        header: "Region",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => <span className={`text-xs ${MUTED}`}>{row.original.region ?? "Not stated"}</span>,
      },
      {
        id: "confirmed",
        header: "Last confirmed",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <ConfirmedCell state={row.original.state} lastConfirmedAt={row.original.last_confirmed_at} staleReason={row.original.stale_reason} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 64,
        cell: ({ row }) => {
          const base = `/iga/resources/${refId(row.original.ref)}`;
          return actions([
            { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
            { label: "Open details", onSelect: () => navigate(base) },
            { label: "Copy reference", onSelect: () => void copyToClipboard(row.original.text, "Reference") },
          ]);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.url.sel, navigate],
  );
  const chrome = useListChrome("discovery-published-resources", columns);

  const kindFacet = fixedFacet(facets, "kind", [
    { value: "exact", label: RESOURCE_KIND_LABEL.exact },
    { value: "selector", label: RESOURCE_KIND_LABEL.selector },
  ]);
  const externalFacet = fixedFacet(facets, "kind", [{ value: "external", label: "External or unresolved only" }]);
  const specs: FacetSpec[] = [
    sourceSpec(p, sourceFacet(p.sources, facets?.account)),
    { key: "region", label: "Region", kind: "choice", value: region, anyLabel: "Any region", ...reportedFacet(facets, "region", (v, l) => (v === "not_stated" ? "Region not stated" : l)), onChange: (v) => p.url.patch({ region: v }) },
    {
      key: "lifecycle",
      label: "Lifecycle",
      kind: "choice",
      value: lifecycle,
      anyLabel: "Active (default)",
      options: [...LIFECYCLE_OPTIONS],
      note: LIFECYCLE_NOTE,
      onChange: (v) => p.url.patch({ lifecycle: v }),
    },
    {
      key: "representation",
      label: "Representation",
      kind: "choice",
      value: external ? undefined : representation,
      anyLabel: "Exact or selector",
      note: "Whether the reference names one resource or a pattern. Separate from External.",
      disabledReason: external ? "Not applicable while External only is chosen." : undefined,
      ...kindFacet,
      onChange: (v) => p.url.patch({ representation: v, external: null }),
    },
    {
      key: "external",
      label: "External",
      kind: "choice",
      value: external ? "only" : undefined,
      anyLabel: "Any account",
      note: "The account the reference states is not connected, so nothing about it could be read. Separate from Representation.",
      options: externalFacet.options.map((o) => ({ ...o, value: "only" })),
      countsUnavailable: externalFacet.countsUnavailable,
      onChange: (v) => p.url.patch({ external: v, representation: null }),
    },
    {
      key: "service",
      label: "Service",
      kind: "choice",
      value: service,
      anyLabel: "Any service",
      ...reportedFacet(facets, "service"),
      onChange: (v) => p.url.patch({ service: v }),
    },
  ];

  return (
    <SourceGate p={p}>
      <PublishedBody<ResourceRow>
        p={p}
        c={c}
        list={list}
        tableId="discovery-published-resources"
        subject="resources"
        columns={columns}
        getRowId={(r) => refId(r.ref)}
        facets={specs}
        sortControl={<SortSelect value={sort} options={RESOURCE_SORTS} onChange={(v) => p.url.patch({ sort: v === "kind" ? null : v })} />}
        searchPlaceholder="Search resources by ARN, pattern or account"
        clearKeys={["region", "lifecycle", "representation", "external", "service", "source"]}
        describeEmpty="resources named by declared access"
        restarted={restarted}
        chosenColumns={chrome.chosen}
        columnsMenu={chrome.menu}
        onColumnsLayout={chrome.setLayout}
        preview={(r) => ({
          key: refId(r.ref),
          name: referenceName(r.text),
          kindLabel: `${RESOURCE_KIND_LABEL[r.kind]}${r.type !== "unknown" ? ` · ${r.type.replace(/_/g, " ")}` : ""}`,
          provider: "aws",
          context: [accountWithId(r.account) ?? "Account not stated by the reference", r.region ?? "Region not stated"],
          facts: [{ label: "Identities with declared access", value: <ResourceHolders ws={p.ws} id={refId(r.ref)} /> }],
          exception:
            r.lifecycle === "retired"
              ? "Retired: no statement names it in the latest scan."
              : r.state === "stale"
                ? `Stale since ${r.stale_reason?.[0]?.since ? new Date(r.stale_reason[0].since).toLocaleDateString() : "an unknown date"}: not reconfirmed by the latest scan.`
                : r.kind === "external"
                  ? "Its account is not connected, so nothing about it could be read."
                  : undefined,
          detailsHref: `/iga/resources/${refId(r.ref)}`,
          graphHref: `/iga/resources/${refId(r.ref)}/graph`,
        })}
      />
    </SourceGate>
  );
}

/* ---------------------------------- entry ---------------------------------- */

export default function PublishedScreen(p: ScreenProps) {
  if (p.type === "workloads") return <PublishedWorkloads {...p} />;
  if (p.type === "identities") return <PublishedIdentities {...p} />;
  return <PublishedResources {...p} />;
}
