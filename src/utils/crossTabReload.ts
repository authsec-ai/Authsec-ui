/**
 * What a tab does when another tab changes the shared session (signs in,
 * switches workspace, signs out): its caches belong to the previous identity,
 * so it reloads rather than mix one workspace's data with another's token.
 *
 * Never twice within WINDOW_MS (two tabs rewriting the session would reload
 * each other in a loop). A change inside the window is not dropped: the reload
 * is deferred to the window's end, so the tab never keeps showing the old
 * identity while its requests carry the new token.
 */

export const RELOAD_STAMP_KEY = "authsec_session_reload_at";
const WINDOW_MS = 10_000;

export interface CrossTabDeps {
  reload: () => void;
  now: () => number;
  defer: (fn: () => void, ms: number) => void;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
}

let deferred = false;

/** Reloads now, or once the window since the last reload has passed. */
export function reloadForSessionChange(deps: CrossTabDeps): "now" | "deferred" | "pending" {
  let last = 0;
  try {
    last = Number(deps.storage?.getItem(RELOAD_STAMP_KEY) || 0);
  } catch {
    // Storage unavailable: reload as before.
  }
  const wait = WINDOW_MS - (deps.now() - last);
  if (wait <= 0) {
    stamp(deps);
    deps.reload();
    return "now";
  }
  if (deferred) return "pending";
  deferred = true;
  deps.defer(() => {
    deferred = false;
    stamp(deps);
    deps.reload();
  }, wait);
  return "deferred";
}

function stamp(deps: CrossTabDeps) {
  try {
    deps.storage?.setItem(RELOAD_STAMP_KEY, String(deps.now()));
  } catch {
    // ignore
  }
}

/** Tests only. */
export function resetCrossTabReloadForTest() {
  deferred = false;
}
