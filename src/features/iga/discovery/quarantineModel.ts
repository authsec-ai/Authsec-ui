/**
 * What a sighting's Quarantine panel says and offers. A quarantine is a
 * DECISION (status `quarantined`, audited, a reason required) that the server
 * then makes real through the cluster's agent: a NetworkPolicy that cuts the
 * workload's network. The two are told apart, because "quarantined but still
 * running with full access" is the state that matters.
 */

import type { DiscoveredAgent } from "@/app/api/discoveryApi";

export type QuarantineTone = "danger" | "warning" | "muted";

export interface QuarantineView {
  quarantined: boolean;
  /** One sentence on where enforcement stands. */
  line: string;
  tone: QuarantineTone;
  /** A quarantine here can be enforced in a cluster (a Kubernetes sighting with its connection). */
  enforceable: boolean;
}

export function quarantineView(a: Pick<DiscoveredAgent, "status" | "source" | "discovery_source_id" | "quarantine_enforced_at" | "quarantine_enforcement_error">): QuarantineView {
  const enforceable = a.source === "k8s_webhook" && !!a.discovery_source_id;
  if (a.status !== "quarantined") {
    return {
      quarantined: false,
      enforceable,
      tone: "muted",
      line: enforceable
        ? "Quarantining cuts this workload's network in its cluster, through the cluster's agent."
        : "Quarantining records the decision; this sighting has no cluster agent that could cut it off.",
    };
  }
  if (a.quarantine_enforced_at) return { quarantined: true, enforceable, tone: "danger", line: "Blocked in the cluster: its network is cut." };
  if (a.quarantine_enforcement_error)
    return { quarantined: true, enforceable, tone: "warning", line: `Quarantined, but NOT blocked: ${a.quarantine_enforcement_error.replace(/^not enforced in-cluster: /, "")}.` };
  return enforceable
    ? { quarantined: true, enforceable, tone: "warning", line: "Quarantined; waiting for the cluster's agent to apply it. It still runs with full access until then." }
    : { quarantined: true, enforceable, tone: "warning", line: "Quarantined on record only: nothing here can block it." };
}

/** The message for a refused or failed quarantine or release. */
export function quarantineErrorText(status: number | string | undefined, releasing: boolean): string {
  if (status === 403) return `Your role cannot ${releasing ? "release" : "quarantine"} agents: it needs discovery:quarantine.`;
  if (status === 404) return "This sighting no longer exists.";
  return `The ${releasing ? "release" : "quarantine"} could not be recorded. Try again.`;
}
