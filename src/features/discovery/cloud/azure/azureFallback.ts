/**
 * While the shared graph is unavailable (its schema not yet verified), Azure's
 * Identities, Resources and Workloads are read from the Azure discovery routes
 * (`/authsec/discovery/azure/{identities,resources,workloads}`), which read the
 * scan tables directly -- as AWS's "Latest collected" does. Those routes filter
 * by ONE connector, while Discovery's Source is a tenant; this works out which
 * connectors a tenant covers and whether the server can filter to it exactly.
 */

import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";
import type { InventoryClass } from "@/app/api/igaInventoryApi";

import { IDENTITY_FILTERS } from "./azureDiscoveryLabels";

export interface AzureFallbackScope {
  /** The connector_id to send, when one connector is exactly the scope. */
  connectorId?: string;
  /** The connectors the scope covers, when the rows must be narrowed after reading. */
  connectorIds?: Set<string>;
  /** False when the server cannot filter to the scope: rows are narrowed after reading and totals are not the scope's. */
  exact: boolean;
}

/**
 * `tenantId` is Discovery's Source as a scope id (the tenant id, any case), or
 * undefined for every tenant. Identities belong to the tenant connector;
 * resources and workloads to its subscriptions (and API-plane resources to the
 * tenant connector).
 */
export function azureFallbackScope(connectors: CloudConnector[], cls: InventoryClass, tenantId: string | undefined): AzureFallbackScope {
  if (!tenantId) return { exact: true };
  const tid = tenantId.toLowerCase();
  const tenants = connectors.filter((c) => c.scope_kind === "tenant");
  const tenant = tenants.find((c) => c.scope_id.toLowerCase() === tid);
  if (!tenant) return { connectorIds: new Set(), exact: false };
  if (cls === "identities") return { connectorId: tenant.id, exact: true };
  // One tenant in the workspace: every Azure row is its, so nothing needs filtering.
  if (tenants.length === 1) return { exact: true };
  const ids = new Set([tenant.id, ...connectors.filter((c) => c.scope_kind === "subscription" && c.parent_scope_id?.toLowerCase() === tid).map((c) => c.id)]);
  return { connectorIds: ids, exact: false };
}

/** The identity filter in the URL (`kind`) as the Azure route's kind and agent_type. */
export function identityFilterArgs(kind: string | null | undefined): { kind?: string; agent_type?: string } {
  if (!kind) return {};
  const f = IDENTITY_FILTERS.find((x) => x.key === kind);
  return f ? { kind: f.kind, agent_type: f.agentType } : { kind };
}

/** An identity's page is keyed by its Entra object id; a resource's and a
 * workload's by its ARM id here, since no graph id exists while the graph is off. */
export function scanTablesHref(cls: InventoryClass, r: { native_id: string }): string {
  const seg = cls === "identities" ? "identity" : cls === "resources" ? "resource" : "workload";
  return `/iga/azure/${seg}/${encodeURIComponent(r.native_id)}`;
}
