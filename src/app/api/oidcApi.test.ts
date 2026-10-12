import { describe, expect, it } from "vitest";
import { oidcApi } from "./oidcApi";

// UI-019: /authsec/hmgr/auth/callback was removed from the backend; upstream
// providers return to /authsec/uflow/oidc/callback on the server. The SPA
// must not keep an endpoint that posts to the removed route.

describe("oidcApi", () => {
  it("has no endpoint for the removed hmgr social callback", () => {
    expect(Object.keys(oidcApi.endpoints)).not.toContain("handleCallback");
  });
});
