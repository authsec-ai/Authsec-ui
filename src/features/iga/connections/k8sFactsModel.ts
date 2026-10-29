/**
 * The Kubernetes "Cluster and agent" panel's counts (AS-167). Discovery's own
 * inventory says how many workloads and ServiceAccounts it holds for the
 * cluster. The agent's status counters (namespaces visible, workloads scanned,
 * agents matched) are shown only when an agent reports them: no release does
 * today, and "Not reported yet" read as a broken sweep.
 */

import type { ConnectorStatus } from "@/app/api/discoveryApi";
import type { InventoryClass, InventorySummary } from "@/app/api/igaInventoryApi";

export function inventoryCountText(
  q: { data?: InventorySummary; isLoading?: boolean; isError?: boolean },
  cls: InventoryClass,
): string {
  if (q.isLoading) return "Counting…";
  const c = q.data?.data[cls];
  if (q.isError || !c || c.value == null) return "Could not be counted";
  return c.exact ? String(c.value) : `At least ${c.value}`;
}

export function agentCounters(s: Pick<ConnectorStatus, "namespacesVisible" | "workloadsScanned" | "workloadsMatched">): [string, number][] {
  const out: [string, number][] = [];
  if (s.namespacesVisible != null) out.push(["Namespaces visible", s.namespacesVisible]);
  if (s.workloadsScanned != null) out.push(["Workloads scanned", s.workloadsScanned]);
  if (s.workloadsMatched != null) out.push(["Agents matched", s.workloadsMatched]);
  return out;
}
