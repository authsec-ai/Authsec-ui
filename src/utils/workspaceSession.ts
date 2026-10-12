/**
 * Workspace member-session upgrade.
 *
 * The login token (POST /authsec/uflow/login/webauthn-callback, TOTP verify,
 * OIDC callback) is a default token: workspace_id + user_id, but NO
 * `workspace_membership_id` claim. Member-gated routes — GET
 * /api/iga/v1/policy/approvals, GET .../reviews?mine=true and every policy
 * mutation — require that claim via humanActor
 * (authsec/controllers/platform/iga_classification_controller.go) and answer
 * 403 forbidden without it, which the policy UI would otherwise report as
 * "Your role cannot do this".
 *
 * POST /authsec/workspaces/{workspace_id}/switch mints a workspace-scoped
 * token carrying the claim (GenerateWorkspaceToken's only console-facing
 * route). RBAC (authz.Require) and role enrichment resolve from the DB, so the
 * swapped token loses no permission either token had: neither carries
 * roles/scopes claims.
 *
 * `ensureWorkspaceMemberSession` runs once per stored token (module-level
 * in-flight dedupe plus a per-token negative cache): when the stored token
 * already carries the claim it resolves immediately, otherwise it calls
 * switch and swaps the stored session token for the returned access_token.
 * Best-effort — it never throws. While the token stays unswitched,
 * member-gated reads render the workspace-session copy (policyErrors.ts
 * `member_session`) instead of failing silently.
 */

import config from "../config";
import { decodeJWT } from "./jwt";
import { SessionManager } from "./sessionManager";

/** The claim a workspace-scoped token carries; the login token does not. */
const MEMBERSHIP_CLAIM = "workspace_membership_id";

export type WorkspaceSessionResult =
  | { ok: true; upgraded: boolean }
  | { ok: false; reason: "no-session" | "switch-failed" };

const NO_SESSION: WorkspaceSessionResult = { ok: false, reason: "no-session" };
const SWITCH_FAILED: WorkspaceSessionResult = { ok: false, reason: "switch-failed" };

let inflight: Promise<WorkspaceSessionResult> | null = null;
/** Token a switch was already attempted for: no repeat POST until it changes. */
let attemptedFor: string | null = null;

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

async function postSwitch(token: string, workspaceId: string): Promise<WorkspaceSessionResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(
      `${config.VITE_API_URL || "http://localhost:7468"}/authsec/workspaces/${encodeURIComponent(workspaceId)}/switch`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
        signal: ctrl.signal,
      },
    );
    if (!res.ok) return SWITCH_FAILED;
    const accessToken = stringField(await res.json(), "access_token");
    if (!accessToken) return SWITCH_FAILED;
    const decoded = decodeJWT(accessToken);
    const membership = decoded?.[MEMBERSHIP_CLAIM];
    // Refuse a token for another workspace or without the membership claim.
    if (!decoded || decoded.workspace_id !== workspaceId || typeof membership !== "string" || !membership) {
      return SWITCH_FAILED;
    }
    // Another tab may have signed out or in while the request was in flight:
    // never overwrite a session that is no longer the one we switched from.
    const fresh = SessionManager.getSession();
    if (!fresh || fresh.token !== token) return SWITCH_FAILED;
    SessionManager.saveSession({
      ...fresh,
      token: accessToken,
      jwtPayload: decoded,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    // The admin flow mirrors the session token here; keep the mirror in sync
    // when it exists, without creating it for flows that never set it.
    try {
      if (window.localStorage.getItem("jwt_token")) {
        window.localStorage.setItem("jwt_token", accessToken);
      }
    } catch {
      // Storage unavailable: the session token above is what API calls send.
    }
    return { ok: true, upgraded: true };
  } catch {
    return SWITCH_FAILED;
  } finally {
    clearTimeout(timer);
  }
}

export function ensureWorkspaceMemberSession(): Promise<WorkspaceSessionResult> {
  const session = SessionManager.getSession();
  const token = session?.token;
  const workspaceId = session?.workspace_id;
  if (!token || !workspaceId) return Promise.resolve(NO_SESSION);
  const payload = decodeJWT(token);
  const membership = payload?.[MEMBERSHIP_CLAIM];
  if (payload && typeof membership === "string" && membership) {
    return Promise.resolve({ ok: true, upgraded: false });
  }
  if (attemptedFor === token) {
    return inflight ?? Promise.resolve(SWITCH_FAILED);
  }
  attemptedFor = token;
  inflight = postSwitch(token, workspaceId).finally(() => {
    inflight = null;
  });
  return inflight;
}
