/**
 * AuthenticationPage — Configure → Identity Providers. Rebuilt to the Console
 * standard: ConsolePage + ConsoleFilterBar + TableCard + AdaptiveTable.
 * Preserves the unified OIDC+SAML data, toggle/delete mutations, client filter,
 * and the Add Provider modal.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  EntityCell,
} from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";

import { AddAuthMethodModal } from "./components/AddAuthMethodModal";
import { toast } from "@/lib/toast";
import {
  useUpdateProviderMutation,
  useDeleteProviderMutation,
  type UpdateProviderRequest,
  type DeleteProviderRequest,
} from "../../app/api/authMethodApi";
import { useUpdateSamlProviderMutation, useDeleteSamlProviderMutation } from "../../app/api/samlApi";
import { useGetClientsQuery } from "../../app/api/clientApi";
import { SessionManager } from "../../utils/sessionManager";
import { useUnifiedProviders } from "./hooks/useUnifiedProviders";
import { ProviderIcon } from "./utils/provider-icons";
import { useTourStep, TOUR_REGISTRY } from "@/features/guided-tour";

// Row type inferred from unified providers hook
type UnifiedProvider = ReturnType<typeof useUnifiedProviders>["providers"][number];

export function AuthenticationPage() {
  const navigate = useNavigate();
  const sessionData = SessionManager.getSession();
  const workspaceId = sessionData?.workspace_id;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name?: string } | null>(null);

  useTourStep({ tourConfig: TOUR_REGISTRY["authentication-setup"] });

  const { data: clientsResponse, isLoading: loadingClients } = useGetClientsQuery(
    workspaceId ? { workspace_id: workspaceId, active_only: false } : { workspace_id: "", active_only: false },
    { skip: !workspaceId },
  );
  const clients = useMemo(
    () => (Array.isArray(clientsResponse?.clients) ? clientsResponse!.clients : []),
    [clientsResponse],
  );

  const [updateOidcProvider] = useUpdateProviderMutation();
  const [deleteOidcProvider, { isLoading: isDeletingOidc }] = useDeleteProviderMutation();
  const [updateSamlProvider] = useUpdateSamlProviderMutation();
  const [deleteSamlProvider, { isLoading: isDeletingSaml }] = useDeleteSamlProviderMutation();

  const {
    providers: unifiedProviders,
    isLoading: isProvidersLoading,
    isError: hasProviderError,
    refetch: refetchProviders,
  } = useUnifiedProviders({ workspace_id: workspaceId || "", client_id: selectedClientId || undefined });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (unifiedProviders ?? []).filter((p) => {
      if (typeFilter !== "all" && p.provider_type !== typeFilter) return false;
      if (statusFilter !== "all" && statusFilter !== (p.is_active ? "active" : "inactive")) return false;
      if (!q) return true;
      return [p.display_name, p.provider_name, p.client_id, p.callback_url, p.entity_id, p.sso_url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [unifiedProviders, search, typeFilter, statusFilter]);

  const filtersActive = search.trim() !== "" || typeFilter !== "all" || statusFilter !== "all" || !!selectedClientId;

  const handleToggleActive = async (providerId: string, isActive: boolean) => {
    if (!workspaceId) return toast.error("Workspace context missing; please sign in again.");
    const provider = (unifiedProviders ?? []).find((item) => item.id === providerId);
    if (!provider) return toast.error("Provider not found.");
    try {
      if (provider.provider_type === "saml") {
        await updateSamlProvider({
          workspace_id: workspaceId,
          provider_id: providerId.replace("saml-", ""),
          is_active: isActive,
        }).unwrap();
      } else {
        const payload: UpdateProviderRequest = {
          workspace_id: workspaceId,
          org_id: sessionData?.org_id || "",
          provider_name: provider.provider_name,
          display_name: provider.display_name,
          client_id: provider.client_id || provider.hydra_client_id || workspaceId,
          client_secret: "",
          auth_url: provider.endpoints?.auth_url || "",
          token_url: provider.endpoints?.token_url || "",
          user_info_url: provider.endpoints?.user_info_url || "",
          scopes: ["openid", "profile", "email"],
          is_active: isActive,
          updated_by: sessionData?.user?.email || "system",
        };
        await updateOidcProvider(payload).unwrap();
      }
      toast.success(`${provider.display_name} ${isActive ? "activated" : "deactivated"}`);
      refetchProviders();
    } catch (error: any) {
      toast.error(error?.data?.message || `Failed to update ${provider.display_name}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!workspaceId || !deleteTarget) {
      setDeleteTarget(null);
      return;
    }
    const provider = (unifiedProviders ?? []).find((item) => item.id === deleteTarget.id);
    if (!provider) {
      toast.error("Provider not found.");
      setDeleteTarget(null);
      return;
    }
    try {
      if (provider.provider_type === "saml") {
        await deleteSamlProvider({
          workspace_id: workspaceId,
          provider_id: deleteTarget.id.replace("saml-", ""),
        }).unwrap();
      } else {
        const payload: DeleteProviderRequest = {
          workspace_id: workspaceId,
          client_id: provider.client_id,
          provider_name: provider.provider_name,
        };
        await deleteOidcProvider(payload).unwrap();
      }
      toast.success(`${provider.display_name} deleted successfully`);
      setDeleteTarget(null);
      refetchProviders();
    } catch (error: any) {
      toast.error(error?.data?.message || `Failed to delete ${provider.display_name}`);
    }
  };

  // ─── Type filter pills ──────────────────────────────────────────────────────
  const allProviders = unifiedProviders ?? [];
  const typeFilters = useMemo(
    () => [
      { key: "all", label: "All", count: allProviders.length },
      { key: "oidc", label: "OIDC", count: allProviders.filter((p) => p.provider_type === "oidc").length },
      { key: "saml", label: "SAML", count: allProviders.filter((p) => p.provider_type === "saml").length },
    ],
    [allProviders],
  );

  // ─── Client + status trailing selects ──────────────────────────────────────
  const trailingControls = (
    <div className="flex items-center gap-2">
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        aria-label="Status"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        style={{ minWidth: 130 }}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <select
        value={selectedClientId}
        onChange={(e) => setSelectedClientId(e.target.value)}
        aria-label="Client"
        disabled={loadingClients}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        style={{ minWidth: 160 }}
      >
        <option value="">All clients</option>
        {clients.map((c: any) => (
          <option key={c.client_id ?? c.id} value={c.client_id ?? c.id}>
            {c.name ?? c.client_name ?? c.client_id ?? c.id}
          </option>
        ))}
      </select>
      {filtersActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            setTypeFilter("all");
            setStatusFilter("all");
            setSelectedClientId("");
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );

  // ─── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<AdaptiveColumn<UnifiedProvider>[]>(
    () => [
      {
        id: "provider",
        header: "Provider",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <ProviderIcon providerName={p.provider_name} providerType={p.provider_type} className="size-4" />
              </span>
              <EntityCell
                label={p.display_name}
                detail={`by ${p.provider_name}`}
              />
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        approxWidth: 100,
        priority: 1,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className={`badge ${p.provider_type === "saml" ? "badge--accent" : "badge--info"}`}>
              <span className="bdot" />
              {p.provider_type === "saml" ? "SAML" : "OIDC"}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        approxWidth: 110,
        priority: 2,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className={`badge ${p.is_active ? "badge--success" : "badge--muted"}`}>
              <span className="bdot" />
              {p.is_active ? "Active" : "Inactive"}
            </span>
          );
        },
      },
      {
        id: "configuration",
        header: "Configuration",
        approxWidth: 280,
        priority: 3,
        cell: ({ row }) => {
          const p = row.original;
          const config = p.provider_type === "saml" ? p.entity_id : p.callback_url;
          return (
            <span
              className="block max-w-[280px] truncate font-mono text-xs text-muted-foreground"
              title={config}
            >
              {config || "—"}
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
          const p = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Provider actions">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                      <circle cx="5" cy="12" r="1" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                  <DropdownMenuItem
                    className="menu-item"
                    onSelect={() => navigate(`/identity-providers/saml/edit/${p.id}`)}
                  >
                    <span className="mi-ic"><Pencil className="icon-sm" /></span>
                    Edit
                  </DropdownMenuItem>
                  <div className="menu-sep" />
                  <DropdownMenuItem
                    className="menu-item"
                    onSelect={() => handleToggleActive(p.id, !p.is_active)}
                  >
                    <span className="mi-ic"><Power className="icon-sm" /></span>
                    {p.is_active ? "Deactivate" : "Activate"}
                  </DropdownMenuItem>
                  <div className="menu-sep" />
                  <DropdownMenuItem
                    className="menu-item danger"
                    onSelect={() => setDeleteTarget({ id: p.id, name: p.display_name })}
                  >
                    <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                    Delete provider
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, handleToggleActive],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <ConsolePage
      title="Identity Providers"
      description="Manage OIDC and SAML providers used by your workforce and end-user authentication flows."
      actions={
        <Button
          className="text-white"
          data-tour-id="create-auth-method-button"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="mr-1.5 size-4" />
          Add provider
        </Button>
      }
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search providers"
        filters={typeFilters}
        activeFilter={typeFilter}
        onFilterChange={setTypeFilter}
        trailing={trailingControls}
      />

      <TableCard>
        <CardContent variant="flush">
          {hasProviderError ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Unable to load identity providers. Please try refreshing.
            </div>
          ) : isProvidersLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                {filtersActive ? "No providers match" : "No identity providers yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {filtersActive
                  ? "Try a different search term or filter."
                  : "Add an OIDC or SAML provider so your users can sign in."}
              </p>
              <div className="mt-4">
                {filtersActive ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setTypeFilter("all");
                      setStatusFilter("all");
                      setSelectedClientId("");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button className="text-white" onClick={() => setIsAddOpen(true)}>
                    <Plus className="mr-1.5 size-4" />
                    Add provider
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <AdaptiveTable
              tableId="identity-providers"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <AddAuthMethodModal open={isAddOpen} onOpenChange={setIsAddOpen} />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !(isDeletingOidc || isDeletingSaml) && setDeleteTarget(null)}
      >
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Delete provider?</DialogTitle>
            <DialogDescription className="dg-desc">
              This removes the provider configuration. Users relying on it can no longer sign in
              through it. This can't be undone.
            </DialogDescription>
            {deleteTarget?.name && (
              <div className="dg-target" style={{ fontFamily: "var(--font-family-sans)" }}>
                {deleteTarget.name}
              </div>
            )}
            <div className="dg-actions">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeletingOidc || isDeletingSaml}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeletingOidc || isDeletingSaml}
              >
                <Trash2 className="mr-1.5 size-4" />
                {isDeletingOidc || isDeletingSaml ? "Deleting…" : "Delete provider"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
