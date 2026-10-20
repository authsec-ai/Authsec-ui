/**
 * Azure: the unified inventory — `provider=azure`, one class per type.
 *
 * The same shape as Kubernetes' list: search is the inventory's `q`, Source
 * (tenant) and Kind are its `scope` and `kind` filters with the server's facet
 * counts, paging is a signed cursor in history state, and a row opens the
 * shared preview beside the list. Azure writes are UNREVISIONED (read live, no
 * publication number), so what a row is "as of" is the discovery run that last
 * confirmed it.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useListAzureConnectorsQuery } from "@/app/api/cloudDiscoveryApi";
import { refId } from "@/app/api/igaGraphApi";
import { useListInventoryQuery, type InventoryClass, type InventoryMeta, type InventoryRow } from "@/app/api/igaInventoryApi";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn, AdaptiveColumnsLayout } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { ColumnsMenu } from "@/components/ui/table-columns";
import { useColumnPreferences } from "@/components/ui/use-column-preferences";
import { DiscoveryTable, RowName } from "@/features/iga/discovery/DiscoveryTable";
import type { FacetSpec } from "@/features/iga/discovery/FacetBar";
import { reportedFacet, sourceFacet } from "@/features/iga/discovery/facets";
import { EmptyList, FilteredEmpty, SourceHasNoRows, UnknownSource } from "@/features/iga/discovery/ListStates";
import { ScreenFrame } from "@/features/iga/discovery/ScreenFrame";
import type { ScreenProps } from "@/features/iga/discovery/screenTypes";
import { ConfirmedValue, PreviewLayout, type PreviewModel } from "@/features/iga/shared/components/ObjectPreview";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { resolvePagedView, useRestartOnListingChanged, type PagedView } from "@/features/iga/shared/listView";
import { usePaging, useRestoreScroll } from "@/features/iga/shared/paging";
import { TableCard } from "@/theme/components/cards";

import { agentTypeLabel } from "./azureDiscoveryLabels";
import { inventoryKindLabel, tenantName, tenantScopeId } from "./azureInventoryLabels";

const MUTED = "text-(--color-text-muted)";

const SUBJECT: Record<InventoryClass, string> = { identities: "identities", resources: "resources", workloads: "workloads" };
const OBJECT_SEGMENT: Record<InventoryClass, string> = { identities: "identity", resources: "resource", workloads: "workload" };
const KIND_FACET_LABEL: Record<InventoryClass, string> = { identities: "Kind", resources: "Type", workloads: "Runtime" };
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
  const blocked = p.scope.kind === "unknown" || p.scope.kind === "no_rows";
  const scopeId = p.scope.kind === "one" ? p.scope.source.scopeId : undefined;

  const connectorsQ = useListAzureConnectorsQuery();
  const tenants = useMemo(
    () => new Map((connectorsQ.data ?? []).filter((c) => c.scope_kind === "tenant").map((c) => [tenantScopeId(c), c] as const)),
    [connectorsQ.data],
  );
  const tenantLabel = (id: string | undefined | null) => (id ? tenantName(tenants.get(id), id) : "Not stated");
  const sources = useMemo(() => p.sources.map((s) => ({ ...s, label: tenantName(tenants.get(s.scopeId), s.label) })), [p.sources, tenants]);

  const list = useListInventoryQuery(
    { ws: p.ws, key: paging.cacheKey, class: type, provider: "azure", kind, scope: scopeId, q: p.url.q, sort: "name", cursor: paging.cursor },
    { skip: blocked },
  );
  useRestartOnListingChanged(list.error, paging.restart, () => setRestarted(true));
  const view: PagedView<InventoryRow, InventoryMeta> = resolvePagedView(list, paging.pageIndex);
  useRestoreScroll(`discovery-azure-${type}`, view.kind === "rows");
  const facets = list.currentData?.meta.facets;

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
      minWidth: 240,
      cell: ({ row }) => (
        <RowName
          to={detailHref(row.original)}
          name={row.original.name}
          rowKey={refId(row.original.ref)}
          selected={selectedId === refId(row.original.ref)}
          context={[kindLabel(row.original.kind), type === "identities" && str(row.original.attrs.agent_type) ? agentTypeLabel({ attrs: row.original.attrs }) : null]}
          account={tenantLabel(row.original.scope?.id)}
        />
      ),
    };
    const lifecycle: AdaptiveColumn<InventoryRow> = {
      id: "lifecycle",
      header: "State",
      priority: 1,
      approxWidth: 100,
      cardSummary: true,
      cell: ({ row }) =>
        row.original.lifecycle === "retired" ? (
          <StatusBadge tone="neutral">Retired</StatusBadge>
        ) : row.original.state === "stale" ? (
          <StatusBadge tone="warning">Stale</StatusBadge>
        ) : row.original.attrs.enabled === false ? (
          <StatusBadge tone="neutral">Disabled</StatusBadge>
        ) : (
          <span className={`text-sm ${MUTED}`}>Current</span>
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
      cell: ({ row }) => <span className={`text-sm ${row.original.sub_scope ? "" : MUTED}`}>{row.original.sub_scope ?? "Tenant-wide"}</span>,
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
            ]}
          />
        </div>
      ),
    };
    if (type === "identities") return [name, lifecycle, signIn, tenant, seen, actions];
    if (type === "workloads") return [name, lifecycle, subscription, region, tenant, seen, actions];
    return [name, lifecycle, subscription, tenant, seen, actions];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, selectedId, navigate, tenants]);

  const prefs = useColumnPreferences(`discovery-azure-${type}`, columns);
  const [layout, setLayout] = useState<AdaptiveColumnsLayout | undefined>();

  const kindOptions = reportedFacet(facets, "kind", (v) => kindLabel(v));
  const specs: FacetSpec[] = [
    {
      key: "source",
      label: "Source",
      kind: "choice",
      value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
      anyLabel: "Every tenant",
      ...sourceFacet(sources, facets?.scope),
      onChange: (v) => p.url.patch({ source: v }),
    },
    {
      key: "kind",
      label: KIND_FACET_LABEL[type],
      kind: "choice",
      value: kind,
      anyLabel: type === "identities" ? "Any kind" : type === "resources" ? "Any type" : "Any runtime",
      ...kindOptions,
      onChange: (v) => p.url.patch({ kind: v }),
    },
  ];

  const preview = (r: InventoryRow): PreviewModel => {
    const facts: PreviewModel["facts"] = [
      { label: "Tenant", value: tenantLabel(r.scope?.id) },
      ...(type !== "identities" ? [{ label: "Subscription", value: r.sub_scope ?? <span className={MUTED}>Tenant-wide</span> }] : []),
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

  const narrowing = [p.url.q && `search "${p.url.q}"`, p.scope.kind === "one" && `source ${p.scope.source.label}`, kind && `${KIND_FACET_LABEL[type].toLowerCase()} ${kindLabel(kind)}`].filter(Boolean) as string[];

  if (p.scope.kind === "unknown") return <UnknownSource id={p.scope.id} provider="azure" onClear={() => p.url.patch({ source: null })} />;
  if (p.scope.kind === "no_rows") return <SourceHasNoRows label={p.scope.source.label} onClear={() => p.url.patch({ source: null })} />;

  return (
    <ScreenFrame
      url={p.url}
      searchPlaceholder={SEARCH_PLACEHOLDER[type]}
      searchHint={p.url.qTooShort ? "Type at least 2 characters to search." : undefined}
      facets={specs}
      trailing={<ColumnsMenu optional={prefs.optional} chosen={prefs.chosen} onChange={prefs.setChosen} onReset={prefs.reset} layout={layout} />}
      onClearAll={() => p.url.patch({ kind: null, source: null })}
      notices={
        restarted ? (
          <p role="status" className="text-xs text-(--color-text-muted)">
            The list restarted at the first page: it changed while you were paging.
          </p>
        ) : undefined
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
                  onRetry={() => void list.refetch()}
                  subject={SUBJECT[type]}
                  permission="iga:read"
                  chosenColumns={prefs.chosen}
                  onColumnsLayout={setLayout}
                  empty={
                    narrowing.length ? (
                      <FilteredEmpty subject={SUBJECT[type]} narrowing={narrowing} onClear={() => p.url.patch({ q: null, kind: null, source: null })} />
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
