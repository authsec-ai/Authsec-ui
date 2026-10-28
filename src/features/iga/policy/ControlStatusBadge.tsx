/**
 * ControlStatusBadge — maps compiled-control status strings to themed StatusBadge
 * chips, following the same pattern as PolicyStatusBadge / EnforcementBadge.
 */

import { type ConsoleTone, StatusBadge } from "@/components/console/status";

const STATUS_TONE: Record<string, ConsoleTone> = {
  installed: "info",
  active: "success",
  verified: "success",
  failed: "danger",
  pending: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  installed: "Installed",
  active: "Active",
  verified: "Verified",
  failed: "Failed",
  pending: "Pending",
};

export function ControlStatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  const label = STATUS_LABEL[status] ?? status;

  return (
    <StatusBadge tone={tone}>
      {label}
    </StatusBadge>
  );
}
