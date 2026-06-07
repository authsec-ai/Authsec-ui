/**
 * DirectorySyncPage — Configure → Directory Sync.
 * Overview of AD/Entra sync configurations. Follows Console Refresh pattern.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ExternalLink,
  FolderSync,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useListSyncConfigsQuery } from "@/app/api/syncConfigsApi";

const INFO_KEY = "directory_sync_info_dismissed_v1";

export default function DirectorySyncPage() {
  const { data: configs = [], isLoading, refetch } = useListSyncConfigsQuery({});
  const navigate = useNavigate();
  const [infoDismissed, setInfoDismissed] = useState(() => {
    try { return localStorage.getItem(INFO_KEY) === "1"; } catch { return false; }
  });
  const dismissInfo = () => { setInfoDismissed(true); try { localStorage.setItem(INFO_KEY, "1"); } catch {} };

  const adConfigs = useMemo(() => configs.filter((c: any) => c.source_type === "active_directory" || c.config_type === "ad"), [configs]);
  const entraConfigs = useMemo(() => configs.filter((c: any) => c.source_type === "entra_id" || c.config_type === "entra"), [configs]);

  const handleRefresh = () => {
    refetch();
    toast.info("Refreshed sync configurations");
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "active": return <span className="status-chip" data-status="active">Active</span>;
      case "error": return <span className="status-chip" data-status="error">Error</span>;
      case "syncing": return <span className="status-chip" data-status="pending">Syncing</span>;
      default: return <span className="status-chip">{status || "Unknown"}</span>;
    }
  };

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Directory Sync</h1>
            <p className="sh-desc">
              Active Directory and Entra ID synchronization. Synced users are automatically provisioned with workspace memberships.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-secondary" onClick={handleRefresh}>
              <RefreshCw className="icon-sm" /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => navigate("/end-users")}>
              <FolderSync className="icon-sm" /> Configure
            </button>
          </div>
        </div>

        {/* Info banner */}
        {!infoDismissed && (
          <div className="decision-banner" style={{ alignItems: "flex-start" }}>
            <span className="db-icon"><FolderSync className="icon" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="db-title">Directory sync management</p>
              <p className="db-text">
                Sync users and groups from your corporate directory to AuthSec. Configure
                sync connections in the End Users page, then monitor them here.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-5)", marginTop: "var(--space-3)" }}>
                {[
                  "Active Directory (LDAP)",
                  "Entra ID (Azure AD)",
                  "Automatic workspace membership",
                ].map((cap) => (
                  <span key={cap} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    <CheckCircle2 className="icon-sm" style={{ color: "var(--color-primary)" }} />
                    {cap}
                  </span>
                ))}
              </div>
              <a
                className="btn btn-secondary"
                href="https://docs.authsec.dev/directory-sync"
                target="_blank"
                rel="noreferrer"
                style={{ height: 32, padding: "0 12px", marginTop: "var(--space-4)" }}
              >
                <ExternalLink className="icon-sm" /> Read docs
              </a>
            </div>
            <button className="icon-btn" aria-label="Dismiss" onClick={dismissInfo} style={{ flex: "none" }}>
              <X className="icon-sm" />
            </button>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <p style={{ color: "var(--color-text-muted)", padding: "var(--space-6)" }}>Loading…</p>
        ) : configs.length === 0 ? (
          <div className="empty-state">
            <FolderSync style={{ width: 40, height: 40, color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }} />
            <p className="es-title">No directory sync configured</p>
            <p className="es-desc">Connect Active Directory or Entra ID to automatically provision users.</p>
            <button className="btn btn-primary" onClick={() => navigate("/end-users")} style={{ marginTop: "var(--space-4)" }}>
              <FolderSync className="icon-sm" /> Go to End Users to Configure
            </button>
          </div>
        ) : (
          <div className="cr-table-wrap">
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Sync</th>
                  <th>Server / Tenant</th>
                </tr>
              </thead>
              <tbody>
                {adConfigs.map((cfg: any) => (
                  <tr key={cfg.id}>
                    <td style={{ fontWeight: 500 }}>{cfg.config_name || cfg.name || "AD Sync"}</td>
                    <td><span className="status-chip">Active Directory</span></td>
                    <td>{statusLabel(cfg.status)}</td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                      {cfg.last_sync_at ? new Date(cfg.last_sync_at).toLocaleString() : "Never"}
                    </td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                      {cfg.server_url || cfg.connection_url || "—"}
                    </td>
                  </tr>
                ))}
                {entraConfigs.map((cfg: any) => (
                  <tr key={cfg.id}>
                    <td style={{ fontWeight: 500 }}>{cfg.config_name || cfg.name || "Entra Sync"}</td>
                    <td><span className="status-chip">Entra ID</span></td>
                    <td>{statusLabel(cfg.status)}</td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                      {cfg.last_sync_at ? new Date(cfg.last_sync_at).toLocaleString() : "Never"}
                    </td>
                    <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                      {cfg.entra_tenant_id || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
