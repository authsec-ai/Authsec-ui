import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";

// The login ticket ties one sign-in together on the server: it is returned by
// the first-factor step (password or OIDC), required by the MFA step, and
// consumed by the callback that issues the session token. It is kept per tab
// and only for the duration of the sign-in.

const STORAGE_KEY = "authsec_login_ticket";

export const LOGIN_TICKET_HEADER = "X-Login-Ticket";

export function getLoginTicket(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLoginTicket(ticket: string | null | undefined): void {
  if (!ticket) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, ticket);
  } catch {
    // Storage unavailable: the MFA step will ask the user to sign in again.
  }
}

export function clearLoginTicket(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Stores the ticket if a first-factor response carries one. */
export function captureLoginTicket(data: unknown): void {
  if (data && typeof data === "object" && "login_ticket" in data) {
    const ticket = (data as { login_ticket?: unknown }).login_ticket;
    if (typeof ticket === "string") setLoginTicket(ticket);
  }
}

/** Requests in the sign-in MFA step and the session callbacks carry the ticket. */
export function needsLoginTicket(url: string): boolean {
  return (
    url.startsWith("/authsec/webauthn/") ||
    url === "/authsec/uflow/login/webauthn-callback" ||
    url === "/authsec/uflow/auth/enduser/webauthn-callback"
  );
}

function isSessionCallback(url: string): boolean {
  return (
    url === "/authsec/uflow/login/webauthn-callback" ||
    url === "/authsec/uflow/auth/enduser/webauthn-callback"
  );
}

/**
 * Wraps an RTK Query base query so that sign-in MFA requests carry the login
 * ticket, any response that hands one out is captured, and the ticket is
 * dropped once a session callback has spent it.
 */
export function withLoginTicket(
  baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError>,
): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> {
  return async (args, api, extraOptions) => {
    const request: FetchArgs = typeof args === "string" ? { url: args } : { ...args };
    const ticket = getLoginTicket();
    if (ticket && needsLoginTicket(request.url)) {
      const headers = new Headers(request.headers as HeadersInit | undefined);
      headers.set(LOGIN_TICKET_HEADER, ticket);
      request.headers = headers;
    }
    const result = await baseQuery(request, api, extraOptions);
    if (result.data) {
      if (isSessionCallback(request.url)) {
        clearLoginTicket();
      } else {
        captureLoginTicket(result.data);
      }
    }
    return result;
  };
}

/** Picks up a ticket handed over in the URL (SAML redirect) and removes it from the address bar. */
export function captureLoginTicketFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const ticket = url.searchParams.get("login_ticket");
    if (!ticket) return;
    setLoginTicket(ticket);
    url.searchParams.delete("login_ticket");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    // ignore
  }
}
