/**
 * A Kubernetes cluster's in-cluster enforcement, as the connection's
 * Enforcement tab shows it: whether AuthSec has minted the cluster's actuation
 * token, what the agent last REPORTED it can do, and the commands that turn
 * each power on. The console never pushes configuration to a cluster -- the
 * agent's Helm values decide, and the agent reports them back on its poll.
 *
 * Minting the token changes discovery too: the server then accepts this
 * cluster's registration, sightings and sweeps only under it (401 otherwise),
 * so the same upgrade makes it the agent's discovery token as well.
 *
 * Two powers, each bounded by the namespaces and roles named here:
 *   quarantine       a NetworkPolicy that cuts a quarantined agent's network
 *                    (the actuation role; actuation.namespaces)
 *   access policies  take a ServiceAccount out of a role's bindings for a
 *                    window (iga-agent 0.5.0; enforcement.bindings)
 */

import type { DiscoverySource } from "@/app/api/discoveryApi";

export const ACTUATION_SECRET = "authsec-iga-actuation";
export const DEFAULT_CHART_REF = "./charts/authsec-iga-agent";

export type PowerState = "on" | "off" | "not_reported";

export interface K8sEnforcementState {
  /** An actuation token exists for this cluster. */
  actuation: boolean;
  actuationSince?: string;
  /** The agent has reported its enforcement settings at least once. */
  reported: boolean;
  /** Quarantine can land: a token, and an agent polling with it. */
  quarantine: PowerState;
  /** Access policies can land: the agent says it may change bindings. */
  accessPolicies: PowerState;
  mode?: string;
  evict: boolean;
}

export function k8sEnforcementState(s: DiscoverySource | undefined): K8sEnforcementState {
  const actuation = !!s?.actuation_enabled_at;
  const reported = !!s?.enforcement_mode;
  const power = (on: boolean): PowerState => (!actuation ? "off" : !reported ? "not_reported" : on ? "on" : "off");
  return {
    actuation,
    actuationSince: s?.actuation_enabled_at,
    reported,
    // An agent that reports at all with a token is polling the actuation endpoints.
    quarantine: power(true),
    accessPolicies: power(!!s?.enforcement_bindings),
    mode: s?.enforcement_mode || undefined,
    evict: !!s?.enforcement_evict,
  };
}

const words = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export interface EnforcementInstall {
  chartRef: string;
  /** Where quarantine may write NetworkPolicies. Empty: none. */
  quarantineNamespaces: string;
  /** Roles whose bindings access policies may change. Empty: access policies off. */
  bindingRoles: string;
  bindingNamespaces: string;
  clusterWide: boolean;
}

/** The Secret holding the token: run once, never put the token in Helm values. */
export function secretCommand(token: string): string {
  return [
    `kubectl create secret generic ${ACTUATION_SECRET} -n authsec-system \\`,
    `  --from-literal=actuationToken=${token} \\`,
    "  --dry-run=client -o yaml | kubectl apply -f -",
  ].join("\n");
}

/** The upgrade that turns the powers on, keeping every other value the release has. */
export function helmEnforcementCommand(o: EnforcementInstall): string {
  const ns = words(o.quarantineNamespaces);
  const roles = words(o.bindingRoles);
  const bns = words(o.bindingNamespaces);
  const lines = [
    `helm upgrade authsec-iga-agent ${o.chartRef.trim() || DEFAULT_CHART_REF} -n authsec-system --reuse-values`,
    `--set "roles={discovery,actuation}"`,
    // A connector with an actuation token accepts discovery (registration,
    // sightings, sweeps) only under that token: the agent sends it for both.
    `--set controlPlane.existingSecret=${ACTUATION_SECRET}`,
    "--set controlPlane.existingSecretKey=actuationToken",
    `--set actuation.existingSecret=${ACTUATION_SECRET}`,
    `--set "actuation.namespaces=${ns.join(" ")}"`,
  ];
  if (roles.length) {
    lines.push(
      "--set enforcement.bindings.enabled=true",
      `--set "enforcement.bindings.roles=${roles.join(" ")}"`,
      `--set "enforcement.bindings.namespaces=${bns.join(" ")}"`,
    );
    if (o.clusterWide) lines.push("--set enforcement.bindings.clusterWide=true");
  }
  return lines.join(" \\\n  ");
}

/** What is missing before the command does what its fields say; null when nothing is. */
export function installProblem(o: EnforcementInstall): string | null {
  if (!words(o.quarantineNamespaces).length) return "Name at least one namespace quarantine may act in.";
  if (words(o.bindingRoles).length && !words(o.bindingNamespaces).length && !o.clusterWide)
    return "Name the namespaces whose RoleBindings access policies may change, or allow ClusterRoleBindings.";
  if (words(o.quarantineNamespaces).includes("authsec-system")) return "The agent's own namespace cannot be quarantined.";
  return null;
}
