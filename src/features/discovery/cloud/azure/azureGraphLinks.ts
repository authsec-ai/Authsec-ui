/** Where an Azure graph node opens, and the graph ref of an Azure identity page. */

import { refId, refType, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { useListInventoryQuery } from "@/app/api/igaInventoryApi";

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

/**
 * An identity page is keyed by its Entra object id; the graph and access policies name it by
 * AuthSec's id. The inventory's native id for an Azure identity is the object id, so its row
 * gives the ref. Skipped without an object id.
 */
export function useAzureIdentityRef(ws: string, objectId: string | undefined) {
  const q = useListInventoryQuery({ ws, class: "identities", provider: "azure", q: objectId, limit: 10 }, { skip: !objectId });
  const row = q.data?.data.find((r) => r.native_id.toLowerCase() === objectId?.toLowerCase());
  return { ref: row?.ref as GraphRef | undefined, query: q };
}
