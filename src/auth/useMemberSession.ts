/**
 * Gives a normal console login a workspace MEMBER session.
 *
 * Every Policy action that records who did it (open your reviews, create a
 * policy, assign owners, except a finding, approve) is refused with
 * `403 forbidden: requires a verified workspace member session` unless the
 * token carries `workspace_membership_id`. Only `POST /authsec/workspaces/:id/switch`
 * issues such a token, and the console's login does not call it. This calls it once
 * per tab session when the token lacks the claim, swaps the stored token for the one
 * it returns (same user, same workspace, same lifetime rules) and reloads once.
 * A failure changes nothing: the old token stays and the app behaves as before.
 */

import { useEffect } from "react";

import config from "../config";
import { decodeJWT } from "../utils/jwt";
import { SessionManager } from "../utils/sessionManager";

export function useMemberSession(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const session = SessionManager.getSession();
    if (!session?.token || !session.workspace_id) return;
    const payload = decodeJWT(session.token);
    if (!payload || payload.workspace_membership_id) return;

    // One attempt per user and workspace in this tab session: never a reload loop.
    const attempted = `authsec_member_switch:${session.workspace_id}:${session.user_id}`;
    try {
      if (sessionStorage.getItem(attempted)) return;
      sessionStorage.setItem(attempted, "1");
    } catch {
      return;
    }

    const base = config.VITE_API_URL || "";
    void fetch(`${base}/authsec/workspaces/${encodeURIComponent(session.workspace_id)}/switch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { access_token?: string } | null) => {
        if (!j?.access_token) return;
        const next = decodeJWT(j.access_token);
        if (!next || !next.workspace_membership_id) return;
        SessionManager.saveSession({ ...session, token: j.access_token, jwtPayload: next, expiresAt: next.exp * 1000 });
        window.location.reload();
      })
      .catch(() => undefined);
  }, [enabled]);
}
