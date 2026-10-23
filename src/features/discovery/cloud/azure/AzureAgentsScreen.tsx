/**
 * Azure Agents: Microsoft Entra Agent ID objects in one place, laid out the way
 * the Entra admin center lists them (agent identity, its blueprint, owners and
 * sponsors, status, created), and Microsoft Foundry (its resources, projects,
 * model deployments and agent applications). Counts and facts only; nothing is
 * rated.
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
import { EntityCell } from "@/components/console/iam-console";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";

import { CloudPill } from "../CloudPill";
import { InventoryToolbar } from "../InventoryToolbar";
import { AWSFilterChips } from "../aws/AWSFilterChips";
import { TruncationNotice } from "../aws/AWSInventoryNotices";
import { ALL, AzureSourceSelect, CopyableId, ListFrame, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { AzureFoundryView } from "./AzureFoundryView";
import { foundryCounts, foundryRowsOf, groupFoundry } from "./azureFoundry";
import { azureSourceFor, azureSourcesFor, connectorLabel, refsOf } from "./azureDiscoveryLabels";
import { pageSizeParam, parsePageSize, useClientPaging } from "./azurePaging";

type View = "identities" | "blueprints" | "foundry";

const KIND_ARGS = {
  identities: { kind: "entra_agent_identity" },
  blueprints: { kind: "entra_application", agent_type: "agent_identity_blueprint" },
} as const;

/** An agent or blueprint opens its own page, keyed by its Entra object id. */
const detailHref = (r: Pick<AzureIdentity, "native_id">) => `/iga/azure/identity/${encodeURIComponent(r.native_id)}`;

function NameLink({ r, children }: { r: AzureIdentity; children: string }) {
  return (
    <Link to={detailHref(r)} onClick={(e) => e.stopPropagation()} className="hover:underline" title={children}>
      {children}
    </Link>
  );
}

function createdBy(r: AzureIdentity): string | undefined {
  const c = r.attrs?.["created_by"] as { by?: string } | undefined;
  return c?.by || undefined;
}

