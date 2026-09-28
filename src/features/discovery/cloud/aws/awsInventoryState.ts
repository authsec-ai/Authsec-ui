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
 * 1. `coverage` IS WRITTEN AT PUBLISH, NOT DURING THE SCAN.
 *    `POST /connectors/:id/scan` enqueues a run; a leased background worker
 *    then runs AWSIAMScanner, AWSPermissionScanner and AWSWorkloadScanner
 *    against one generation and calls FinalizeCoverage, which merges all three
 *    phases' surfaces into this blob before the run publishes. So the report
 *    DOES describe every phase — an earlier version of this file said it
 *    covered the IAM phase only, which stopped being true when FinalizeCoverage
 *    landed. What it cannot describe is a scan still in flight: until that run
 *    publishes, this is the previous run's answer, and a surface the last scan
 *    never reported on is one nobody can speak for.
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

import type { AWSConnectorAttrs, CloudConnector, CloudPage } from "@/app/api/cloudDiscoveryApi";
import { stackPredatesCompute } from "./awsInventoryLabels";

/* ─────────────────────── Is this list the whole list? ────────────────────
 *
 * Separate from the empty-state question above, and just as load-bearing. The
 * AWS discovery endpoints cap every response at 500 rows and default to 100,
 * so ANY list can be a prefix of the truth. A console that renders a prefix
 * without saying so reports a smaller account than the customer has — the one
 * failure mode worse than showing nothing.
 */

export interface Truncation {
  /** Known, or presumed, not to be the whole set. */
  truncated: boolean;
  /** Rows actually in hand. */
  shown: number;
  /** What the server says exists. A floor when `totalKnown` is false. */
  total: number;
  totalKnown: boolean;
}

/** Derived in one place so no page hand-rolls the comparison.
 *
 * With a server total the comparison uses `offset + rows.length`, not
 * `rows.length`: on page three, having 100 rows of 250 is not truncation at
 * 100, it is position 200 of 250.
 *
 * WITHOUT a server total the comparison cannot be made at all. `total` is then
 * only the rows in hand, so `offset + rows < total` is always false and every
 * warning is suppressed — a 2,500-row account with no pagination metadata
 * rendered 500 rows and called itself complete. A full page is therefore
 * PRESUMED truncated: missing evidence has to bias toward "there may be more",
 * because the alternative is an absent meta block quietly asserting the
 * opposite. */
export function truncationOf(
  page: Pick<CloudPage<unknown>, "rows" | "total" | "offset" | "totalKnown" | "limit">,
): Truncation {
  const truncated = page.totalKnown
    ? page.offset + page.rows.length < page.total
    : page.rows.length >= page.limit;
  return {
    truncated,
    shown: page.rows.length,
    total: page.total,
    totalKnown: page.totalKnown,
  };
}

export type InventorySurface =
  | "identities"
  | "permissions"
  | "compute"
  | "usage"
  | "resources"
  // AgentCore workload identities. Its own surface rather than borrowing
  // "compute": the stale-stack branch below is compute-only and would tell an
  // operator their CloudFormation template lacks the Lambda, ECS and EC2 reads
  // — permissions that have nothing to do with bedrock-agentcore.
  | "workload_identities";

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

  // The scan succeeded. Whether that is a verdict for THIS surface depends on
  // whether the coverage report actually describes it.
  //
  // It used to depend only on `surface === "identities"`, on the premise that
  // coverage carried the four iam_* keys and nothing else. FinalizeCoverage
  // made that false — it merges the permission and workload phases' surfaces
  // into the same blob before publishing — so every non-identity view was
  // answering "we cannot tell you why this is empty" while holding, in hand,
  // a report that says the surface was reached.
  //
  // The check is per-connector and conservative: a connector whose blob does
  // not mention this surface (an older backend, or a scan predating the merge)
  // still cannot speak for it, and one silent connector is enough to withhold
  // the verdict for everyone.
  if (coverageDescribes(live, surface)) return { kind: "genuinely_empty" };
  return { kind: "phase_unobservable" };
}

/** The coverage surface keys that answer for each inventory view.
 *
 * These are the keys a SUCCESSFUL scan writes, verified against a real
 * published report rather than inferred from the constant names. Two traps
 * worth recording, because both were fallen into first:
 *
 *  - `permission_scan` and `workload_scan` are NOT markers that those phases
 *    ran. FinalizeCoverage writes them only when a phase failed before
 *    producing any snapshot at all, as a stand-in for the surfaces it never
 *    reached. Keying on them means never recognising a healthy scan.
 *  - `policy_documents` appears only on a PARTIAL permission read
 *    (surfacePartial), so it is absent from every clean scan.
 *
 * What a healthy phase always writes: the IAM phase, iam_roles / iam_users;
 * the permission phase, oidc_providers / eks_pod_identity / resource_policies;
 * the workload phase, activity plus one "<surface>:<region>" per selected
 * region and "compute:<region>" per unselected one. */
const SURFACE_COVERAGE_KEYS: Record<InventorySurface, string[]> = {
  identities: ["iam_roles", "iam_users"],
  permissions: ["oidc_providers", "resource_policies"],
  // A cloud_resource row exists only because a parsed statement named its ARN,
  // so the permission phase is what answers for this view too.
  resources: ["resource_policies"],
  usage: ["activity"],
  compute: [],
  workload_identities: [],
};

/** Prefix-matched keys, for the surfaces that carry a region.
 *
 * There is one key per surface per region, so no fixed list can name them and
 * the set depends on what the operator selected. At least one region is always
 * selected — onboarding rejects an empty list — so a workload phase that ran
 * always leaves at least one of these behind. */
const SURFACE_COVERAGE_PREFIXES: Record<InventorySurface, string[]> = {
  identities: [],
  permissions: [],
  resources: [],
  usage: [],
  compute: ["lambda:", "ecs:", "ec2:", "bedrock-agents:", "bedrock-agentcore:", "compute:"],
  workload_identities: ["agentcore-workload-identities:"],
};

/** Whether EVERY live connector's coverage report speaks to this surface.
 *
 * Only presence is checked, not state: a surface that was denied, throttled or
 * partly read has already been caught by the `partial`/`failed` branch above,
 * because FinalizeCoverage folds those into the connector-level status. What
 * is being asked here is narrower — "did the last scan report on this at
 * all" — and the honest answer when it did not is that nobody can say. */
function coverageDescribes(connectors: CloudConnector[], surface: InventorySurface): boolean {
  const keys = SURFACE_COVERAGE_KEYS[surface];
  const prefixes = SURFACE_COVERAGE_PREFIXES[surface];
  if (!keys.length && !prefixes.length) return false;
  return connectors.every((c) => {
    const surfaces = c.coverage?.surfaces;
    if (!surfaces) return false;
    if (keys.some((k) => surfaces[k] !== undefined)) return true;
    if (!prefixes.length) return false;
    return Object.keys(surfaces).some((k) => prefixes.some((p) => k.startsWith(p)));
  });
}
