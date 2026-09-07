/**
 * Google Authentication's OAuth landing page.
 *
 * Google's redirect lands the popup here on AuthSec's own backend
 * (controllers/platform/cloud_gcp_oauth_controller.go's GoogleOAuthCallback),
 * which itself redirects the browser to THIS frontend route with either
 * `?session_id=...` (never a token) or `?error=...` in the query string.
 * This page's only job is to read that and tell the opener window about it
 * via `postMessage`.
 *
 * Deliberately does NOT call window.close() on itself immediately after
 * postMessage(). That ordering is a real, observed race: closing (or
 * tearing down) the sending frame right after postMessage() can drop the
 * message in flight in some browsers, especially when the whole Google
 * redirect chain completes in well under a second (which it does whenever
 * Google silently re-authorizes a previously-consented app -- no visible
 * consent screen at all, just an instant redirect). The opener
 * (googleOAuthPopup.ts's onMessage handler) closes this window itself,
 * only after it has actually received the message -- race-free by
 * construction. The delayed self-close below is only a fallback for the
 * rare case the opener couldn't (e.g. it navigated away, or a
 * Cross-Origin-Opener-Policy configuration blocked it from that side).
 *
 * Security: this page ALWAYS posts to `window.location.origin` (this
 * frontend's own origin, never a wildcard "*") — the opener is a same-origin
 * tab of the same SPA, so it always matches. The opener-side listener
 * (googleOAuthPopup.ts's openGoogleOAuthPopup) independently re-checks
 * `event.origin === window.location.origin` before accepting anything —
 * strict validation on both ends of the channel, not just one.
 */
import { useEffect, useState } from "react";

export const GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE = "authsec:google-oauth-callback" as const;

export interface GoogleOAuthCallbackMessage {
  type: typeof GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE;
  sessionId?: string;
  error?: string;
}

export function GoogleOAuthCallbackPage() {
  const [status, setStatus] = useState<"posting" | "no-opener">("posting");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id") ?? undefined;
    const error = params.get("error") ?? undefined;

    if (!window.opener) {
      // Someone navigated here directly (not as a popup) — nothing to relay
      // to, and nothing sensitive to show either way (session_id is a
      // single-use opaque token, never the access token itself).
      setStatus("no-opener");
      return;
    }

    const message: GoogleOAuthCallbackMessage = {
      type: GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
      sessionId,
      error,
    };
    window.opener.postMessage(message, window.location.origin);

    // Fallback only -- see the file-level comment above for why this isn't
    // the primary close mechanism. 1.5s is far longer than postMessage
    // delivery ever takes; by the time this fires, the opener has either
    // already closed this window (the normal case) or genuinely couldn't.
    const fallbackClose = window.setTimeout(() => window.close(), 1500);
    return () => window.clearTimeout(fallbackClose);
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">
      {status === "posting" ? (
        <p>Finishing Google sign-in…</p>
      ) : (
        <p>You can close this window and return to AuthSec.</p>
      )}
    </div>
  );
}

export default GoogleOAuthCallbackPage;
