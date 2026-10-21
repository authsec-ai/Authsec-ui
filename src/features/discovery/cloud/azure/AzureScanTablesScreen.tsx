/**
 * Azure Identities, Resources and Workloads while the shared graph is
 * unavailable (not yet ready): read from the Azure discovery routes,
 * which serve the scan tables directly, as AWS's "Latest collected" does. The
 * inventory screen hands over to this one only when the graph answers
 * `graph_unavailable`; once the graph is on, the inventory is read again.
 *
 * Up to AWS_DISCOVERY_MAX_LIMIT rows are read per filter, the server's search,
 * kind and connector filters applied; the table pages them. Facts only.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  AWS_DISCOVERY_MAX_LIMIT,
  useListAzureConnectorsQuery,
  useListAzureIdentitiesQuery,
  useListAzureResourcesQuery,
  useListAzureWorkloadsQuery,
  type AzureIdentity,
  type AzureResource,
  type AzureWorkload,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import type { InventoryClass } from "@/app/api/igaInventoryApi";
import { EntityCell } from "@/components/console/iam-console";
import { StatusBadge } from "@/components/console/status";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import type { FacetSpec } from "@/features/iga/discovery/FacetBar";
import { sourceFacet } from "@/features/iga/discovery/facets";
import { ScreenFrame } from "@/features/iga/discovery/ScreenFrame";
import type { ScreenProps } from "@/features/iga/discovery/screenTypes";

import { CopyableId } from "../aws/AWSInventoryCells";
import { ListFrame, RelativeDate } from "./AzureDiscoveryShared";
import { agentTypeLabel, connectorLabel, IDENTITY_FILTERS, identityKindLabel } from "./azureDiscoveryLabels";
import { azureFallbackScope, identityFilterArgs, scanTablesHref } from "./azureFallback";
import { inventoryKindLabel, tenantName, tenantScopeId } from "./azureInventoryLabels";

type Row = AzureIdentity | AzureResource | AzureWorkload;

const MUTED = "text-xs text-muted-foreground";
const NOUN: Record<InventoryClass, string> = { identities: "identities", resources: "resources", workloads: "workloads" };
const SEARCH_PLACEHOLDER: Record<InventoryClass, string> = {
  identities: "Search identities by name, object ID or user principal name",
  resources: "Search resources by name or resource ID",
  workloads: "Search workloads by name or resource ID",
};

function rowKind(cls: InventoryClass, r: Row): string {
  return cls === "workloads" ? (r as AzureWorkload).runtime_kind : (r as AzureIdentity | AzureResource).kind;
}

export default function AzureScanTablesScreen(p: ScreenProps & { cls: InventoryClass }) {
  const { cls } = p;
  const navigate = useNavigate();
  const kind = p.url.get("kind");
  const connectorsQ = useListAzureConnectorsQuery();
  const connectors = useMemo(() => connectorsQ.data ?? [], [connectorsQ.data]);
  const byId = useMemo(() => new Map(connectors.map((c) => [c.id, c] as const)), [connectors]);
  const tenants = useMemo(() => new Map(connectors.filter((c) => c.scope_kind === "tenant").map((c) => [tenantScopeId(c), c] as const)), [connectors]);
  const sources = useMemo(() => p.sources.map((s) => ({ ...s, label: tenantName(tenants.get(s.scopeId), s.label) })), [p.sources, tenants]);

  const tenantId = p.scope.kind === "one" ? p.scope.source.scopeId : undefined;
  const scope = azureFallbackScope(connectors, cls, tenantId);
  const args = {
    connector_id: scope.connectorId,
    q: p.url.q,
    limit: AWS_DISCOVERY_MAX_LIMIT,
    ...(cls === "identities" ? identityFilterArgs(kind) : { kind: kind ?? undefined }),
  };
  // Kinds present, for the Kind filter: the same read without a kind (the list itself when none is chosen).
  const kindsArgs = { ...args, kind: undefined, agent_type: undefined };
  const skip = connectorsQ.isLoading;
  const idQ = useListAzureIdentitiesQuery(args, { skip: skip || cls !== "identities" });
  const resQ = useListAzureResourcesQuery(args, { skip: skip || cls !== "resources" });
  const wlQ = useListAzureWorkloadsQuery(args, { skip: skip || cls !== "workloads" });
  const resKindsQ = useListAzureResourcesQuery(kindsArgs, { skip: skip || cls !== "resources" });
  const wlKindsQ = useListAzureWorkloadsQuery(kindsArgs, { skip: skip || cls !== "workloads" });
  const q = cls === "identities" ? idQ : cls === "resources" ? resQ : wlQ;

  const loaded: Row[] = useMemo(() => (q.data?.rows ?? []) as Row[], [q.data]);
  const rows = useMemo(() => (scope.connectorIds ? loaded.filter((r) => scope.connectorIds!.has(r.connector_id)) : loaded), [loaded, scope.connectorIds]);
  const total = q.data?.total ?? 0;
  const truncated = !!q.data && q.data.totalKnown && total > loaded.length;

  const kindOptions = useMemo(() => {
    if (cls === "identities") return IDENTITY_FILTERS.map((f) => ({ value: f.key, label: f.label }));
    const source = (cls === "resources" ? resKindsQ.data?.rows : wlKindsQ.data?.rows) as Row[] | undefined;
    const counts = new Map<string, number>();
    for (const r of source ?? []) counts.set(rowKind(cls, r), (counts.get(rowKind(cls, r)) ?? 0) + 1);
    if (kind && !counts.has(kind)) counts.set(kind, 0);
    return [...counts.entries()]
      .map(([value, n]) => ({ value, label: inventoryKindLabel(cls, value), count: { kind: "exact" as const, value: n } }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cls, kind, resKindsQ.data, wlKindsQ.data]);

  const tenantOf = (c: CloudConnector | undefined): string => {
    if (!c) return "Unknown";
    if (c.scope_kind === "tenant") return tenantName(c, c.scope_id);
    const t = connectors.find((x) => x.scope_kind === "tenant" && x.scope_id.toLowerCase() === c.parent_scope_id?.toLowerCase());
    return t ? tenantName(t, t.scope_id) : c.parent_scope_id ?? "Unknown";
  };

  const columns = useMemo<AdaptiveColumn<Row>[]>(() => {
    const name: AdaptiveColumn<Row> = {
      id: "name",
      accessorKey: "name",
      header: "Name",
      alwaysVisible: true,
      priority: 1,
      approxWidth: 300,
      cell: ({ row }) => {
        const r = row.original;
        const agent = cls === "identities" ? agentTypeLabel(r as AzureIdentity) : undefined;
        return (
          <EntityCell
            label={<span className="font-medium">{r.name || r.native_id}</span>}
            detail={
              <span className="flex flex-col gap-0.5">
                <span className={MUTED}>{[inventoryKindLabel(cls, rowKind(cls, r)), agent].filter(Boolean).join(" · ")}</span>
                <CopyableId value={r.native_id} label={cls === "identities" ? "Object ID" : "Resource ID"} />
              </span>
            }
          />
        );
      },
    };
    const state: AdaptiveColumn<Row> = {
      id: "state",
      header: "State",
      priority: 2,
      approxWidth: 100,
      cell: ({ row }) =>
        cls === "identities" && (row.original as AzureIdentity).enabled === false ? <StatusBadge tone="neutral">Disabled</StatusBadge> : <span className={MUTED}>Current</span>,
    };
    const signIn: AdaptiveColumn<Row> = {
      id: "last_sign_in",
      header: "Last sign-in",
      priority: 3,
      approxWidth: 130,
      cell: ({ row }) => <RelativeDate iso={(row.original as AzureIdentity).last_used_at} />,
    };
    const subscription: AdaptiveColumn<Row> = {
      id: "subscription",
      header: "Subscription",
      priority: 3,
      approxWidth: 160,
      cell: ({ row }) => {
        const c = byId.get(row.original.connector_id);
        return <span className="text-xs">{c?.scope_kind === "subscription" ? connectorLabel(c) : "Tenant-wide"}</span>;
      },
    };
    const region: AdaptiveColumn<Row> = {
      id: "region",
      header: "Region",
      priority: 4,
      approxWidth: 110,
      cell: ({ row }) => <span className={MUTED}>{(row.original as AzureWorkload).region || "Not stated"}</span>,
    };
    const runsAs: AdaptiveColumn<Row> = {
      id: "runs_as",
      header: "Runs as",
      priority: 4,
      approxWidth: 180,
      cell: ({ row }) => {
        const w = row.original as AzureWorkload;
        return w.identity_name ? (
          <span className="text-xs">
            {w.identity_name} <span className="text-muted-foreground">({identityKindLabel(w.identity_kind)})</span>
          </span>
        ) : (
          <span className={MUTED}>No identity recorded</span>
        );
      },
    };
    const tenant: AdaptiveColumn<Row> = {
      id: "tenant",
      header: "Tenant",
      priority: 5,
      approxWidth: 150,
      cell: ({ row }) => <span className="text-xs">{tenantOf(byId.get(row.original.connector_id))}</span>,
    };
    const seen: AdaptiveColumn<Row> = {
      id: "seen",
      header: "Last seen",
      priority: 5,
      approxWidth: 130,
      cell: ({ row }) => <RelativeDate iso={row.original.last_seen_at} />,
    };
    if (cls === "identities") return [name, state, signIn, tenant, seen];
    if (cls === "workloads") return [name, subscription, region, runsAs, tenant, seen];
    return [name, subscription, tenant, seen];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls, byId, connectors]);

  const specs: FacetSpec[] = [
    {
      key: "source",
      label: "Source",
      kind: "choice",
      value: p.scope.kind === "one" ? p.scope.source.id : p.url.source,
      anyLabel: "Every tenant",
      ...sourceFacet(sources, undefined),
      onChange: (v) => p.url.patch({ source: v }),
    },
    {
      key: "kind",
      label: cls === "identities" ? "Kind" : cls === "resources" ? "Type" : "Runtime",
      kind: "choice",
      value: kind,
      anyLabel: cls === "identities" ? "Any kind" : cls === "resources" ? "Any type" : "Any runtime",
      options: kindOptions,
      onChange: (v) => p.url.patch({ kind: v }),
    },
  ];

  const filtered = !!(p.url.q || kind || tenantId);
  return (
    <ScreenFrame
      url={p.url}
      searchPlaceholder={SEARCH_PLACEHOLDER[cls]}
      searchHint={p.url.qTooShort ? "Type at least 2 characters to search." : undefined}
      facets={specs}
      onClearAll={() => p.url.patch({ kind: null, source: null })}
      notices={
        <div className="space-y-1 text-xs text-(--color-text-muted)" role="status">
          <p>
            Read straight from the latest Azure scan: AuthSec's graph is not ready on this server yet, so these {NOUN[cls]} are not
            counted against the graph or linked to an Access Graph.
          </p>
          {truncated ? <p>Showing the first {loaded.length.toLocaleString()} of {total.toLocaleString()}. Search or filter to narrow them.</p> : null}
          {!scope.exact ? <p>Narrowed to this tenant after reading the first {loaded.length.toLocaleString()} rows of every tenant: choose Every tenant, or search, to see the rest.</p> : null}
        </div>
      }
    >
      {() => (
        <ListFrame
          loading={q.isLoading || connectorsQ.isLoading}
          failed={q.isError && !loaded.length}
          error={q.error}
          onRetry={() => void q.refetch()}
          empty={!rows.length}
          noMatch={false}
          emptyText={
            filtered
              ? `No ${NOUN[cls]} match this search or filter.`
              : `No ${NOUN[cls]} were recorded. If a scan is still running they appear when it finishes; the connection's Coverage tab says what each part of the scan could read.`
          }
        >
          <AdaptiveTable
            key={cls}
            sizing="fit"
            cardsBelow={640}
            tableId={`azure-scan-${cls}`}
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            rowDetails={false}
            onRowClick={(r) => navigate(scanTablesHref(cls, r))}
            pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
          />
        </ListFrame>
      )}
    </ScreenFrame>
  );
}

