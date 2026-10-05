import { describe, expect, it } from "vitest";

import { INCOMPLETE_STATES } from "./labels";
import { incompleteAccounts, unfilteredEmpty } from "./listSummary";
import type { GraphCoverageGap } from "@/app/api/igaGraphApi";

const gap = (account_id: string, state: GraphCoverageGap["state"]): GraphCoverageGap =>
  ({ account_id, state, surface: `${account_id}:${state}` }) as GraphCoverageGap;

/**
 * Revocation is a decision the customer made, not a failed read. Treating it
 * as a coverage gap put an orange "Discovery is incomplete" banner, an
 * "incomplete" pager badge and a qualified empty state in front of someone who
 * had deliberately disconnected an account — none of it naming a problem they
 * could act on. Discovery's source notices report revoked connections separately,
 * in neutral tone, which is the honest place for it.
 */
describe("INCOMPLETE_STATES", () => {
  it("excludes revoked — a deliberate disconnection is not a collection gap", () => {
    expect(INCOMPLETE_STATES.has("revoked")).toBe(false);
  });

  it("still includes every state that happened TO the collection", () => {
    for (const s of ["partial", "denied", "throttled", "unknown", "stale", "constrained"] as const) {
      expect(INCOMPLETE_STATES.has(s)).toBe(true);
    }
  });

  it("excludes the states nobody asked to collect", () => {
    for (const s of ["not_selected", "unsupported", "not_configured", "reached"] as const) {
      expect(INCOMPLETE_STATES.has(s)).toBe(false);
    }
  });
});

describe("incompleteAccounts", () => {
  const nameOf = (id: string) => id;

  it("does not name an account whose only gap is that it was revoked", () => {
    expect(incompleteAccounts([gap("111", "revoked")], nameOf)).toEqual([]);
  });

  it("still names an account AWS actually refused", () => {
    expect(incompleteAccounts([gap("111", "denied")], nameOf)).toEqual(["111"]);
  });

  it("names only the genuinely incomplete account when both are present", () => {
    const gaps = [gap("111", "revoked"), gap("222", "throttled")];
    expect(incompleteAccounts(gaps, nameOf)).toEqual(["222"]);
  });
});

describe("unfilteredEmpty", () => {
  it("does not qualify an empty result because an account was revoked", () => {
    const copy = unfilteredEmpty("workloads", incompleteAccounts([gap("111", "revoked")], (id) => id));
    expect(copy).not.toMatch(/incomplete/i);
    expect(copy).toContain("no workloads were found");
  });

  it("still qualifies it when a read genuinely fell short", () => {
    const copy = unfilteredEmpty("workloads", incompleteAccounts([gap("111", "denied")], (id) => id));
    expect(copy).toMatch(/incomplete/i);
  });
});
