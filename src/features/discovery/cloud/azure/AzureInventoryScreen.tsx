/**
 * Azure: the unified inventory — `provider=azure`, one class per type.
 *
 * The same shape as Kubernetes' list: search is the inventory's `q`, Source
 * (tenant) and Kind are its `scope` and `kind` filters with the server's facet
 * counts, paging is a signed cursor in history state, and a row opens the
 * shared preview beside the list. Azure writes are UNREVISIONED (read live, no
 * publication number), so what a row is "as of" is the discovery run that last
 * confirmed it.
 *
 * While the Access Graph is unavailable, the same three lists are read from
 * the Azure scan tables by AzureScanTablesScreen.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useListAzureConnectorsQuery } from "@/app/api/cloudDiscoveryApi";
import { permissionCount, resourceExclusions } from "./entraPermissions";
import { refId } from "@/app/api/igaGraphApi";
import { useListInventoryQuery, type InventoryClass, type InventoryMeta, type InventoryRow } from "@/app/api/igaInventoryApi";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { copyToClipboard } from "@/lib/clipboard";
import { LifecycleCell } from "@/features/iga/discovery/PublishedBody";
import { DiscoveryTable, RowName } from "@/features/iga/discovery/DiscoveryTable";
import type { FacetSpec } from "@/features/iga/discovery/FacetBar";
import { reportedFacet, sourceFacet } from "@/features/iga/discovery/facets";
import { EmptyList, FilteredEmpty, SourceHasNoRows, UnknownSource } from "@/features/iga/discovery/ListStates";
import { LIFECYCLE_NOTE, LIFECYCLE_OPTIONS, valid } from "@/features/iga/discovery/publishedCommon";
import { ScreenFrame } from "@/features/iga/discovery/ScreenFrame";
import type { ScreenProps } from "@/features/iga/discovery/screenTypes";
import { ConfirmedValue, PreviewLayout, type PreviewModel } from "@/features/iga/shared/components/ObjectPreview";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { resolvePagedView, useRestartOnListingChanged, type PagedView } from "@/features/iga/shared/listView";
import { usePaging, useRestoreScroll } from "@/features/iga/shared/paging";
import { classifyGraphError } from "@/features/iga/shared/graphErrors";
import { TableCard } from "@/theme/components/cards";

import AzureScanTablesScreen from "./AzureScanTablesScreen";

import { agentTypeLabel } from "./azureDiscoveryLabels";
import { CopyableId } from "./AzureDiscoveryShared";
import { inventoryKindLabel, subscriptionLabel, tenantName, tenantScopeId } from "./azureInventoryLabels";
import { pageSizeParam, parsePageSize } from "./azurePaging";

const MUTED = "text-(--color-text-muted)";

const SUBJECT: Record<InventoryClass, string> = { identities: "identities", resources: "resources", workloads: "workloads" };
const OBJECT_SEGMENT: Record<InventoryClass, string> = { identities: "identity", resources: "resource", workloads: "workload" };
const KIND_FACET_LABEL: Record<InventoryClass, string> = { identities: "Kind", resources: "Kind", workloads: "Runtime" };
const SEARCH_PLACEHOLDER: Record<InventoryClass, string> = {
  identities: "Search identities by name or object ID",
  resources: "Search resources by name or resource ID",
  workloads: "Search workloads by name or resource ID",
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export default function AzureInventoryScreen(p: ScreenProps) {
  const navigate = useNavigate();
  const type: InventoryClass = p.type === "resources" || p.type === "workloads" ? p.type : "identities";
  const paging = usePaging(`discovery-azure-${type}`, 0);
  const [restarted, setRestarted] = useState(false);
  const kind = p.url.get("kind");
  const permissionsShown = p.url.get("permissions") === "shown";
  const excluded = resourceExclusions(type, kind, permissionsShown);
  const lifecycleFilter = valid(p.url.get("lifecycle"), ["retired", "all"] as const);
  // Rows per page, in the URL as on AWS's lists: 25 unless one of 25 / 50 / 100 is chosen.
  const pageSize = parsePageSize(p.url.get("size"));
  const setPageSize = (n: number) => p.url.patch({ size: pageSizeParam(n) });
  const blocked = p.scope.kind === "unknown" || p.scope.kind === "no_rows";
  const scopeId = p.scope.kind === "one" ? p.scope.source.scopeId : undefined;

  const connectorsQ = useListAzureConnectorsQuery();
  const tenants = useMemo(
    () => new Map((connectorsQ.data ?? []).filter((c) => c.scope_kind === "tenant").map((c) => [tenantScopeId(c), c] as const)),
    [connectorsQ.data],
  );
  const tenantLabel = (id: string | undefined | null) => (id ? tenantName(tenants.get(id), id) : "Not stated");
  // One tenant is not worth a column or a line under every name.
  const manyTenants = tenants.size > 1;
  const sources = useMemo(() => p.sources.map((s) => ({ ...s, label: tenantName(tenants.get(s.scopeId), s.label) })), [p.sources, tenants]);

  const list = useListInventoryQuery(
    { ws: p.ws, key: paging.cacheKey, class: type, provider: "azure", kind, exclude_kind: excluded, scope: scopeId, q: p.url.q, lifecycle: lifecycleFilter, sort: "name", limit: pageSize, cursor: paging.cursor },
    { skip: blocked },
  );
  useRestartOnListingChanged(list.error, paging.restart, () => setRestarted(true));
  const view: PagedView<InventoryRow, InventoryMeta> = resolvePagedView(list, paging.pageIndex);
  useRestoreScroll(`discovery-azure-${type}`, view.kind === "rows");
  const facets = list.currentData?.meta.facets;
  const hiddenPermissions = permissionCount(facets);

  const rows = view.kind === "rows" ? view.rows : [];
  const selectedId = p.url.sel;
  const selected = selectedId ? rows.find((r) => refId(r.ref) === selectedId) : undefined;
  const dropSelection = view.kind === "rows" && !view.dim && !view.footerFailure && !!selectedId && !selected;
  const { select } = p.url;
  useEffect(() => {
    if (dropSelection) select(null);
  }, [dropSelection, select]);

  // An identity's page is keyed by its Entra object id (what the legacy Azure reads search by); a resource's and workload's by the IGA uuid.
  const detailHref = (r: InventoryRow) => `/iga/azure/${OBJECT_SEGMENT[type]}/${encodeURIComponent(type === "identities" ? r.native_id : refId(r.ref))}`;
  const kindLabel = (k: string) => inventoryKindLabel(type, k);

  const columns = useMemo<AdaptiveColumn<InventoryRow>[]>(() => {
    const name: AdaptiveColumn<InventoryRow> = {
      id: "name",
      header: "Name",
      primary: true,
      // Wider than the generic default: Azure's own names (agent blueprints, app
      // registrations) run 40-60+ characters and clip hard at a narrower column.
      minWidth: 300,
      cell: ({ row }) => {
        const isAgent = type === "identities" && !!str(row.original.attrs.agent_type);
        return (
          <RowName
            to={detailHref(row.original)}
            name={row.original.name}
            rowKey={refId(row.original.ref)}
            selected={selectedId === refId(row.original.ref)}
            context={[kindLabel(row.original.kind), isAgent ? agentTypeLabel({ attrs: row.original.attrs }) : null]}
            account={manyTenants ? tenantLabel(row.original.scope?.id) : null}
            lifecycle={row.original.lifecycle === "retired" ? "Retired" : row.original.state === "stale" ? "Stale" : null}
            // An agent identity's display name can be long and technical; its short,
            // click-to-copy ID gives the eye a stable anchor the way the Agents tab's list does.
            badge={isAgent ? <CopyableId value={row.original.native_id} what="Object ID" /> : undefined}
          />
        );
      },
    };
    const lifecycle: AdaptiveColumn<InventoryRow> = {
      id: "lifecycle",
      header: "State",
      alwaysVisible: lifecycleFilter !== undefined,
      priority: 1,
      approxWidth: 100,
      cardSummary: true,
      cell: ({ row }) =>
        row.original.lifecycle !== "retired" && row.original.state !== "stale" && row.original.attrs.enabled === false ? (
          <StatusBadge tone="neutral">Disabled</StatusBadge>
        ) : (
          <LifecycleCell lifecycle={row.original.lifecycle} state={row.original.state} />
        ),
    };
    const tenant: AdaptiveColumn<InventoryRow> = {
      id: "account",
      header: "Tenant",
      priority: 2,
      approxWidth: 150,
      cell: ({ row }) => <span className="text-sm">{tenantLabel(row.original.scope?.id)}</span>,
    };
    const subscription: AdaptiveColumn<InventoryRow> = {
      id: "subscription",
      header: "Subscription",
      priority: 2,
      approxWidth: 160,
      cell: ({ row }) => <span className={`text-sm ${row.original.sub_scope ? "" : MUTED}`}>{subscriptionLabel(row.original.sub_scope)}</span>,
    };
    const signIn: AdaptiveColumn<InventoryRow> = {
      id: "last_sign_in",
      header: "Last sign-in",
      priority: 2,
      approxWidth: 130,
      cell: ({ row }) => (
        <span className={`text-sm ${MUTED}`}>
          <Timestamp iso={str(row.original.attrs.last_sign_in_at)} missing="never seen" />
        </span>
      ),
    };
    const region: AdaptiveColumn<InventoryRow> = {
      id: "region",
      header: "Region",
      priority: 3,
      approxWidth: 120,
      cell: ({ row }) => <span className={`text-sm ${MUTED}`}>{str(row.original.attrs.region) ?? "Not stated"}</span>,
    };
    const seen: AdaptiveColumn<InventoryRow> = {
      id: "seen",
      header: "Last confirmed",
      priority: 3,
      approxWidth: 140,
      cell: ({ row }) => (
        <span className={`text-sm ${MUTED}`} title="When the discovery run behind this row confirmed it">
          <Timestamp iso={row.original.as_of ?? row.original.last_seen_at} />
        </span>
      ),
    };
    const actions: AdaptiveColumn<InventoryRow> = {
      id: "actions",
      header: "",
      alwaysVisible: true,
      approxWidth: 64,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ConsoleRowActions
            items={[
              { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
              { label: "Open details", onSelect: () => navigate(detailHref(row.original)) },
              { label: type === "identities" ? "Copy object ID" : "Copy resource ID", onSelect: () => void copyToClipboard(row.original.native_id, type === "identities" ? "Object ID" : "Resource ID") },
            ]}
          />
        </div>
      ),
    };
    const tenantCols = manyTenants ? [tenant] : [];
    if (type === "identities") return [name, lifecycle, signIn, ...tenantCols, seen, actions];
    if (type === "workloads") return [name, lifecycle, subscription, region, ...tenantCols, seen, actions];
    return [name, lifecycle, subscription, ...tenantCols, seen, actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, selectedId, navigate, tenants, lifecycleFilter, manyTenants]);

  const prefs = useColumnPreferences(`discovery-azure-${type}`, columns);
  const [layout, setLayout] = useState<AdaptiveColumnsLayout | undefined>();

  const kindOptions = reportedFacet(facets, "kind", (v) => kindLabel(v));
  const specs: FacetSpec[] = [
    {
      key: "source",
      label: "Source",
      kind: "choice",
      value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
      anyLabel: "Every Azure tenant",
      ...sourceFacet(sources, facets?.scope),
      onChange: (v) => p.url.patch({ source: v }),
    },
    {
      key: "kind",
      label: KIND_FACET_LABEL[type],
      kind: "choice",
      value: kind,
      anyLabel: type === "workloads" ? "Any runtime" : "Any kind",
      ...kindOptions,
      onChange: (v) => p.url.patch({ kind: v }),
    },
    {
      key: "lifecycle",
      label: "Lifecycle",
      kind: "choice",
      value: lifecycleFilter,
      anyLabel: "Active (default)",
      options: [...LIFECYCLE_OPTIONS],
      note: LIFECYCLE_NOTE,
      onChange: (v) => p.url.patch({ lifecycle: v }),
    },
  ];

  const preview = (r: InventoryRow): PreviewModel => {
    const facts: PreviewModel["facts"] = [
      { label: "Tenant", value: tenantLabel(r.scope?.id) },
      ...(type !== "identities" ? [{ label: "Subscription", value: r.sub_scope ? subscriptionLabel(r.sub_scope) : <span className={MUTED}>Tenant-wide</span> }] : []),
      ...(type === "identities" ? [{ label: "Last sign-in", value: <ConfirmedValue iso={str(r.attrs.last_sign_in_at)} /> }] : []),
      ...(type === "workloads" && str(r.attrs.region) ? [{ label: "Region", value: str(r.attrs.region) }] : []),
      { label: type === "identities" ? "Object ID" : "Resource ID", value: <span className="break-all font-mono text-xs">{r.native_id}</span> },
      { label: "Last confirmed", value: <ConfirmedValue iso={r.as_of ?? r.last_seen_at} /> },
    ];
    const href = detailHref(r);
    return {
      key: refId(r.ref),
      name: r.name,
      kindLabel: kindLabel(r.kind),
      provider: "azure",
      context: [],
      facts,
      exception:
        r.lifecycle === "retired"
          ? `Retired${r.retired_reason ? ` — ${r.retired_reason}` : ""}.`
          : r.state === "stale"
            ? "Stale: the latest discovery run could not confirm it. It is still believed, not gone."
            : r.attrs.enabled === false
              ? "This account is disabled in Microsoft Entra ID."
              : undefined,
      detailsHref: href,
      graphHref: `${href}/graph`,
    };
  };

  const narrowing = [p.url.q && `search "${p.url.q}"`, p.scope.kind === "one" && `source ${p.scope.source.label}`, kind && `${KIND_FACET_LABEL[type].toLowerCase()} ${kindLabel(kind)}`, lifecycleFilter && `lifecycle ${lifecycleFilter}`].filter(Boolean) as string[];

  if (p.scope.kind === "unknown") return <UnknownSource id={p.scope.id} provider="azure" onClear={() => p.url.patch({ source: null })} />;
  if (p.scope.kind === "no_rows") return <SourceHasNoRows label={p.scope.source.label} onClear={() => p.url.patch({ source: null })} />;
  // The graph is not ready or not deployed: read the same objects from the scan tables instead. Only the
  // first page decides it: a failure on a later page is the page's own and keeps the rows above.
  if (classifyGraphError(list.error)?.kind === "unavailable" && paging.pageIndex === 0) return <AzureScanTablesScreen {...p} cls={type} />;

  return (
    <ScreenFrame
      url={p.url}
      searchPlaceholder={SEARCH_PLACEHOLDER[type]}
      searchHint={p.url.qTooShort ? "Type at least 2 characters to search." : undefined}
      facets={specs}
      trailing={<ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={layout} />}
      onClearAll={() => p.url.patch({ kind: null, source: null, lifecycle: null, q: null, permissions: null })}
      notices={
        <>
          {type === "resources" && !kind && hiddenPermissions > 0 ? (
            <p className="text-xs text-(--color-text-muted)">
              {permissionsShown
                ? "Entra app permissions are listed with the Azure resources."
                : `${hiddenPermissions} Entra app ${hiddenPermissions === 1 ? "permission is" : "permissions are"} not listed: they are what an app may do in Microsoft Entra ID and Microsoft 365, not Azure resources.`}{" "}
              <button
                type="button"
                className="font-medium text-(--color-primary-text) hover:underline"
                onClick={() => p.url.patch({ permissions: permissionsShown ? null : "shown" })}
              >
                {permissionsShown ? "Hide them" : "Show them"}
              </button>
            </p>
          ) : null}
          {restarted ? (
            <p role="status" className="text-xs text-(--color-text-muted)">
              The list restarted at the first page: it changed while you were paging.
            </p>
          ) : null}
        </>
      }
    >
      {(width) => (
        <PreviewLayout
          width={width}
          model={selected ? preview(selected) : null}
          onClose={() => p.url.select(null)}
          list={
            <TableCard>
              <CardContent variant="flush">
                <DiscoveryTable<InventoryRow>
                  tableId={`discovery-azure-${type}`}
                  view={view}
                  columns={columns}
                  getRowId={(r) => refId(r.ref)}
                  selectedId={selectedId}
                  onSelect={(r) => p.url.select(refId(r.ref))}
                  pageIndex={paging.pageIndex}
                  onPrev={paging.prev}
                  onNext={paging.next}
                  pageSize={pageSize}
                  onPageSize={setPageSize}
                  onRetry={() => void list.refetch()}
                  subject={SUBJECT[type]}
                  permission="iga:read"
                  chosenColumns={prefs.chosen}
                  onColumnsLayout={setLayout}
                  empty={
                    narrowing.length ? (
                      <FilteredEmpty subject={SUBJECT[type]} narrowing={narrowing} onClear={() => p.url.patch({ q: null, kind: null, source: null, lifecycle: null })} />
                    ) : (
                      <EmptyList subject={SUBJECT[type]} detail="None are listed for this tenant yet. If a discovery run is still in progress, they appear when it finishes. This is not a finding that there are none." />
                    )
                  }
                />
              </CardContent>
            </TableCard>
          }
        />
      )}
    </ScreenFrame>
  );
}
