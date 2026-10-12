/**
 * What the legacy agent-policy view says (SPEC-iga-phase3-policy.md §7.10, §9.5).
 * Pure words over `LegacyAgentPolicyView`; no requests. `on_expiry` and the
 * outcomes are the legacy reconciler's own vocabulary (models/agent_policy.go).
 */

import type { LegacyAgentPolicyView, LegacyReconcileOutcome } from "@/app/api/igaPolicySetupApi";
import type { ConsoleTone } from "@/components/console/status";

import { humanize, relTime } from "../shared";

/** What the reconciler does when the policy's clock runs out. */
export function onExpiryWords(onExpiry: string): string {
  switch (onExpiry) {
    case "revoke":
      return "revoke the target's entitlements (the workload is left as it is)";
    case "quarantine":
      return "quarantine the workload";
    case "evict":
      return "evict the workload, which removes it from the cluster";
    default:
      return `act on expiry (${humanize(onExpiry).toLowerCase()})`;
  }
}

export function targetLabel(p: LegacyAgentPolicyView): string {
  if (p.target.kind === "selector") return "Agents matching a selector";
  return p.target.agent_label || "An agent that is no longer listed";
}

export function outcomeView(o: LegacyReconcileOutcome): { label: string; tone: ConsoleTone } {
  if (o.dry_run || o.outcome === "planned") return { label: "Planned, not applied", tone: "info" };
  switch (o.outcome) {
    case "applied":
      return { label: "Applied", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "refused":
      return { label: "Refused", tone: "warning" };
    default:
      return { label: humanize(o.outcome), tone: "neutral" };
  }
}

/** "Quarantined · cluster, 3 hours ago". */
export function lastActionLine(o: LegacyReconcileOutcome): string {
  const when = relTime(o.at);
  return [humanize(o.action), o.arm ? `${o.arm} arm` : "", when].filter(Boolean).join(" · ");
}

/** What the reconciler will do with an ENABLED policy if nobody changes it. Empty when it has no clock. */
export function whatHappensNext(p: LegacyAgentPolicyView): string {
  if (!p.enabled) return "The policy is already paused, so the reconciler is not acting on it.";
  const at = p.effective_expiry ? new Date(p.effective_expiry) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return "The policy has no expiry. While it is enabled the reconciler keeps holding its target to the state it asks for.";
  }
  const when = at.getTime() <= Date.now() ? "on its next pass (its expiry has passed)" : `at ${at.toLocaleString()}`;
  return `If left enabled, the reconciler will ${onExpiryWords(p.on_expiry)} ${when}.`;
}
