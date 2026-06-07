/**
 * ScimConnectionsPage — Configure → SCIM Connections.
 * Manage SCIM 2.0 provisioning tokens. Follows the Console Refresh pattern
 * used by AuthenticationPage (section-header, decision-banner, bespoke table).
 */

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
  useListScimConnectionsQuery,
  useCreateScimConnectionMutation,
  useRevokeScimConnectionMutation,
} from "@/app/api/scimConnectionsApi";
import config from "@/config";

const INFO_KEY = "scim_connections_info_dismissed_v1";

export default function ScimConnectionsPage() {
  const { data: connections = [], isLoading } = useListScimConnectionsQuery();
  const [createConnection, { isLoading: isCreating }] = useCreateScimConnectionMutation();
  const [revokeConnection] = useRevokeScimConnectionMutation();
  const [newToken, setNewToken] = useState<{ token: string; endpoint: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null);
  const [infoDismissed, setInfoDismissed] = useState(() => {
    try { return localStorage.getItem(INFO_KEY) === "1"; } catch { return false; }
  });

  const dismissInfo = () => { setInfoDismissed(true); try { localStorage.setItem(INFO_KEY, "1"); } catch {} };

  const handleCreate = async () => {
    try {
      const result = await createConnection({}).unwrap();
      setNewToken({ token: result.token, endpoint: result.endpoint });
      toast.success("SCIM connection created");
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to create connection");
    }
  };

  const handleRevoke = async () => {
    if (!deleteTarget) return;
    try {
      await revokeConnection(deleteTarget.id).unwrap();
      toast.success("Connection revoked");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.error || "Failed to revoke");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const activeConns = connections.filter((c) => c.status === "active");
  const revokedConns = connections.filter((c) => c.status !== "active");
  const apiBase = config.VITE_API_URL || "";

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">SCIM Connections</h1>
            <p className="sh-desc">
              Manage SCIM 2.0 provisioning tokens for automated user sync from identity providers.
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={isCreating}>
            <Plus className="icon-sm" /> {isCreating ? "Creating…" : "New Connection"}
          </button>
        </div>

        {/* Token reveal banner */}
        {newToken && (
          <div className="decision-banner" style={{ alignItems: "flex-start", borderColor: "var(--color-success, #16a34a)" }}>
            <span className="db-icon"><Shield className="icon" style={{ color: "var(--color-success, #16a34a)" }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="db-title">Connection created — copy the token now</p>
              <p className="db-text">This token will not be shown again. Store it securely.</p>

              <div style={{ marginTop: "var(--space-3)" }}>
                <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>Bearer Token</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ fontSize: 12, background: "var(--color-bg-subtle)", padding: "6px 10px", borderRadius: 6, flex: 1, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>{newToken.token}</code>
                  <button className="btn btn-secondary" style={{ height: 32, padding: "0 10px", flex: "none" }} onClick={() => copyToClipboard(newToken.token)}>
                    <Copy className="icon-sm" />
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "var(--space-3)" }}>
                <label style={{ fontSize: 11, color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>SCIM Endpoint</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <code style={{ fontSize: 12, background: "var(--color-bg-subtle)", padding: "6px 10px", borderRadius: 6, flex: 1, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>{newToken.endpoint}</code>
                  <button className="btn btn-secondary" style={{ height: 32, padding: "0 10px", flex: "none" }} onClick={() => copyToClipboard(newToken.endpoint)}>
                    <Copy className="icon-sm" />
                  </button>
                </div>
              </div>

              <button className="btn btn-secondary" style={{ height: 32, padding: "0 12px", marginTop: "var(--space-4)" }} onClick={() => setNewToken(null)}>
                Dismiss
              </button>
            </div>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setNewToken(null)} style={{ flex: "none" }}>
              <X className="icon-sm" />
            </button>
          </div>
        )}

        {/* Info banner */}
        {!infoDismissed && !newToken && (
          <div className="decision-banner" style={{ alignItems: "flex-start" }}>
            <span className="db-icon"><Shield className="icon" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="db-title">SCIM provisioning setup</p>
              <p className="db-text">
                Connect your identity provider (Okta, Azure AD, OneLogin) to automatically
                provision and deprovision users in this workspace.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-5)", marginTop: "var(--space-3)" }}>
                {[
                  "Automated user lifecycle",
                  "Group-based access control",
                  "Real-time deprovisioning",
                ].map((cap) => (
                  <span key={cap} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    <CheckCircle2 className="icon-sm" style={{ color: "var(--color-primary)" }} />
                    {cap}
                  </span>
                ))}
              </div>
              <a
                className="btn btn-secondary"
                href="https://docs.authsec.dev/scim"
                target="_blank"
                rel="noreferrer"
                style={{ height: 32, padding: "0 12px", marginTop: "var(--space-4)" }}
              >
                <ExternalLink className="icon-sm" /> Setup guide
              </a>
            </div>
            <button className="icon-btn" aria-label="Dismiss" onClick={dismissInfo} style={{ flex: "none" }}>
              <X className="icon-sm" />
            </button>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <p style={{ color: "var(--color-text-muted)", padding: "var(--space-6)" }}>Loading…</p>
        ) : connections.length === 0 && !newToken ? (
          <div className="empty-state">
            <Shield style={{ width: 40, height: 40, color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }} />
            <p className="es-title">No SCIM connections</p>
            <p className="es-desc">Create a connection to start provisioning users automatically.</p>
            <button className="btn btn-primary" onClick={handleCreate} disabled={isCreating} style={{ marginTop: "var(--space-4)" }}>
              <Plus className="icon-sm" /> Create First Connection
            </button>
          </div>
        ) : (
          <div className="cr-table-wrap">
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Connection ID</th>
                  <th>Status</th>
                  <th>SCIM Endpoint</th>
                  <th>Created</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {activeConns.map((conn) => (
                  <tr key={conn.id}>
                    <td><code style={{ fontSize: 12 }}>{conn.id.slice(0, 12)}…</code></td>
                    <td><span className="status-chip" data-status="active">Active</span></td>
                    <td><code style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{apiBase}/authsec/uflow/scim/v2/c/{conn.id}/Users</code></td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{new Date(conn.created_at).toLocaleDateString()}</td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="icon-btn"><MoreHorizontal className="icon-sm" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                          <DropdownMenuItem onClick={() => copyToClipboard(`${apiBase}/authsec/uflow/scim/v2/c/${conn.id}/Users`)}>
                            <Copy className="icon-sm" /> Copy endpoint
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ id: conn.id })}>
                            <Trash2 className="icon-sm" /> Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {revokedConns.map((conn) => (
                  <tr key={conn.id} style={{ opacity: 0.5 }}>
                    <td><code style={{ fontSize: 12 }}>{conn.id.slice(0, 12)}…</code></td>
                    <td><span className="status-chip" data-status="error">Revoked</span></td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>—</td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{new Date(conn.created_at).toLocaleDateString()}</td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="confirm-dialog">
            <DialogTitle className="cd-title">Revoke SCIM connection</DialogTitle>
            <DialogDescription className="cd-desc">
              Users provisioned via this token will no longer sync. This cannot be undone.
            </DialogDescription>
            <div className="cd-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleRevoke}>Revoke</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
