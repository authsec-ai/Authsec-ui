/** Where an Azure graph node opens. */

import { refId, refType, type GraphNode } from "@/app/api/igaGraphApi";

/**
 * An identity's page (by its Entra object id, its native_id), a resource's or a workload's.
 * Scopes, role assignments and external principals have none.
 */
export function azureObjectPath(node: GraphNode | undefined, tab?: "graph"): string | null {
  if (!node || node.provider !== "azure") return null;
  const type = refType(node.ref);
  const suffix = tab ? `/${tab}` : "";
  if (type === "identity") return node.native_id ? `/iga/azure/identity/${encodeURIComponent(node.native_id)}${suffix}` : null;
  if (type === "resource" && node.kind === "azure_resource") return `/iga/azure/resource/${encodeURIComponent(refId(node.ref))}${suffix}`;
  if (type === "workload") return `/iga/azure/workload/${encodeURIComponent(refId(node.ref))}${suffix}`;
  return null;
}
