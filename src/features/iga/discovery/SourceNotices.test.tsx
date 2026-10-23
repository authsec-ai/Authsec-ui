import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { Connection } from "@/app/api/connectionsApi";

import { connectionNotices, type Notice } from "./connectionNotices";
import { SourceNotices } from "./SourceNotices";

function notice(overrides: Partial<Notice>): Notice {
  return { key: "n1", tone: "warning", label: "Authentication failed", text: "Fabrikam Inc: results from earlier scans remain.", ...overrides };
}

function renderNotices(notices: Notice[]) {
  return render(
    <MemoryRouter>
      <SourceNotices notices={notices} />
    </MemoryRouter>,
  );
}

describe("SourceNotices", () => {
  beforeEach(() => sessionStorage.clear());

  it("renders nothing when there are no notices", () => {
    const { container } = renderNotices([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a notice and removes it on dismiss, within this session", () => {
    renderNotices([notice({})]);
    expect(screen.getByText("Authentication failed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    expect(screen.queryByText("Authentication failed")).toBeNull();
  });

  it("keeps a dismissal across remounts of the same session", () => {
    const { unmount } = renderNotices([notice({})]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    unmount();
    renderNotices([notice({})]);
    expect(screen.queryByText("Authentication failed")).toBeNull();
  });

  it("does not let dismissing one notice hide a different one", () => {
    renderNotices([notice({ key: "n1", label: "Authentication failed" }), notice({ key: "n2", label: "Latest scan failed", text: "Contoso: results from earlier scans remain." })]);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss this notice" })[0]);
    expect(screen.queryByText("Authentication failed")).toBeNull();
    expect(screen.getByText("Latest scan failed")).toBeTruthy();
  });

  it("shows a partial Azure tenant's gaps as one closeable row in Microsoft's words", () => {
    const azure = {
      id: "az1",
      provider: "azure",
      scope_kind: "tenant",
      name: "Contoso",
      native_id: "t1",
      scope_id: "t1",
      created_at: "2026-01-01T00:00:00Z",
      connection: { state: "connected", reason_code: null, verified_at: "2026-01-01T00:00:00Z" },
      scan: { state: "finished", at: "2026-01-01T00:00:00Z", run_id: null },
      coverage: { state: "partial", gaps: [{ surface: "conditional_access", state: "denied" }] },
      graph: { state: "not_applicable", rev: null, published_at: null },
      scope_summary: "1 subscription",
      discovery: { ready: true, as_of: "2026-01-01T00:00:00Z" },
      capabilities: { scan: true, verify: true, edit_scope: false, revoke: true, rules: false },
    } as Connection;
    renderNotices(connectionNotices([azure], { publishedView: false }));
    expect(screen.getByText("Collection partial")).toBeTruthy();
    expect(screen.getByText(/Sign-in rules \(Conditional Access\)/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Dismiss this notice" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    expect(screen.queryByText("Collection partial")).toBeNull();
  });
});
