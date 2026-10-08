import config from "../config";
import { SessionManager } from "../utils/sessionManager";

/**
 * Revokes the current session token on the server (POST /authsec/auth/logout)
 * so it stops working everywhere, not just in this browser. Best effort: a
 * failure must not block signing out locally.
 */
export async function endServerSession(): Promise<void> {
  const token = SessionManager.getSession()?.token;
  if (!token) return;
  try {
    await fetch(`${config.VITE_API_URL || "http://localhost:7468"}/authsec/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
  } catch {
    // Offline or server unreachable: the token still expires on its own.
  }
}
