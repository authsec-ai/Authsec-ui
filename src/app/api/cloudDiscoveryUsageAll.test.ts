import { describe, expect, it } from "vitest";
import { accumulateUsagePages } from "./cloudDiscoveryApi";

/** A source of `count` rows served 500 at a time, optionally reporting a total. */
function pagedSource(count: number, withMeta: boolean, failAtPage?: number) {
  let pages = 0;
  return async (offset: number) => {
    pages += 1;
    if (failAtPage && pages === failAtPage) {
      return { error: { status: 500, data: "boom" } as never };
    }
    const rows = Array.from({ length: Math.max(0, Math.min(500, count - offset)) }, (_, i) => ({
      id: `u-${offset + i}`,
    }));
    return {
      envelope: {
        data: rows,
        meta: withMeta ? { total: count, limit: 500, offset } : {},
      },
    } as never;
  };
}

describe("accumulateUsagePages", () => {
  it("keeps paging when the server reports no total", async () => {
    // The defect: `total` seeded from the first page's length is satisfied by
    // that same page, so the walk ended at 500 rows and called itself complete.
    const res = await accumulateUsagePages(pagedSource(2500, false));
    const d = "data" in res ? res.data : null;
    expect(d!.pagesFetched).toBe(4); // capped at 2000, not stopped at 500
    expect(d!.rows.length).toBe(2000);
    expect(d!.totalKnown).toBe(false);
    expect(d!.truncated).toBe(true);
  });

  it("treats a short page as proof of exhaustion", async () => {
    const res = await accumulateUsagePages(pagedSource(700, false));
    const d = "data" in res ? res.data : null;
    expect(d!.rows.length).toBe(700);
    expect(d!.truncated).toBe(false);
  });

  it("is exact when the server reports a total", async () => {
    const res = await accumulateUsagePages(pagedSource(1200, true));
    const d = "data" in res ? res.data : null;
    expect(d!.rows.length).toBe(1200);
    expect(d!.total).toBe(1200);
    expect(d!.totalKnown).toBe(true);
    expect(d!.truncated).toBe(false);
  });

  it("keeps earlier pages when a later one fails, and says it is incomplete", async () => {
    const res = await accumulateUsagePages(pagedSource(2500, false, 3));
    const d = "data" in res ? res.data : null;
    expect(d!.rows.length).toBe(1000);
    expect(d!.truncated).toBe(true);
    expect(d!.partialError).toBeDefined();
  });

  it("returns the error when the first page fails", async () => {
    const res = await accumulateUsagePages(pagedSource(2500, false, 1));
    expect("error" in res).toBe(true);
  });
});
