import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { Connection } from "@/app/api/connectionsApi";

import { ConnectionCoverageStrip } from "./ConnectionCoverageStrip";

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

function renderStrip(c: Connection) {
  return render(
    <MemoryRouter>
      <ConnectionCoverageStrip c={c} />
    </MemoryRouter>,
  );
}

describe("ConnectionCoverageStrip", () => {
  it("renders nothing when coverage is complete", () => {
    renderStrip(conn({ coverage: { state: "complete", gaps: [] } }));
    expect(screen.queryByText("Review collection gaps")).toBeNull();
  });

  it("renders nothing when coverage is unknown with no gaps", () => {
    renderStrip(conn({ coverage: { state: "unknown", gaps: [] } }));
    expect(screen.queryByText("Review collection gaps")).toBeNull();
  });

  it("shows the headline and AWS surface names for a partial AWS connection", () => {
    renderStrip(
      conn({
        provider: "aws",
        coverage: { state: "partial", gaps: [{ surface: "iam_users", state: "throttled" }] },
      }),
    );
    expect(screen.getByText("Discovery is incomplete here. Some results may be missing.")).toBeTruthy();
    fireEvent.click(screen.getByText("Review collection gaps"));
    expect(screen.getByText("What the latest read could not collect, and what that leaves unknown.")).toBeTruthy();
  });

  it("shows denied wording and Azure surface names for a denied Azure connection", () => {
    renderStrip(
      conn({
        provider: "azure",
        coverage: { state: "denied", gaps: [{ surface: "entra_agent_identity", state: "denied" }] },
      }),
    );
    expect(screen.getByText("Collection was denied here. Some results may be missing.")).toBeTruthy();
  });
});
