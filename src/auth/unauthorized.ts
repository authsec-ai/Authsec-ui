import type { BaseQueryFn, FetchArgs, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import { SESSION_KEY, SessionManager } from "../utils/sessionManager";

// Global 401 handling (UI-011). A 401 on a request made with the signed-in
// session means the server no longer accepts that session (expired, revoked,
// or the workspace membership was removed). The session is cleared, the auth
// slice is logged out (which also resets every RTK Query cache, see store.ts)
// and the browser is sent to the sign-in page.
//
// Sign-in requests are excluded: a 401 there is a wrong password or a failed
// MFA step, which the sign-in screens report themselves. So are requests made
// with a token other than the session's (the end-user device pages pass the
// hosted-login token explicitly).

/** authSlice's `logout` action type. Kept as a string so this module does not import the slice (authSlice -> authApi -> baseApi -> here would be a cycle); a test pins it to `logout.type`. */
export const LOGOUT_ACTION_TYPE = "auth/logout";

const SIGN_IN_PREFIXES = [
  "/authsec/webauthn/",
  "/authsec/uflow/login",
  "/authsec/uflow/auth/",
  "/authsec/uflow/oidc/",
  "/authsec/uflow/user/login",
  "/authsec/uflow/user/saml/",
  "/authsec/uflow/user/register",
  "/authsec/uflow/user/forgot-password",
  "/authsec/uflow/user/oidc/",
  "/authsec/uflow/register",
  "/authsec/uflow/forgot-password",
  "/authsec/hmgr/",
  "/authsec/auth/logout",
];

function pathOf(url: string): string {
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return url;
  }
}

/** Requests that belong to signing in (or out), where a 401 is an answer, not an expired session. */
export function isSignInRequest(url: string): boolean {
  const path = `/${pathOf(url).replace(/^\/+/, "")}`;
  if (/callback/i.test(path)) return true;
  return SIGN_IN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const AUTH_SCREENS = /^\/(authsec\/)?(admin\/(login|verify-otp|webauthn|auth\/callback|create-workspace)|oidc\/)/;

/**
 * Where to send the browser after the session is rejected, or null to leave
 * the session alone.
 * The admin console signs in at /admin/login. Pages under /oidc are the
 * hosted end-user sign-in, which has no session of its own to end, and the
 * sign-in screens themselves must not redirect to themselves.
 */
export function loginPathFor(pathname: string): string | null {
  if (AUTH_SCREENS.test(pathname)) return null;
  return "/admin/login";
}

function storedSessionToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const token = (JSON.parse(raw) as { token?: unknown }).token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

function madeWithSession(meta: FetchBaseQueryMeta | undefined, state: unknown): boolean {
  const bearer = meta?.request?.headers.get("Authorization");
  if (bearer) {
    const token = storedSessionToken();
    return token !== null && bearer === `Bearer ${token}`;
  }
  // No token was sent: the stored session had already expired and was
  // dropped while preparing the request. It still counts if the UI believes
  // it is signed in.
  return (state as { auth?: { isAuthenticated?: boolean } } | undefined)?.auth?.isAuthenticated === true;
}

let redirecting = false;

/** Test hook: forget that a redirect has been started. */
export function resetUnauthorizedHandler(): void {
  redirecting = false;
}

export interface UnauthorizedOptions {
  /** Navigates to the sign-in page; replaceable in tests. */
  redirect?: (path: string) => void;
  /** Current path, used to pick the sign-in page; replaceable in tests. */
  currentPath?: () => string;
}

/**
 * Wraps an RTK Query base query (composes with withLoginTicket) so that a 401
 * on an authenticated, non-sign-in request ends the session.
 */
export function withUnauthorizedHandler(
  baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta>,
  options: UnauthorizedOptions = {},
): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta> {
  const redirect = options.redirect ?? ((path: string) => window.location.assign(path));
  const currentPath = options.currentPath ?? (() => window.location.pathname);

  return async (args, api, extraOptions) => {
    const result = await baseQuery(args, api, extraOptions);
    if (result.error?.status !== 401) return result;

    const url = typeof args === "string" ? args : args.url;
    if (isSignInRequest(url)) return result;
    if (!madeWithSession(result.meta, api.getState())) return result;

    // On the sign-in screens and the hosted end-user pages there is no
    // console session to end.
    const target = loginPathFor(currentPath());
    if (!target) return result;

    SessionManager.clearSession();
    api.dispatch({ type: LOGOUT_ACTION_TYPE });
    if (!redirecting) {
      redirecting = true;
      redirect(target);
    }
    return result;
  };
}
