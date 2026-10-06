/**
 * Kubernetes inventory facts that are about the SWEEP behind the rows
 * (SPEC-console-revamp.md *Kubernetes in Discovery*): the inventory date is the
 * sweep's `observed_at`, coverage is a state with a sentence, and the agent's
 * heartbeat is connection health that never stands in for either.
 */

import type { GraphCoverageGap } from "@/app/api/igaGraphApi";
import type { KubernetesCoverageNote } from "@/app/api/igaInventoryApi";
import type { K8sCluster } from "@/app/api/k8sGraphApi";

/** The coverage vocabulary of internal/k8sread. Never a number, never a percentage. */
export const K8S_COVERAGE_LABEL: Record<string, string> = {
  complete: "Fully swept",
  namespaced_only: "Namespaces only",
  incomplete: "Sweep incomplete",
  not_swept: "Never swept",
};

export interface ClusterSweep {
  cluster: string;
  state: string;
  observedAt: string | null;
  limitation?: string;
  /** The sweep's own status (received | projected | failed): the rows come from the newest one that was applied. */
  status?: string;
}

function isSweepNote(n: GraphCoverageGap | KubernetesCoverageNote): n is KubernetesCoverageNote {
  return (n as KubernetesCoverageNote).surface === "k8s_sweep";
}

/**
 * Every cluster's latest sweep: from the inventory's coverage notes when it
 * sends them (B1), completed by the clusters read (`last_sweep`), which is the
 * sweep behind the rows too — never the heartbeat. A cluster neither knows is
 * simply absent: that is "not reported", not "complete".
 */
export function clusterSweeps(
  notes: (GraphCoverageGap | KubernetesCoverageNote)[] | undefined,
  clusters: K8sCluster[] | undefined,
): ClusterSweep[] {
  const out = new Map<string, ClusterSweep>();
  for (const c of clusters ?? []) {
    out.set(c.cluster, {
      cluster: c.cluster,
      state: c.last_sweep?.coverage ?? "not_swept",
      observedAt: c.last_sweep?.observed_at ?? null,
      limitation: c.last_sweep?.limitation || undefined,
      status: c.last_sweep?.status,
    });
  }
  for (const n of notes ?? []) {
    if (!isSweepNote(n)) continue;
    const prior = out.get(n.account_id);
    out.set(n.account_id, { cluster: n.account_id, state: n.state, observedAt: n.observed_at ?? prior?.observedAt ?? null, limitation: prior?.limitation, status: prior?.status });
  }
  return [...out.values()];
}

/** The sweeps in scope: one cluster when a source is chosen, else all of them. */
export function inScope(sweeps: ClusterSweep[], cluster: string | undefined): ClusterSweep[] {
  return cluster ? sweeps.filter((s) => s.cluster === cluster) : sweeps;
}
