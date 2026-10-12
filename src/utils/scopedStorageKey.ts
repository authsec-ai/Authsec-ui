import { SessionManager } from "@/utils/sessionManager";

/**
 * A localStorage key for per-person UI state (wizard progress, tours,
 * dismissed notices): scoped to the signed-in workspace and user, so another
 * person or workspace in the same browser starts from their own state.
 * Display preferences of the browser itself (theme, density) are not scoped.
 */
export function scopedStorageKey(base: string): string {
  const s = SessionManager.getSession();
  return `${base}:${s?.workspace_id ?? "-"}:${s?.user_id ?? "-"}`;
}
