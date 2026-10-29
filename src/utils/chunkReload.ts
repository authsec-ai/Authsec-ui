/**
 * Route pages load on demand (`React.lazy`). After a release the files an open
 * tab still points at are gone, so its next navigation fails with "Failed to
 * fetch dynamically imported module" and the error boundary replaces the page.
 * The fix is to load the new version once. A timestamp in sessionStorage stops
 * a page that is still broken after the reload from reloading forever.
 */

const KEY = "authsec_chunk_reload_at";
const LOOP_WINDOW_MS = 15_000;
// At most this many reloads in a row; a reload older than RESET_MS proves the
// page worked since, so a tab open across several releases reloads for each.
const MAX_IN_A_ROW = 2;
const RESET_MS = 10 * 60_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return CHUNK_ERROR.test(message);
}

/**
 * Reloads the page for a new version, at most MAX_IN_A_ROW times in a row and
 * never twice within LOOP_WINDOW_MS. A time window alone looped forever when
 * the chunk failed slowly (a proxy timeout longer than the window). Returns
 * false when it did not reload (already tried, or storage is unavailable).
 */
export function reloadOnceForNewVersion(reload: () => void = () => window.location.reload(), now: () => number = Date.now): boolean {
  try {
    const t = now();
    const prev = readState(sessionStorage.getItem(KEY));
    const inARow = t - prev.at > RESET_MS ? 0 : prev.n;
    if (t - prev.at < LOOP_WINDOW_MS || inARow >= MAX_IN_A_ROW) return false;
    sessionStorage.setItem(KEY, JSON.stringify({ at: t, n: inARow + 1 }));
  } catch {
    return false;
  }
  reload();
  return true;
}

/** The stored state; a bare timestamp is what earlier versions wrote. */
function readState(raw: string | null): { at: number; n: number } {
  if (!raw) return { at: 0, n: 0 };
  try {
    const v = JSON.parse(raw);
    if (typeof v === "number") return { at: v, n: 1 };
    if (v && typeof v.at === "number" && typeof v.n === "number") return { at: v.at, n: v.n };
  } catch {
    // fall through
  }
  return { at: 0, n: 0 };
}
