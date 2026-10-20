/**
 * Workspace member-session upgrade for the Policy feature.
 *
 * The login token carries workspace_id + user_id but no workspace_membership_id
 * claim. Member-gated policy endpoints (GET /policy/approvals,
 * /reviews?mine=true, and policy mutations) require that claim and answer 403
 * without it. POST /authsec/workspaces/{id}/switch mints a workspace-scoped
 * token that carries the claim, losing no permission the login token had.
 *
 * ensureWorkspaceMemberSession swaps the stored token once per token (deduped,
 * best-effort, never throws, no page reload). useWorkspaceMemberSession fires
 * it on mount and reports `ready` so a page can gate its member-gated queries'
 * `skip` until the swap settles.
 */

import { useEffect, useState } from "react";

import config from "@/config";
import { decodeJWT } from "@/utils/jwt";
import { SessionManager } from "@/utils/sessionManager";

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
    // Reject a token for another workspace or without the membership claim.
    if (!decoded || decoded.workspace_id !== workspaceId || typeof membership !== "string" || !membership) {
      return SWITCH_FAILED;
    }
    // Don't overwrite a session that changed (sign-out/in) while in flight.
    const fresh = SessionManager.getSession();
    if (!fresh || fresh.token !== token) return SWITCH_FAILED;
    SessionManager.saveSession({
      ...fresh,
      token: accessToken,
      jwtPayload: decoded,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    // Keep the admin flow's token mirror in sync when it exists.
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

/** Whether the upgrade attempt has completed at least once this session. */
let settled = false;

/**
 * Fire the member-session upgrade on mount; report `ready` once it settles
 * (success or failure). A later-mounting page starts ready and does not retry.
 */
export function useWorkspaceMemberSession(): { ready: boolean } {
  const [ready, setReady] = useState(settled);
  useEffect(() => {
    if (settled) {
      setReady(true);
      return;
    }
    let live = true;
    void ensureWorkspaceMemberSession().finally(() => {
      settled = true;
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return { ready };
}
