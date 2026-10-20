/**
 * Azure Agents: Microsoft Entra Agent ID objects in one place, laid out the way
 * the Entra admin center lists them (agent identity, its blueprint, owners and
 * sponsors, status, created). Counts and facts only; nothing is rated.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  AWS_DISCOVERY_MAX_LIMIT,
  useListAzureIdentitiesQuery,
  type AzureIdentity,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import { useListDiscoveredAgentsQuery } from "@/app/api/discoveryApi";
import { EntityCell } from "@/components/console/iam-console";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { cn } from "@/lib/utils";

import { CloudPill } from "../CloudPill";
import { InventoryToolbar } from "../InventoryToolbar";
import { CopyableId } from "../aws/AWSInventoryCells";
import { ALL, AzureSourceSelect, ListFrame, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { azureSourceFor, azureSourcesFor, connectorLabel, refsOf } from "./azureDiscoveryLabels";

type View = "identities" | "blueprints";

const KIND_ARGS = {
  identities: { kind: "entra_agent_identity" },
  blueprints: { kind: "entra_application", agent_type: "agent_identity_blueprint" },
  principals: { kind: "entra_service_principal", agent_type: "agent_identity_blueprint_principal" },
  users: { kind: "entra_agent_user" },
} as const;

/** An agent or blueprint opens its own page, keyed by its Entra object id. */
const detailHref = (r: Pick<AzureIdentity, "native_id">) => `/iga/azure/identity/${encodeURIComponent(r.native_id)}`;

function NameLink({ r, children }: { r: AzureIdentity; children: string }) {
  return (
    <Link to={detailHref(r)} onClick={(e) => e.stopPropagation()} className="hover:underline">
      {children}
    </Link>
  );
}

function createdBy(r: AzureIdentity): string | undefined {
  const c = r.attrs?.["created_by"] as { by?: string } | undefined;
  return c?.by || undefined;
}

function Tile({ label, value, active, onClick, title }: { label: string; value: number | undefined; active?: boolean; onClick?: () => void; title: string }) {
  const body = (
    <>
      <span className="block text-2xl font-semibold tabular-nums text-(--color-text)">{value ?? "–"}</span>
      <span className="block text-xs text-(--color-text-muted)">{label}</span>
    </>
  );
  const cls = cn(
    "rounded-lg border px-4 py-3 text-left",
    active ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-subtle) bg-(--color-surface-raised)",
  );
  return onClick ? (
    <button type="button" className={cn(cls, "hover:border-(--color-primary)")} onClick={onClick} title={title} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}

