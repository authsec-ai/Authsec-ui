import { SessionManager } from "../utils/sessionManager";

/**
 * Replaces the session token with one issued for another workspace and
 * reloads. The workspace and identity are read from the token itself, and a
 * reload guarantees no query cache or slice from the previous workspace is
 * reused (ADR-0001 §8). Other tabs follow through the storage event.
 */
export function switchSessionWorkspace(accessToken: string): void {
  const session = SessionManager.getSession();
  if (!session) return;
  SessionManager.saveSession({ ...session, token: accessToken, jwtPayload: null });
  window.location.assign("/");
}
