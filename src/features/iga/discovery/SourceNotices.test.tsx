import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import type { Connection } from "@/app/api/connectionsApi";
import { SESSION_KEY } from "@/utils/sessionManager";

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

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Signs this tab in as `user` of `workspace`; the identity is the token's claims. */
function signIn(workspace: string, user: string) {
  const claims = { exp: Math.floor(Date.now() / 1000) + 3600, workspace_id: workspace, user_id: user };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.sig` }));
}

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";

describe("SourceNotices", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

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

  it("does not carry a dismissal into another workspace or another user's session in the same tab", () => {
    // A Kubernetes sweep notice is keyed by the cluster's name, which two workspaces can share.
    const sweep = notice({ key: "sweep:prod", label: "Namespaces only" });
    signIn(WS_A, "u1");
    const { unmount } = renderNotices([sweep]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    unmount();

    signIn(WS_B, "u1");
    const other = renderNotices([sweep]);
    expect(screen.getByText("Namespaces only")).toBeTruthy();
    other.unmount();

    signIn(WS_A, "u2");
    const otherUser = renderNotices([sweep]);
    expect(screen.getByText("Namespaces only")).toBeTruthy();
    otherUser.unmount();

    signIn(WS_A, "u1");
    renderNotices([sweep]);
    expect(screen.queryByText("Namespaces only")).toBeNull();
  });

  it("re-reads the dismissals when the session changes under a mounted list", () => {
    const sweep = notice({ key: "sweep:prod", label: "Namespaces only" });
    signIn(WS_A, "u1");
    const { rerender } = renderNotices([sweep]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss this notice" }));
    signIn(WS_B, "u1");
    rerender(
      <MemoryRouter>
        <SourceNotices notices={[sweep]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Namespaces only")).toBeTruthy();
  });
});
