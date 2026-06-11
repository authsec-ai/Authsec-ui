/**
 * DirectorySyncPage — Configure → Directory Sync.
 * Overview of AD/Entra sync configurations. Follows the same Console Refresh
 * pattern used by AuthenticationPage and ApplicationsPage (table-card, empty
 * state, skeleton loaders).
 */

import { useMemo, useState } from "react";
import {
  Edit2,
  FolderSync,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-utils";
import {
  useListSyncConfigsQuery,
  useDeleteSyncConfigMutation,
  type SyncConfig,
} from "@/app/api/syncConfigsApi";
import {
  useSyncActiveDirectoryMutation,
  useSyncEntraIDMutation,
} from "@/app/api/enduser/invitesApi";
import { ADSyncInlineForm } from "@/features/users/components/ADSyncInlineForm";
import { EntraSyncInlineForm } from "@/features/users/components/EntraSyncInlineForm";

type SheetKind = "ad" | "entra" | null;

export default function DirectorySyncPage() {
  const { data: configs = [], isLoading, isError, refetch } =
    useListSyncConfigsQuery({});
  const [deleteConfig] = useDeleteSyncConfigMutation();
  const [syncAD] = useSyncActiveDirectoryMutation();
  const [syncEntra] = useSyncEntraIDMutation();

  // Sheet state: which form is open + optional config being edited
  const [sheetKind, setSheetKind] = useState<SheetKind>(null);
  const [editConfig, setEditConfig] = useState<SyncConfig | null>(null);

  const openAD = (cfg: SyncConfig | null = null) => {
    setEditConfig(cfg);
    setSheetKind("ad");
  };

  const openEntra = (cfg: SyncConfig | null = null) => {
    setEditConfig(cfg);
    setSheetKind("entra");
  };

  const closeSheet = () => {
    setSheetKind(null);
    setEditConfig(null);
  };

  const handleSuccess = () => {
    closeSheet();
    refetch();
  };

  const rows = useMemo(() => {
    if (!Array.isArray(configs)) return [];
    return configs.map((c: SyncConfig) => ({
      ...c,
      typeLabel:
        c.sync_type === "entra_id" ? "Entra ID" : "Active Directory",
    }));
  }, [configs]);

  const handleRefresh = () => {
    refetch();
    toast.info("Refreshed sync configurations");
  };

  const handleSyncNow = async (cfg: SyncConfig & { typeLabel: string }) => {
    try {
      if (cfg.typeLabel === "Entra ID") {
        await syncEntra({ provider: "entra", config_id: cfg.id }).unwrap();
      } else {
        await syncAD({ provider: "ad", config_id: cfg.id }).unwrap();
      }
      toast.success(`Sync triggered for "${cfg.config_name}"`);
      refetch();
    } catch (err: unknown) {
      toast.error(`Sync failed: ${getErrorMessage(err, "Unknown error")}`);
    }
  };

  const handleDelete = async (cfg: SyncConfig) => {
    if (
      !window.confirm(
        `Delete sync configuration "${cfg.config_name}"? This cannot be undone.`
      )
    )
      return;
    try {
      await deleteConfig({ id: cfg.id! }).unwrap();
      toast.success(`"${cfg.config_name}" deleted`);
      refetch();
    } catch (err: unknown) {
      toast.error(`Delete failed: ${getErrorMessage(err, "Unknown error")}`);
    }
  };

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Directory Sync</h1>
            <p className="sh-desc">
              Active Directory and Entra ID synchronization. Synced users are
              automatically provisioned with workspace memberships.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-secondary" onClick={handleRefresh}>
              <RefreshCw className="icon-sm" /> Refresh
            </button>
            <button className="btn btn-secondary" onClick={() => openAD()}>
              <Plus className="icon-sm" /> Active Directory
            </button>
            <button className="btn btn-primary" onClick={() => openEntra()}>
              <Plus className="icon-sm" /> Entra ID
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="table-card">
          {isError ? (
            <div className="empty">
              <span
                className="empty-ic"
                style={{
                  background: "var(--color-danger-soft)",
                  color: "var(--color-danger-text)",
                  borderColor: "transparent",
                }}
              >
                <FolderSync className="icon-lg" />
              </span>
              <h3
                className="empty-title"
                style={{ color: "var(--color-danger-text)" }}
              >
                Unable to load configurations
              </h3>
              <p
                className="empty-desc"
                style={{ color: "var(--color-danger-text)" }}
              >
                We hit an error fetching directory sync configurations.
              </p>
            </div>
          ) : isLoading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span
                    className="sk"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      flex: "none",
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                    }}
                  >
                    <span className="sk sk-line" style={{ width: "30%" }} />
                    <span
                      className="sk sk-line"
                      style={{ width: "20%", height: 9 }}
                    />
                  </span>
                  <span
                    className="sk sk-line"
                    style={{
                      width: 64,
                      height: 22,
                      borderRadius: 999,
                      margin: "0 24px",
                    }}
                  />
                  <span
                    className="sk sk-line"
                    style={{ width: 72, height: 22, borderRadius: 999 }}
                  />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <FolderSync className="icon-lg" />
              </span>
              <h3 className="empty-title">No directory sync configured</h3>
              <p className="empty-desc">
                Connect Active Directory or Entra ID to automatically provision
                users.
              </p>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-secondary" onClick={() => openAD()}>
                  <Plus className="icon-sm" /> Active Directory
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => openEntra()}
                >
                  <Plus className="icon-sm" /> Entra ID
                </button>
              </div>
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
                {rows.map((cfg) => (
                  <tr key={cfg.id} tabIndex={0}>
                    <td>
                      <div className="app-cell">
                        <span className="app-glyph">
                          <FolderSync className="icon-sm" />
                        </span>
                        <span className="ac-meta">
                          <span className="ac-name">
                            {cfg.config_name || "Sync Config"}
                          </span>
                          <span className="ac-uri">
                            {cfg.last_sync_at
                              ? `Last sync · ${new Date(
                                  cfg.last_sync_at
                                ).toLocaleDateString()}`
                              : "Never synced"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          cfg.typeLabel === "Entra ID"
                            ? "badge--accent"
                            : "badge--info"
                        }`}
                      >
                        <span className="bdot" />
                        {cfg.typeLabel}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          cfg.is_active
                            ? "badge--success"
                            : cfg.last_sync_status === "error"
                            ? "badge--danger"
                            : "badge--muted"
                        }`}
                      >
                        <span className="bdot" />
                        {cfg.is_active
                          ? "Active"
                          : cfg.last_sync_status === "error"
                          ? "Error"
                          : "Inactive"}
                      </span>
                    </td>
                    <td className="col-context">
                      <span
                        className="ctx-uri"
                        title={
                          cfg.ad_config?.server ||
                          cfg.entra_config?.workspace_id ||
                          ""
                        }
                        style={{ maxWidth: 280 }}
                      >
                        {cfg.ad_config?.server ||
                          cfg.entra_config?.workspace_id ||
                          "—"}
                      </span>
                    </td>
                    <td>
                      <div
                        className="row-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="icon-btn"
                              aria-label="Config actions"
                            >
                              <MoreHorizontal className="icon" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            data-cr
                            className="min-w-52 p-1"
                          >
                            <DropdownMenuItem
                              className="menu-item"
                              onSelect={() => handleSyncNow(cfg)}
                            >
                              <span className="mi-ic">
                                <Zap className="icon-sm" />
                              </span>
                              Sync now
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="menu-item"
                              onSelect={() =>
                                cfg.typeLabel === "Entra ID"
                                  ? openEntra(cfg)
                                  : openAD(cfg)
                              }
                            >
                              <span className="mi-ic">
                                <Edit2 className="icon-sm" />
                              </span>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="menu-item menu-item--danger"
                              onSelect={() => handleDelete(cfg)}
                            >
                              <span className="mi-ic">
                                <Trash2 className="icon-sm" />
                              </span>
                              Delete
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

      {/* AD Sheet */}
      <Sheet open={sheetKind === "ad"} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-hidden">
          <SheetTitle className="sr-only">Configure Active Directory Sync</SheetTitle>
          <SheetDescription className="sr-only">
            Set up or edit an Active Directory sync configuration.
          </SheetDescription>
          <ADSyncInlineForm
            onClose={closeSheet}
            onSuccess={handleSuccess}
            editConfig={editConfig}
          />
        </SheetContent>
      </Sheet>

      {/* Entra ID Sheet */}
      <Sheet open={sheetKind === "entra"} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-hidden">
          <SheetTitle className="sr-only">Configure Entra ID Sync</SheetTitle>
          <SheetDescription className="sr-only">
            Set up or edit a Microsoft Entra ID sync configuration.
          </SheetDescription>
          <EntraSyncInlineForm
            onClose={closeSheet}
            onSuccess={handleSuccess}
            editConfig={editConfig}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
