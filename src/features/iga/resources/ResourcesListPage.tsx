/**
 * Resources — every resource reference and selector named by declared access
 * (SPEC-iga-phase2-graph.md §2.14.2, §2.14.12, §5.3 *Resources*).
 *
 * An ARN in a policy is not proof a resource exists: every row is typed as
 * an exact reference, a selector, or external — never "discovered", which
 * nothing produces this phase. S3 ARNs state no account, so "Unknown
 * account" is a real filter value and "All accounts" includes it.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  igaGraphApi,
  refId,
  useListGraphResourcesQuery,
  type ListResourcesArgs,
  type ResourceKind,
  type ResourceRow,
  type ResourceSort,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { ConsoleFilterField, ConsoleRowActions, type AppliedFilter } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { copyToClipboard } from "@/lib/clipboard";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature, useGraphV2 } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import {
  resolvePagedView,
  useRestartOnListingChanged,
} from "../shared/listView";
import { usePaging, useRestoreScroll } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ProviderFilter } from "../shared/ProviderFilter";
import { PROVIDER_LABEL, listGraphOptIn, providerOfResource } from "../shared/providers";
import { useListFilters, useSlashToSearch } from "../shared/useListFilters";
import { RESOURCE_KIND_LABEL, RESOURCE_KIND_NOTE, countText } from "../shared/labels";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { CoverageSummary } from "../coverage/CoverageSummary";
import { FacetCheckList, FacetSelect, SortSelect } from "../shared/components/FacetSelect";
import { AccountCell, CopyValue, CopyValueWrapped, NameCell } from "../shared/components/InventoryCells";
import { ListToolbar } from "../shared/components/ListToolbar";
import { IgaPage } from "../shared/components/IgaPage";
import {
  AsOf,
  ListGate,
  NotPublished,
  UnknownAccountNote,
} from "../shared/components/ListParts";
import {
  coverageSummary,
  incompleteAccounts,
  unfilteredEmpty,
  useAccountNames,
} from "../shared/listSummary";
import { EmptyScope, PagedTable } from "../shared/components/PagedTable";
import { PipelineNotice } from "../pipeline/PipelineNotice";
import { useLoadFirstPublication, usePipeline } from "../pipeline/usePipeline";

const KINDS: { key: string; label: string; kind?: ResourceKind }[] = [
  { key: "all", label: "All" },
  { key: "exact", label: "Exact references", kind: "exact" },
  { key: "selector", label: "Selectors", kind: "selector" },
  { key: "external", label: "External", kind: "external" },
];

const SORTS: { value: ResourceSort; label: string }[] = [
  { value: "kind", label: "Kind" },
  { value: "name", label: "Name" },
  { value: "service", label: "Service" },
  { value: "account", label: "Account" },
];

const FILTERS = {
  q: null,
  account: null,
  service: null,
  kind: ["exact", "selector", "external"],
  provider: ["aws", "linux", "kubernetes", "ad", "all"],
  sort: SORTS.map((s) => s.value),
} as const;

/**
 * A reference's readable part: an ARN's resource segment
 * ("support-tickets/*", "table/Orders"); anything else as written. The whole
 * reference is in the row's details and on the resource's page.
 */
function referenceName(text: string): string {
  if (!text.startsWith("arn:")) return text;
  const rest = text.split(":").slice(5).join(":");
  return rest || text;
}

function namedBy(r: ResourceRow): string {
  return countText(r.named_by_count, "statement", "statements");
}

