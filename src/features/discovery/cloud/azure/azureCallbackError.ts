/** What the Azure OAuth callback page says for an `?error=` code. Pure. */

const ERROR_LABELS: Record<string, string> = {
  not_configured: "Azure discovery is not configured on this deployment.",
  state_invalid: "The sign-in session expired or was already used. Start again from Connections.",
  consent_denied: "Admin consent was denied. The administrator must accept the permissions for AuthSec to read the tenant.",
  consent_required:
    "Microsoft could not sign you in to Azure for AuthSec: the AuthSec app registration does not request Azure Service Management access. This is a deployment problem on AuthSec's side, not in your tenant.",
  tenant_mismatch: "The tenant you signed into does not match the one you started with.",
  authsec_credential_rejected: "AuthSec's own credential was rejected by this tenant. This is a deployment problem.",
  sign_in_failed: "The sign-in did not complete. Try again from Connections.",
};

/**
 * The sentence for an `?error=` code. The URL is anyone's to write, so an
 * unknown code is never shown as prose: a generic sentence, with the code
 * only when it looks like one.
 */
export function callbackError(code: string): string {
  const known = ERROR_LABELS[code];
  if (known) return known;
  const looksLikeCode = /^[a-z][a-z0-9_]{0,47}$/.test(code);
  return `The sign-in did not complete. Try again from Connections.${looksLikeCode ? ` (code: ${code})` : ""}`;
}
