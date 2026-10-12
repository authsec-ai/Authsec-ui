/**
 * Whether to offer a policy action (author, approve, enforce, emergency).
 *
 * The console never infers a permission from a role name, and no endpoint
 * reports a caller's `governance:*` rights: the server decides. So an action is
 * offered, and the first time the server answers 403 for a permission, that
 * permission is remembered as refused for the rest of the session (per user and
 * workspace) and the controls it guards are hidden, answered "Your role cannot
 * do this", never as a failure. The server enforces regardless. Reads that sit
 * behind a permission (`GET /approvals` needs `governance:approve`) mark it the
 * same way.
 */

import { useSyncExternalStore } from "react";

import { SessionManager } from "@/utils/sessionManager";

export type PolicyPermission =
  | "governance:read"
  | "governance:author"
  | "governance:approve"
  | "governance:enforce"
  | "governance:emergency"
  | "iga:admin"
  | "discovery:admin";

const denied = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
let version = 0;

function sessionKey(): string {
  const s = SessionManager.getSession();
  return `${s?.user_id ?? "-"}:${s?.workspace_id ?? "-"}`;
}

/** The server refused a request for this permission: stop offering what it guards. */
export function markPolicyDenied(permission: PolicyPermission): void {
  const k = sessionKey();
  const set = denied.get(k) ?? new Set<string>();
  if (set.has(permission)) return;
  set.add(permission);
  denied.set(k, set);
  version += 1;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** `true` while the server has not refused this permission. Offered means "ask", not "allowed". */
export function usePolicyPermission(permission: PolicyPermission): { offered: boolean; refused: boolean } {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const refused = denied.get(sessionKey())?.has(permission) ?? false;
  return { offered: !refused, refused };
}
