/**
 * Whether to offer administrative controls (Scan now, Verify, Edit scope,
 * Revoke).
 *
 * The console never infers a permission from a role name, and the token does
 * not reliably carry `discovery:admin`: the server decides from the token's
 * permission claims, its scopes, or a role binding in the database
 * (internal/authz `Allows`). So the one thing this console can know for certain
 * is what the server has told it. Until the server says no, the controls are
 * offered; the first 403 from an administrative request hides them for the rest
 * of the session, and the request itself is answered *Your role cannot do this*,
 * never as a failure. The server enforces regardless.
 *
 * A server-stated answer on the connections read (a `meta.capabilities`, as the
 * graph's detail responses carry) would let read-only readers see no control at
 * all before they try one; it is a dependency on the B3 contract, which this
 * module does not change.
 */

import { useSyncExternalStore } from "react";

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

/** Offered unless the server has said this reader cannot administer. */
export function useCanAdminister(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !denied.has(key()),
    () => true,
  );
}
