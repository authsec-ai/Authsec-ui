/**
 * Discovery for Azure: what the Entra and subscription passes recorded, read
 * from `/authsec/discovery/azure/*`. Identities are per tenant; resources and
 * workloads per subscription, so the Source filter offers the connectors that
 * own the rows of the tab in view.
 *
 * Facts only, as Microsoft returned them: no rating, verdict or action.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AWS_DISCOVERY_MAX_LIMIT,
  useListAzureIdentitiesQuery,
  useListAzureResourcesQuery,
  useListAzureWorkloadsQuery,
  type AzureIdentity,
  type AzureResource,
  type AzureWorkload,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import { EntityCell, type AppliedFilter, type ConsoleFilterOption } from "@/components/console/iam-console";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";

import { CloudPill } from "../CloudPill";
import { InventoryToolbar } from "../InventoryToolbar";
import { CopyableId } from "../aws/AWSInventoryCells";
import { AWSFilterChips } from "../aws/AWSFilterChips";
import { TruncationNotice } from "../aws/AWSInventoryNotices";
import { truncationOf } from "../aws/awsInventoryState";
import { ALL, AzureSourceSelect, ListFrame, RelativeDate } from "./AzureDiscoveryShared";
import AzureAgentsScreen from "./AzureAgentsScreen";
import { AzureIdentityDrawer } from "./AzureIdentityDrawer";
import { AzureResourceDrawer, AzureWorkloadDrawer } from "./AzureObjectDrawers";
import {
  IDENTITY_FILTERS,
  agentTypeLabel,
  armTypeLabel,
  azureSourceFor,
  azureSourcesFor,
  connectorLabel,
  identityKindLabel,
  type AzureDiscoveryType,
} from "./azureDiscoveryLabels";


function useUrlParam(key: string): [string, (v: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? ALL;
  const set = (v: string | null) => {
    const next = new URLSearchParams(params);
    if (!v || v === ALL) next.delete(key);
    else next.set(key, v);
    setParams(next, { replace: true });
  };
  return [value, set];
}

/** Selection with prev/next over the rows the reader can see. */
function useSelection<T extends { id: string }>(rows: T[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = rows.findIndex((r) => r.id === selectedId);
  useEffect(() => {
    if (selectedId && index === -1) setSelectedId(null);
  }, [selectedId, index]);
  return {
    selected: index >= 0 ? rows[index] : null,
    index: index >= 0 ? index : 0,
    select: setSelectedId,
    close: () => setSelectedId(null),
    prev: () => setSelectedId(rows[index - 1]?.id ?? null),
    next: () => setSelectedId(rows[index + 1]?.id ?? null),
  };
}

function kindOptions<T>(rows: T[], kindOf: (r: T) => string, label: (k: string) => string): ConsoleFilterOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(kindOf(r), (counts.get(kindOf(r)) ?? 0) + 1);
  return [
    { key: ALL, label: "All", count: rows.length },
    ...[...counts.entries()].sort(([a], [b]) => label(a).localeCompare(label(b))).map(([k, n]) => ({ key: k, label: label(k), count: n })),
  ];
}

const EMPTY_HINT = "Nothing was recorded yet. Discovery runs in the background after a tenant connects; check the connection's scans if this stays empty.";

/* --------------------------------- identities -------------------------------- */

