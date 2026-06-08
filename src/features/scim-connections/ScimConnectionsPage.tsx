/**
 * ScimConnectionsPage — Configure → SCIM Connections.
 * Manage SCIM 2.0 provisioning tokens. Follows the same Console Refresh
 * pattern used by AuthenticationPage and ApplicationsPage (table-card, empty
 * state, skeleton loaders, dropdown actions, confirmation dialog).
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
  const { data: connections = [], isLoading, isError } = useListScimConnectionsQuery();
  const [createConnection, { isLoading: isCreating }] = useCreateScimConnectionMutation();
  const [revokeConnection, { isLoading: isRevoking }] = useRevokeScimConnectionMutation();
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

  const safeConnections = Array.isArray(connections) ? connections : [];
  const activeConns = safeConnections.filter((c) => c.status === "active");
  const revokedConns = safeConnections.filter((c) => c.status !== "active");
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
        <div className="table-card">
          {isError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <Shield className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Unable to load connections</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>We hit an error fetching SCIM connections.</p>
            </div>
          ) : isLoading ? (
            <div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk" style={{ width: 36, height: 36, borderRadius: 8, flex: "none" }} />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "30%" }} />
                    <span className="sk sk-line" style={{ width: "20%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 64, height: 22, borderRadius: 999, margin: "0 24px" }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999 }} />
                </div>
              ))}
            </div>
          ) : safeConnections.length === 0 && !newToken ? (
            <div className="empty">
              <span className="empty-ic"><Shield className="icon-lg" /></span>
              <h3 className="empty-title">No SCIM connections</h3>
              <p className="empty-desc">Create a connection to start provisioning users automatically.</p>
              <button className="btn btn-primary" onClick={handleCreate} disabled={isCreating}>
                <Plus className="icon-sm" /> Create first connection
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Connection</th>
                  <th>Status</th>
                  <th className="th-context">SCIM Endpoint</th>
                  <th className="th-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeConns.map((conn) => (
                  <tr key={conn.id} tabIndex={0}>
                    <td>
                      <div className="app-cell">
                        <span className="app-glyph">
                          <Shield className="icon-sm" />
                        </span>
                        <span className="ac-meta">
                          <span className="ac-name"><code style={{ fontSize: 12 }}>{conn.id.slice(0, 12)}…</code></span>
                          <span className="ac-uri">{new Date(conn.created_at).toLocaleDateString()}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge--success">
                        <span className="bdot" />
                        Active
                      </span>
                    </td>
                    <td className="col-context">
                      <span className="ctx-uri" style={{ maxWidth: 320 }}>
                        <code style={{ fontSize: 11 }}>{apiBase}/authsec/uflow/scim/v2/c/{conn.id}/Users</code>
                      </span>
                    </td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="icon-btn" aria-label="Connection actions">
                              <MoreHorizontal className="icon" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                            <DropdownMenuItem className="menu-item" onSelect={() => copyToClipboard(`${apiBase}/authsec/uflow/scim/v2/c/${conn.id}/Users`)}>
                              <span className="mi-ic"><Copy className="icon-sm" /></span>
                              Copy endpoint
                            </DropdownMenuItem>
                            <div className="menu-sep" />
                            <DropdownMenuItem className="menu-item danger" onSelect={() => setDeleteTarget({ id: conn.id })}>
                              <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                              Revoke
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
                {revokedConns.map((conn) => (
                  <tr key={conn.id} tabIndex={0} style={{ opacity: 0.5 }}>
                    <td>
                      <div className="app-cell">
                        <span className="app-glyph">
                          <Shield className="icon-sm" />
                        </span>
                        <span className="ac-meta">
                          <span className="ac-name"><code style={{ fontSize: 12 }}>{conn.id.slice(0, 12)}…</code></span>
                          <span className="ac-uri">{new Date(conn.created_at).toLocaleDateString()}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge--danger">
                        <span className="bdot" />
                        Revoked
                      </span>
                    </td>
                    <td className="col-context">
                      <span className="ctx-uri" style={{ color: "var(--color-text-muted)" }}>—</span>
                    </td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !isRevoking && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Revoke SCIM connection?</DialogTitle>
            <DialogDescription className="dg-desc">
              Users provisioned via this token will no longer sync. This cannot be undone.
            </DialogDescription>
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={isRevoking}>Cancel</button>
              <button className="btn btn-danger" onClick={handleRevoke} disabled={isRevoking}>
                <Trash2 className="icon-sm" /> {isRevoking ? "Revoking…" : "Revoke"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
