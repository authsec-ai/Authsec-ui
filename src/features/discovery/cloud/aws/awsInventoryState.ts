/**
 * Why is an AWS inventory view empty?
 *
 * Split out of AWSInventoryNotices.tsx so that file exports only components
 * (the repo's react-refresh lint rule), but the reasoning belongs in its own
 * module for a better reason than lint: this derivation is the single place
 * that decides whether the console is allowed to tell a reader "there is
 * none". Every AWS inventory view routes its empty state through it.
 *
 * It exists because two facts about the backend are not expressed by any
 * response field:
 *
 * 1. `coverage` REPORTS THE IAM PHASE ONLY. `POST /connectors/:id/scan`
 *    returns 202 and chains three scanners in one goroutine — AWSIAMScanner,
 *    then AWSPermissionScanner, then AWSWorkloadScanner. Only the first writes
 *    `coverage.surfaces`, and only ever the four `iam_*` keys. The other two
 *    return in-process reports the controller discards apart from logging
 *    failures. So `coverage.status === "complete"` means the IAM phase
 *    finished; permissions, compute and usage may still be running, or may
 *    have failed with only the server log knowing.
 *
 * 2. A STACK DEPLOYED BEFORE TEMPLATE 2026-09-08 CANNOT DISCOVER COMPUTE.
 *    That version added the `WorkloadReads` statement; the commit that did it
 *    calls this "the one change that requires existing customers to redeploy
 *    their stack". Combined with (1), an old stack yields an empty compute
 *    list with no reason attached anywhere in the API response.
 *
 * All three situations — plus a genuinely empty account — produce the same
 * observable state of zero rows. Telling them apart is the whole job.
 */

import type { AWSConnectorAttrs, CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { stackPredatesCompute } from "./awsInventoryLabels";

export type InventorySurface = "identities" | "permissions" | "compute" | "usage";

export type InventoryEmptyReason =
  | { kind: "no_connectors" }
  | { kind: "never_scanned"; connectorId: string | null }
  | { kind: "scanning" }
  | { kind: "coverage_incomplete" }
  | { kind: "stale_stack" }
  | { kind: "phase_unobservable" }
  | { kind: "genuinely_empty" };

/**
 * Takes the connectors currently in scope — one when an account is selected,
 * all of them when it is not, which matters because five of the seven list
 * endpoints ignore `connector_id` and return the whole workspace regardless.
 * With several accounts connected the honest answer is the worst case across
 * them: one unscanned account is enough to make "nothing found" unsafe to say.
 *
 * Order is significance, not convenience. A running scan outranks incomplete
 * coverage (the coverage blob is mid-write), and both outrank a stale stack,
 * because a reader sent to update a CloudFormation stack when the scan simply
 * has not finished has been sent to do unnecessary work in their own cloud
 * console.
 */
export function inventoryEmptyReason(
  connectors: CloudConnector[],
  surface: InventorySurface,
): InventoryEmptyReason {
  const live = connectors.filter((c) => c.status !== "revoked");
  if (!live.length) return { kind: "no_connectors" };

  if (live.some((c) => c.coverage?.status === "running")) return { kind: "scanning" };

  const unscanned = live.filter((c) => c.scan_generation === 0);
  if (unscanned.length) {
    return {
      kind: "never_scanned",
      // Offer a direct scan action only when exactly one account is in scope.
      // With several, there is no single connector the button could act on.
      connectorId: live.length === 1 ? live[0].id : null,
    };
  }

  // `partial` and `failed` both mean the inventory is a floor, not a total.
  // This reflects the IAM phase only, which is exactly why the later surfaces
  // fall through to `phase_unobservable` rather than borrowing its verdict.
  if (live.some((c) => c.coverage?.status === "partial" || c.coverage?.status === "failed")) {
    return { kind: "coverage_incomplete" };
  }

  if (surface === "compute") {
    const anyStale = live.some((c) =>
      stackPredatesCompute((c.attrs as AWSConnectorAttrs | undefined)?.template_version),
    );
    if (anyStale) return { kind: "stale_stack" };
  }

  // The IAM phase succeeded. For identities that is a real verdict, because
  // coverage actually describes the surface they came from. For the other
  // three it is not: nothing in the API reports whether their scanner ran.
  if (surface === "identities") return { kind: "genuinely_empty" };
  return { kind: "phase_unobservable" };
}