function IdentitiesList({ connectors }: { connectors: CloudConnector[] }) {
  const [source, setSource] = useUrlParam("source");
  const [kind, setKind] = useUrlParam("kind");
  const [search, setSearch] = useState("");
  const options = azureSourcesFor(connectors, "identities");
  const connectorId = azureSourceFor(connectors, "identities", source);
  const filter = IDENTITY_FILTERS.find((f) => f.key === kind);

  const q = useListAzureIdentitiesQuery({
    connector_id: connectorId,
    kind: filter?.kind,
    agent_type: filter?.agentType,
    limit: AWS_DISCOVERY_MAX_LIMIT,
  });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const upn = typeof r.attrs?.["user_principal_name"] === "string" ? (r.attrs["user_principal_name"] as string) : "";
      return [r.name, r.native_id, upn].some((v) => v.toLowerCase().includes(s));
    });
  }, [rows, search]);
  const sel = useSelection(filtered);

  const chips: ConsoleFilterOption[] = [{ key: ALL, label: "All" }, ...IDENTITY_FILTERS.map((f) => ({ key: f.key, label: f.label }))];
  const applied: AppliedFilter[] = [
    ...(filter ? [{ key: "kind", label: `Kind: ${filter.label}`, onRemove: () => setKind(null) }] : []),
    ...(connectorId ? [{ key: "source", label: `Source: ${connectorLabel(options.find((c) => c.id === connectorId))}`, onRemove: () => setSource(null) }] : []),
  ];

  const columns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "identity",
        accessorKey: "name",
        header: "Identity",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 340,
        cell: ({ row }) => {
          const r = row.original;
          const agent = agentTypeLabel(r);
          return (
            <EntityCell
              label={r.name || r.native_id}
              detail={<CopyableId value={r.native_id} label="Object ID" />}
              badge={
                <span className="flex flex-none gap-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{identityKindLabel(r.kind)}</span>
                  {agent ? <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{agent}</span> : null}
                </span>
              }
            />
          );
        },
      },
      {
        id: "enabled",
        header: "Status",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) =>
          row.original.enabled ? (
            <CloudPill tone="muted" dot={false}>
              Enabled
            </CloudPill>
          ) : (
            <CloudPill tone="muted" dot={false}>
              Disabled
            </CloudPill>
          ),
      },
      { id: "last_sign_in", header: "Last sign-in", priority: 3, approxWidth: 130, cell: ({ row }) => <RelativeDate iso={row.original.last_used_at} /> },
      { id: "created", header: "Created", priority: 4, approxWidth: 130, cell: ({ row }) => <RelativeDate iso={row.original.created_at} /> },
      { id: "last_seen", header: "Last seen", priority: 5, approxWidth: 130, cell: ({ row }) => <RelativeDate iso={row.original.last_seen_at} /> },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {q.data ? <TruncationNotice truncation={truncationOf(q.data)} noun="identities" narrowBy="Narrow by Kind or Source first; both are applied by the server. Search narrows the rows already loaded." /> : null}
      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search the ${rows.length} loaded rows by name, object ID or sign-in name`}
        chips={<AWSFilterChips label="Identity kind" options={chips} active={filter?.key ?? ALL} onSelect={(k) => setKind(k)} />}
        controls={<AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={setSource} allLabel="Every tenant" />}
        applied={applied}
        onClearAll={() => {
          setKind(null);
          setSource(null);
          setSearch("");
        }}
        shown={filtered.length}
        total={rows.length}
        noun="identities"
      />
      <ListFrame loading={q.isLoading} failed={q.isError && !rows.length} onRetry={() => void q.refetch()} empty={!rows.length} noMatch={!filtered.length} emptyText={EMPTY_HINT}>
        <AdaptiveTable
          sizing="fit"
          cardsBelow={640}
          tableId="azure-identities"
          columns={columns}
          data={filtered}
          getRowId={(r) => r.id}
          enableSelection={false}
          enableExpansion={false}
          rowDetails={false}
          onRowClick={(r) => sel.select(r.id)}
          pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
        />
      </ListFrame>
      <AzureIdentityDrawer identity={sel.selected} onClose={sel.close} onPrev={sel.prev} onNext={sel.next} index={sel.index} total={filtered.length} />
    </div>
  );
}

/* --------------------------------- resources --------------------------------- */

function ResourcesList({ connectors }: { connectors: CloudConnector[] }) {
  const [source, setSource] = useUrlParam("source");
  const [kind, setKind] = useUrlParam("kind");
  const [search, setSearch] = useState("");
  const options = azureSourcesFor(connectors, "resources");
  const connectorId = azureSourceFor(connectors, "resources", source);
  const byId = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  const q = useListAzureResourcesQuery({ connector_id: connectorId, limit: AWS_DISCOVERY_MAX_LIMIT });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const chips = useMemo(() => kindOptions(rows, (r) => r.kind, armTypeLabel), [rows]);
  const activeKind = chips.some((c) => c.key === kind) ? kind : ALL;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => (activeKind === ALL || r.kind === activeKind) && (!s || r.name.toLowerCase().includes(s) || r.native_id.toLowerCase().includes(s)));
  }, [rows, search, activeKind]);
  const sel = useSelection(filtered);

  const applied: AppliedFilter[] = [
    ...(activeKind !== ALL ? [{ key: "kind", label: `Type: ${armTypeLabel(activeKind)}`, onRemove: () => setKind(null) }] : []),
    ...(connectorId ? [{ key: "source", label: `Source: ${connectorLabel(byId.get(connectorId))}`, onRemove: () => setSource(null) }] : []),
  ];

  const columns = useMemo<AdaptiveColumn<AzureResource>[]>(
    () => [
      {
        id: "resource",
        accessorKey: "name",
        header: "Resource",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 360,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.name || row.original.native_id}
            detail={<CopyableId value={row.original.native_id} label="Resource ID" />}
            badge={<span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{armTypeLabel(row.original.kind)}</span>}
          />
        ),
      },
      { id: "subscription", header: "Subscription", priority: 2, approxWidth: 180, cell: ({ row }) => <span className="text-xs">{connectorLabel(byId.get(row.original.connector_id))}</span> },
      { id: "first_seen", header: "First seen", priority: 3, approxWidth: 130, cell: ({ row }) => <RelativeDate iso={row.original.first_seen_at} /> },
      { id: "last_seen", header: "Last seen", priority: 4, approxWidth: 130, cell: ({ row }) => <RelativeDate iso={row.original.last_seen_at} /> },
    ],
    [byId],
  );

  return (
    <div className="space-y-4">
      {q.data ? <TruncationNotice truncation={truncationOf(q.data)} noun="resources" narrowBy="Narrow by Source first; it is applied by the server. Type and search narrow the rows already loaded." /> : null}
      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search the ${rows.length} loaded rows by name or resource ID`}
        chips={<AWSFilterChips label="Resource type" options={chips} active={activeKind} onSelect={(k) => setKind(k)} />}
        controls={<AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={setSource} allLabel="Every subscription" />}
        applied={applied}
        onClearAll={() => {
          setKind(null);
          setSource(null);
          setSearch("");
        }}
        shown={filtered.length}
        total={rows.length}
        noun="resources"
      />
      <ListFrame loading={q.isLoading} failed={q.isError && !rows.length} onRetry={() => void q.refetch()} empty={!rows.length} noMatch={!filtered.length} emptyText={EMPTY_HINT}>
        <AdaptiveTable
          sizing="fit"
          cardsBelow={640}
          tableId="azure-resources"
          columns={columns}
          data={filtered}
          getRowId={(r) => r.id}
          enableSelection={false}
          enableExpansion={false}
          rowDetails={false}
          onRowClick={(r) => sel.select(r.id)}
          pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
        />
      </ListFrame>
      <AzureResourceDrawer
        resource={sel.selected}
        subscription={sel.selected ? byId.get(sel.selected.connector_id) : undefined}
        onClose={sel.close}
        onPrev={sel.prev}
        onNext={sel.next}
        index={sel.index}
        total={filtered.length}
      />
    </div>
  );
}

