/**
 * Microsoft Foundry on the Azure Agents tab: each Foundry resource with its
 * projects, each hub with its hub-based projects, and Machine Learning
 * workspaces; their model deployments, connections and agent applications, and
 * which identities their managed identities are trusted by. Read from
 * `/authsec/discovery/azure/foundry`. Facts as Microsoft returned them: nothing
 * is rated.
 */

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { AzureFoundry, AzureFoundryTrust, CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { EntityCell } from "@/components/console/iam-console";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Fact, Facts, Panel } from "@/features/iga/shared/components/Panel";

import { CloudPill } from "../CloudPill";
import { ListFrame, RelativeDate } from "./AzureDiscoveryShared";
import { agentTypeLabel, connectorLabel, foundryKindLabel, identityKindLabel } from "./azureDiscoveryLabels";
import type { FoundryConnection, FoundryDeployment, FoundryNode } from "./azureFoundry";

const MUTED = "text-xs text-muted-foreground";

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const identityHref = (objectId: string) => `/iga/azure/identity/${encodeURIComponent(objectId)}`;

function yesNo(v: unknown): string {
  return v === true ? "Yes" : v === false ? "No" : "Not recorded";
}

function DeploymentLine({ d }: { d: FoundryDeployment }) {
  const model = [d.model, d.model_version].filter(Boolean).join(" ");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="font-medium">{d.name}</span>
        {model ? <span className={`ml-2 ${MUTED}`}>{model}</span> : null}
      </span>
      <span className={MUTED}>
        {[d.publisher, d.sku, d.capacity !== undefined ? `capacity ${d.capacity}` : undefined, d.state].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function ConnectionLine({ c }: { c: FoundryConnection }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{c.name}</span>
        {c.category ? (
          <CloudPill tone="muted" dot={false}>
            {c.category}
          </CloudPill>
        ) : null}
        {c.auth_type ? (
          <CloudPill tone="muted" dot={false}>
            {c.auth_type}
          </CloudPill>
        ) : null}
      </div>
      <p className={MUTED}>
        {c.target ? <span className="break-all">{c.target}</span> : "No target recorded"}
        {c.secret_based ? " · uses a stored credential" : c.uses_project_identity ? " · uses the project's identity" : ""}
        {c.shared_to_all ? " · shared with every project" : ""}
      </p>
    </div>
  );
}

function TrustLine({ t }: { t: AzureFoundryTrust }) {
  const agentType = agentTypeLabel({ attrs: { agent_type: t.trusted_agent_type } });
  return (
    <div className="space-y-0.5">
      <p>
        <span className="font-medium">{t.trusted_name || t.trusted_identity_id}</span>
        <span className={`ml-2 ${MUTED}`}>{agentType ?? identityKindLabel(t.trusted_kind)}</span>
      </p>
      <p className={MUTED}>
        Has a federated credential naming this managed identity
        {t.agent_name ? (
          <>
            {" "}
            · obtains the tokens of agent identity{" "}
            {t.agent_object_id ? (
              <Link to={identityHref(t.agent_object_id)} className="text-(--color-primary-text) hover:underline">
                {t.agent_name}
              </Link>
            ) : (
              t.agent_name
            )}
          </>
        ) : null}
      </p>
    </div>
  );
}

function Rows<T>({ title, rows, empty, render }: { title: string; rows: T[]; empty?: string; render: (r: T) => React.ReactNode }) {
  if (!rows.length && !empty) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-(--color-text)">
        {title} <span className="font-normal tabular-nums text-(--color-text-muted)">{rows.length}</span>
      </h4>
      {rows.length ? (
        <ul className="divide-y rounded-md border">
          {rows.map((r, i) => (
            <li key={i} className="px-3 py-2 text-[13px]">
              {render(r)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={MUTED}>{empty}</p>
      )}
    </div>
  );
}

export function FoundryNodeBody({ n }: { n: FoundryNode }) {
  const a = n.workload.attrs ?? {};
  const isProject = n.foundryKind === "project" || n.foundryKind === "hub_project";
  return (
    <div className="space-y-3">
      <Facts>
        <Fact label="Runs as">
          {n.principalId ? (
            <Link to={identityHref(n.principalId)} className="text-(--color-primary-text) hover:underline">
              {n.workload.identity_name || n.principalId}
            </Link>
          ) : (
            "No managed identity recorded"
          )}
        </Fact>
        {str(a["endpoint"]) ? (
          <Fact label="Endpoint" mono>
            {str(a["endpoint"])!}
          </Fact>
        ) : null}
        {a["public_network_access"] !== undefined ? <Fact label="Public network access">{str(a["public_network_access"]) ?? "Not recorded"}</Fact> : null}
        {a["local_auth_enabled"] !== undefined ? <Fact label="API key sign-in allowed">{yesNo(a["local_auth_enabled"])}</Fact> : null}
        {str(a["sku"]) ? <Fact label="SKU">{str(a["sku"])!}</Fact> : null}
        {isProject && a["is_default"] !== undefined ? <Fact label="Default project">{yesNo(a["is_default"])}</Fact> : null}
        <Fact label="Last seen by AuthSec">
          <RelativeDate iso={n.workload.last_seen_at} />
        </Fact>
      </Facts>
      {n.incomplete ? <p className={MUTED}>Some of this object's detail could not be read in the last scan; what is shown is what was read.</p> : null}
      <Rows title="Model deployments" rows={n.deployments} render={(d) => <DeploymentLine d={d} />} />
      <Rows title="Connections" rows={n.connections} render={(c) => <ConnectionLine c={c} />} />
      {isProject ? (
        <Rows
          title="Agent applications"
          rows={n.agentApplications}
          empty={
            n.agentApplicationsUnavailable
              ? "Not readable: this project's agents are read from its data plane, which needs a Foundry data-plane role assigned to AuthSec."
              : "None recorded."
          }
          render={(app) => (
            <div className="space-y-0.5">
              <p className="font-medium">{app.display_name || app.name}</p>
              <p className={MUTED}>{app.agents?.length ? `Agents: ${app.agents.join(", ")}` : "No agents listed"}</p>
            </div>
          )}
        />
      ) : null}
      <Rows title="Trusted by" rows={n.trusts} render={(t) => <TrustLine t={t} />} />
    </div>
  );
}

/** A Foundry object's page: its facts, then its projects when it is a resource or hub. */
export function FoundryOverview({ node, projects }: { node: FoundryNode; projects: FoundryNode[] }) {
  return (
    <div className="space-y-4">
      <Panel title={nameOf(node)} count={foundryKindLabel(node.foundryKind, node.workload.runtime_kind)}>
        <FoundryNodeBody n={node} />
      </Panel>
      {projects.length ? (
        <Panel title="Projects" count={projects.length}>
          <ul className="divide-y divide-(--color-border-subtle)">
            {projects.map((p) => (
              <li key={p.workload.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <Link to={foundryHref(p)} className="font-medium text-(--color-primary-text) hover:underline">
                  {nameOf(p)}
                </Link>
                <span className={MUTED}>{foundryKindLabel(p.foundryKind, p.workload.runtime_kind)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

interface FoundryRow {
  node: FoundryNode;
  /** The resource a project belongs to, when it is one of its children. */
  parent?: FoundryNode;
}

function flatten(nodes: FoundryNode[]): FoundryRow[] {
  return nodes.flatMap((n) => [{ node: n }, ...n.children.map((p) => ({ node: p, parent: n }))]);
}

function nameOf(n: FoundryNode): string {
  return (str(n.workload.attrs?.["display_name"]) || n.workload.name || n.workload.native_id) ?? "";
}

/** A Foundry object opens its own page, keyed by its ARM id, like every other Azure row. */
export function foundryHref(n: Pick<FoundryNode, "workload">): string {
  return `/iga/azure/workload/${encodeURIComponent(n.workload.native_id)}`;
}

export function AzureFoundryView({
  query,
  nodes,
  connectors,
}: {
  query: { isLoading: boolean; isError: boolean; error?: Parameters<typeof ListFrame>[0]["error"]; refetch: () => unknown; data?: AzureFoundry };
  nodes: FoundryNode[];
  connectors: CloudConnector[];
}) {
  const navigate = useNavigate();
  const rows = useMemo(() => flatten(nodes), [nodes]);
  const subscription = (id: string) => connectorLabel(connectors.find((c) => c.id === id));

  const columns = useMemo<AdaptiveColumn<FoundryRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={
              <Link to={foundryHref(row.original.node)} onClick={(e) => e.stopPropagation()} className="hover:underline">
                {nameOf(row.original.node)}
              </Link>
            }
            detail={<span className={MUTED}>{row.original.parent ? `Project of ${nameOf(row.original.parent)}` : foundryKindLabel(row.original.node.foundryKind, row.original.node.workload.runtime_kind)}</span>}
          />
        ),
      },
      {
        id: "type",
        header: "Type",
        priority: 2,
        approxWidth: 170,
        cell: ({ row }) => <span className="text-xs">{foundryKindLabel(row.original.node.foundryKind, row.original.node.workload.runtime_kind)}</span>,
      },
      {
        id: "subscription",
        header: "Subscription",
        priority: 3,
        approxWidth: 180,
        cell: ({ row }) => <span className="text-xs">{subscription(row.original.node.workload.connector_id)}</span>,
      },
      {
        id: "region",
        header: "Region",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => <span className="text-xs">{row.original.node.workload.region || "—"}</span>,
      },
      {
        id: "deployments",
        header: "Models",
        priority: 5,
        approxWidth: 90,
        cell: ({ row }) => <span className="text-xs tabular-nums">{row.original.node.deployments.length}</span>,
      },
      {
        id: "last_seen",
        header: "Last seen",
        priority: 6,
        approxWidth: 140,
        cell: ({ row }) => <RelativeDate iso={row.original.node.workload.last_seen_at} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectors],
  );

  return (
    <ListFrame
      loading={query.isLoading}
      failed={query.isError && !query.data}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={!nodes.length}
      noMatch={false}
      emptyText="No Microsoft Foundry resource, hub or Machine Learning workspace was recorded. They are read from each connected subscription with Reader; the connection's Coverage tab says whether that read ran."
    >
      <AdaptiveTable
        tableId="azure-agents-foundry"
        sizing="fit"
        columns={columns}
        data={rows}
        getRowId={(r) => r.node.workload.id}
        enableSelection={false}
        enableExpansion={false}
        rowDetails={false}
        onRowClick={(r) => navigate(foundryHref(r.node))}
        pagination={{ pageSize: 25, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
      />
    </ListFrame>
  );
}
