import type { ConnectorConnection } from "@/app/api/connectorsApi";

export type ConnectionHealth = "connected" | "expiring" | "error" | "expired" | "not_connected";

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Derives a single health label from a connector's connections. Only the
 * workspace-scope connection is considered — that's the only binding type
 * the admin console manages today; user-scope connections are created by
 * end users via delegated OAuth (not yet wired to any UI).
 */
export function deriveConnectionHealth(
  connections: ConnectorConnection[],
): { label: ConnectionHealth; connection: ConnectorConnection | null } {
  // Deliberately does NOT fall back to a user-scope connection: this drives
  // the Overview tab's Reconnect flow, which restarts a *workspace* OAuth
  // grant. Falling back to a user connection here would silently reconnect
  // using someone's personal scopes/consent under a workspace-level label.
  const connection = connections.find((c) => c.binding_type === "workspace") ?? null;

  if (!connection || connection.status === "revoked" || connection.status === "disconnected") {
    return { label: "not_connected", connection };
  }
  if (connection.status === "error" || connection.last_refresh_error) {
    return { label: "error", connection };
  }
  if (connection.status === "expired") {
    return { label: "expired", connection };
  }
  if (connection.access_expires_at) {
    const msLeft = new Date(connection.access_expires_at).getTime() - Date.now();
    if (msLeft <= 0) return { label: "expired", connection };
    if (msLeft < EXPIRING_WINDOW_MS) return { label: "expiring", connection };
  }
  return { label: "connected", connection };
}

export const HEALTH_LABEL: Record<ConnectionHealth, string> = {
  connected: "Connected",
  expiring: "Expires soon",
  error: "Refresh failing",
  expired: "Expired",
  not_connected: "Not connected",
};
