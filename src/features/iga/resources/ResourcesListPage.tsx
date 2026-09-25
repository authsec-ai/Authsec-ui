/**
 * Resources — every resource reference and selector named by declared access
 * (SPEC-iga-phase2-graph.md §2.14.2, §2.14.12, §5.3 *Resources*).
 *
 * An ARN in a policy is not proof a resource exists: every row is typed as
 * an exact reference, a selector, or external — never "discovered", which
 * nothing produces this phase. S3 ARNs state no account, so "Unknown
 * account" is a real filter value and "All accounts" includes it.
 */

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

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
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../shared/capabilities";
import { classifyGraphError } from "../shared/graphErrors";
import {
  resolvePagedView,
  useRestartOnListingChanged,
} from "../shared/listView";
import { usePaging, useRestoreScroll } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { useListFilters, useSlashToSearch } from "../shared/useListFilters";
import { RESOURCE_KIND_LABEL, accountLabel, countText } from "../shared/labels";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { CoverageNotice } from "../shared/components/CoverageNotice";
import { FacetSelect, MultiFacetSelect, SortSelect } from "../shared/components/FacetSelect";
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
  sort: SORTS.map((s) => s.value),
} as const;

function namedBy(r: ResourceRow): string {
  return countText(r.named_by_count, "statement", "statements");
}

export default function ResourcesListPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "resources");
  const f = useListFilters(FILTERS);
  const paging = usePaging("resources", epoch);
  useSlashToSearch();

  const accounts = f.values("account");
  const service = f.value("service");
  const kind = f.value("kind") as ResourceKind | undefined;
  const sort = (f.value("sort") as ResourceSort | undefined) ?? "kind";

  const pipeline = usePipeline(ws, feature.off);
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
  };
  const list = useListGraphResourcesQuery(args, { skip: feature.off });
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

  const columns = useMemo<AdaptiveColumn<ResourceRow>[]>(
    () => [
      {
        id: "text",
        header: "Resource or selector",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 380,
        cell: ({ row }) => (
          <EntityCell
            label={
              <Link
                to={`/iga/resources/${refId(row.original.ref)}`}
                className="break-all font-mono text-sm hover:underline"
              >
                {row.original.text}
              </Link>
            }
            detail={row.original.type !== "unknown" ? row.original.type : (row.original.service ?? undefined)}
          />
        ),
      },
      {
        id: "kind",
        header: "Kind",
        alwaysVisible: true,
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => (
          <StatusBadge
            tone={row.original.kind === "external" ? "warning" : "neutral"}
          >
            {RESOURCE_KIND_LABEL[row.original.kind]}
          </StatusBadge>
        ),
      },
      {
        id: "account",
        header: "Account",
        alwaysVisible: true,
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => (
          <EntityCell
            label={accountLabel(row.original.account)}
            detail={row.original.account?.id}
            monoDetail
          />
        ),
      },
      {
        id: "region",
        header: "Region",
        priority: 5,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-(--color-text-muted)">
            {row.original.region ?? "Region not stated"}
          </span>
        ),
      },
      {
        id: "named_by",
        header: "Named by",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{namedBy(row.original)}</span>
        ),
      },
      {
        id: "confirmed",
        header: "Last confirmed",
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
        id: "actions",
        header: "",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 56,
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
                    label: "Copy ARN",
                    onSelect: () => {
                      void navigator.clipboard.writeText(row.original.text);
                      toast.success("ARN copied");
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
        <div data-graph-search>
          <ConsoleFilterBar
            search={f.searchText}
            onSearchChange={f.setSearchText}
            searchPlaceholder="Search ARN, pattern or account id"
            filters={KINDS.map((k) => ({
              key: k.key,
              label: k.label,
              count: kindCount(k.kind),
            }))}
            activeFilter={kind ?? "all"}
            onFilterChange={(k) => f.set("kind", k === "all" ? null : k)}
            trailing={
              <>
                <MultiFacetSelect
                  label="Account"
                  allLabel="All accounts"
                  value={accounts}
                  options={facets?.account ?? []}
                  onChange={(v) => f.setMany("account", v)}
                  labelFor={(v, l) => (v === "unknown" ? "Unknown account" : l)}
                />
                <FacetSelect
                  label="Service"
                  allLabel="All services"
                  value={service}
                  options={facets?.service ?? []}
                  onChange={(v) => f.set("service", v)}
                />
                <SortSelect
                  value={sort}
                  options={SORTS}
                  onChange={(v) => f.set("sort", v === "kind" ? null : v)}
                />
              </>
            }
          />
        </div>
        <UnknownAccountNote
          account={accounts.length && !accounts.includes("unknown") ? accounts.join(",") : undefined}
          accountName={accounts.map(accountName).join(", ")}
          unknownCount={
            facets?.account?.find((a) => a.value === "unknown")?.count
          }
          onShow={() => f.set("account", null)}
        />

        <CoverageNotice
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
