/**
 * Microsoft Foundry as discovery recorded it (`/authsec/discovery/azure/foundry`),
 * grouped the way the Foundry portal shows it: a Foundry resource with its
 * projects, a hub with its hub-based projects, and Machine Learning workspaces
 * on their own. Facts only, read from each workload's attrs.
 */

import type { AzureFoundryTrust, AzureWorkload, CloudConnector } from "@/app/api/cloudDiscoveryApi";

export interface FoundryDeployment {
  name: string;
  model?: string;
  model_version?: string;
  model_format?: string;
  publisher?: string;
  sku?: string;
  capacity?: number;
  content_filter?: string;
  version_upgrade?: string;
  state?: string;
}

export interface FoundryConnection {
  name: string;
  category?: string;
  auth_type?: string;
  target?: string;
  shared_to_all?: boolean;
  uses_project_identity?: boolean;
  secret_based?: boolean;
}

export interface FoundryAgentApplication {
  name: string;
  display_name?: string;
  resource_id?: string;
  provisioning_state?: string;
  authorization?: unknown;
  agents?: string[];
}

export interface FoundryNode {
  workload: AzureWorkload;
  foundryKind: string;
  /** The object id of its managed identity, when it has one. */
  principalId?: string;
  deployments: FoundryDeployment[];
  connections: FoundryConnection[];
  agentApplications: FoundryAgentApplication[];
  /** True when Microsoft did not let AuthSec read the project's agent applications. */
  agentApplicationsUnavailable: boolean;
  /** True when some of its detail could not be read in the last scan. */
  incomplete: boolean;
  trusts: AzureFoundryTrust[];
  children: FoundryNode[];
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as T[]) : []);
const lower = (v: string | undefined) => v?.toLowerCase();

export function foundryNodeOf(w: AzureWorkload, trusts: AzureFoundryTrust[]): FoundryNode {
  const a = w.attrs ?? {};
  const principalId = lower(str(a["principal_id"]));
  return {
    workload: w,
    foundryKind: str(a["foundry_kind"]) ?? "",
    principalId,
    deployments: list<FoundryDeployment>(a["deployments"]),
    connections: list<FoundryConnection>(a["connections"]),
    agentApplications: list<FoundryAgentApplication>(a["agent_applications"]),
    agentApplicationsUnavailable: a["agent_applications_unavailable"] === true,
    incomplete: a["detail_incomplete"] === true,
    trusts: principalId ? trusts.filter((t) => t.principal_id.toLowerCase() === principalId) : [],
    children: [],
  };
}

/** The Foundry rows of one tenant, or of every tenant when `tenant` is undefined. */
export function foundryRowsOf(rows: AzureWorkload[], connectors: CloudConnector[], tenant: CloudConnector | undefined): AzureWorkload[] {
  if (!tenant) return rows;
  const tid = tenant.scope_id.toLowerCase();
  const subs = new Set(connectors.filter((c) => c.scope_kind === "subscription" && c.parent_scope_id?.toLowerCase() === tid).map((c) => c.id));
  return rows.filter((w) => subs.has(w.connector_id));
}

/** Top-level Foundry objects, each with its projects; a project whose parent
 * was not read is listed on its own rather than dropped. */
export function groupFoundry(rows: AzureWorkload[], trusts: AzureFoundryTrust[]): FoundryNode[] {
  const nodes = rows.map((w) => foundryNodeOf(w, trusts));
  const byResourceId = new Map<string, FoundryNode>();
  for (const n of nodes) {
    const id = lower(str(n.workload.attrs?.["resource_id"])) ?? lower(n.workload.native_id);
    if (id && (n.foundryKind === "account" || n.foundryKind === "hub")) byResourceId.set(id, n);
  }
  const top: FoundryNode[] = [];
  for (const n of nodes) {
    const parentId = n.foundryKind === "project" ? lower(str(n.workload.attrs?.["account_id"])) : n.foundryKind === "hub_project" ? lower(str(n.workload.attrs?.["hub_id"])) : undefined;
    const parent = parentId ? byResourceId.get(parentId) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else top.push(n);
  }
  const byName = (a: FoundryNode, b: FoundryNode) => (a.workload.name || a.workload.native_id).localeCompare(b.workload.name || b.workload.native_id);
  for (const n of top) n.children.sort(byName);
  return top.sort(byName);
}

/** The counts a reader looks for first. */
export function foundryCounts(nodes: FoundryNode[]) {
  const all = nodes.flatMap((n) => [n, ...n.children]);
  return {
    objects: all.length,
    projects: all.filter((n) => n.foundryKind === "project" || n.foundryKind === "hub_project").length,
    deployments: all.reduce((s, n) => s + n.deployments.length, 0),
    agentApplications: all.reduce((s, n) => s + n.agentApplications.length, 0),
    agents: all.reduce((s, n) => s + n.agentApplications.reduce((t, a) => t + (a.agents?.length ?? 0), 0), 0),
  };
}