export default function AzureAgentsScreen({ connectors }: { connectors: CloudConnector[] }) {
  const [params, setParams] = useSearchParams();
  const agentsParam = params.get("agents");
  const view: View = agentsParam === "blueprints" ? "blueprints" : agentsParam === "foundry" ? "foundry" : "identities";
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
  const scope = { connector_id: connectorId };

  // Foundry is read once for every tenant: its rows belong to subscriptions, so
  // the tenant chosen above narrows them by the subscriptions under it.
  const foundryQ = useListAzureFoundryQuery();
  const foundry = useMemo(() => {
    const tenant = connectors.find((c) => c.id === connectorId);
    const rows = foundryRowsOf(foundryQ.data?.rows ?? [], connectors, tenant);
    return groupFoundry(rows, foundryQ.data?.trusts ?? []);
  }, [foundryQ.data, connectors, connectorId]);
  const foundryTotals = foundryCounts(foundry);

  const q = useListAzureIdentitiesQuery({ ...scope, ...KIND_ARGS[view === "foundry" ? "identities" : view], limit: AWS_DISCOVERY_MAX_LIMIT }, { skip: view === "foundry" });
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

  const paged = useClientPaging(filtered, pageSize, `${view}|${connectorId ?? ""}|${search.trim()}|${pageSize}`);
  const truncation = { truncated: !!q.data && q.data.totalKnown && q.data.total > rows.length, shown: rows.length, total: q.data?.total ?? rows.length, totalKnown: !!q.data?.totalKnown };

  const identityColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "AI agent",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 340,
        cell: ({ row }) => (
          <EntityCell
            label={<NameLink r={row.original}>{row.original.name || "Unnamed AI agent"}</NameLink>}
            detail={<CopyableId value={row.original.native_id} what="Object ID" />}
          />
        ),
      },
      {
        id: "blueprint",
        header: "Built from template",
        priority: 2,
        approxWidth: 220,
        cell: ({ row }) => {
          const name = row.original.attrs?.["agent_blueprint_name"];
          return typeof name === "string" && name ? (
            <span className="block truncate text-xs" title={name}>
              {name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No template recorded</span>
          );
        },
      },
      { id: "sponsors", header: "Sponsor (accountable person)", priority: 3, approxWidth: 210, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "sponsors")} empty="No sponsor listed" /> },
      { id: "owners", header: "Owners (can change it)", priority: 4, approxWidth: 210, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "owners")} empty="No owner listed" /> },
      {
        id: "status",
        header: "Switched on",
        priority: 5,
        approxWidth: 100,
        cell: ({ row }) => (
          <CloudPill tone="muted" dot={false} title={row.original.enabled ? "Can sign in and use its permissions" : "Off: this agent cannot sign in"}>
            {row.original.enabled ? "On" : "Off"}
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
            {createdBy(row.original) ? <span className="block text-muted-foreground">Created by {createdBy(row.original)}</span> : null}
          </span>
        ),
      },
      { id: "last_sign_in", header: "Last used", priority: 7, approxWidth: 120, cell: ({ row }) => <RelativeDate iso={row.original.last_used_at} /> },
    ],
    [],
  );

  const blueprintColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Agent template",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 340,
        cell: ({ row }) => (
          <EntityCell
            label={<NameLink r={row.original}>{row.original.name || "Unnamed template"}</NameLink>}
            detail={<CopyableId value={row.original.native_id} what="Object ID" />}
          />
        ),
      },
      {
        id: "agents",
        header: "Agents made from it",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => {
          const n = row.original.attrs?.["agent_count"];
          return <span className="text-xs tabular-nums">{typeof n === "number" ? n : "Not recorded"}</span>;
        },
      },
      { id: "sponsors", header: "Sponsor (accountable person)", priority: 3, approxWidth: 210, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "sponsors")} empty="No sponsor listed" /> },
      { id: "owners", header: "Owners (can change it)", priority: 4, approxWidth: 210, cell: ({ row }) => <RefNames refs={refsOf(row.original.attrs, "owners")} empty="No owner listed" /> },
      {
        id: "publisher",
        header: "Publisher website",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) => {
          const domain = (row.original.attrs?.["publisher_domain"] as string) || "Not stated";
          return (
            <span className="block truncate text-xs" title={domain}>
              {domain}
            </span>
          );
        },
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

  const noun = view === "identities" ? "AI agents" : "agent templates";
  const sourceSelect = <AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={(v) => setParam("source", v)} allLabel="All Microsoft accounts" />;
  const viewChips = (
    <AWSFilterChips
      label="Agent view"
      active={view}
      onSelect={(key) => {
        const next = new URLSearchParams(params);
        if (key === "identities") next.delete("agents");
        else next.set("agents", key);
        next.delete("size");
        setParams(next, { replace: true });
      }}
      options={[
        { key: "identities", label: "AI agents" },
        { key: "blueprints", label: "Agent templates" },
        { key: "foundry", label: "Microsoft Foundry (AI projects)" },
      ]}
    />
  );
  return (
    <div className="space-y-4">
      {/* The view chips and the source selector stay in this one row across every
          tab, in this same order, so switching to Microsoft Foundry — which has no
          search box — never shifts them: only what sits between the two changes. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {viewChips}
        {view === "foundry" ? (
          <p className="text-xs text-(--color-text-muted)">
            {foundryQ.data
              ? `${foundryTotals.objects} ${foundryTotals.objects === 1 ? "item" : "items"}: ${foundryTotals.projects} ${foundryTotals.projects === 1 ? "project" : "projects"}. ${foundryTotals.deployments} AI ${foundryTotals.deployments === 1 ? "model" : "models"} deployed. ${foundryTotals.agents} ${foundryTotals.agents === 1 ? "agent" : "agents"} found.`
              : "Reading Microsoft Foundry…"}
          </p>
        ) : null}
        <span className="ml-auto">{sourceSelect}</span>
      </div>
      {view === "foundry" ? (
        <AzureFoundryView query={foundryQ} nodes={foundry} connectors={connectors} />
      ) : (
        <>
          <div className="px-4">
          <InventoryToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name, ID, template or person"
            applied={connectorId ? [{ key: "source", label: `Source: ${connectorLabel(options.find((c) => c.id === connectorId))}`, onRemove: () => setParam("source", null) }] : []}
            onClearAll={() => {
              setParam("source", null);
              setSearch("");
            }}
            shown={filtered.length}
            total={rows.length}
            noun={noun}
          />
          </div>

          <TruncationNotice truncation={truncation} noun={noun} narrowBy="Choose a tenant to read fewer. Search narrows only the rows already loaded." />

          <ListFrame
            loading={q.isLoading}
            failed={q.isError && !rows.length}
            error={q.error}
            onRetry={() => void q.refetch()}
            empty={!rows.length}
            noMatch={!filtered.length}
            emptyText={
              view === "identities"
                ? "No AI agent was found in this directory. AuthSec reads them with the permission Read all agent identities (AgentIdentity.Read.All). The connection's Coverage tab shows whether that read ran. This is not proof there are none."
                : "No agent template was found. AuthSec reads them with the permission Read all agent identity blueprints (AgentIdentityBlueprint.Read.All). The connection's Coverage tab shows whether that read ran."
            }
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
              onRowClick={(r) => navigate(detailHref(r))}
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
  );
}
