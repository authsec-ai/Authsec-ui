/**
 * Status words for a workspace client registration (one client on one MCP
 * server), shared by the Clients table, the client drawer and the Agents list.
 * Each label says what is true of the registration, nothing more.
 */

import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";

import { useApproveWorkspaceClientMutation, type WorkspaceClientItem } from "@/app/api/mcpClientsApi";
import type { ConsoleTone } from "@/components/console/status";

export type ConnectionStatus = "active" | "waiting" | "pending" | "sync_error" | "revoked";

export const CONNECTION_STATUS: Record<ConnectionStatus, { label: string; tone: ConsoleTone }> = {
  active: { label: "Active", tone: "success" },
  waiting: { label: "Waiting for first connection", tone: "info" },
  pending: { label: "Pending approval", tone: "info" },
  sync_error: { label: "Sync error", tone: "warning" },
  revoked: { label: "Revoked", tone: "neutral" },
};

export function connectionStatus(c: WorkspaceClientItem): ConnectionStatus {
  if (c.status === "revoked" || c.sync_status === "pending_delete") return "revoked";
  if (c.status === "pending_approval") return "pending";
  if (c.sync_status === "sync_error") return "sync_error";
  return c.last_token_issued_at ? "active" : "waiting";
}

/**
 * One status for a client across all its registrations: a pending one needs a
 * decision, so it wins; then any server it uses; then any it may use.
 */
export function clientStatus(conns: WorkspaceClientItem[]): ConnectionStatus {
  const all = conns.map(connectionStatus);
  for (const s of ["pending", "active", "sync_error", "waiting"] as const) {
    if (all.includes(s)) return s;
  }
  return "revoked";
}

export const KIND_LABELS: Record<WorkspaceClientItem["client_kind"], string> = {
  agent: "Agent",
  human_app: "Human app",
  m2m: "M2M",
  cli: "CLI",
};

export const REGISTRATION_LABELS: Record<string, string> = {
  dcr: "Dynamic (DCR)",
  prereg: "Pre-registered",
  cimd: "Client metadata (CIMD)",
};

export function latestToken(conns: WorkspaceClientItem[]): string | undefined {
  return conns
    .map((c) => c.last_token_issued_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
}

/** Font size for this feature's small text: nothing below 12.5px. */
export const SMALL_TEXT = "text-[length:var(--font-size-body-xs)]";

export function relativeOrNever(ts?: string) {
  if (!ts) return "Never";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "Never" : formatDistanceToNow(d, { addSuffix: true });
}

export function errorText(err: unknown, fallback: string) {
  const e = err as { data?: { error?: string; message?: string } };
  return e?.data?.message ?? e?.data?.error ?? fallback;
}

/** Approve a pending registration, wired to the workspace client registry. */
export function useApproveClient() {
  const [approve, state] = useApproveWorkspaceClientMutation();
  const run = async (c: WorkspaceClientItem) => {
    try {
      await approve({ rsId: c.resource_server_id, clientId: c.client_id }).unwrap();
      toast.success(`Approved ${c.client_name || c.client_id} on ${c.resource_server_name || "this server"}.`);
    } catch (err) {
      toast.error(errorText(err, "Couldn't approve the client."));
    }
  };
  return [run, state] as const;
}

