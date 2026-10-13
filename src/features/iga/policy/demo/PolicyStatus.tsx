import { StatusBadge } from "@/components/console/status";
import type { PolicyDemoPhase } from "@/app/api/policyDemoApi";

import { PHASE } from "./policyDemoModel";

export function PhaseChip({ phase }: { phase: PolicyDemoPhase }) {
  const p = PHASE[phase];
  return (
    <StatusBadge tone={p.tone} title={p.hint}>
      {p.label}
    </StatusBadge>
  );
}
