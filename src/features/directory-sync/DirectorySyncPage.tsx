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
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
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

type SyncRow = SyncConfig & { typeLabel: string };

export default function DirectorySyncPage() {
  const { data: configs = [], isLoading, refetch } =
    useListSyncConfigsQuery({});
  const [deleteConfig] = useDeleteSyncConfigMutation();
  const [syncAD] = useSyncActiveDirectoryMutation();
  const [syncEntra] = useSyncEntraIDMutation();

  const [query, setQuery] = useState("");

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

  const allRows = useMemo<SyncRow[]>(() => {
    if (!Array.isArray(configs)) return [];
    return configs.map((c: SyncConfig) => ({
      ...c,
      typeLabel:
        c.sync_type === "entra_id" ? "Entra ID" : "Active Directory",
    }));
  }, [configs]);

  const rows = useMemo<SyncRow[]>(() => {
    if (!query.trim()) return allRows;
    const q = query.toLowerCase();
    return allRows.filter(
      (r) =>
        r.config_name?.toLowerCase().includes(q) ||
        r.typeLabel.toLowerCase().includes(q) ||
        r.ad_config?.server?.toLowerCase().includes(q) ||
        r.entra_config?.workspace_id?.toLowerCase().includes(q),
    );
  }, [allRows, query]);

  const handleRefresh = () => {
    refetch();
    toast.info("Refreshed sync configurations");
  };

  const handleSyncNow = async (cfg: SyncRow) => {
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

  const columns = useMemo<AdaptiveColumn<SyncRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.config_name || "Sync Config"}
            detail={
              row.original.last_sync_at
                ? `Last sync · ${new Date(row.original.last_sync_at).toLocaleDateString()}`
                : "Never synced"
            }
          />
        ),
      },
      {
        id: "type",
        header: "Type",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => (
          <span
            className={`badge ${
              row.original.typeLabel === "Entra ID"
                ? "badge--accent"
                : "badge--info"
            }`}
          >
            <span className="bdot" />
            {row.original.typeLabel}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => {
          const cfg = row.original;
          return (
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
          );
        },
      },
      {
        id: "server",
        header: "Server / Tenant",
        priority: 3,
        approxWidth: 280,
        cell: ({ row }) => {
          const cfg = row.original;
          const value =
            cfg.ad_config?.server ||
            cfg.entra_config?.workspace_id ||
            "—";
          return (
            <span
              className="ctx-uri"
              title={value}
              style={{ maxWidth: 280 }}
            >
              {value}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const cfg = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                items={[
                  {
                    label: "Sync now",
                    icon: <Zap className="size-4" />,
                    onSelect: () => handleSyncNow(cfg),
                  },
                  {
                    label: "Edit",
                    icon: <Edit2 className="size-4" />,
                    onSelect: () =>
                      cfg.typeLabel === "Entra ID"
                        ? openEntra(cfg)
                        : openAD(cfg),
                  },
                  {
                    label: "Delete",
                    icon: <Trash2 className="size-4" />,
                    destructive: true,
                    onSelect: () => handleDelete(cfg),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ConsolePage
      title="Directory Sync"
      description="Active Directory and Entra ID synchronization. Synced users are automatically provisioned with workspace memberships."
      actions={
        <>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-1.5 size-3.5" /> Refresh
          </Button>
          <Button variant="outline" onClick={() => openAD()}>
            <Plus className="mr-1.5 size-3.5" /> Active Directory
          </Button>
          <Button className="text-white" onClick={() => openEntra()}>
            <Plus className="mr-1.5 size-3.5" /> Entra ID
          </Button>
        </>
      }
    >
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search sync configurations…"
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <FolderSync className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {query
                  ? "No configurations match your search"
                  : "No directory sync configured"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {query
                  ? "Try a different search term."
                  : "Connect Active Directory or Entra ID to automatically provision users."}
              </p>
              {!query && (
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" onClick={() => openAD()}>
                    <Plus className="mr-1.5 size-3.5" /> Active Directory
                  </Button>
                  <Button className="text-white" onClick={() => openEntra()}>
                    <Plus className="mr-1.5 size-3.5" /> Entra ID
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="directory-sync"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id ?? ""}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {/* AD Sheet */}
      <Sheet
        open={sheetKind === "ad"}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 overflow-hidden"
        >
          <SheetTitle className="sr-only">
            Configure Active Directory Sync
          </SheetTitle>
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
      <Sheet
        open={sheetKind === "entra"}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 overflow-hidden"
        >
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
    </ConsolePage>
  );
}
