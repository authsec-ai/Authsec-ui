import { describe, expect, it } from "vitest";
import { decodeJWT } from "./jwt";

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const token = (claims: Record<string, unknown>) => `${b64url({ alg: "HS256" })}.${b64url(claims)}.sig`;

// UI-033: the workspace comes from the workspace_id claim only; the legacy
// tenant_id claim is not a fallback.

describe("decodeJWT", () => {
  it("reads the workspace from workspace_id", () => {
    expect(decodeJWT(token({ workspace_id: "ws-1", tenant_id: "t-1" }))?.workspace_id).toBe("ws-1");
  });

  it("does not fall back to tenant_id", () => {
    expect(decodeJWT(token({ tenant_id: "t-1" }))?.workspace_id).toBe("");
  });
});
