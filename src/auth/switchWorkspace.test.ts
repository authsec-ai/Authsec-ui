import { describe, expect, it, vi } from "vitest";
import { SESSION_KEY } from "../utils/sessionManager";
import { getWorkspaceId } from "../utils/workspace";
import { switchSessionWorkspace } from "./switchWorkspace";

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const tok = (ws: string) =>
  `${b64url({ alg: "HS256" })}.${b64url({ workspace_id: ws, user_id: "u", exp: Math.floor(Date.now() / 1000) + 3600 })}.s`;

describe("switchSessionWorkspace", () => {
  it("makes the new token's workspace the active one and reloads", () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: tok(A), workspace_id: A }));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    switchSessionWorkspace(tok(B));

    expect(getWorkspaceId()).toBe(B);
    expect(assign).toHaveBeenCalledWith("/");
    vi.unstubAllGlobals();
  });
});
