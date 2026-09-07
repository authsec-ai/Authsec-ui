import { describe, it, expect, vi, afterEach } from "vitest";

import { openGoogleOAuthPopup } from "./googleOAuthPopup";
import { GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE } from "./GoogleOAuthCallbackPage";

/**
 * Security-critical: the popup helper must accept a postMessage ONLY from
 * this window's own origin and ONLY with the expected message type —
 * anything else (a message from another origin, a message from the right
 * origin but with a different/absent type) must be silently ignored, not
 * resolved as if it were a real callback result.
 */

function fakePopup() {
  const popup = { closed: false, close: vi.fn() };
  popup.close.mockImplementation(() => {
    popup.closed = true;
  });
  return popup as unknown as Window & { close: ReturnType<typeof vi.fn> };
}

describe("openGoogleOAuthPopup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves with the session id from a same-origin, correctly-typed message", async () => {
    vi.spyOn(window, "open").mockReturnValue(fakePopup());

    const promise = openGoogleOAuthPopup("https://accounts.google.com/o/oauth2/v2/auth?x=1");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE, sessionId: "sess-123" },
      }),
    );

    await expect(promise).resolves.toEqual({ sessionId: "sess-123", error: undefined });
  });

  it("closes the popup itself only after receiving the message, not before -- the race-condition fix", async () => {
    // Regression test for the actual bug: the popup previously called
    // window.close() on ITSELF immediately after postMessage(), which can
    // race message delivery and drop it (observed in production as
    // "Google sign-in didn't complete" despite the backend completing the
    // flow correctly). The opener must be the one to close the popup, and
    // only once it has actually processed a valid message.
    const popup = fakePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    const promise = openGoogleOAuthPopup("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    expect(popup.close).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE, sessionId: "sess-123" },
      }),
    );
    await promise;

    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("ignores a message from a different origin and keeps waiting", async () => {
    vi.spyOn(window, "open").mockReturnValue(fakePopup());

    const promise = openGoogleOAuthPopup("https://accounts.google.com/o/oauth2/v2/auth?x=1");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example.com",
        data: { type: GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE, sessionId: "stolen-session" },
      }),
    );
    // The bad message must not have resolved the promise -- confirm the
    // legitimate, same-origin message afterward still resolves cleanly and
    // with its own value, not the spoofed one.
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE, sessionId: "real-session" },
      }),
    );

    await expect(promise).resolves.toEqual({ sessionId: "real-session", error: undefined });
  });

  it("ignores a same-origin message with the wrong type", async () => {
    vi.spyOn(window, "open").mockReturnValue(fakePopup());

    const promise = openGoogleOAuthPopup("https://accounts.google.com/o/oauth2/v2/auth?x=1");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "some-other-message", sessionId: "not-for-us" },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: GOOGLE_OAUTH_CALLBACK_MESSAGE_TYPE, sessionId: "real-session" },
      }),
    );

    await expect(promise).resolves.toEqual({ sessionId: "real-session", error: undefined });
  });

  it("resolves with popup_blocked when window.open returns null", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openGoogleOAuthPopup("https://accounts.google.com/o/oauth2/v2/auth")).resolves.toEqual({
      error: "popup_blocked",
    });
  });
});
