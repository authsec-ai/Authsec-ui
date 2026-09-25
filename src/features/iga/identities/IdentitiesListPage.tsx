/**
 * Identities — every IAM role, user and group in the graph
 * (SPEC-iga-phase2-graph.md §2.14.2, §5.3 *Identities*). An investigation
 * often starts from a shared role rather than from a workload, so this list
 * is estate-wide.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  igaGraphApi,
  refId,
  useListGraphIdentitiesQuery,
  type IdentityKind,
  type IdentityRow,
  type IdentitySort,
  type ListIdentitiesArgs,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { ConsoleFilterField, ConsoleRowActions, type AppliedFilter } from "@/components/console/iam-console";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { DIRECT_BINDINGS_LABEL, DIRECT_BINDINGS_MEANING, IDENTITY_KIND_LABEL, countText } from "../shared/labels";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { CoverageSummary } from "../coverage/CoverageSummary";
import { FacetCheckList, SortSelect } from "../shared/components/FacetSelect";
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

const KINDS: { key: string; label: string; kind?: IdentityKind }[] = [
  { key: "all", label: "All" },
  { key: "iam_role", label: "Roles", kind: "iam_role" },
  { key: "iam_user", label: "Users", kind: "iam_user" },
  { key: "iam_group", label: "Groups", kind: "iam_group" },
];

const SORTS: { value: IdentitySort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "kind", label: "Kind" },
  { value: "account", label: "Account" },
  { value: "last_confirmed", label: "Last confirmed" },
];

const FILTERS = {
  q: null,
  account: null,
  kind: ["iam_role", "iam_user", "iam_group"],
  used_by: ["workloads"],
  sort: SORTS.map((s) => s.value),
} as const;

function usedByText(r: IdentityRow): string {
  const c = r.used_by_count;
  if (r.kind === "iam_group") return "—";
  if (c.value === 0 && c.exact) return "None";
  return countText(c, "workload", "workloads");
}

export default function IdentitiesListPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const feature = useGraphFeature(ws, "identities");
  const f = useListFilters(FILTERS);
  const paging = usePaging("identities", epoch);
  useSlashToSearch();

  const accounts = f.values("account");
  const kind = f.value("kind") as IdentityKind | undefined;
  const usedBy = f.value("used_by") as "workloads" | undefined;
  const sort = (f.value("sort") as IdentitySort | undefined) ?? "name";

  const pipeline = usePipeline(ws, feature.off);
  const args: ListIdentitiesArgs = {
    ws,
    rev,
    key: paging.cacheKey,
    q: f.q,
    account: accounts.length ? accounts : undefined,
    kind,
    used_by: usedBy,
    sort,
    cursor: paging.cursor,
  };
  const list = useListGraphIdentitiesQuery(args, { skip: feature.off });
  const view = resolvePagedView(list, paging.pageIndex);
  useRestoreScroll("identities", view.kind === "rows");
  useTrackRevision(
    ws,
    list.currentData,
    classifyGraphError(list.error),
    (r, d) =>
      dispatch(
        igaGraphApi.util.upsertQueryData(
          "listGraphIdentities",
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
  const gaps = meta?.coverage ?? [];
  const incomplete = incompleteAccounts(gaps, nameOf);
  const narrowing = [
    f.q && `search "${f.q}"`,
    ...accounts.map(nameOf),
    kind && IDENTITY_KIND_LABEL[kind],
    usedBy && "bound to a workload",
  ].filter(Boolean) as string[];

  // Priority: the name (its kind in the context line), then account,
  // direct workload bindings and freshness while they fit; ARN in details.
  const columns = useMemo<AdaptiveColumn<IdentityRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <NameCell
            to={`/iga/identities/${refId(row.original.ref)}`}
            name={row.original.name}
            context={[IDENTITY_KIND_LABEL[row.original.kind]]}
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
        id: "used_by",
        header: "Bindings",
        label: DIRECT_BINDINGS_LABEL,
        priority: 2,
        approxWidth: 120,
        cardSummary: true,
        // Workloads configured to run as it — not every workload that
        // reaches it through another role.
        cell: ({ row }) => (
          <span className="text-sm tabular-nums" title={DIRECT_BINDINGS_MEANING}>
            {usedByText(row.original)}
          </span>
        ),
        detail: (r) => (r.kind === "iam_group" ? "Groups are not run as" : `${usedByText(r)} — ${DIRECT_BINDINGS_MEANING}`),
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
        id: "arn",
        header: "ARN",
        priority: 4,
        approxWidth: 300,
        defaultHidden: true,
        cell: ({ row }) => <CopyValue value={row.original.arn} />,
        detail: (r) => <CopyValueWrapped value={r.arn} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 48,
        cell: ({ row }) => {
          const base = `/iga/identities/${refId(row.original.ref)}`;
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
                    label: "Open permissions",
                    onSelect: () => navigate(`${base}/permissions`),
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
  const prefs = useColumnPreferences("iga-identities", columns);
  const [columnsLayout, setColumnsLayout] = useState<AdaptiveColumnsLayout | undefined>();
  const applied: AppliedFilter[] = [
    ...accounts.map((a) => ({ key: `account:${a}`, label: `Account: ${nameOf(a)}`, onRemove: () => f.setMany("account", accounts.filter((x) => x !== a)) })),
    ...(usedBy ? [{ key: "used_by", label: "Bound to a workload", onRemove: () => f.set("used_by", null) }] : []),
  ];

  const kindFacet = facets?.kind;
  const kindCount = (k?: string) =>
    kindFacet
      ?.filter((v) => !k || v.value === k)
      .reduce((n, v) => n + v.count, 0);

  return (
    <IgaPage
      ws={ws}
      title="Identities"
      description={
        coverageSummary(meta, pipeline?.accounts.length ?? 0, incomplete, accounts.length ? accounts.map(nameOf).join(", ") : undefined) ??
        "The IAM roles, users and groups in your connected AWS accounts, and what runs as them."
      }
      actions={<AsOf meta={meta} />}
    >
      <ListGate
        off={feature.off}
        unauthorized={feature.unauthorized}
        pipeline={pipeline}
        subject="identities"
      >
        {pipeline ? <PipelineNotice pipeline={pipeline} /> : null}
        <ListToolbar
          search={f.searchText}
          onSearchChange={f.setSearchText}
          searchPlaceholder="Search name, ARN or account id"
          views={KINDS.map((k) => ({ key: k.key, label: k.label, count: kindCount(k.kind) }))}
          activeView={kind ?? "all"}
          onViewChange={(k) => f.set("kind", k === "all" ? null : k)}
          filters={
            <>
              <ConsoleFilterField label="Account">
                <FacetCheckList label="Account" noun="accounts" value={accounts} options={facets?.account ?? []} onChange={(v) => f.setMany("account", v)} />
              </ConsoleFilterField>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={usedBy === "workloads"}
                  onCheckedChange={(on) => f.set("used_by", on ? "workloads" : null)}
                  aria-label="Only identities a workload runs as"
                />
                Only identities bound to a workload
              </label>
            </>
          }
          applied={applied}
          onClearAll={() => f.clearKeys(["account", "used_by"])}
          sort={<SortSelect value={sort} options={SORTS} onChange={(v) => f.set("sort", v === "name" ? null : v)} />}
          columns={<ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={columnsLayout} />}
        />

        <CoverageSummary subject="identities"
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
                tableId="iga-identities"
                view={view}
                columns={columns}
                getRowId={(r) => r.ref}
                onRowClick={(r) => navigate(`/iga/identities/${refId(r.ref)}`)}
                pageIndex={paging.pageIndex}
                onPrev={paging.prev}
                onNext={paging.next}
                onRetry={() => void list.refetch()}
                onRefresh={refresh}
                subject="identities"
                incompleteAccounts={incomplete}
                chosenColumns={prefs.chosen}
                onColumnsLayout={setColumnsLayout}
                empty={
                  <EmptyScope
                    subject="identities"
                    narrowing={narrowing}
                    unfiltered={unfilteredEmpty(
                      "IAM roles, users or groups",
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
