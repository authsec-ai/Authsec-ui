/** A state as text plus tone, with its meaning on hover. */

import { StatusBadge } from "@/components/console/status";

import type { StateView } from "./labels";

export function StateChip({ state, className }: { state: StateView; className?: string }) {
  return (
    <StatusBadge tone={state.tone} title={state.hint} className={className}>
      {state.label}
    </StatusBadge>
  );
}
