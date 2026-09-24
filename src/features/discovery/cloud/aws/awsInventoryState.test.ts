import { describe, expect, it } from "vitest";
import { inventoryEmptyReason, truncationOf } from "./awsInventoryState";
import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { COVERAGE_STATE_LABEL } from "./awsInventoryLabels";

/** A response with no pagination metadata must not read as a complete one.
 *
 * `toCloudPage` sets `total = offset + rows.length` when the server reports
 * nothing, so the natural comparison `offset + rows < total` is always false.
 * Every truncation warning was therefore suppressed on exactly the deployments
 * that could not prove completeness. */
describe("truncationOf", () => {
  it("presumes a full page with no reported total is truncated", () => {
    const t = truncationOf({
      rows: new Array(500).fill(null),
      total: 500, // the invented floor, not a count
      totalKnown: false,
      limit: 500,
      offset: 0,
    });
    expect(t.truncated).toBe(true);
    expect(t.totalKnown).toBe(false);
    expect(t.shown).toBe(500);
  });

  it("does not cry truncation on a short page with no reported total", () => {
    const t = truncationOf({
      rows: new Array(12).fill(null),
      total: 12,
      totalKnown: false,
      limit: 500,
      offset: 0,
    });
    expect(t.truncated).toBe(false);
  });

  it("is exact when the server reports a total", () => {
    expect(
      truncationOf({ rows: new Array(100).fill(null), total: 250, totalKnown: true, limit: 100, offset: 0 })
        .truncated,
    ).toBe(true);
    // Position 200 of 250 is not truncation at 100 — it is the last page.
    expect(
      truncationOf({ rows: new Array(50).fill(null), total: 250, totalKnown: true, limit: 100, offset: 200 })
        .truncated,
    ).toBe(false);
  });
});

/** inventoryEmptyReason's verdict for a non-identity surface.
 *
 * It used to hard-code `surface === "identities"` as the only view allowed to
 * claim a genuinely empty account, on the premise that coverage carried the
 * four iam_* keys and nothing else. FinalizeCoverage merges every phase's
 * surfaces into that blob before a run publishes, so the premise stopped being
 * true and each non-identity view answered "we cannot tell you why this is
 * empty" while holding a report that said the surface was reached.
 *
 * Both directions matter: using the evidence when it is there, and still
 * withholding the verdict when it is not. */
describe("inventoryEmptyReason", () => {
  const connector = (surfaces: Record<string, { state: string; count: number }>): CloudConnector =>
    ({
      id: "c1",
      workspace_id: "w1",
      provider: "aws",
      scope_kind: "account",
      scope_id: "429418377036",
      status: "active",
      scan_generation: 3,
      coverage: { status: "complete", surfaces },
      attrs: { template_version: "2026-09-18" },
      created_by: "admin",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    }) as unknown as CloudConnector;

  it("trusts a reported surface and calls the account genuinely empty", () => {
    const c = connector({
      iam_roles: { state: "reached", count: 3 },
      activity: { state: "reached", count: 0 },
    });
    expect(inventoryEmptyReason([c], "usage").kind).toBe("genuinely_empty");
  });

  it("withholds the verdict when coverage names no result for the surface", () => {
    // An older backend, or a scan from before the phases were merged.
    const c = connector({ iam_roles: { state: "reached", count: 3 } });
    expect(inventoryEmptyReason([c], "usage").kind).toBe("phase_unobservable");
  });

  it("still answers for identities, which coverage always described", () => {
    const c = connector({ iam_roles: { state: "reached", count: 0 } });
    expect(inventoryEmptyReason([c], "identities").kind).toBe("genuinely_empty");
  });

  it("lets one silent connector withhold the verdict for all of them", () => {
    // Absence of a report is not a report of absence, and the view shows every
    // account at once — so the quietest connector sets the ceiling.
    const reported = connector({ activity: { state: "reached", count: 0 } });
    const silent = { ...connector({ iam_roles: { state: "reached", count: 1 } }), id: "c2" };
    expect(inventoryEmptyReason([reported, silent], "usage").kind).toBe("phase_unobservable");
  });

  it("recognises the compute phase from a region-suffixed surface key", () => {
    // Compute keys are "<surface>:<region>", so no fixed list can name them.
    const c = connector({ "lambda:us-east-1": { state: "reached", count: 0 } });
    expect(inventoryEmptyReason([c], "compute").kind).toBe("genuinely_empty");
  });

  it("recognises the permission phase from the surfaces a clean scan writes", () => {
    const c = connector({
      oidc_providers: { state: "reached", count: 0 },
      resource_policies: { state: "reached", count: 0 },
    });
    expect(inventoryEmptyReason([c], "permissions").kind).toBe("genuinely_empty");
  });

  it("does not mistake a failed-phase marker for a phase that ran", () => {
    // FinalizeCoverage writes `permission_scan` ONLY when the phase failed
    // before producing any snapshot. Reading it as proof the phase ran is
    // exactly backwards, and it is the mistake the first version of this
    // mapping made -- it keyed every non-identity view on these two markers,
    // so the improvement silently never fired on a healthy scan.
    const c = connector({ permission_scan: { state: "denied", count: 0 } });
    expect(inventoryEmptyReason([c], "permissions").kind).not.toBe("genuinely_empty");
  });
});

/** The state vocabulary the console can render must match the backend's.
 *
 * `models.SurfaceStates` in cloud_discovery.go is the authoritative list, and
 * its own comment says it exists "for validation and for the console's total
 * Record" — this Record is that one. Two states were missing when this was
 * written (`partial`, `not_selected`), both actively produced by real scans,
 * and both rendered as a pill with no text because a Record lookup returned
 * undefined. A third (`unsupported`) was declared and unwritten.
 *
 * Hard-coded rather than imported: the two repos do not share a type, so the
 * only way this stays honest is a human updating it when the Go list changes.
 * That is the point — the test fails loudly instead of a pill going blank. */
describe("coverage state vocabulary", () => {
  const BACKEND_SURFACE_STATES = [
    "reached",
    "partial",
    "denied",
    "throttled",
    "constrained",
    "stale",
    "not_configured",
    "not_selected",
    "unsupported",
    "unknown",
  ] as const;

  it("labels every state models.SurfaceStates declares", () => {
    const missing = BACKEND_SURFACE_STATES.filter((s) => !COVERAGE_STATE_LABEL[s]);
    expect(missing, `states that would render as a blank pill: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares no state the backend does not", () => {
    const extra = Object.keys(COVERAGE_STATE_LABEL).filter(
      (s) => !BACKEND_SURFACE_STATES.includes(s as (typeof BACKEND_SURFACE_STATES)[number]),
    );
    expect(extra, `states the backend cannot produce: ${extra.join(", ")}`).toEqual([]);
  });
});
