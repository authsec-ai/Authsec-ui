/**
 * Azure Agents: Microsoft Entra Agent ID objects in one place, laid out the way
 * the Entra admin center lists them (agent identity, its blueprint, owners and
 * sponsors, status, created), and Microsoft Foundry (its resources, projects,
 * model deployments and agent applications). Counts and facts only; nothing is
 * rated.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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
import { PreviewLayout, type PreviewModel } from "@/features/iga/shared/components/ObjectPreview";
import { useElementWidth } from "@/features/iga/shared/components/useElementWidth";

import { StatusBadge } from "@/components/console/status";
import { InventoryToolbar } from "../InventoryToolbar";
import { AWSFilterChips } from "../aws/AWSFilterChips";
import { TruncationNotice } from "../aws/AWSInventoryNotices";
import { ALL, AzureSourceSelect, ListFrame, RelativeDate } from "./AzureDiscoveryShared";
import { AzureFoundryView, foundryPreview } from "./AzureFoundryView";
import { foundryCounts, foundryRowsOf, groupFoundry } from "./azureFoundry";
import { azureSourceFor, azureSourcesFor, connectorLabel, identityKindLabel, refsOf } from "./azureDiscoveryLabels";
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
    <Link to={detailHref(r)} onClick={(e) => e.stopPropagation()} className="hover:underline">
      {children}
    </Link>
  );
}

/** The side panel for an agent identity or blueprint: its facts, with the full page one click away. */
function identityPreview(r: AzureIdentity): PreviewModel {
  const people = (key: string) => refsOf(r.attrs, key).map((x) => x.name).filter(Boolean).join(", ");
  const blueprint = typeof r.attrs?.["agent_blueprint_name"] === "string" ? (r.attrs["agent_blueprint_name"] as string) : "";
  return {
    key: r.native_id,
    name: r.name || r.native_id,
    kindLabel: identityKindLabel(r.kind),
    provider: "azure",
    context: [],
    facts: [
      { label: "Blueprint", value: blueprint || "—" },
      { label: "Sponsors", value: people("sponsors") || "None recorded" },
      { label: "Owners", value: people("owners") || "None recorded" },
      { label: "Created", value: <RelativeDate iso={r.created_at} /> },
      { label: "Last sign-in", value: <RelativeDate iso={r.last_used_at} /> },
    ],
    exception: r.enabled === false ? "This agent is disabled in Microsoft Entra ID." : undefined,
    detailsHref: detailHref(r),
  };
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
  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const selectedKey = params.get("sel");
  const selectedRow = selectedKey ? rows.find((r) => r.native_id === selectedKey) : undefined;
  const selectedFoundry = selectedKey ? foundry.flatMap((n) => [n, ...n.children]).find((n) => n.workload.native_id === selectedKey) : undefined;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const bp = typeof r.attrs?.["agent_blueprint_name"] === "string" ? (r.attrs["agent_blueprint_name"] as string) : "";
      const people = [...refsOf(r.attrs, "sponsors"), ...refsOf(r.attrs, "owners")].map((p) => p.name ?? "");
      return [r.name, r.native_id, bp, ...people].some((v) => v.toLowerCase().includes(s));
    });
  }, [rows, search]);

  const truncation = { truncated: !!q.data && q.data.totalKnown && q.data.total > rows.length, shown: rows.length, total: q.data?.total ?? rows.length, totalKnown: !!q.data?.totalKnown };
  const paged = useClientPaging(filtered, pageSize, `${view}|${connectorId ?? ""}|${search.trim()}|${pageSize}`, truncation.truncated);

  const identityColumns = useMemo<AdaptiveColumn<AzureIdentity>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Agent identity",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 280,
        cell: ({ row }) => <EntityCell label={<NameLink r={row.original}>{row.original.name || row.original.native_id}</NameLink>} />,
      },
      {
        id: "status",
        header: "Status",
        priority: 5,
        approxWidth: 100,
        cell: ({ row }) => (row.original.enabled === false ? <StatusBadge tone="neutral">Disabled</StatusBadge> : <span className="text-xs text-muted-foreground">Enabled</span>),
      },
      { id: "last_sign_in", header: "Last seen", priority: 7, approxWidth: 120, cell: ({ row }) => <RelativeDate iso={row.original.last_used_at} /> },
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
          return <EntityCell label={<NameLink r={row.original}>{row.original.name || appId}</NameLink>} />;
        },
      },
      {
        id: "agents",
        header: "Agent identities",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => {
          const n = row.original.attrs?.["agent_count"];
          return <span className="text-xs tabular-nums">{typeof n === "number" ? n : "—"}</span>;
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

  const noun = view === "identities" ? "agent identities" : "agent identity blueprints";
  const sourceSelect = <AzureSourceSelect options={options} value={connectorId ?? ALL} onChange={(v) => setParam("source", v)} allLabel="Every tenant" />;
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
        { key: "identities", label: "Agent identities" },
        { key: "blueprints", label: "Agent identity blueprints" },
        { key: "foundry", label: "Microsoft Foundry" },
      ]}
    />
  );
  return (
    <div ref={rootRef} className="space-y-4">
      {view === "foundry" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            {viewChips}
            <p className="text-xs text-(--color-text-muted)">
              {foundryQ.data
                ? `${foundryTotals.objects} Foundry ${foundryTotals.objects === 1 ? "object" : "objects"} · ${foundryTotals.projects} ${foundryTotals.projects === 1 ? "project" : "projects"} · ${foundryTotals.deployments} model ${foundryTotals.deployments === 1 ? "deployment" : "deployments"} · ${foundryTotals.agentApplications} agent ${foundryTotals.agentApplications === 1 ? "application" : "applications"} (${foundryTotals.agents} ${foundryTotals.agents === 1 ? "agent" : "agents"})`
                : "Reading Microsoft Foundry…"}
            </p>
            <span className="ml-auto">{sourceSelect}</span>
          </div>
          <PreviewLayout
            width={rootWidth}
            model={selectedFoundry ? foundryPreview(selectedFoundry, connectors) : null}
            onClose={() => setParam("sel", null)}
            list={
              <AzureFoundryView
                query={foundryQ}
                nodes={foundry}
                connectors={connectors}
                onSelect={(id) => setParam("sel", id)}
                pageSize={pageSize}
                onPageSize={(n) => setParam("size", pageSizeParam(n))}
              />
            }
          />
        </>
      ) : (
        <>
          <div className="px-4 pt-3">
          <InventoryToolbar
            chips={viewChips}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={`Search ${noun} by name, ID, blueprint, sponsor or owner`}
            controls={sourceSelect}
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

          <PreviewLayout
            width={rootWidth}
            model={selectedRow ? identityPreview(selectedRow) : null}
            onClose={() => setParam("sel", null)}
            list={
          <ListFrame
            loading={q.isLoading}
            failed={q.isError && !rows.length}
            error={q.error}
            onRetry={() => void q.refetch()}
            empty={!rows.length}
            noMatch={!filtered.length}
            subject={view === "identities" ? "agent identities" : "agent identity blueprints"}
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
              data={paged.pageRows}
              getRowId={(r) => r.id}
              enableSelection={false}
              enableExpansion={false}
              enableSorting={false}
              enablePagination={false}
              rowDetails={false}
              onRowClick={(r) => setParam("sel", r.native_id)}
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
            }
          />
        </>
      )}
    </div>
  );
}
