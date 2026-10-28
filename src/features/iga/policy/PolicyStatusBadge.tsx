import { type ConsoleTone, StatusBadge } from "@/components/console/status";
import type { PolicyLifecycle } from "./policyApi";
import { LIFECYCLE_HELP } from "./lifecycleHelp";

const LIFECYCLE_TONE: Record<PolicyLifecycle, ConsoleTone> = {
  draft: "neutral",
  validated: "info",
  simulated: "info",
  approved: "warning",
  published: "success",
  superseded: "neutral",
  revoked: "danger",
};

const LIFECYCLE_LABEL: Record<PolicyLifecycle, string> = {
  draft: "Draft",
  validated: "Validated",
  simulated: "Simulated",
  approved: "Approved",
  published: "Published",
  superseded: "Superseded",
  revoked: "Revoked",
};

// Enforcement overlay states
export type EnforcementOverlay =
  | "pending" | "received" | "applied" | "verified"
  | "partial" | "failed" | "stale" | "revoked";

const ENFORCEMENT_TONE: Record<EnforcementOverlay, ConsoleTone> = {
  pending: "neutral",
  received: "info",
  applied: "info",
  verified: "success",
  partial: "warning",
  failed: "danger",
  stale: "warning",
  revoked: "danger",
};

export function PolicyStatusBadge({ lifecycle }: { lifecycle: PolicyLifecycle }) {
  return (
    <StatusBadge tone={LIFECYCLE_TONE[lifecycle] ?? "neutral"} title={LIFECYCLE_HELP[lifecycle]}>
      {LIFECYCLE_LABEL[lifecycle] ?? lifecycle}
    </StatusBadge>
  );
}

export function EnforcementBadge({ state }: { state: EnforcementOverlay }) {
  return (
    <StatusBadge tone={ENFORCEMENT_TONE[state] ?? "neutral"}>
      {state}
    </StatusBadge>
  );
}
