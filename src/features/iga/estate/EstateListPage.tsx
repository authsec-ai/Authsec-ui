/**
 * Agents & workloads — the entry point of the identity graph
 * (SPEC-iga-phase2-graph.md §2.14.2, §2.14.6, §2.14.7).
 *
 * Filters, search and sort live in the URL; the page cursor lives in history
 * state (see `useListFilters`, `usePaging`). Two rows with one name are two
 * workloads in two accounts, so the account is always a column.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  igaGraphApi,
  refId,
  useListGraphWorkloadsQuery,
  type ClassificationFilter,
  type ListWorkloadsArgs,
  type RuntimeKind,
  type WorkloadRow,
  type WorkloadSort,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
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
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  RUNTIME_LABEL,
  RUNTIME_SHORT,
  accountLabel,
} from "../shared/labels";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { CoverageNotice } from "../shared/components/CoverageNotice";
import { FacetSelect, MultiFacetSelect, SortSelect } from "../shared/components/FacetSelect";
import { IgaPage } from "../shared/components/IgaPage";
import { AsOf, ListGate, NotPublished } from "../shared/components/ListParts";
import {
  coverageSummary,
  incompleteAccounts,
  unfilteredEmpty,
  useAccountNames,
} from "../shared/listSummary";
import { EmptyScope, PagedTable } from "../shared/components/PagedTable";
import { PipelineNotice } from "../pipeline/PipelineNotice";
import { useLoadFirstPublication, usePipeline } from "../pipeline/usePipeline";

const RUNTIMES = Object.keys(RUNTIME_LABEL) as RuntimeKind[];

const SORTS: { value: WorkloadSort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "account", label: "Account" },
  { value: "classification", label: "Classification" },
  { value: "last_confirmed", label: "Last confirmed" },
];

const CLASSIFICATION_CHIPS: {
  key: string;
  label: string;
  filter?: ClassificationFilter;
}[] = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agents", filter: "agent" },
  { key: "unclassified", label: "Unclassified", filter: "unclassified" },
];

const FILTERS = {
  q: null,
  account: null,
  region: null,
  runtime_kind: RUNTIMES,
  classification: ["agent", "unclassified"],
  sort: SORTS.map((s) => s.value),
} as const;

export default function EstateListPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "workloads");
  const f = useListFilters(FILTERS);
  const paging = usePaging("workloads", epoch);
  const [restarted, setRestarted] = useState(false);
  useSlashToSearch();

  const accounts = f.values("account");
  const region = f.value("region");
  const runtime = f.value("runtime_kind") as RuntimeKind | undefined;
  const classification = f.value("classification");
  const sort = (f.value("sort") as WorkloadSort | undefined) ?? "name";

  const pipeline = usePipeline(ws, feature.off);
  const args: ListWorkloadsArgs = {
    ws,
    rev,
    key: paging.cacheKey,
    q: f.q,
    account: accounts.length ? accounts : undefined,
    region,
    runtime_kind: runtime,
    classification: CLASSIFICATION_CHIPS.find((c) => c.key === classification)
      ?.filter,
    sort,
    cursor: paging.cursor,
  };
  const list = useListGraphWorkloadsQuery(args, { skip: feature.off });
  const view = resolvePagedView(list, paging.pageIndex);
  useRestoreScroll("workloads", view.kind === "rows");

  useTrackRevision(
    ws,
    list.currentData,
    classifyGraphError(list.error),
    (r, d) =>
      dispatch(
        igaGraphApi.util.upsertQueryData(
          "listGraphWorkloads",
          { ...args, rev: r },
          d,
        ),
      ),
  );
  useRestartOnListingChanged(list.error, paging.restart, () =>
    setRestarted(true),
  );
  useLoadFirstPublication(
    ws,
    pipeline?.current_rev,
    list.currentData?.meta.graph_state === "not_published",
    list.refetch,
  );

  // Header, coverage and facets describe THIS query only, never the last one.
  const meta = list.currentData?.meta;
  const facets = meta?.facets;
  const nameOf = useAccountNames(pipeline, facets?.account ?? undefined);
  const gaps = meta?.coverage ?? [];
  const incomplete = incompleteAccounts(gaps, nameOf);

  const narrowing = [
    f.q && `search "${f.q}"`,
    ...accounts.map(nameOf),
    region &&
      (facets?.region?.find((r) => r.value === region)?.label ?? region),
    runtime && RUNTIME_LABEL[runtime],
    classification &&
      CLASSIFICATION_CHIPS.find((c) => c.key === classification)?.label,
  ].filter(Boolean) as string[];

  const columns = useMemo<AdaptiveColumn<WorkloadRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 340,
        cell: ({ row }) => (
          <div className="min-w-0">
            <EntityCell
              label={
                <Link
                  to={`/iga/estate/${refId(row.original.ref)}`}
                  className="hover:underline"
                >
                  {row.original.name}
                </Link>
              }
              detail={row.original.arn}
              monoDetail
            />
            {/* Not a count of zero: nothing reads Bedrock aliases yet (§2.14.4). */}
            {row.original.instances?.state === "not_collected" ? (
              <p className="mt-0.5 text-xs text-(--color-text-muted)">
                instances: not collected
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "classification",
        header: "Classification",
        alwaysVisible: true,
        priority: 2,
        approxWidth: 190,
        cell: ({ row }) => (
          <StatusBadge tone={CLASSIFICATION_TONE[row.original.classification]}>
            {CLASSIFICATION_LABEL[row.original.classification]}
          </StatusBadge>
        ),
      },
      {
        id: "runtime",
        header: "Runtime",
        priority: 3,
        approxWidth: 110,
        cell: ({ row }) => (
          <span
            className="text-sm"
            title={RUNTIME_LABEL[row.original.runtime_kind]}
          >
            {RUNTIME_SHORT[row.original.runtime_kind]}
          </span>
        ),
      },
      {
        id: "account",
        header: "Account",
        alwaysVisible: true,
        priority: 2,
        approxWidth: 170,
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
          const base = `/iga/estate/${refId(row.original.ref)}`;
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
                    label: "Open identities",
                    onSelect: () => navigate(`${base}/identities`),
                  },
                  {
                    label: "Copy ARN",
                    onSelect: () => {
                      void navigator.clipboard.writeText(row.original.arn);
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

  const accountCount = pipeline?.accounts.length ?? 0;
  const classFacet = facets?.classification;
  const count = (...keys: string[]) =>
    classFacet
      ?.filter((v) => keys.includes(v.value))
      .reduce((n, v) => n + v.count, 0);

  return (
    <IgaPage
      ws={ws}
      title="Agents & workloads"
      description={
        coverageSummary(meta, accountCount, incomplete, accounts.length ? accounts.map(nameOf).join(", ") : undefined) ??
        "What runs in your connected AWS accounts, and the identities it runs as."
      }
      actions={<AsOf meta={meta} />}
    >
      <ListGate
        off={feature.off}
        unauthorized={feature.unauthorized}
        pipeline={pipeline}
        subject="agents and workloads"
      >
        {restarted ? (
          <DecisionBanner
            tone="info"
            title="The list restarted at the first page"
            body="A classification changed while you were paging, so the next page could not continue where the last one ended."
          />
        ) : null}
        {pipeline ? <PipelineNotice pipeline={pipeline} /> : null}

        <div data-graph-search>
          <ConsoleFilterBar
            search={f.searchText}
            onSearchChange={(v) => {
              setRestarted(false);
              f.setSearchText(v);
            }}
            searchPlaceholder="Search name, ARN or account id"
            filters={CLASSIFICATION_CHIPS.map((c) => ({
              key: c.key,
              label: c.label,
              count:
                c.key === "all"
                  ? count(
                      "provider_native_agent",
                      "classified_agent",
                      "unclassified",
                    )
                  : c.key === "agent"
                    ? count("provider_native_agent", "classified_agent")
                    : count("unclassified"),
            }))}
            activeFilter={classification ?? "all"}
            onFilterChange={(k) => {
              setRestarted(false);
              f.set("classification", k === "all" ? null : k);
            }}
            trailing={
              <>
                <MultiFacetSelect
                  label="Account"
                  allLabel="All accounts"
                  value={accounts}
                  options={facets?.account ?? []}
                  onChange={(v) => f.setMany("account", v)}
                />
                <FacetSelect
                  label="Region"
                  allLabel="All regions"
                  value={region}
                  options={facets?.region ?? []}
                  onChange={(v) => f.set("region", v)}
                  labelFor={(v, l) =>
                    v === "not_stated" ? "Region not stated" : l
                  }
                />
                <FacetSelect
                  label="Runtime"
                  allLabel="All runtimes"
                  value={runtime}
                  options={facets?.runtime_kind ?? []}
                  onChange={(v) => f.set("runtime_kind", v)}
                  labelFor={(v, l) => RUNTIME_LABEL[v as RuntimeKind] ?? l}
                />
                <SortSelect
                  value={sort}
                  options={SORTS}
                  onChange={(v) => f.set("sort", v === "name" ? null : v)}
                />
              </>
            }
          />
        </div>

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
                tableId="iga-estate"
                view={view}
                columns={columns}
                getRowId={(r) => r.ref}
                onRowClick={(r) => navigate(`/iga/estate/${refId(r.ref)}`)}
                pageIndex={paging.pageIndex}
                onPrev={paging.prev}
                onNext={paging.next}
                onRetry={() => void list.refetch()}
                onRefresh={refresh}
                subject="agents and workloads"
                incompleteAccounts={incomplete}
                empty={
                  <EmptyScope
                    subject="agents or workloads"
                    narrowing={narrowing}
                    unfiltered={unfilteredEmpty(
                      "compute or agent runtimes",
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
