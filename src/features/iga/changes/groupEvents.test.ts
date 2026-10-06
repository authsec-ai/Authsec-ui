import { describe, expect, it } from "vitest";

import type { ChangeEvent } from "@/app/api/igaGraphApi";

import { eventGroupOf, eventTypeOf } from "./eventTypes";
import { groupByScan, parseAt, unchangedSinceNewest } from "./groupEvents";

const ev = (id: string, at: string, event: ChangeEvent["event"] = "grant_started", detail: ChangeEvent["detail"] = {}): ChangeEvent =>
  ({ id, at, event, detail, labels: {}, claims: [], subject: "workload:1", rev: 1, run: null, reason: null }) as unknown as ChangeEvent;

describe("groupByScan", () => {
  it("collapses events with the same timestamp into one scan", () => {
    const g = groupByScan([ev("a", "2026-09-25T15:04:00Z"), ev("b", "2026-09-25T15:04:00Z"), ev("c", "2026-09-25T15:04:00Z")]);
    expect(g).toHaveLength(1);
    expect(g[0].events.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps different scans apart, newest first order preserved", () => {
    const g = groupByScan([ev("a", "2026-09-26T10:00:00Z"), ev("b", "2026-09-25T15:04:00Z")]);
    expect(g.map((x) => x.at)).toEqual(["2026-09-26T10:00:00Z", "2026-09-25T15:04:00Z"]);
  });

  it("does not merge two runs that are not adjacent", () => {
    const g = groupByScan([ev("a", "t1"), ev("b", "t2"), ev("c", "t1")]);
    expect(g.map((x) => x.at)).toEqual(["t1", "t2", "t1"]);
  });

  it("is empty for no events", () => {
    expect(groupByScan([])).toEqual([]);
  });
});

describe("parseAt", () => {
  it("returns null rather than an invalid Date", () => {
    expect(parseAt("not a date")).toBeNull();
    expect(parseAt(null)).toBeNull();
    expect(parseAt("2026-09-25T15:04:00Z")).toBeInstanceOf(Date);
  });
});

describe("unchangedSinceNewest", () => {
  it("is true when the object was re-confirmed after its newest change", () => {
    expect(unchangedSinceNewest("2026-09-25T15:04:00Z", "2026-10-05T01:00:00Z")).toBe(true);
  });

  it("is false when the newest change is later than the last confirmation", () => {
    expect(unchangedSinceNewest("2026-10-06T00:00:00Z", "2026-10-05T01:00:00Z")).toBe(false);
  });

  it("says nothing when a time is missing or unreadable", () => {
    expect(unchangedSinceNewest(undefined, "2026-10-05T01:00:00Z")).toBeNull();
    expect(unchangedSinceNewest("2026-09-25T15:04:00Z", null)).toBeNull();
    expect(unchangedSinceNewest("garbage", "2026-10-05T01:00:00Z")).toBeNull();
  });
});

describe("event types and groups", () => {
  it("names ordinary grants plainly and wildcard grants as broad", () => {
    expect(eventTypeOf(ev("a", "t", "grant_started", { actions: ["s3:GetObject"], targets: [] })).label).toBe("Access granted");
    const broad = eventTypeOf(ev("b", "t", "grant_started", { actions: ["logs:*"], targets: [] }));
    expect(broad.label).toBe("Broad access granted");
    expect(broad.tone).toBe("danger");
  });

  it("files events under the filter a reader would choose", () => {
    expect(eventGroupOf({ event: "grant_started" })).toBe("access");
    expect(eventGroupOf({ event: "policy_attached" })).toBe("access");
    expect(eventGroupOf({ event: "relationship_started" })).toBe("identity");
    expect(eventGroupOf({ event: "first_seen" })).toBe("lifecycle");
    expect(eventGroupOf({ event: "coverage_changed" })).toBe("coverage");
  });
});
