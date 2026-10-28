/**
 * Discovery's Entra Agent ID tab: Microsoft Entra Agent ID and Microsoft
 * Foundry in four views.
 *
 *   Overview          each blueprint with its agent identities, by who made them
 *   Agent identities  the accounts agents sign in with
 *   Blueprints        the templates agent identities are made from
 *   Foundry           Foundry resources and their projects
 *
 * Names follow the shared cells (AzureAgentCells): a readable name over where
 * the object came from. Facts only; nothing is rated.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  AWS_DISCOVERY_MAX_LIMIT,
  useListAzureFoundryQuery,
  useListAzureIdentitiesQuery,
  type AzureIdentity,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";

import { InventoryToolbar } from "../InventoryToolbar";
import { AWSFilterChips } from "../aws/AWSFilterChips";
import { TruncationNotice } from "../aws/AWSInventoryNotices";
import { AgentNameCell, AgentStatus } from "./AzureAgentCells";
import { AzureAgentOverview } from "./AzureAgentOverview";
import { ALL, AzureSourceSelect, ListFrame, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { AzureFoundryTable } from "./AzureFoundryTable";
import { AzureTerm } from "./AzureTerm";
import { agentDisplayName, agentMatches, agentPageHref, isFoundryProjectIdentity, usesAgentIdentity } from "./azureAgentSource";
import { azureSourceFor, azureSourcesFor, connectorLabel, refsOf } from "./azureDiscoveryLabels";
import { foundryRowsOf, groupFoundry } from "./azureFoundry";
import { azureExplain } from "./azureGlossary";
import { pageSizeParam, parsePageSize, useClientPaging } from "./azurePaging";

type View = "overview" | "identities" | "blueprints" | "foundry";

const MUTED = "text-xs text-(--color-text-muted)";

export default function AzureAgentsScreen({ connectors }: { connectors: CloudConnector[] }) {
  const [params, setParams] = useSearchParams();
  const agentsParam = params.get("agents");
  const view: View = agentsParam === "blueprints" || agentsParam === "foundry" || agentsParam === "identities" ? agentsParam : "overview";
  const source = params.get("source");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const navigate = useNavigate();
  const pageSize = parsePageSize(params.get("size"));

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // The search lives in the URL (a reload or a shared link keeps it), written a moment after typing.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const wanted = search.trim();
      if ((params.get("q") ?? "") === wanted) return;
      const next = new URLSearchParams(params);
      if (wanted) next.set("q", wanted);
      else next.delete("q");
      setParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(t);
  }, [search, params, setParams]);

  const options = azureSourcesFor(connectors, "agents");
  const connectorId = azureSourceFor(connectors, "agents", source);
  const scope = { connector_id: connectorId, limit: AWS_DISCOVERY_MAX_LIMIT };

  // Both lists are small and every view uses them (counts, blueprint names, Foundry's agent counts).
  const agentsQ = useListAzureIdentitiesQuery({ ...scope, kind: "entra_agent_identity" });
  const blueprintsQ = useListAzureIdentitiesQuery({ ...scope, kind: "entra_application", agent_type: "agent_identity_blueprint" });
  const managedQ = useListAzureIdentitiesQuery({ ...scope, kind: "entra_managed_identity" });
  const agents = useMemo(() => agentsQ.data?.rows ?? [], [agentsQ.data]);
  // As in the Entra admin center: agent identities, plus the older Foundry projects whose agents
  // run as the project's own managed identity ("Uses agent identity: No").
  const allAgents = useMemo(() => [...agents, ...(managedQ.data?.rows ?? []).filter(isFoundryProjectIdentity)], [agents, managedQ.data]);
  const blueprints = useMemo(() => blueprintsQ.data?.rows ?? [], [blueprintsQ.data]);
  const blueprintById = useMemo(() => new Map(blueprints.map((b) => [b.native_id, b])), [blueprints]);

  // Foundry is read once for every tenant: its rows belong to subscriptions, so
  // the tenant chosen above narrows them by the subscriptions under it.
  const foundryQ = useListAzureFoundryQuery();
  const foundry = useMemo(() => {
    const tenant = connectors.find((c) => c.id === connectorId);
    return groupFoundry(foundryRowsOf(foundryQ.data?.rows ?? [], connectors, tenant), foundryQ.data?.trusts ?? []);
  }, [foundryQ.data, connectors, connectorId]);

  const listQ = view === "blueprints" ? blueprintsQ : agentsQ;
  const listLoading = view === "blueprints" ? blueprintsQ.isLoading : agentsQ.isLoading || managedQ.isLoading;
  const rows = view === "blueprints" ? blueprints : allAgents;
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    return rows.filter((r) => agentMatches(r, search));
  }, [rows, search]);

  const paged = useClientPaging(filtered, pageSize, `${view}|${connectorId ?? ""}|${search.trim()}|${pageSize}`);
  const truncation = {
    truncated: !!listQ.data && listQ.data.totalKnown && listQ.data.total > rows.length,
    shown: rows.length,
    total: listQ.data?.total ?? rows.length,
    totalKnown: !!listQ.data?.totalKnown,
  };

  const identityColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 300,
        cell: ({ row }) => <AgentNameCell identity={row.original} noun="identity" />,
      },
      {
        id: "blueprint",
        header: () => <AzureTerm term="Agent identity blueprint">Blueprint</AzureTerm>,
        label: "Blueprint",
        priority: 2,
        approxWidth: 200,
        cell: ({ row }) => {
          const id = row.original.attrs?.["agent_blueprint_id"];
          const bp = typeof id === "string" ? blueprintById.get(id) : undefined;
          if (bp) {
            return (
              <Link to={agentPageHref(bp)} onClick={(e) => e.stopPropagation()} title={bp.name} className="block truncate text-xs hover:underline">
                {agentDisplayName(bp)}
              </Link>
            );
          }
          const name = row.original.attrs?.["agent_blueprint_name"];
          if (typeof name === "string" && name) return <span className="block truncate text-xs">{name}</span>;
          return <span className="text-xs text-(--color-text-muted)">None</span>;
        },
      },
      {
        id: "uses_agent_identity",
        header: () => <AzureTerm term="Uses agent identity" />,
        label: "Uses agent identity",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => <span className="text-xs">{usesAgentIdentity(row.original) ? "Yes" : "No"}</span>,
      },
      { id: "sponsors", header: () => <AzureTerm term="Sponsors" />, label: "Sponsors", priority: 3, approxWidth: 170, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "sponsors")} /> },
      { id: "status", header: () => <AzureTerm term="Status" />, label: "Status", priority: 2, approxWidth: 100, cell: ({ row }) => <AgentStatus enabled={row.original.enabled} /> },
      {
        id: "last_sign_in",
        header: () => <AzureTerm term="Last sign-in" />,
        label: "Last sign-in",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => (row.original.last_used_at ? <RelativeDate iso={row.original.last_used_at} /> : <span className={MUTED}>Never</span>),
      },
      {
        id: "created",
        header: "Created",
        priority: 5,
        approxWidth: 110,
        cell: ({ row }) => (row.original.created_at ? <RelativeDate iso={row.original.created_at} /> : <span className={MUTED}>—</span>),
      },
      { id: "owners", header: () => <AzureTerm term="Owners" />, label: "Owners", priority: 6, approxWidth: 170, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "owners")} /> },
    ],
    [blueprintById],
  );

  const blueprintColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 300,
        cell: ({ row }) => <AgentNameCell identity={row.original} noun="blueprint" />,
      },
      {
        id: "agents",
        header: () => <AzureTerm term="Agent identities" />,
        label: "Agent identities",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => <span className="text-xs tabular-nums">{agents.filter((a) => a.attrs?.["agent_blueprint_id"] === row.original.native_id).length}</span>,
      },
      { id: "sponsors", header: () => <AzureTerm term="Sponsors" />, label: "Sponsors", priority: 3, approxWidth: 170, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "sponsors")} /> },
      { id: "status", header: () => <AzureTerm term="Status" />, label: "Status", priority: 2, approxWidth: 100, cell: ({ row }) => <AgentStatus enabled={row.original.enabled} /> },
      { id: "created", header: "Created", priority: 4, approxWidth: 110, cell: ({ row }) => <RelativeDate iso={row.original.created_at} /> },
      { id: "owners", header: () => <AzureTerm term="Owners" />, label: "Owners", priority: 5, approxWidth: 170, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "owners")} /> },
      {
        id: "publisher",
        header: () => <AzureTerm term="Publisher domain">Publisher</AzureTerm>,
        label: "Publisher",
        priority: 6,
        approxWidth: 140,
        cell: ({ row }) => <span className="text-xs">{(row.original.attrs?.["publisher_domain"] as string) || "—"}</span>,
      },
    ],
    [agents],
  );

  // The Foundry view lists projects (and any resource with none), so its chip counts those rows.
  const foundryObjects = foundry.reduce((n, f) => n + (f.children.length || 1), 0);
  const sourceSelect = <AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={(v) => setParam("source", v)} allLabel="Every tenant" />;
  const viewChips = (
    <AWSFilterChips
      label="Entra Agent ID view"
      active={view}
      onSelect={(key) => {
        const next = new URLSearchParams(params);
        if (key === "overview") next.delete("agents");
        else next.set("agents", key);
        next.delete("size");
        setParams(next, { replace: true });
      }}
      options={[
        { key: "overview", label: "Overview", hint: azureExplain("Overview") },
        { key: "identities", label: "Agent identities", count: agentsQ.data && managedQ.data ? allAgents.length : undefined, hint: azureExplain("Agent identities") },
        { key: "blueprints", label: "Blueprints", count: blueprintsQ.data ? blueprints.length : undefined, hint: azureExplain("Agent identity blueprints") },
        { key: "foundry", label: "Foundry", count: foundryQ.data ? foundryObjects : undefined, hint: azureExplain("Microsoft Foundry") },
      ]}
    />
  );

  const noun = view === "identities" ? "agent identities" : view === "blueprints" ? "blueprints" : view === "foundry" ? "projects" : "agents";
  const listView = view === "identities" || view === "blueprints";
  return (
    <div className="space-y-4 p-4">
      <InventoryToolbar
        chips={viewChips}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={view === "foundry" ? "Search projects or agents" : "Search by name, sponsor or owner"}
        searchAt="end"
        controls={sourceSelect}
        applied={connectorId ? [{ key: "source", label: `Tenant: ${connectorLabel(options.find((c) => c.id === connectorId))}`, onRemove: () => setParam("source", null) }] : []}
        onClearAll={() => {
          setParam("source", null);
          setSearch("");
        }}
        shown={listView ? filtered.length : 0}
        total={listView ? rows.length : 0}
        noun={noun}
        showCount={listView}
      />

      {/* Keyed by view: the content fades in on each switch rather than snapping. */}
      <div key={view} className="space-y-4 animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
        {view === "overview" ? (
          <AzureAgentOverview connectorId={connectorId} search={search} />
        ) : view === "foundry" ? (
          <AzureFoundryTable query={foundryQ} nodes={foundry} agents={allAgents} search={search} />
        ) : (
          <>
      <TruncationNotice truncation={truncation} noun={noun} narrowBy="Choose a tenant to read fewer. Search narrows only the rows already loaded." />

      <ListFrame
        loading={listLoading}
        failed={listQ.isError && !rows.length}
        error={listQ.error}
        onRetry={() => void listQ.refetch()}
        empty={!rows.length}
        noMatch={!filtered.length}
        emptyText={view === "identities" ? "No agent identities found in this tenant." : "No agent identity blueprints found in this tenant."}
      >
        <AdaptiveTable
          key={view}
          sizing="fit"
          cardsBelow={640}
          tableId={`azure-agents-${view}`}
          columns={view === "identities" ? identityColumns : blueprintColumns}
          data={paged.pageRows}
          getRowId={(r) => r.id}
          enableSelection={false}
          enableExpansion={false}
          enableSorting={false}
          enablePagination={false}
          rowDetails={false}
          onRowClick={(r) => navigate(agentPageHref(r))}
        />
        <CursorPager
          meta={paged.meta}
          pageIndex={paged.pageIndex}
          rowsOnPage={paged.pageRows.length}
          onPrev={paged.onPrev}
          onNext={paged.onNext}
          pageSize={pageSize}
          onPageSize={(n) => setParam("size", pageSizeParam(n))}
        />
      </ListFrame>
          </>
        )}
      </div>
    </div>
  );
}
