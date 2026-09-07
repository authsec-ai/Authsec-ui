/**
 * Popup-window plumbing for Google Authentication's OAuth step. Opens the
 * Google consent URL in a popup and resolves once GoogleOAuthCallbackPage
 * (running on this same frontend origin, after the backend's redirect)
 * posts a message back — never a token, only an opaque session_id or an
 * error code.
 *
 * Security: `postMessage` is filtered on BOTH `event.origin` (must be this
 * exact window's own origin — the popup only ever reaches that origin via
 * AuthSec's own backend redirect, never Google's) and the message's `type`
 * field, before any part of the payload is trusted. This mirrors
 * GoogleOAuthCallbackPage.tsx's own origin check on the sending side —
 * strict validation on both ends of the channel, not just one.
 */
import {
  GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE,
  type GoogleOAuthCallbackMessage,
} from "./GoogleOAuthCallbackPage";

export interface GoogleOAuthPopupResult {
  sessionId?: string;
  error?: string;
}

export function openGoogleOAuthPopup(authorizeUrl: string): Promise<GoogleOAuthPopupResult> {
  return new Promise((resolve) => {
    const popup = window.open(
      authorizeUrl,
      "authsec-google-oauth",
      "width=520,height=650,noopener=no",
    );
    if (!popup) {
      resolve({ error: "popup_blocked" });
      return;
    }

    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(pollClosed);
    };

    const onMessage = (event: MessageEvent) => {
      // Strict origin check: only ever accept a message from this exact
      // window's own origin. Anything else (including Google's own origin,
      // which never sends us a postMessage directly) is ignored outright.
      if (event.origin !== window.location.origin) return;
      const data = event.data as Partial<GoogleOAuthCallbackMessage> | undefined;
      if (!data || data.type !== GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE) return;

      settled = true;
      cleanup();
      // Close the popup HERE, now that its message has actually arrived --
      // NOT by having the popup call window.close() on itself immediately
      // after postMessage(). That ordering races message delivery: closing
      // (or tearing down) the sending frame right after postMessage() can,
      // in some browsers, drop the message in flight if the whole redirect
      // chain completes fast enough (this app's own backend logs show the
      // full Google round trip finishing in well under a second when
      // Google silently re-authorizes a previously-consented app -- fast
      // enough to hit exactly this race). Closing only after we've already
      // received the data is race-free by construction.
      try {
        popup.close();
      } catch {
        // Ignore -- e.g. a Cross-Origin-Opener-Policy configuration could
        // block this from the opener's side in some deployments. The
        // popup's own delayed self-close (GoogleOAuthCallbackPage.tsx) is
        // the fallback for that case.
      }
      resolve({ sessionId: data.sessionId, error: data.error });
    };
    window.addEventListener("message", onMessage);

    // Fallback only: if the user manually closes the popup (or it closes
    // for some other reason) before any message ever arrives, treat that
    // as a cancelled flow. Once a message HAS arrived, `settled` is true
    // and this is a no-op -- the popup closing (by us, above) never
    // re-triggers this branch.
    const pollClosed = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        if (!settled) resolve({ error: "popup_closed" });
      }
    }, 500);
  });
}
