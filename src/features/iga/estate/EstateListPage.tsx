/**
 * Agents & workloads — the entry point of the identity graph
 * (SPEC-iga-phase2-graph.md §2.14.2, §2.14.6, §2.14.7).
 *
 * Filters, search and sort live in the URL; the page cursor lives in history
 * state (see `useListFilters`, `usePaging`). Two rows with one name are two
 * workloads in two accounts: the account is a column when there is room,
 * and part of the name's context line when there is not.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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
import { ConsoleFilterField, ConsoleRowActions, type AppliedFilter } from "@/components/console/iam-console";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { copyToClipboard } from "@/lib/clipboard";
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
  CLASSIFICATION_MEANING,
  CLASSIFICATION_SHORT,
  CLASSIFICATION_TONE,
  RUNTIME_LABEL,
  RUNTIME_SHORT,
} from "../shared/labels";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { CoverageSummary } from "../coverage/CoverageSummary";
import { FacetCheckList, FacetSelect, SortSelect } from "../shared/components/FacetSelect";
import { AccountCell, CopyValue, CopyValueWrapped, NameCell } from "../shared/components/InventoryCells";
import { ListToolbar } from "../shared/components/ListToolbar";
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

  // Priority: the name (always), then account, classification and
  // freshness while they fit; region, ARN and instances in row details
  // unless chosen. Runtime and region ride in the name's context line.
  const columns = useMemo<AdaptiveColumn<WorkloadRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <NameCell
            to={`/iga/estate/${refId(row.original.ref)}`}
            name={row.original.name}
            context={[RUNTIME_SHORT[row.original.runtime_kind], row.original.region]}
            account={row.original.account}
          />
        ),
      },
      {
        id: "account",
        header: "Account",
        priority: 1,
        approxWidth: 170,
        cell: ({ row }) => <AccountCell account={row.original.account} />,
      },
      {
        id: "classification",
        header: "Classification",
        priority: 2,
        approxWidth: 128,
        cardSummary: true,
        cell: ({ row }) => (
          <span title={CLASSIFICATION_MEANING[row.original.classification]}>
            <StatusBadge tone={CLASSIFICATION_TONE[row.original.classification]}>
              {CLASSIFICATION_SHORT[row.original.classification]}
            </StatusBadge>
          </span>
        ),
        detail: (r) => (
          <span>
            {CLASSIFICATION_SHORT[r.classification]}{" "}
            <span className="text-(--color-text-muted)">— {CLASSIFICATION_MEANING[r.classification]}</span>
          </span>
        ),
      },
      {
        id: "confirmed",
        header: "Last confirmed",
        label: "Freshness",
        priority: 3,
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
        priority: 4,
        approxWidth: 120,
        defaultHidden: true,
        cell: ({ row }) => <span className="font-mono text-xs text-(--color-text-muted)">{row.original.region ?? "Not stated"}</span>,
      },
      {
        id: "runtime",
        header: "Runtime",
        priority: 5,
        approxWidth: 150,
        defaultHidden: true,
        cell: ({ row }) => <span className="text-sm">{RUNTIME_LABEL[row.original.runtime_kind]}</span>,
      },
      {
        id: "arn",
        header: "ARN",
        priority: 6,
        approxWidth: 300,
        defaultHidden: true,
        cell: ({ row }) => <CopyValue value={row.original.arn} />,
        detail: (r) => <CopyValueWrapped value={r.arn} />,
      },
      {
        id: "instances",
        header: "Instances",
        priority: 7,
        approxWidth: 160,
        defaultHidden: true,
        // Not a count of zero: nothing reads Bedrock aliases or versions yet (§2.14.4).
        cell: ({ row }) => (
          <span className="text-xs text-(--color-text-muted)">
            {row.original.instances?.state === "not_collected" ? "Not collected" : "—"}
          </span>
        ),
        detail: (r) =>
          r.instances?.state === "not_collected" ? (
            <span className="text-(--color-text-muted)">Not collected — aliases and versions are not read yet, so this is not a count of zero.</span>
          ) : (
            <span className="text-(--color-text-muted)">Not applicable</span>
          ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 48,
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
                      void copyToClipboard(row.original.arn, "ARN");
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
  const prefs = useColumnPreferences("iga-estate", columns);
  const [columnsLayout, setColumnsLayout] = useState<AdaptiveColumnsLayout | undefined>();

  const applied: AppliedFilter[] = [
    ...accounts.map((a) => ({ key: `account:${a}`, label: `Account: ${nameOf(a)}`, onRemove: () => f.setMany("account", accounts.filter((x) => x !== a)) })),
    ...(region ? [{ key: "region", label: `Region: ${region === "not_stated" ? "not stated" : region}`, onRemove: () => f.set("region", null) }] : []),
    ...(runtime ? [{ key: "runtime", label: `Runtime: ${RUNTIME_LABEL[runtime]}`, onRemove: () => f.set("runtime_kind", null) }] : []),
  ];

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
        "What runs in your connected accounts, the identities it runs as, and what those identities declare — built from each scan into one graph."
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

        <ListToolbar
          search={f.searchText}
          onSearchChange={(v) => {
            setRestarted(false);
            f.setSearchText(v);
          }}
          searchPlaceholder="Search name, ARN or account id"
          views={CLASSIFICATION_CHIPS.map((c) => ({
            key: c.key,
            label: c.label,
            count:
              c.key === "all"
                ? count("provider_native_agent", "classified_agent", "unclassified")
                : c.key === "agent"
                  ? count("provider_native_agent", "classified_agent")
                  : count("unclassified"),
          }))}
          activeView={classification ?? "all"}
          onViewChange={(k) => {
            setRestarted(false);
            f.set("classification", k === "all" ? null : k);
          }}
          filters={
            <>
              <ConsoleFilterField label="Account">
                <FacetCheckList label="Account" noun="accounts" value={accounts} options={facets?.account ?? []} onChange={(v) => f.setMany("account", v)} />
              </ConsoleFilterField>
              <ConsoleFilterField label="Region">
                <FacetSelect
                  label="Region"
                  allLabel="All regions"
                  value={region}
                  options={facets?.region ?? []}
                  onChange={(v) => f.set("region", v)}
                  labelFor={(v, l) => (v === "not_stated" ? "Region not stated" : l)}
                  className="h-9 w-full"
                />
              </ConsoleFilterField>
              <ConsoleFilterField label="Runtime">
                <FacetSelect
                  label="Runtime"
                  allLabel="All runtimes"
                  value={runtime}
                  options={facets?.runtime_kind ?? []}
                  onChange={(v) => f.set("runtime_kind", v)}
                  labelFor={(v, l) => RUNTIME_LABEL[v as RuntimeKind] ?? l}
                  className="h-9 w-full"
                />
              </ConsoleFilterField>
            </>
          }
          applied={applied}
          onClearAll={() => f.clearKeys(["account", "region", "runtime_kind"])}
          sort={<SortSelect value={sort} options={SORTS} onChange={(v) => f.set("sort", v === "name" ? null : v)} />}
          columns={<ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={columnsLayout} />}
        />

        <CoverageSummary subject="workloads"
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
                chosenColumns={prefs.chosen}
                onColumnsLayout={setColumnsLayout}
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
