/**
 * Route pages load on demand (`React.lazy`). After a release the files an open
 * tab still points at are gone, so its next navigation fails with "Failed to
 * fetch dynamically imported module" and the error boundary replaces the page.
 * The fix is to load the new version once. A timestamp in sessionStorage stops
 * a page that is still broken after the reload from reloading forever.
 */

const KEY = "authsec_chunk_reload_at";
const LOOP_WINDOW_MS = 15_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return CHUNK_ERROR.test(message);
}

/** Reloads the page once per loop window. Returns false when it did not (already tried, or storage is unavailable). */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < LOOP_WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
