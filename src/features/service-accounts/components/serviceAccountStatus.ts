/**
 * How a service account authenticates and what is true of it now, shared by
 * the Service accounts page and the Agents list.
 */

import type { WorkspaceServiceAccount } from "@/app/api/agentIdentityApi";
import type { ConsoleTone } from "@/components/console/status";

export type AuthMethod = "credential" | "kubernetes" | "none";

export function authMethodOf(sa: WorkspaceServiceAccount): AuthMethod {
  if (sa.spiffe_id) return "kubernetes";
  if (sa.oauth_client_id) return "credential";
  return "none";
}

/** What it proves its identity with: the "Identity provider" of a service account. */
export const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  credential: "Client secret / JWT",
  kubernetes: "Kubernetes token",
  none: "No credential",
};

export type SAStatus = "active" | "waiting" | "no_credential" | "disabled";

export const SA_STATUS: Record<SAStatus, { label: string; tone: ConsoleTone }> = {
  active: { label: "Active", tone: "success" },
  waiting: { label: "Waiting for first connection", tone: "info" },
  no_credential: { label: "No credential", tone: "warning" },
  disabled: { label: "Disabled", tone: "neutral" },
};

export function saStatusOf(sa: WorkspaceServiceAccount): SAStatus {
  if (sa.status !== "active") return "disabled";
  if (authMethodOf(sa) === "none") return "no_credential";
  return sa.last_seen_at ? "active" : "waiting";
}
