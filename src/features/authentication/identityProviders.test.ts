import { configureStore } from "@reduxjs/toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendRequests } from "../../test/apiRequest";
import { authMethodApi } from "../../app/api/authMethodApi";
import { identityProviderCrumb } from "../../components/layout/Breadcrumb";
import { providerEditPath } from "./utils/providerPaths";
import { providerLoadError } from "./utils/providerLoadError";

// Intern report (Identity Providers, issues 1-2): Edit opened
// /identity-providers/saml/edit/<row key> for every provider. The row key
// (`saml-<uuid>`, `oidc-<name>-undefined`) is not an id the backend knows, so
// GET /authsec/identity-providers/:id answered 400 and the page said
// "Provider not found". Every action now uses the identity_providers id.

const ID = "e767d47c-1111-4222-8333-944445555666";

describe("providerEditPath", () => {
  it("opens the page of the provider's own protocol, by its UUID", () => {
    expect(providerEditPath({ provider_type: "saml", idp_id: ID })).toBe(`/identity-providers/saml/edit/${ID}`);
    expect(providerEditPath({ provider_type: "oidc", idp_id: ID })).toBe(`/identity-providers/oidc/edit/${ID}`);
  });
});

describe("identityProviderCrumb", () => {
  it("names the create and edit pages instead of showing the id", () => {
    expect(identityProviderCrumb(["identity-providers", "saml", "edit", ID])).toBe("Edit SAML provider");
    expect(identityProviderCrumb(["identity-providers", "oidc", "edit", ID])).toBe("Edit OIDC provider");
    expect(identityProviderCrumb(["identity-providers", "saml", "create"])).toBe("New SAML provider");
    expect(identityProviderCrumb(["identity-providers", "create"])).toBe("New OIDC provider");
  });

  it("leaves other paths alone", () => {
    expect(identityProviderCrumb(["identity-providers"])).toBeNull();
    expect(identityProviderCrumb(["clients", "saml", "edit", ID])).toBeNull();
  });
});

describe("providerLoadError", () => {
  it("tells a missing provider from a failed load", () => {
    expect(providerLoadError({ status: 404 })).toBe("Provider not found");
    expect(providerLoadError({ status: 400 })).toBe("This link does not name a provider");
    expect(providerLoadError({ status: 500, data: { error: "db down" } })).toBe("Could not load the provider: db down");
  });
});

describe("OIDC provider API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the identity_providers id in the OIDC list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([{ id: ID, display_name: "Google", provider_type: "oidc", status: "configured", config_ref: "" }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const store = configureStore({
      reducer: { [authMethodApi.reducerPath]: authMethodApi.reducer },
      middleware: (d) => d({ serializableCheck: false }).concat(authMethodApi.middleware),
    });
    const res = await store.dispatch(authMethodApi.endpoints.showAuthProviders.initiate({ workspace_id: "ws" }));
    expect(res.data?.data.providers[0].id).toBe(ID);
  });

  it("updates an OIDC provider by id with the create-shaped body", async () => {
    const sent = await sendRequests(authMethodApi, "updateOIDCIdentityProvider", {
      id: ID,
      display_name: "Google",
      config: { client_id: "cid", authorization_url: "https://a", token_url: "https://t", userinfo_url: "https://u" },
    });
    expect(sent).toEqual([
      {
        method: "PUT",
        path: `/authsec/identity-providers/${ID}`,
        body: {
          provider_type: "oidc",
          display_name: "Google",
          config: { client_id: "cid", authorization_url: "https://a", token_url: "https://t", userinfo_url: "https://u" },
        },
      },
    ]);
  });
});