export default function ResourcesListPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "resources");
  const v2 = useGraphV2(ws);
  const f = useListFilters(FILTERS);
  const paging = usePaging("resources", epoch);
  useSlashToSearch();

  const accounts = f.values("account");
  const service = f.value("service");
  const kind = f.value("kind") as ResourceKind | undefined;
  const sort = (f.value("sort") as ResourceSort | undefined) ?? "kind";

  const provider = v2.available ? f.value("provider") : undefined;
  const pipeline = usePipeline(ws, feature.off || v2.loading, v2.available);
  const args: ListResourcesArgs = {
    ws,
    rev,
    key: paging.cacheKey,
    q: f.q,
    account: accounts.length ? accounts : undefined,
    service,
    kind,
    sort,
    cursor: paging.cursor,
    ...listGraphOptIn(provider),
  };
  const list = useListGraphResourcesQuery(args, { skip: feature.off || (v2.loading && !!f.value("provider")) });
  const view = resolvePagedView(list, paging.pageIndex);
  useRestoreScroll("resources", view.kind === "rows");
  useTrackRevision(
    ws,
    list.currentData,
    classifyGraphError(list.error),
    (r, d) =>
      dispatch(
        igaGraphApi.util.upsertQueryData(
          "listGraphResources",
          { ...args, rev: r },
          d,
        ),
      ),
  );
  useRestartOnListingChanged(list.error, paging.restart);
  useLoadFirstPublication(
    ws,
    pipeline?.current_rev,
    list.currentData?.meta.graph_state === "not_published",
    list.refetch,
  );

  const meta = list.currentData?.meta;
  const facets = meta?.facets;
  const nameOf = useAccountNames(pipeline, facets?.account ?? undefined);
  const accountName = (id: string) =>
    id === "unknown" ? "Unknown account" : nameOf(id);
  const gaps = meta?.coverage ?? [];
  const incomplete = incompleteAccounts(gaps, nameOf);
  const narrowing = [
    f.q && `search "${f.q}"`,
    ...accounts.map(accountName),
    service,
    kind && RESOURCE_KIND_LABEL[kind],
  ].filter(Boolean) as string[];

  // Priority: the reference's readable name (service and region as its
  // context), then kind, account, how many statements name it, freshness;
  // the whole reference and region in details unless chosen.
  const columns = useMemo<AdaptiveColumn<ResourceRow>[]>(
    () => [
      {
        id: "text",
        header: "Resource or selector",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <NameCell
            to={`/iga/resources/${refId(row.original.ref)}`}
            name={referenceName(row.original.text)}
            context={[
              row.original.native_kind,
              row.original.reference_status,
              row.original.type !== "unknown" ? row.original.type.replace(/_/g, " ") : row.original.service,
              providerOfResource(row.original.native_kind) ? PROVIDER_LABEL[providerOfResource(row.original.native_kind)!] : null,
              row.original.region,
            ]}
            account={row.original.account}
          />
        ),
      },
      {
        id: "kind",
        header: "Kind",
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
            {RESOURCE_KIND_LABEL[r.kind]} <span className="text-(--color-text-muted)">— {RESOURCE_KIND_NOTE[r.kind]}</span>
          </span>
        ),
      },
      {
        id: "account",
        header: "Account",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => <AccountCell account={row.original.account} />,
      },
      {
        id: "named_by",
        header: "Named by",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => <span className="text-sm tabular-nums">{namedBy(row.original)}</span>,
      },
      {
        id: "confirmed",
        header: "Last confirmed",
        label: "Freshness",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => (
          <ConfirmedCell
            state={row.original.state}
            lastConfirmedAt={row.original.last_confirmed_at}
            staleReason={row.original.stale_reason}
          />
        ),
      },
      {
        id: "region",
        header: "Region",
        priority: 5,
        approxWidth: 120,
        defaultHidden: true,
        cell: ({ row }) => <span className="font-mono text-xs text-(--color-text-muted)">{row.original.region ?? "Not stated"}</span>,
      },
      {
        id: "reference",
        header: "Full reference",
        priority: 6,
        approxWidth: 320,
        defaultHidden: true,
        cell: ({ row }) => <CopyValue value={row.original.text} />,
        detail: (r) => <CopyValueWrapped value={r.text} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 48,
        cell: ({ row }) => {
          const base = `/iga/resources/${refId(row.original.ref)}`;
          // The menu renders in a portal, so its clicks still bubble to the
          // row through React; stop them here or the row opens too.
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                items={[
                  {
                    label: "Open graph",
                    onSelect: () => navigate(`${base}/graph`),
                  },
                  {
                    label: "Open access",
                    onSelect: () => navigate(`${base}/access`),
                  },
                  {
                    label: "Copy reference",
                    onSelect: () => {
                      void copyToClipboard(row.original.text, "Reference");
                    },
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [navigate],
  );
  const prefs = useColumnPreferences("iga-resources", columns);
  const [columnsLayout, setColumnsLayout] = useState<AdaptiveColumnsLayout | undefined>();
  const applied: AppliedFilter[] = [
    ...accounts.map((a) => ({ key: `account:${a}`, label: `Account: ${accountName(a)}`, onRemove: () => f.setMany("account", accounts.filter((x) => x !== a)) })),
    ...(service ? [{ key: "service", label: `Service: ${service}`, onRemove: () => f.set("service", null) }] : []),
  ];

  const kindFacet = facets?.kind;
  const kindCount = (k?: string) =>
    kindFacet
      ?.filter((v) => !k || v.value === k)
      .reduce((n, v) => n + v.count, 0);

  return (
    <IgaPage
      ws={ws}
      title="Resources"
      description={
        coverageSummary(meta, pipeline?.accounts.length ?? 0, incomplete, accounts.length ? accounts.map(accountName).join(", ") : undefined) ??
        "The resources and selectors that declared access names. Named by a policy is not proof a resource exists."
      }
      actions={<AsOf meta={meta} />}
    >
      <ListGate
        off={feature.off}
        unauthorized={feature.unauthorized}
        pipeline={pipeline}
        subject="resources"
      >
        {pipeline ? <PipelineNotice pipeline={pipeline} /> : null}
        <ListToolbar
          search={f.searchText}
          onSearchChange={f.setSearchText}
          searchPlaceholder="Search ARN, pattern or account id"
          views={KINDS.map((k) => ({ key: k.key, label: k.label, count: kindCount(k.kind) }))}
          activeView={kind ?? "all"}
          onViewChange={(k) => f.set("kind", k === "all" ? null : k)}
          filters={
            <>
              {v2.available ? <ProviderFilter value={provider} onChange={(v) => f.set("provider", v)} /> : null}
              <ConsoleFilterField label="Account">
                <FacetCheckList
                  label="Account"
                  noun="accounts"
                  value={accounts}
                  options={facets?.account ?? []}
                  onChange={(v) => f.setMany("account", v)}
                  labelFor={(v, l) => (v === "unknown" ? "Account not stated by the reference" : l)}
                />
              </ConsoleFilterField>
              <ConsoleFilterField label="Service">
                <FacetSelect
                  label="Service"
                  allLabel="All services"
                  value={service}
                  options={facets?.service ?? []}
                  onChange={(v) => f.set("service", v)}
                  className="h-9 w-full"
                />
              </ConsoleFilterField>
            </>
          }
          applied={applied}
          onClearAll={() => f.clearKeys(["account", "service", "provider"])}
          sort={<SortSelect value={sort} options={SORTS} onChange={(v) => f.set("sort", v === "kind" ? null : v)} />}
          columns={<ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={columnsLayout} />}
        />
        <UnknownAccountNote
          account={accounts.length && !accounts.includes("unknown") ? accounts.join(",") : undefined}
          accountName={accounts.map(accountName).join(", ")}
          unknownCount={
            facets?.account?.find((a) => a.value === "unknown")?.count
          }
          onShow={() => f.set("account", null)}
        />

        <CoverageSummary subject="resources"
          ws={ws}
          gaps={gaps}
          accountName={nameOf}
          pipeline={pipeline}
        />

        {paging.resetByRevision ? (
          <p className="text-xs text-(--color-text-muted)">
            The list was refreshed because a newer scan published.
          </p>
        ) : null}

        <TableCard>
          <CardContent variant="flush">
            {list.currentData?.meta.graph_state === "not_published" ? (
              <NotPublished />
            ) : (
              <PagedTable
                tableId="iga-resources"
                view={view}
                columns={columns}
                getRowId={(r) => r.ref}
                onRowClick={(r) => navigate(`/iga/resources/${refId(r.ref)}`)}
                pageIndex={paging.pageIndex}
                onPrev={paging.prev}
                onNext={paging.next}
                onRetry={() => void list.refetch()}
                onRefresh={refresh}
                subject="resources"
                incompleteAccounts={incomplete}
                chosenColumns={prefs.chosen}
                onColumnsLayout={setColumnsLayout}
                empty={
                  <EmptyScope
                    subject="resources"
                    narrowing={narrowing}
                    unfiltered={unfilteredEmpty(
                      "resources named by declared access",
                      incomplete,
                    )}
                    onClear={f.clear}
                  />
                }
              />
            )}
          </CardContent>
        </TableCard>
      </ListGate>
    </IgaPage>
  );
}
