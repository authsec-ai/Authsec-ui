import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_KEY } from "@/utils/sessionManager";

import { OLD_TOKEN_REVOKE_DELAY_MS, ensureWorkspaceMemberSession } from "./workspaceMemberSession";

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const WS = "11111111-1111-4111-8111-111111111111";
const jwt = (claims: Record<string, unknown>) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, workspace_id: WS, user_id: "u1", ...claims })}.sig`;

describe("member-session swap", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("revokes the replaced login token on the server, after in-flight requests end", async () => {
    const login = jwt({ jti: "login-1" });
    const member = jwt({ jti: "member-1", workspace_membership_id: "m-1" });
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: login, workspace_id: WS, user_id: "u1" }));
    const calls: { url: string; auth: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, auth: String((init.headers as Record<string, string>).Authorization) });
        return url.endsWith("/switch")
          ? new Response(JSON.stringify({ access_token: member }), { status: 200 })
          : new Response("{}", { status: 200 });
      }),
    );

    const res = await ensureWorkspaceMemberSession();
    expect(res).toEqual({ ok: true, upgraded: true });
    expect(calls.some((c) => c.url.endsWith("/auth/logout"))).toBe(false);

    await vi.advanceTimersByTimeAsync(OLD_TOKEN_REVOKE_DELAY_MS);
    const logout = calls.filter((c) => c.url.endsWith("/auth/logout"));
    expect(logout).toHaveLength(1);
    expect(logout[0].auth).toBe(`Bearer ${login}`);
  });
});
