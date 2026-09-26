/**
 * Green only when `protectionBadge` says so. The status badge's success tone
 * is the green treatment; every other result stays off that tone.
 */

import { StatusBadge, type ConsoleTone } from "@/components/console/status";

import { policyStatusBadge, protectionBadge, type ProtectionBadgeModel, type RequiredControl } from "./protection";

const TONE: Record<ProtectionBadgeModel["tone"], ConsoleTone> = {
  neutral: "neutral",
  warning: "warning",
  success: "success",
};

export function ProtectionBadge({
  controls,
  status,
}: {
  /** When set, the control list decides the badge. An empty list is not configured. */
  controls?: RequiredControl[] | null;
  /** Used when there is no control list, including the runtime-policy placeholder. */
  status?: string | null;
}) {
  const model = controls !== undefined ? protectionBadge(controls) : policyStatusBadge(status);
  return (
    <span data-protection={model.green ? "protected" : "not-protected"} data-testid="protection-badge">
      <StatusBadge tone={TONE[model.tone]}>{model.label}</StatusBadge>
    </span>
  );
}
