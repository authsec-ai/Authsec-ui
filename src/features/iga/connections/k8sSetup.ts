/**
 * Connecting a Kubernetes cluster: the one command an operator pastes, with
 * everything the console knows already in it -- the published chart and its
 * version, the control plane's API address, the workspace, a freshly minted
 * ingest token -- so the only thing typed is the cluster's name.
 *
 * Nothing is created up front: the agent registers itself as the cluster's
 * connection (instance `k8s:<cluster.name>`) on its first heartbeat, and the
 * dialog waits for exactly that row.
 */

import type { DiscoverySource } from "@/app/api/discoveryApi";
import type { AccessPolicy } from "@/app/api/igaAccessPoliciesApi";

/** The published chart (an OCI registry, pulled anonymously) and the version this console was tested with. */
export const IGA_AGENT_CHART = "oci://docker-repo-public.authnull.com/charts/authsec-iga-agent";
export const IGA_AGENT_CHART_VERSION = "0.6.3";

/** `helm upgrade --install` of the published chart: the same line installs, re-runs and upgrades. */
export const helmChartLine = (verb: "upgrade" | "upgrade --install") =>
  `helm ${verb} authsec-iga-agent ${IGA_AGENT_CHART} --version ${IGA_AGENT_CHART_VERSION} -n authsec-system`;

export interface K8sSetup {
  clusterName: string;
  /** The control plane's API, where the agent reports (not the console's address). */
  controlPlaneUrl: string;
  workspaceId: string;
  ingestToken: string;
  /** Read the cluster's RBAC: the access graph, and what access policies act on. */
  accessGraph: boolean;
  /** Sweep existing workloads too, not only what is created after install. */
  resync: boolean;
  /**
   * Give the agent the actuation role, once enforcement is turned on:
   * quarantine in every namespace and access policies on every role (never
   * kube-system and its peers, the agent's own namespace, or system: roles).
   */
  enforce: boolean;
}

/** The cluster's name as the agent registers it: a DNS label, as Kubernetes names are. */
const CLUSTER_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** What is wrong with a proposed cluster name; null when it can be used. */
export function clusterNameProblem(name: string): string | null {
  if (!name) return "Name the cluster.";
  if (!CLUSTER_NAME.test(name)) return "Lowercase letters, digits and hyphens, starting and ending with a letter or digit (at most 63).";
  return null;
}

/** The connection this cluster's agent registers as, once it has. */
export function connectedSource(sources: DiscoverySource[] | undefined, clusterName: string): DiscoverySource | undefined {
  return sources?.find((s) => s.kind === "k8s_webhook" && s.self_registered && s.instance_id === `k8s:${clusterName}`);
}

/** The one-time setup command, every value filled in. */
export function k8sSetupCommand(o: K8sSetup): string {
  const lines = [
    `${helmChartLine("upgrade --install")} --create-namespace`,
    `--set controlPlane.url=${o.controlPlaneUrl.replace(/\/+$/, "")}`,
    `--set workspace.id=${o.workspaceId}`,
    `--set cluster.name=${o.clusterName}`,
    // The chart stores it in a Secret; production refuses reports without it.
    `--set controlPlane.sourceToken=${o.ingestToken}`,
  ];
  if (o.accessGraph) lines.push("--set accessGraph.enabled=true");
  if (o.resync) lines.push("--set resync.enabled=true");
  if (o.enforce) lines.push(`--set "roles={discovery,actuation}"`, ...EVERY_ROLE);
  return lines.join(" \\\n  ");
}

/**
 * Access policies on every role, wherever it is bound (iga-agent 0.6.2+). The
 * agent then holds `bind` on every role, so it bounds itself: it puts back only
 * a subject it recorded removing, and never touches system: roles or the
 * cluster's own namespaces.
 */
export const EVERY_ROLE = ["--set enforcement.bindings.enabled=true", '--set "enforcement.bindings.roles=*"', '--set enforcement.bindings.namespaces=""'];

/** The roles the cluster's agent says access policies may change (iga-agent 0.6.1+). */
export function allowedRoles(s: DiscoverySource | undefined): string[] {
  const rt = (s?.runtime ?? {}) as { binding_roles?: unknown };
  return Array.isArray(rt.binding_roles) ? rt.binding_roles.filter((r): r is string => typeof r === "string") : [];
}

/**
 * The roles an installed agent older than removal receipts (0.6.1 and before)
 * may have taken a subject out of: the named roles it reports, and the roles of
 * this cluster's policies not yet ended. Passed as enforcement.bindings.
 * legacyRoles when it moves to every role, so ending those policies still puts
 * the subjects back -- an upgrade never loses anyone's access.
 */
export function legacyRoles(reported: readonly string[], policies: readonly AccessPolicy[] | undefined, cluster: string): string[] {
  const out = new Set(reported.filter((r) => r !== "*"));
  for (const p of policies ?? []) {
    if (p.resource.provider !== "k8s" || p.resource.account_id !== cluster || p.status === "ended" || p.status === "scheduled") continue;
    const role = p.resource.name.split("/").pop();
    if (role) out.add(role);
  }
  return [...out].sort();
}

/** The flag that keeps an older agent's removals restorable; nothing when there are none. */
export const legacyRolesFlag = (legacy: readonly string[]) => (legacy.length ? [`--set "enforcement.bindings.legacyRoles=${legacy.join(" ")}"`] : []);

/** The one upgrade that lets an installed agent's access policies act on every role. */
export function helmEveryRoleCommand(legacy: readonly string[] = []): string {
  return [`${helmChartLine("upgrade")} --reset-then-reuse-values`, `--set "roles={discovery,actuation}"`, ...EVERY_ROLE, ...legacyRolesFlag(legacy)].join(
    " \\\n  ",
  );
}