/* --------------------------------- workloads --------------------------------- */

function WorkloadsList({ connectors }: { connectors: CloudConnector[] }) {
  const [source, setSource] = useUrlParam("source");
  const [kind, setKind] = useUrlParam("runtime");
  const [search, setSearch] = useState("");
  const options = azureSourcesFor(connectors, "workloads");
  const connectorId = azureSourceFor(connectors, "workloads", source);
  const byId = useMemo(() => new Map(connectors.map((c) => [c.id, c])), [connectors]);

  const q = useListAzureWorkloadsQuery({ connector_id: connectorId, limit: AWS_DISCOVERY_MAX_LIMIT });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const chips = useMemo(() => kindOptions(rows, (r) => r.runtime_kind, armTypeLabel), [rows]);
  const activeKind = chips.some((c) => c.key === kind) ? kind : ALL;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (activeKind === ALL || r.runtime_kind === activeKind) &&
        (!s || [r.name, r.native_id, r.identity_name].some((v) => (v ?? "").toLowerCase().includes(s))),
    );
  }, [rows, search, activeKind]);
  const sel = useSelection(filtered);

  const applied: AppliedFilter[] = [
    ...(activeKind !== ALL ? [{ key: "runtime", label: `Type: ${armTypeLabel(activeKind)}`, onRemove: () => setKind(null) }] : []),
    ...(connectorId ? [{ key: "source", label: `Source: ${connectorLabel(byId.get(connectorId))}`, onRemove: () => setSource(null) }] : []),
  ];

  const columns = useMemo<AdaptiveColumn<AzureWorkload>[]>(
    () => [
      {
        id: "workload",
        accessorKey: "name",
        header: "Workload",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 340,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.name || row.original.native_id}
            detail={<CopyableId value={row.original.native_id} label="Resource ID" />}
            badge={<span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{armTypeLabel(row.original.runtime_kind)}</span>}
          />
        ),
      },
      {
        id: "runs_as",
        header: "Runs as",
        priority: 2,
        approxWidth: 220,
        cell: ({ row }) =>
          row.original.identity_name ? (
            <span className="text-xs">
              {row.original.identity_name} <span className="text-muted-foreground">· {identityKindLabel(row.original.identity_kind)}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No identity recorded</span>
          ),
      },
      { id: "region", header: "Region", priority: 3, approxWidth: 120, cell: ({ row }) => <span className="text-xs">{row.original.region || "—"}</span> },
      { id: "subscription", header: "Subscription", priority: 4, approxWidth: 180, cell: ({ row }) => <span className="text-xs">{connectorLabel(byId.get(row.original.connector_id))}</span> },
      { id: "last_seen", header: "Last seen", priority: 5, approxWidth: 130, cell: ({ row }) => <RelativeDate iso={row.original.last_seen_at} /> },
    ],
    [byId],
  );

  return (
    <div className="space-y-4">
      {q.data ? <TruncationNotice truncation={truncationOf(q.data)} noun="workloads" narrowBy="Narrow by Source first; it is applied by the server. Type and search narrow the rows already loaded." /> : null}
      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search the ${rows.length} loaded rows by name, resource ID or identity`}
        chips={<AWSFilterChips label="Workload type" options={chips} active={activeKind} onSelect={(k) => setKind(k)} />}
        controls={<AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={setSource} allLabel="Every subscription" />}
        applied={applied}
        onClearAll={() => {
          setKind(null);
          setSource(null);
          setSearch("");
        }}
        shown={filtered.length}
        total={rows.length}
        noun="workloads"
      />
      <ListFrame loading={q.isLoading} failed={q.isError && !rows.length} onRetry={() => void q.refetch()} empty={!rows.length} noMatch={!filtered.length} emptyText={EMPTY_HINT}>
        <AdaptiveTable
          sizing="fit"
          cardsBelow={640}
          tableId="azure-workloads"
          columns={columns}
          data={filtered}
          getRowId={(r) => r.id}
          enableSelection={false}
          enableExpansion={false}
          rowDetails={false}
          onRowClick={(r) => sel.select(r.id)}
          pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
        />
      </ListFrame>
      <AzureWorkloadDrawer
        workload={sel.selected}
        subscription={sel.selected ? byId.get(sel.selected.connector_id) : undefined}
        onClose={sel.close}
        onPrev={sel.prev}
        onNext={sel.next}
        index={sel.index}
        total={filtered.length}
      />
    </div>
  );
}

export default function AzureDiscoveryScreen({ type, connectors }: { type: AzureDiscoveryType; connectors: CloudConnector[] }) {
  if (type === "agents") return <AzureAgentsScreen connectors={connectors} />;
  return (
    <div className="p-4">
      {type === "identities" ? <IdentitiesList connectors={connectors} /> : type === "resources" ? <ResourcesList connectors={connectors} /> : <WorkloadsList connectors={connectors} />}
    </div>
  );
}
