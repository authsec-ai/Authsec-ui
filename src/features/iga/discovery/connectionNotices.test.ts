import { describe, expect, it } from "vitest";

import type { Connection } from "@/app/api/connectionsApi";

import { connectionNotices } from "./connectionNotices";

function conn(overrides: Partial<Connection>): Connection {
  return {
    id: "c1",
    provider: "aws",
    scope_kind: "tenant",
    name: "Test connection",
    native_id: "n1",
    scope_id: "n1",
    created_at: "2026-01-01T00:00:00Z",
    connection: { state: "connected", reason_code: null, verified_at: "2026-01-01T00:00:00Z" },
    scan: { state: "finished", at: "2026-01-01T00:00:00Z", run_id: "r1" },
    coverage: { state: "complete", gaps: [] },
    graph: { state: "not_applicable", rev: null, published_at: null },
    scope_summary: "1 region",
    discovery: { ready: true, as_of: "2026-01-01T00:00:00Z" },
    capabilities: { scan: true, verify: true, edit_scope: true, revoke: true, rules: false },
    ...overrides,
  } as Connection;
}

describe("connectionNotices: collection gaps", () => {
  it("gives a partial Azure tenant one coverage notice in Microsoft's words, linking to its Coverage tab", () => {
    const notices = connectionNotices(
      [
        conn({
          id: "az1",
          provider: "azure",
          name: "Contoso",
          coverage: {
            state: "partial",
            gaps: [
              { surface: "conditional_access", state: "denied" },
              { surface: "teams_apps", state: "throttled" },
            ],
          },
        }),
      ],
      { publishedView: false },
    );
    expect(notices).toHaveLength(1);
    const [n] = notices;
    expect(n.key).toBe("az1:coverage");
    expect(n.label).toBe("Collection partial");
    expect(n.href).toBe("/iga/connections/az1/coverage");
    expect(n.text).toContain("Sign-in rules (Conditional Access)");
    expect(n.text).toContain("Teams bots");
    // Never the raw surface key, never the AWS reading of it ("conditional access").
    expect(n.text).not.toContain("conditional_access");
    expect(n.text).not.toContain("teams_apps");
  });

  it("says Collection denied for a denied Azure tenant", () => {
    const notices = connectionNotices(
      [conn({ id: "az2", provider: "azure", name: "Fabrikam", coverage: { state: "denied", gaps: [{ surface: "users", state: "denied" }] } })],
      { publishedView: false },
    );
    expect(notices.map((n) => n.label)).toEqual(["Collection denied"]);
    expect(notices[0].text).toMatch(/^Fabrikam: People \(user accounts\) /);
  });

  it("keeps AWS gaps in AWS service names", () => {
    const notices = connectionNotices(
      [conn({ provider: "aws", coverage: { state: "partial", gaps: [{ surface: "iam_users", state: "throttled" }] } })],
      { publishedView: false },
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].text).not.toContain("Other area");
  });

  it("leaves coverage to the published view's own summary and to skipCoverage", () => {
    const azure = conn({ provider: "azure", coverage: { state: "partial", gaps: [{ surface: "users", state: "denied" }] } });
    expect(connectionNotices([azure], { publishedView: true })).toEqual([]);
    expect(connectionNotices([azure], { publishedView: false, skipCoverage: true })).toEqual([]);
  });
});
