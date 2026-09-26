/**
 * Collector coverage rows arrive on the v2 coverage and pipeline reads.
 * Unknown and stale stay first-class words. AWS surface copy is unchanged.
 */

import type { PipelineAccount } from "@/app/api/igaGraphApi";

export function isCollectorAccount(account: Pick<PipelineAccount, "state" | "integration">): boolean {
  return account.state === "collector" || account.integration.startsWith("integration:");
}

/** Words for a collector coverage state. Unknown and stale are not softened. */
export function coverageStateLabel(state: string | null | undefined): string {
  if (!state || state === "unknown") return "Unknown";
  if (state === "stale") return "Stale";
  if (state === "not_configured") return "Not configured";
  return state.replace(/_/g, " ");
}
