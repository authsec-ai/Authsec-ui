/**
 * Gives a normal console login a workspace MEMBER session as soon as the user
 * is signed in.
 *
 * Every Policy action that records who did it (open your reviews, create a
 * policy, assign owners, except a finding, approve) is refused with
 * `403 forbidden: requires a verified workspace member session` unless the
 * token carries `workspace_membership_id`. Only `POST /authsec/workspaces/:id/switch`
 * issues such a token, and the console's login does not call it.
 *
 * The swap itself is ensureWorkspaceMemberSession: deduped per token, best
 * effort, and it never reloads the page. This runs it once for the whole
 * console rather than per page, so actions on pages that do not gate on it
 * themselves (findings, policies, setup) are covered too.
 *
 * It used to reload the page after swapping the token. That put a blank
 * "Loading…" screen, and a full re-download of the app, between sign-in and
 * every new tab. Nothing needs it: requests read the stored token when they
 * are made, and the pages that fire member-gated queries wait on `ready`.
 */

import { useEffect } from "react";

import { ensureWorkspaceMemberSession } from "../features/iga/policy/shared/workspaceMemberSession";

export function useMemberSession(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void ensureWorkspaceMemberSession();
  }, [enabled]);
}
