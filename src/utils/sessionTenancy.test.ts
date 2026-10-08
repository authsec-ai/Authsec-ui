import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_KEY, SessionManager, sessionIdentityFromStorage } from "./sessionManager";
import { getWorkspaceId } from "./workspace";
import { withSessionData } from "../app/api/baseApi";
import { endServerSession } from "../auth/endServerSession";

// ADR-0001 §8: the active workspace comes from the session token, never from
// editable local state; the server enforces it, the UI must not contradict it.

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function token(claims: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;
}
function store(session: Record<string, unknown>) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

const WS_TOKEN = "11111111-1111-4111-8111-111111111111";
const WS_EDITED = "22222222-2222-4222-8222-222222222222";

describe("session tenancy", () => {
  beforeEach(() => localStorage.clear());

  it("takes the workspace from the token, not the stored copy", () => {
    store({ token: token({ workspace_id: WS_TOKEN, user_id: "u1" }), workspace_id: WS_EDITED });
    expect(SessionManager.getSession()?.workspace_id).toBe(WS_TOKEN);
    expect(getWorkspaceId()).toBe(WS_TOKEN);
  });

  it("fills request bodies from the token even when the stored workspace was edited", () => {
    store({ token: token({ workspace_id: WS_TOKEN }), workspace_id: WS_EDITED });
    expect(withSessionData({ workspace_id: WS_EDITED }).workspace_id).toBe(WS_TOKEN);
  });

  it("does not guess a workspace for a token without one", () => {
    store({ token: token({ user_id: "u1" }), workspace_id: WS_EDITED });
    expect(getWorkspaceId()).toBeNull();
  });

  it("identifies a session by workspace and user from its token", () => {
    const a = JSON.stringify({ token: token({ workspace_id: WS_TOKEN, user_id: "u1" }) });
    const b = JSON.stringify({ token: token({ workspace_id: WS_EDITED, user_id: "u1" }) });
    expect(sessionIdentityFromStorage(a)).toBe(`${WS_TOKEN}|u1`);
    expect(sessionIdentityFromStorage(a)).not.toBe(sessionIdentityFromStorage(b));
    expect(sessionIdentityFromStorage(null)).toBe("");
  });

  it("clears sign-in state and per-flow keys on sign-out", () => {
    store({ token: token({ workspace_id: WS_TOKEN }) });
    sessionStorage.setItem("authsec_login_ticket", "t");
    sessionStorage.setItem("saml_post_webauthn", "true");
    sessionStorage.setItem("unrelated", "keep");
    SessionManager.clearSession();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem("authsec_login_ticket")).toBeNull();
    expect(sessionStorage.getItem("saml_post_webauthn")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("revokes the session on the server when signing out", async () => {
    const t = token({ workspace_id: WS_TOKEN });
    store({ token: t });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await endServerSession();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/authsec/auth/logout");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: `Bearer ${t}` });
    vi.unstubAllGlobals();
  });
});
