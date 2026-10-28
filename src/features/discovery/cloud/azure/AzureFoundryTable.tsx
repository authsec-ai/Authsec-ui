/**
 * Microsoft Foundry, one row per project, since a project is where a team's
 * agents live: its agents (counted the way the Entra admin center counts them),
 * the models its Foundry resource has deployed, and where and how that resource
 * can be reached. A row opens to the project's agents, model deployments and
 * connections; the name opens the project's own page.
 *
 * A Foundry resource, hub or workspace with no project is listed on its own row.
 */

import { ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import type { AzureFoundry, AzureIdentity, CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { StatusBadge } from "@/components/console/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ListFrame } from "./AzureDiscoveryShared";
import { AzureTerm } from "./AzureTerm";
import { agentDisplayName, agentMatches, agentPageHref, agentSource, usesAgentIdentity } from "./azureAgentSource";
import { foundryKindLabel } from "./azureDiscoveryLabels";
import type { FoundryConnection, FoundryNode } from "./azureFoundry";

const COLS = 5;
const MUTED = "text-xs text-(--color-text-muted)";
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

const CONNECTION_SERVICE: Record<string, string> = {
  AppInsights: "Application Insights",
  CognitiveSearch: "Azure AI Search",
  AzureBlob: "Blob Storage",
  AzureStorageAccount: "Storage",
  AzureOpenAI: "Azure OpenAI",
  AIServices: "Azure AI services",
  KeyVault: "Key Vault",
  CosmosDB: "Cosmos DB",
  ApiKey: "API",
  CustomKeys: "Custom",
  RemoteTool: "Remote tool",
};
const CONNECTION_AUTH: Record<string, string> = {
  AAD: "Entra ID",
  ApiKey: "API key",
  ManagedIdentity: "Managed identity",
  ProjectManagedIdentity: "Project identity",
  AgenticIdentity: "Agent identity",
  AccountKey: "Account key",
  AccessKey: "Access key",
  CustomKeys: "Custom keys",
  ServicePrincipal: "Service principal",
  None: "None",
};

/** A Foundry object's short name: a project's without its resource prefix ("account/project" → "project"). */
function shortName(n: FoundryNode): string {
  const name = n.workload.name || n.workload.native_id;
  return str(n.workload.attrs?.["display_name"]) || name.split("/").pop() || name;
}

const pageHref = (n: FoundryNode) => `/iga/azure/workload/${encodeURIComponent(n.workload.native_id)}`;

/** One row: a project and the Foundry resource it belongs to, or a resource with no project. */
interface Line {
  key: string;
  /** The project; undefined for a resource with no project. */
  project?: FoundryNode;
  resource: FoundryNode;
}

function linesOf(nodes: FoundryNode[]): Line[] {
  return nodes.flatMap((r) =>
    r.children.length ? r.children.map((p) => ({ key: p.workload.id, project: p, resource: r })) : [{ key: r.workload.id, resource: r }],
  );
}

/** The agents of a project, as the Entra admin center lists them: its agent identities, and the project's own identity when its agents run as it. */
function agentsOf(line: Line, agents: AzureIdentity[]): AzureIdentity[] {
  if (!line.project) return [];
  const project = shortName(line.project);
  const account = line.resource.workload.name;
  return agents.filter((a) => {
    const s = agentSource(a);
    return s.kind === "foundry" && s.project === project && (!s.account || s.account === account);
  });
}

function Block({ title, term, children, count }: { title: string; term: string; count: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium text-(--color-text)">
        <AzureTerm term={term}>{title}</AzureTerm>
        <span className="ml-1.5 font-normal text-(--color-text-muted)">{count}</span>
      </p>
      {children}
    </div>
  );
}

function Detail({ line, agents }: { line: Line; agents: AzureIdentity[] }) {
  const { project, resource } = line;
  const connections: FoundryConnection[] = project?.connections.length ? project.connections : resource.connections;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {project ? (
        <Block title="Agents" term="Agent identities" count={agents.length}>
          {agents.length ? (
            <ul className="space-y-1">
              {agents.map((a) => (
                <li key={a.id} className="truncate text-xs">
                  <Link to={agentPageHref(a)} className="text-(--color-text) hover:underline">
                    {agentDisplayName(a)}
                  </Link>
                  <span className="text-(--color-text-muted)"> · {usesAgentIdentity(a) ? "agent identity" : "project identity"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={MUTED}>None</p>
          )}
        </Block>
      ) : null}
      <Block title="Model deployments" term="Model deployments" count={resource.deployments.length}>
        {resource.deployments.length ? (
          <ul className="space-y-1">
            {resource.deployments.map((d) => (
              <li key={d.name} className="truncate text-xs">
                <span className="text-(--color-text)">{d.name}</span>
                {/* "gpt-4.1-mini · 2025-04-14" when named after its model, else "name · model version". */}
                {(d.model === d.name ? [d.model_version] : [d.model, d.model_version]).filter(Boolean).length ? (
                  <span className="text-(--color-text-muted)"> · {(d.model === d.name ? [d.model_version] : [d.model, d.model_version]).filter(Boolean).join(" ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={MUTED}>None</p>
        )}
      </Block>
      <Block title="Connections" term="Connections" count={connections.length}>
        {connections.length ? (
          <ul className="space-y-1">
            {connections.map((c) => (
              <li key={c.name} className="truncate text-xs">
                <span className="text-(--color-text)">{(c.category && CONNECTION_SERVICE[c.category]) || c.category || c.name}</span>
                {c.auth_type ? <span className="text-(--color-text-muted)"> · {CONNECTION_AUTH[c.auth_type] ?? c.auth_type}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={MUTED}>None</p>
        )}
      </Block>
    </div>
  );
}

function Row({ line, agents }: { line: Line; agents: AzureIdentity[] }) {
  const [open, setOpen] = useState(false);
  const { project, resource } = line;
  const own = agentsOf(line, agents);
  const access = str(resource.workload.attrs?.["public_network_access"]);
  const main = project ?? resource;
  return (
    <Fragment>
      <TableRow onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <TableCell className="max-w-[420px]">
          <div className="flex items-center gap-2">
            <ChevronRight className={`size-4 shrink-0 text-(--color-text-muted) transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
            <div className="min-w-0">
              <Link to={pageHref(main)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-(--color-text) hover:underline">
                {shortName(main)}
              </Link>
              <p className="mt-0.5 truncate text-xs text-(--color-text-muted)">
                {project ? `in ${shortName(resource)}` : `${foundryKindLabel(resource.foundryKind, resource.workload.runtime_kind)} · no projects`}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-xs tabular-nums">{project ? own.length : "—"}</TableCell>
        <TableCell className="text-xs tabular-nums">{resource.deployments.length}</TableCell>
        <TableCell className="text-xs text-(--color-text-muted)">{resource.workload.region || "—"}</TableCell>
        <TableCell>{access ? <StatusBadge tone={access === "Enabled" ? "warning" : "success"}>{access === "Enabled" ? "Public" : "Private"}</StatusBadge> : <span className={MUTED}>—</span>}</TableCell>
      </TableRow>
      {open ? (
        <TableRow className="bg-(--color-surface-subtle) hover:bg-(--color-surface-subtle)">
          <TableCell colSpan={COLS} className="whitespace-normal py-4 pl-12">
            <Detail line={line} agents={own} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}

export function AzureFoundryTable({
  query,
  nodes,
  agents,
  search = "",
}: {
  query: { isLoading: boolean; isError: boolean; error?: Parameters<typeof ListFrame>[0]["error"]; refetch: () => unknown; data?: AzureFoundry };
  nodes: FoundryNode[];
  /** Every agent, as the Entra Agent ID view lists them (agent identities and Foundry project identities). */
  agents: AzureIdentity[];
  connectors?: CloudConnector[];
  /** Narrows to projects whose name, resource or agents match. */
  search?: string;
}) {
  const q = search.trim().toLowerCase();
  const lines = linesOf(nodes).filter(
    (l) =>
      !q ||
      [shortName(l.project ?? l.resource), shortName(l.resource)].some((v) => v.toLowerCase().includes(q)) ||
      agentsOf(l, agents).some((a) => agentMatches(a, q)),
  );
  return (
    <ListFrame
      loading={query.isLoading}
      failed={query.isError && !query.data}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={!nodes.length}
      noMatch={!!q && !lines.length}
      emptyText="No Microsoft Foundry projects found in the connected subscriptions."
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>
              <AzureTerm term="Foundry project">Project</AzureTerm>
            </TableHead>
            <TableHead>
              <AzureTerm term="Agent identities">Agents</AzureTerm>
            </TableHead>
            <TableHead>
              <AzureTerm term="Model deployments">Models</AzureTerm>
            </TableHead>
            <TableHead>
              <AzureTerm term="Region" />
            </TableHead>
            <TableHead>
              <AzureTerm term="Public network access">Network</AzureTerm>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <Row key={l.key} line={l} agents={agents} />
          ))}
        </TableBody>
      </Table>
    </ListFrame>
  );
}
