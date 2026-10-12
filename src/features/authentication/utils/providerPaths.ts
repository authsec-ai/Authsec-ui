import type { UnifiedAuthProvider } from "../types";

/** The edit page for a provider, addressed by its identity_providers id. */
export function providerEditPath(
  p: Pick<UnifiedAuthProvider, "provider_type" | "idp_id">,
): string {
  const kind = p.provider_type === "saml" ? "saml" : "oidc";
  return `/identity-providers/${kind}/edit/${encodeURIComponent(p.idp_id)}`;
}
