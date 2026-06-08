/**
 * DirectorySyncPage — Configure → Directory Sync.
 * Overview of AD/Entra sync configurations. Follows the same Console Refresh
 * pattern used by AuthenticationPage and ApplicationsPage (table-card, empty
 * state, skeleton loaders).
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ExternalLink,
  FolderSync,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { useListSyncConfigsQuery } from "@/app/api/syncConfigsApi";

const INFO_KEY = "directory_sync_info_dismissed_v1";

export default function DirectorySyncPage() {
  const { data: configs = [], isLoading, isError, refetch } = useListSyncConfigsQuery({});
  const navigate = useNavigate();
  const [infoDismissed, setInfoDismissed] = useState(() => {
    try { return localStorage.getItem(INFO_KEY) === "1"; } catch { return false; }
  });
  const dismissInfo = () => { setInfoDismissed(true); try { localStorage.setItem(INFO_KEY, "1"); } catch {} };

  const rows = useMemo(() => {
    if (!Array.isArray(configs)) return [];
    return configs.map((c: any) => ({
      ...c,
      typeLabel: c.source_type === "entra_id" || c.config_type === "entra" ? "Entra ID" : "Active Directory",
    }));
  }, [configs]);

  const handleRefresh = () => {
    refetch();
    toast.info("Refreshed sync configurations");
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
        <div className="table-card">
          {isError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <FolderSync className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Unable to load configurations</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>We hit an error fetching directory sync configurations.</p>
            </div>
          ) : isLoading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
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
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic"><FolderSync className="icon-lg" /></span>
              <h3 className="empty-title">No directory sync configured</h3>
              <p className="empty-desc">Connect Active Directory or Entra ID to automatically provision users.</p>
              <button className="btn btn-primary" onClick={() => navigate("/end-users")}>
                <FolderSync className="icon-sm" /> Go to End Users to configure
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="th-context">Server / Tenant</th>
                  <th className="th-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((cfg: any) => (
                  <tr key={cfg.id} tabIndex={0}>
                    <td>
                      <div className="app-cell">
                        <span className="app-glyph">
                          <FolderSync className="icon-sm" />
                        </span>
                        <span className="ac-meta">
                          <span className="ac-name">{cfg.config_name || cfg.name || "Sync Config"}</span>
                          <span className="ac-uri">
                            {cfg.last_sync_at ? `Last sync · ${new Date(cfg.last_sync_at).toLocaleDateString()}` : "Never synced"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${cfg.typeLabel === "Entra ID" ? "badge--accent" : "badge--info"}`}>
                        <span className="bdot" />
                        {cfg.typeLabel}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${cfg.status === "active" || cfg.is_active ? "badge--success" : cfg.status === "error" ? "badge--danger" : "badge--muted"}`}>
                        <span className="bdot" />
                        {cfg.status === "active" || cfg.is_active ? "Active" : cfg.status === "error" ? "Error" : cfg.status === "syncing" ? "Syncing" : cfg.status || "Unknown"}
                      </span>
                    </td>
                    <td className="col-context">
                      <span className="ctx-uri" title={cfg.server_url || cfg.connection_url || cfg.entra_tenant_id || ""} style={{ maxWidth: 280 }}>
                        {cfg.server_url || cfg.connection_url || cfg.entra_tenant_id || "—"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="icon-btn" aria-label="Config actions">
                              <MoreHorizontal className="icon" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                            <DropdownMenuItem className="menu-item" onSelect={() => navigate("/end-users")}>
                              <span className="mi-ic"><FolderSync className="icon-sm" /></span>
                              Manage in End Users
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
