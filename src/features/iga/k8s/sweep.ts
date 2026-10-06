/**
 * The sweep behind a Kubernetes page, said as the page's header says it
 * (SPEC-console-revamp.md *Kubernetes object pages*). The inventory date is the
 * SWEEP's `observed_at`, never the agent's heartbeat; coverage is a state with
 * its sentence, never a percentage; and an empty answer says what was not read.
 */

import { format } from "date-fns";

import { K8S_COVERAGE_LABEL, inScope, type ClusterSweep } from "../discovery/k8s";

/** Weakest first: an unknown cluster-admin binding hides in the sweep that was not fully read. */
const WEAKEST_FIRST: Record<string, number> = { incomplete: 0, not_swept: 1, namespaced_only: 2, complete: 3 };

/**
 * The sweep behind THIS object: its cluster's when the cluster is known, else
 * the weakest of the workspace's — never a stronger claim than the evidence.
 */
export function sweepBehind(sweeps: ClusterSweep[], cluster: string | undefined): ClusterSweep | undefined {
  return [...inScope(sweeps, cluster)].sort((a, b) => (WEAKEST_FIRST[a.state] ?? 9) - (WEAKEST_FIRST[b.state] ?? 9))[0];
}

/** "Inventory from the sweep at 5 Oct 09:12 · Fully swept", or what is known when there is no sweep. */
export function sweepLine(s: ClusterSweep | undefined, read: "loading" | "failed" | "done"): string {
  if (read === "loading") return "Reading the sweep behind this inventory…";
  if (read === "failed") return "The sweep behind this inventory could not be read";
  if (!s) return "The sweep behind this inventory is not reported";
  const word = K8S_COVERAGE_LABEL[s.state] ?? s.state;
  if (s.state === "not_swept" || !s.observedAt) return `No inventory received yet · ${word}`;
  return `Inventory from the sweep at ${format(new Date(s.observedAt), "d MMM HH:mm")} · ${word}`;
}

/**
 * What a non-complete sweep did not read, persistently: Namespaces only means
 * the cluster-wide bindings were not read, which is where cluster-admin lives.
 */
export function sweepWarning(s: ClusterSweep | undefined): string | null {
  if (!s) return null;
  if (s.status && s.status !== "projected" && s.state !== "not_swept")
    return "The newest sweep has not been applied yet, so the inventory shown is from an earlier one.";
  switch (s.state) {
    case "namespaced_only":
      return "Cluster-wide bindings were not read: ClusterRoles and ClusterRoleBindings are outside this sweep, so what the cluster grants cluster-wide is unknown, not none.";
    case "incomplete":
      return s.limitation || "A list failed during this sweep, so anything missing from it may simply not have been read.";
    case "not_swept":
      return "No sweep has been received for this cluster, so nothing here has been confirmed.";
    default:
      return null;
  }
}

/**
 * Why a list is empty, in terms of what was read. Never "no access": an empty
 * list is access not found in what the sweep read, and that is only as strong
 * as the sweep.
 */
export function emptyAccessWords(s: ClusterSweep | undefined): string {
  switch (s?.state) {
    case "not_swept":
      return "No sweep has been received, so nothing was read. What the cluster lets it do is unknown.";
    case "incomplete":
      return "No binding in what the sweep read names this ServiceAccount. A list failed in that sweep, so this is not a finding that there are none.";
    case "namespaced_only":
      return "No RoleBinding in the namespaces the sweep read names this ServiceAccount. ClusterRoleBindings were not read, so this is not a finding that there are none.";
    case "complete":
      return "No RoleBinding or ClusterRoleBinding in the sweep names this ServiceAccount. Grants through groups are not evaluated here.";
    default:
      return "No binding in what was read names this ServiceAccount. The sweep behind this answer is not reported, so this is not a finding that there are none.";
  }
}
