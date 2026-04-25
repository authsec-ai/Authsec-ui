/**
 * OAuth2 Utility Functions
 *
 * Provides utilities for generating OAuth2 authorization URLs with PKCE support
 */
import config from "../config";

/**
 * Generates a cryptographically secure random string for state/nonce
 * Uses base64url encoding for URL safety
 */
export function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Base64 URL-safe encoding (no padding, URL-safe characters)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generates a PKCE code verifier (random 43-128 character string)
 */
export function generateCodeVerifier(): string {
  return generateRandomString(32); // 32 bytes = 43 chars in base64url
}

/**
 * Generates a PKCE code challenge from a code verifier using SHA-256
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Gets the OAuth2 authorization base URL from the configured runtime contract.
 * The SPA host and the OAuth issuer can differ in hosted deployments.
 */
export function getOAuthBaseUrl(): string {
  return config.VITE_OAUTH_BASE_URL.replace(/\/+$/, "");
}

/**
 * Extracts a tenant/workspace prefix from the current hostname when the app is
 * mounted on a prefixed subdomain.
 *
 * @returns The tenant domain (e.g., "dec10") or undefined if not on a tenant subdomain
 */
export function getTenantDomainFromHostname(): string | undefined {
  const hostname = window.location.hostname;

  // Local development - no tenant domain from hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return undefined;
  }

  const parts = hostname.split(".");

  if (parts.length >= 3) {
    const tenantDomain = parts[0];
    if (
      tenantDomain !== "app" &&
      tenantDomain !== "www" &&
      tenantDomain !== "oauth" &&
      tenantDomain !== "dev" &&
      tenantDomain !== "api"
    ) {
      return tenantDomain;
    }
  }

  return undefined;
}

/**
 * Gets the redirect URI for the browser callback scene. The UI remains
 * root-mounted; callback handling should always land back on the current app
 * origin rather than deriving a second host.
 *
 * @param tenantDomain - The tenant's domain name (e.g., "dec10"), NOT the tenant UUID
 */
export function getRedirectUri(tenantDomain?: string): string {
  void tenantDomain;
  return `${window.location.origin}/oidc/auth/callback`;
}

export interface OAuth2AuthorizationUrlParams {
  clientId: string;
  redirectUri?: string;
  scopes?: string[];
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
  /** The tenant's domain name (e.g., "dec10"), NOT the tenant UUID */
  tenantDomain?: string;
  /** Hydra public URL from the API response — takes priority over getOAuthBaseUrl() */
  hydraPublicUrl?: string;
}

export interface OAuth2AuthorizationUrlResult {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generates a complete OAuth2 authorization URL with PKCE
 *
 * Example output:
 * https://dev.api.authsec.dev/oauth2/auth?response_type=code&client_id=xxx-main-client&redirect_uri=...&scope=openid+profile+email&state=...&code_challenge=...&code_challenge_method=S256
 */
export async function generateOAuth2AuthorizationUrl(
  params: OAuth2AuthorizationUrlParams,
): Promise<OAuth2AuthorizationUrlResult> {
  const { clientId, redirectUri, scopes = ["openid", "profile", "email"], tenantDomain, hydraPublicUrl } = params;

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Generate state for CSRF protection
  const state = generateRandomString(32);

  // Build the OAuth2 client ID with suffix
  const oauthClientId = clientId.endsWith("-main-client") ? clientId : `${clientId}-main-client`;

  // Determine redirect URI
  const finalRedirectUri = redirectUri || getRedirectUri(tenantDomain);

  // Use hydra_public_url from API if available, otherwise derive from hostname
  const baseUrl = hydraPublicUrl || getOAuthBaseUrl();
  const authUrl = new URL(`${baseUrl}/oauth2/auth`);

  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", oauthClientId);
  authUrl.searchParams.set("redirect_uri", finalRedirectUri);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const generatedUrl = authUrl.toString();

  // Log the generated OAuth2 authorization URL for debugging
  // eslint-disable-next-line no-console
  console.log("[OAuth2] 🔐 Generated Authorization URL:", {
    url: generatedUrl,
    clientId: oauthClientId,
    tenantDomain: tenantDomain || "(none - using current hostname)",
    redirectUri: finalRedirectUri,
    scopes: scopes.join(" "),
    state,
    codeChallenge,
    codeChallengeMethod: "S256",
  });

  return {
    authorizationUrl: generatedUrl,
    state,
    codeVerifier,
    codeChallenge,
  };
}
