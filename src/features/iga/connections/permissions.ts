/**
 * Whether to offer administrative controls (Scan now, Verify, Edit scope,
 * Revoke).
 *
 * The console never infers a permission from a role name, and the token does
 * not reliably carry `discovery:admin`: the server decides from the token's
 * permission claims, its scopes, or a role binding in the database. So the
 * console asks the server (`GET /connections/can-administer`, behind the same
 * discovery:admin middleware as the administrative routes): only a 200 that
 * says yes offers the controls.
 *
 * It fails closed. While the answer is pending, and when it could not be had
 * (a 500, a network failure, a route an older backend lacks), no control is
 * offered; `loading` and `unknown` let a screen say which of those it is. A
 * 403 is a definite no. After the server refuses an administrative request
 * the controls stay hidden for the rest of the session, answered *Your role
 * cannot do this*, never as a failure. The server enforces regardless.
 */

import { useSyncExternalStore } from "react";

import { useGetCanAdministerQuery } from "@/app/api/connectionsApi";
import { SessionManager } from "@/utils/sessionManager";

const denied = new Set<string>();
const listeners = new Set<() => void>();

function key(): string {
  const s = SessionManager.getSession();
  return `${s?.user_id ?? "-"}:${s?.workspace_id ?? "-"}`;
}

/** The server refused an administrative request: stop offering the controls. */
export function markAdminDenied(): void {
  const k = key();
  if (denied.has(k)) return;
  denied.add(k);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export interface AdminAccess {
  /** The server said yes, and has not since refused an administrative request. */
  canAdminister: boolean;
  /** The server has not answered yet. */
  loading: boolean;
  /** The question could not be answered (not a 403): administration is not offered, but nobody said no. */
  unknown: boolean;
}

export function useAdminAccess(): AdminAccess {
  const refused = useSyncExternalStore(
    subscribe,
    () => denied.has(key()),
    () => false,
  );
  const probe = useGetCanAdministerQuery();
  if (refused) return { canAdminister: false, loading: false, unknown: false };
  if (probe.isSuccess) return { canAdminister: probe.data.can_administer === true, loading: false, unknown: false };
  if (probe.isLoading || probe.isUninitialized) return { canAdminister: false, loading: true, unknown: false };
  const status = (probe.error as { status?: unknown } | undefined)?.status;
  return { canAdminister: false, loading: false, unknown: status !== 403 };
}

/** Offered only when the server says this reader can administer. */
export function useCanAdminister(): boolean {
  return useAdminAccess().canAdminister;
}
