/**
 * Azure OAuth callback landing page.
 *
 * Microsoft's redirect lands on the AuthSec backend
 * (`controllers/platform/cloud_azure_controller.go` OAuthCallback), which
 * redirects the browser here with `?session_id=...` or `?error=...`.
 *
 * Unlike Google OAuth (popup + postMessage), Azure uses a full-page redirect:
 * the admin consent and sign-in happen in the same tab. This page reads the
 * query params and redirects to the connections page with the session id, so
 * the Azure wizard picks up from step 2 (Review tenant).
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ERROR_LABELS: Record<string, string> = {
  not_configured: "Azure discovery is not configured on this deployment.",
  state_invalid: "The sign-in session expired or was already used. Start again from Connections.",
  consent_denied: "Admin consent was denied. The administrator must accept the permissions for AuthSec to read the tenant.",
  consent_required: "Admin consent is required but was not granted.",
  tenant_mismatch: "The tenant you signed into does not match the one you started with.",
  authsec_credential_rejected: "AuthSec's own credential was rejected by this tenant. This is a deployment problem.",
  sign_in_failed: "The sign-in did not complete. Try again from Connections.",
};

export function AzureOAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const errorCode = params.get("error");

    if (sessionId) {
      navigate(`/iga/connections?azure_session_id=${encodeURIComponent(sessionId)}`, { replace: true });
      return;
    }

    if (errorCode) {
      setError(ERROR_LABELS[errorCode] ?? `Sign-in failed: ${errorCode.replace(/_/g, " ")}.`);
      return;
    }

    setError("No session was returned. The sign-in may not have completed.");
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center p-4">
      <div className="max-w-md space-y-3 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-foreground">Azure sign-in did not complete</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              className="text-sm text-(--color-primary-text) underline"
              onClick={() => navigate("/iga/connections", { replace: true })}
            >
              Back to Connections
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Redirecting…</p>
        )}
      </div>
    </div>
  );
}

export default AzureOAuthCallbackPage;
