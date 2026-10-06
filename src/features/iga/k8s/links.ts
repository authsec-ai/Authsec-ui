/** Where a Kubernetes object lives in the console: `/iga/k8s/<workload|identity>/<id>`, the cluster carried as `?cluster=`. */

import { refId, refType, type GraphNode } from "@/app/api/igaGraphApi";

export type K8sObjectKind = "workload" | "identity";

/** The page of a Kubernetes workload or ServiceAccount; `tab` is "graph" or "access" (Overview when absent). */
export function k8sObjectPath(kind: K8sObjectKind, id: string, cluster?: string | null, tab?: "access" | "graph"): string {
  return `/iga/k8s/${kind}/${encodeURIComponent(id)}${tab ? `/${tab}` : ""}${cluster ? `?cluster=${encodeURIComponent(cluster)}` : ""}`;
}

/** The page a graph node opens: its workload or ServiceAccount page, or null for a rule, which has none. */
export function k8sNodePath(node: GraphNode | undefined, tab?: "access" | "graph"): string | null {
  if (!node) return null;
  const type = refType(node.ref);
  if (type !== "workload" && type !== "identity") return null;
  return k8sObjectPath(type, refId(node.ref), node.scope?.id, tab);
}
