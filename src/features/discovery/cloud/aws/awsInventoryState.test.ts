import { describe, expect, it } from "vitest";
import { truncationOf } from "./awsInventoryState";

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