export default function AzureAgentsScreen({ connectors }: { connectors: CloudConnector[] }) {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("agents") === "blueprints" ? "blueprints" : "identities";
  const source = params.get("source");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const options = azureSourcesFor(connectors, "agents");
  const connectorId = azureSourceFor(connectors, "agents", source);
  const scope = { connector_id: connectorId };

  // The four counts, each the server's own total.
  const cIdentities = useListAzureIdentitiesQuery({ ...scope, ...KIND_ARGS.identities, limit: 1 });
  const cBlueprints = useListAzureIdentitiesQuery({ ...scope, ...KIND_ARGS.blueprints, limit: 1 });
  const cPrincipals = useListAzureIdentitiesQuery({ ...scope, ...KIND_ARGS.principals, limit: 1 });
  const cUsers = useListAzureIdentitiesQuery({ ...scope, ...KIND_ARGS.users, limit: 1 });

  const q = useListAzureIdentitiesQuery({ ...scope, ...KIND_ARGS[view], limit: AWS_DISCOVERY_MAX_LIMIT });
  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const bp = typeof r.attrs?.["agent_blueprint_name"] === "string" ? (r.attrs["agent_blueprint_name"] as string) : "";
      const people = [...refsOf(r.attrs, "sponsors"), ...refsOf(r.attrs, "owners")].map((p) => p.name ?? "");
      return [r.name, r.native_id, bp, ...people].some((v) => v.toLowerCase().includes(s));
    });
  }, [rows, search]);

  const toIdentities = (kind: string) => {
    const next = new URLSearchParams(params);
    next.set("type", "identities");
    next.set("kind", kind);
    next.delete("agents");
    setParams(next);
  };

  const identityColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Agent identity",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 280,
        cell: ({ row }) => <EntityCell label={<NameLink r={row.original}>{row.original.name || row.original.native_id}</NameLink>} detail={<CopyableId value={row.original.native_id} label="Object ID" />} />,
      },
      {
        id: "blueprint",
        header: "Agent identity blueprint",
        priority: 2,
        approxWidth: 200,
        cell: ({ row }) => {
          const name = row.original.attrs?.["agent_blueprint_name"];
          return typeof name === "string" && name ? <span className="text-xs">{name}</span> : <span className="text-xs text-muted-foreground">Not recorded</span>;
        },
      },
      { id: "sponsors", header: "Sponsors", priority: 3, approxWidth: 180, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "sponsors")} /> },
      { id: "owners", header: "Owners", priority: 4, approxWidth: 180, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "owners")} /> },
      {
        id: "status",
        header: "Status",
        priority: 5,
        approxWidth: 100,
        cell: ({ row }) => (
          <CloudPill tone="muted" dot={false}>
            {row.original.enabled ? "Enabled" : "Disabled"}
          </CloudPill>
        ),
      },
      {
        id: "created",
        header: "Created",
        priority: 6,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-xs">
            <RelativeDate iso={row.original.created_at} />
            {createdBy(row.original) ? <span className="block text-muted-foreground">by {createdBy(row.original)}</span> : null}
          </span>
        ),
      },
      { id: "last_sign_in", header: "Last sign-in", priority: 7, approxWidth: 120, cell: ({ row }) => <RelativeDate iso={row.original.last_used_at} /> },
    ],
    [],
  );

  const blueprintColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Agent identity blueprint",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 280,
        cell: ({ row }) => {
          const appId = typeof row.original.attrs?.["app_id"] === "string" ? (row.original.attrs["app_id"] as string) : row.original.native_id;
          return <EntityCell label={<NameLink r={row.original}>{row.original.name || appId}</NameLink>} detail={<CopyableId value={appId} label="Application (client) ID" />} />;
        },
      },
      {
        id: "agents",
        header: "Agent identities",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => {
          const n = row.original.attrs?.["agent_count"];
          return <span className="text-xs tabular-nums">{typeof n === "number" ? n : "Not recorded"}</span>;
        },
      },
      { id: "sponsors", header: "Sponsors", priority: 3, approxWidth: 180, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "sponsors")} /> },
      { id: "owners", header: "Owners", priority: 4, approxWidth: 180, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "owners")} /> },
      {
        id: "publisher",
        header: "Publisher domain",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) => <span className="text-xs">{(row.original.attrs?.["publisher_domain"] as string) || "—"}</span>,
      },
      {
        id: "created",
        header: "Created",
        priority: 6,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-xs">
            <RelativeDate iso={row.original.created_at} />
            {createdBy(row.original) ? <span className="block text-muted-foreground">by {createdBy(row.original)}</span> : null}
          </span>
        ),
      },
    ],
    [],
  );

  const noun = view === "identities" ? "agent identities" : "agent identity blueprints";
  return (
    <div className="space-y-4 p-4">
      <AllAgentsNote onOpen={() => setParam("type", "sightings")} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Agent identities"
          value={cIdentities.data?.total}
          active={view === "identities"}
          onClick={() => setParam("agents", null)}
          title="Show agent identities"
        />
        <Tile
          label="Agent identity blueprints"
          value={cBlueprints.data?.total}
          active={view === "blueprints"}
          onClick={() => setParam("agents", "blueprints")}
          title="Show agent identity blueprints"
        />
        <Tile
          label="Agent identity blueprint principals"
          value={cPrincipals.data?.total}
          onClick={() => toIdentities("agent_identity_blueprint_principal")}
          title="Open them in Identities"
        />
        <Tile label="Agents' user accounts" value={cUsers.data?.total} onClick={() => toIdentities("entra_agent_user")} title="Open them in Identities" />
      </div>

      <InventoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${noun} by name, ID, blueprint, sponsor or owner`}
        controls={<AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={(v) => setParam("source", v)} allLabel="Every tenant" />}
        applied={connectorId ? [{ key: "source", label: `Source: ${connectorLabel(options.find((c) => c.id === connectorId))}`, onRemove: () => setParam("source", null) }] : []}
        onClearAll={() => {
          setParam("source", null);
          setSearch("");
        }}
        shown={filtered.length}
        total={rows.length}
        noun={noun}
      />

      <ListFrame
        loading={q.isLoading}
        failed={q.isError && !rows.length}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={!rows.length}
        noMatch={!filtered.length}
        emptyText={
          view === "identities"
            ? "No agent identity was recorded. Agent identities are read with AgentIdentity.Read.All; the connection's Coverage tab says whether that read ran."
            : "No agent identity blueprint was recorded. Blueprints are read with AgentIdentityBlueprint.Read.All; the connection's Coverage tab says whether that read ran."
        }
      >
        <AdaptiveTable
          key={view}
          sizing="fit"
          cardsBelow={640}
          tableId={`azure-agents-${view}`}
          columns={view === "identities" ? identityColumns : blueprintColumns}
          data={filtered}
          getRowId={(r) => r.id}
          enableSelection={false}
          enableExpansion={false}
          rowDetails={false}
          onRowClick={(r) => navigate(detailHref(r))}
          pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
        />
      </ListFrame>
    </div>
  );
}

/**
 * This tab lists Microsoft Entra Agent ID objects only. Every Azure agent —
 * these, Microsoft 365 agent registry agents and the ones AuthSec inferred —
 * is in the shared agent inventory, which Sightings lists.
 */
function AllAgentsNote({ onOpen }: { onOpen: () => void }) {
  const all = useListDiscoveredAgentsQuery({ source: "azure", limit: 1 });
  const total = all.data?.total;
  if (total === undefined) return null;
  return (
    <p className="text-xs text-(--color-text-muted)">
      These are the agents Microsoft Entra Agent ID lists.{" "}
      <button type="button" onClick={onOpen} className="font-medium text-(--color-primary-text) hover:underline">
        See all {total} Azure {total === 1 ? "agent" : "agents"} in Sightings
      </button>
      , including Microsoft 365 agent registry agents and agents inferred from sign-ins and permissions.
    </p>
  );
}
