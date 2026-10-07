import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_KEY } from "./sessionManager";
import { scopedStorageKey } from "./scopedStorageKey";
import { WizardStorage } from "../features/wizards/utils/wizardStorage";

// UI-033: per-person UI state is kept per signed-in workspace and user.

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function signIn(ws: string, user: string) {
  const claims = { workspace_id: ws, user_id: user, exp: Math.floor(Date.now() / 1000) + 3600 };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: `${b64url({ alg: "HS256" })}.${b64url(claims)}.sig` }));
}

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";

describe("scopedStorageKey", () => {
  beforeEach(() => localStorage.clear());

  it("differs per workspace and per user", () => {
    signIn(WS_A, "u1");
    const a1 = scopedStorageKey("authsec_wizards");
    signIn(WS_A, "u2");
    const a2 = scopedStorageKey("authsec_wizards");
    signIn(WS_B, "u1");
    const b1 = scopedStorageKey("authsec_wizards");
    expect(new Set([a1, a2, b1]).size).toBe(3);
    expect(a1).toContain(WS_A);
  });

  it("keeps one person's wizard progress from another's view", () => {
    signIn(WS_A, "u1");
    WizardStorage.set({ completedWizards: ["mcp-setup"] as never });
    expect(WizardStorage.get().completedWizards).toContain("mcp-setup");
    signIn(WS_B, "u2");
    expect(WizardStorage.get().completedWizards).toHaveLength(0);
  });
});
