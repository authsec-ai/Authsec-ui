import { beforeEach, describe, expect, it } from "vitest";
import { store } from "./store";
import { completeWebAuthnAuthentication, logout } from "../auth/slices/authSlice";
import { setAuthToken, setCurrentStep } from "../auth/slices/adminWebAuthnSlice";

// Sign-in got stuck on "Login successful, Finalizing secure session": the
// session reset that runs when the signed-in identity changes also ran for
// the sign-in itself and cleared the admin flow's token, so the redirect,
// which waits for step "completed" AND a token, never fired.

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const WS = "11111111-1111-4111-8111-111111111111";
const TOKEN = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({
  workspace_id: WS,
  user_id: "u1",
  email: "a@example.com",
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.sig`;

describe("admin sign-in completion", () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(logout());
  });

  it("keeps the flow's step and token through the sign-in", () => {
    store.dispatch(setAuthToken(TOKEN));
    store.dispatch(completeWebAuthnAuthentication({ workspaceId: WS, email: "a@example.com", token: TOKEN }));
    store.dispatch(setCurrentStep("completed"));

    const s = store.getState();
    expect(s.auth.isAuthenticated).toBe(true);
    expect(s.adminWebAuthn.currentStep).toBe("completed");
    expect(s.adminWebAuthn.authToken).toBe(TOKEN);
  });

  it("still clears the flow when the session ends", () => {
    store.dispatch(setAuthToken(TOKEN));
    store.dispatch(completeWebAuthnAuthentication({ workspaceId: WS, email: "a@example.com", token: TOKEN }));
    store.dispatch(setCurrentStep("completed"));
    store.dispatch(logout());

    const s = store.getState();
    expect(s.adminWebAuthn.currentStep).toBe("login");
    expect(s.adminWebAuthn.authToken).toBeNull();
  });
});
