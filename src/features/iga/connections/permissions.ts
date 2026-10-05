/**
 * Whether to offer administrative controls (Scan now, Verify, Edit scope,
 * Revoke).
 *
 * The console never infers a permission from a role name, and the token does
 * not reliably carry `discovery:admin`: the server decides from the token's
 * permission claims, its scopes, or a role binding in the database. So the
 * console asks the server (`GET /connections/can-administer`, behind the same
 * discovery:admin middleware as the administrative routes): 200 means offer
 * the controls, 403 means a read-only reader sees none of them.
 *
 * Until that answer arrives the controls are not shown (a read-only reader is
 * never offered a control that was never theirs). If the route does not exist
 * (an older backend) or cannot be reached, the earlier behaviour applies: the
 * controls are offered until the first 403 from an administrative request,
 * which hides them for the rest of the session and is answered *Your role
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

/** Offered when the server says this reader can administer, and not after it has refused one. */
export function useCanAdminister(): boolean {
  const refused = useSyncExternalStore(
    subscribe,
    () => denied.has(key()),
    () => false,
  );
  const probe = useGetCanAdministerQuery();
  if (refused) return false;
  if (probe.isLoading) return false;
  if (probe.isSuccess) return probe.data.can_administer;
  const status = (probe.error as { status?: unknown } | undefined)?.status;
  if (status === 403) return false;
  // The route is absent or unreachable: offer, and let the first refusal hide them.
  return true;
}
