/**
 * A Kubernetes cluster's in-cluster enforcement, as the connection's
 * Enforcement tab shows it: whether it is turned on, whether the cluster's
 * agent can take it up, what the agent last REPORTED it can do, and the one
 * command a cluster admin runs to let it act. The console never pushes
 * configuration to a cluster -- the agent's Helm values decide, and the agent
 * reports them back on its poll.
 *
 * Turning enforcement on hands nothing to anyone: the connector turns
 * "pending", and the agent (iga-agent 0.6.0+, actuation role) generates its own
 * credential and hands it over on its next heartbeat. Discovery keeps
 * reporting under the ingest token until then, and goes back to it when
 * enforcement is turned off.
 *
 * What only a cluster admin can grant is WHERE the agent may act -- write RBAC
 * per namespace. Two powers, each bounded by the namespaces and roles named:
 *   quarantine       a NetworkPolicy that cuts a quarantined agent's network
 *                    (the actuation role; actuation.namespaces)
 *   access policies  take a ServiceAccount out of a role's bindings for a
 *                    window (iga-agent 0.5.0; enforcement.bindings)
 */

import type { DiscoverySource } from "@/app/api/discoveryApi";

import { helmChartLine } from "./k8sSetup";

export type PowerState = "on" | "off" | "not_reported";

/** off; pending (turned on, waiting for the agent's credential); on. */
export type ActuationState = "off" | "pending" | "on";

/**
 * Whether the cluster's agent can take enforcement up, from what its heartbeat
 * reports (runtime.actuation_credential, iga-agent 0.6.0+):
 *   ready    the actuation role, generating its own credential
 *   no_role  discovery only
 *   manual   a token given by hand (actuation.token / existingSecret)
 *   upgrade  older than the hand-over
 */
export type AgentReadiness = "ready" | "no_role" | "manual" | "upgrade";

export interface K8sEnforcementState {
  state: ActuationState;
  since?: string;
  agent: AgentReadiness;
  /** The agent has reported its enforcement settings at least once. */
  reported: boolean;
  /** Quarantine can land: on, and an agent polling with its credential. */
  quarantine: PowerState;
  /** Access policies can land: the agent says it may change bindings. */
  accessPolicies: PowerState;
  mode?: string;
  evict: boolean;
}

export function agentReadiness(s: DiscoverySource | undefined): AgentReadiness {
  const rt = (s?.runtime ?? {}) as { actuation_credential?: unknown };
  switch (rt.actuation_credential) {
    case "managed":
      return "ready";
    case "fixed":
      return "manual";
    case "none":
      return "no_role";
    default:
      return "upgrade";
  }
}

export function k8sEnforcementState(s: DiscoverySource | undefined): K8sEnforcementState {
  // A control plane older than the hand-over sends no actuation_state: a minted
  // token there is "on".
  const state: ActuationState = s?.actuation_state ?? (s?.actuation_enabled_at ? "on" : "off");
  const reported = !!s?.enforcement_mode;
  const power = (on: boolean): PowerState => (state === "off" ? "off" : state === "pending" || !reported ? "not_reported" : on ? "on" : "off");
  return {
    state,
    since: s?.actuation_enabled_at,
    agent: agentReadiness(s),
    reported,
    // An agent that reports at all with a credential is polling the actuation endpoints.
    quarantine: power(true),
    accessPolicies: power(!!s?.enforcement_bindings),
    mode: s?.enforcement_mode || undefined,
    evict: !!s?.enforcement_evict,
  };
}

/** One sentence on where enforcement stands, and what (if anything) blocks it. */
export function statusLine(st: K8sEnforcementState, agentVersion: string): string {
  if (st.state === "off") return "Off. The agent can only discover.";
  if (st.state === "on") return "On. The agent acts with its own credential.";
  switch (st.agent) {
    case "ready":
      return "Turned on. The agent takes it up on its next heartbeat, within a minute; discovery carries on meanwhile.";
    case "no_role":
      return "Turned on, but the agent cannot take it up: it does not have the actuation role. Run the command below.";
    case "manual":
      return "Turned on, but the agent was given a token by hand. Run the command below so it takes enforcement up from here.";
    default:
      return `Turned on, but this agent${agentVersion ? ` (v${agentVersion})` : ""} predates the hand-over. Upgrade it to iga-agent 0.6.0 with the command below.`;
  }
}

const words = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export interface EnforcementInstall {
  /** Where quarantine may write NetworkPolicies. Empty: none. */
  quarantineNamespaces: string;
  /**
   * Roles whose bindings access policies may change. Empty leaves the agent's
   * binding settings as the release has them (--reset-then-reuse-values).
   */
  bindingRoles: string;
  bindingNamespaces: string;
  clusterWide: boolean;
  /**
   * Set when moving an agent off a token given by hand: the Secret holding its
   * discovery ingest token (key sourceToken). The earlier Enforcement command
   * pointed controlPlane at the actuation token, which stops working as soon as
   * the agent hands over its own.
   */
  ingestSecret?: string;
}

// The published chart at the console's version; --reset-then-reuse-values, not
// --reuse-values: a release from an older chart would otherwise keep that
// chart's defaults (iga-agent chart notes).
const helmUpgrade = () => `${helmChartLine("upgrade")} --reset-then-reuse-values`;

/** The upgrade that lets the agent act, keeping every other value the release was given. */
export function helmEnforcementCommand(o: EnforcementInstall): string {
  const ns = words(o.quarantineNamespaces);
  const roles = words(o.bindingRoles);
  const bns = words(o.bindingNamespaces);
  const lines = [
    helmUpgrade(),
    `--set "roles={discovery,actuation}"`,
    // Empty: the agent generates its credential and hands it over. A token
    // given by hand would take precedence.
    '--set actuation.existingSecret=""',
    '--set actuation.token=""',
    `--set "actuation.namespaces=${ns.join(" ")}"`,
  ];
  if (o.ingestSecret?.trim()) lines.push(`--set controlPlane.existingSecret=${o.ingestSecret.trim()}`, "--set controlPlane.existingSecretKey=sourceToken");
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
  if (o.ingestSecret !== undefined && !o.ingestSecret.trim()) return "Name the Secret that holds the agent's discovery ingest token.";
  return null;
}

/** What the server said is still in force when it refused to turn enforcement off. */
export interface EnforcementInUse {
  quarantined: number;
  access_policies: number;
  open_instructions: number;
}

export function inUseText(u: EnforcementInUse | undefined): string {
  if (!u) return "Enforcement could not be turned off. Try again.";
  const parts = [
    u.quarantined ? `${u.quarantined} quarantined ${u.quarantined === 1 ? "agent" : "agents"} (release ${u.quarantined === 1 ? "it" : "them"})` : "",
    u.access_policies ? `${u.access_policies} live access ${u.access_policies === 1 ? "policy" : "policies"} (end ${u.access_policies === 1 ? "it" : "them"})` : "",
    u.open_instructions ? `${u.open_instructions} ${u.open_instructions === 1 ? "change" : "changes"} the agent has not applied yet (wait for ${u.open_instructions === 1 ? "it" : "them"})` : "",
  ].filter(Boolean);
  return `Still in force on this cluster: ${parts.join(", ")}. Turned off now, the agent could not undo them.`;
}

/**
 * Optional after turning off: take the agent's write access away too. The role
 * alone: without it the chart grants no write at all, binding changes included,
 * and the binding settings stay in the release, so giving the role back
 * restores them instead of leaving access policies off.
 */
export function helmRemoveRoleCommand(): string {
  return [helmUpgrade(), `--set "roles={discovery}"`].join(" \\\n  ");
}
