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

/** The published chart (an OCI registry, pulled anonymously) and the version this console was tested with. */
export const IGA_AGENT_CHART = "oci://docker-repo-public.authnull.com/charts/authsec-iga-agent";
export const IGA_AGENT_CHART_VERSION = "0.6.0";

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
  /** Namespaces enforcement may act in; empty installs discovery only. */
  enforceNamespaces: string;
}

const words = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

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

/** What is wrong with the enforcement namespaces; null when nothing is. */
export function enforceProblem(namespaces: string): string | null {
  return words(namespaces).includes("authsec-system") ? "The agent's own namespace cannot be enforced in." : null;
}

/** The one-time setup command, every value filled in. */
export function k8sSetupCommand(o: K8sSetup): string {
  const ns = words(o.enforceNamespaces);
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
  if (ns.length) lines.push(`--set "roles={discovery,actuation}"`, `--set "actuation.namespaces=${ns.join(" ")}"`);
  return lines.join(" \\\n  ");
}
