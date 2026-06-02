/**
 * AuthenticationPage — Configure → Identity Providers. Rebuilt to the Console
 * Refresh prototype (`[data-cr]`): section-header, filter bar, bespoke table,
 * kebab actions, prototype delete dialog. Preserves the unified OIDC+SAML data,
 * toggle/delete mutations, client filter, and the Add Provider modal.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Fingerprint,
  MoreHorizontal,
  Plus,
  Power,
  Search,
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

export function AuthenticationPage() {
  const sessionData = SessionManager.getSession();
  const workspaceId = sessionData?.workspace_id;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name?: string } | null>(null);
  const INFO_KEY = "idp_info_dismissed_v1";
  const [infoDismissed, setInfoDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INFO_KEY) === "1";
    } catch {
      return false;
    }
  });
  const dismissInfo = () => {
    setInfoDismissed(true);
    try {
      localStorage.setItem(INFO_KEY, "1");
    } catch {
      /* ignore */
    }
  };

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

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Identity Providers</h1>
            <p className="sh-desc">
              Manage OIDC and SAML providers used by your workforce and end-user authentication flows.
            </p>
          </div>
          <button className="btn btn-primary" data-tour-id="create-auth-method-button" onClick={() => setIsAddOpen(true)}>
            <Plus className="icon-sm" /> Add provider
          </button>
        </div>

        {!infoDismissed && (
          <div className="decision-banner" style={{ alignItems: "flex-start" }}>
            <span className="db-icon"><Fingerprint className="icon" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="db-title">Identity provider management</p>
              <p className="db-text">
                Manage OIDC and SAML authentication methods for secure user identity verification
                across your applications.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-5)", marginTop: "var(--space-3)" }}>
                {[
                  "Multiple protocol support (OIDC / SAML)",
                  "Real-time provider status monitoring",
                  "Enterprise SSO integration",
                ].map((cap) => (
                  <span key={cap} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    <CheckCircle2 className="icon-sm" style={{ color: "var(--color-primary)" }} />
                    {cap}
                  </span>
                ))}
              </div>
              <a
                className="btn btn-secondary"
                href="https://docs.authsec.dev/administration/category/authentication-5"
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

        <div className="roles-toolbar">
          <div className={`search${search ? " has-value" : ""}`}>
            <span className="search-ic"><Search className="icon" /></span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search providers"
              aria-label="Search providers"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="filterset">
            <span className="filterset-label">Type</span>
            <div className="segmented">
              {[["all", "All"], ["oidc", "OIDC"], ["saml", "SAML"]].map(([v, label]) => (
                <button key={v} data-on={typeFilter === v} onClick={() => setTypeFilter(v)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="select">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" style={{ minWidth: 120 }}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          <div className="select">
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} aria-label="Client" disabled={loadingClients} style={{ minWidth: 150 }}>
              <option value="">All clients</option>
              {clients.map((c: any) => (
                <option key={c.client_id ?? c.id} value={c.client_id ?? c.id}>{c.name ?? c.client_name ?? c.client_id ?? c.id}</option>
              ))}
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          {filtersActive && (
            <button className="chip-clear" onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setSelectedClientId(""); }}>
              Clear
            </button>
          )}
        </div>

        <div className="table-card">
          {hasProviderError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <Fingerprint className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Unable to load providers</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>We hit an error fetching identity providers.</p>
            </div>
          ) : isProvidersLoading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk" style={{ width: 36, height: 36, borderRadius: 8, flex: "none" }} />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "30%" }} />
                    <span className="sk sk-line" style={{ width: "20%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 64, height: 22, borderRadius: 999, margin: "0 24px" }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 28 }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic"><Fingerprint className="icon-lg" /></span>
              <h3 className="empty-title">{filtersActive ? "No providers match" : "No identity providers yet"}</h3>
              <p className="empty-desc">
                {filtersActive
                  ? "Try a different search term or filter."
                  : "Add an OIDC or SAML provider so your users can sign in."}
              </p>
              <button className="btn btn-primary" onClick={filtersActive ? () => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setSelectedClientId(""); } : () => setIsAddOpen(true)}>
                {filtersActive ? "Clear filters" : (<><Plus className="icon-sm" /> Add provider</>)}
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="th-context">Configuration</th>
                  <th className="th-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const config = p.provider_type === "saml" ? p.entity_id : p.callback_url;
                  return (
                    <tr key={p.id} tabIndex={0}>
                      <td>
                        <div className="app-cell">
                          <span className="app-glyph">
                            <ProviderIcon providerName={p.provider_name} providerType={p.provider_type} className="icon-sm" />
                          </span>
                          <span className="ac-meta">
                            <span className="ac-name">{p.display_name}</span>
                            <span className="ac-uri" style={{ fontFamily: "var(--font-family-sans)" }}>by {p.provider_name}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${p.provider_type === "saml" ? "badge--accent" : "badge--info"}`}>
                          <span className="bdot" />
                          {p.provider_type === "saml" ? "SAML" : "OIDC"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${p.is_active ? "badge--success" : "badge--muted"}`}>
                          <span className="bdot" />
                          {p.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="col-context">
                        <span className="ctx-uri" title={config} style={{ maxWidth: 280 }}>{config || "—"}</span>
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="icon-btn" aria-label="Provider actions">
                                <MoreHorizontal className="icon" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                              <DropdownMenuItem className="menu-item" onSelect={() => handleToggleActive(p.id, !p.is_active)}>
                                <span className="mi-ic"><Power className="icon-sm" /></span>
                                {p.is_active ? "Deactivate" : "Activate"}
                              </DropdownMenuItem>
                              <div className="menu-sep" />
                              <DropdownMenuItem className="menu-item danger" onSelect={() => setDeleteTarget({ id: p.id, name: p.display_name })}>
                                <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                                Delete provider
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AddAuthMethodModal open={isAddOpen} onOpenChange={setIsAddOpen} />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !(isDeletingOidc || isDeletingSaml) && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Delete provider?</DialogTitle>
            <DialogDescription className="dg-desc">
              This removes the provider configuration. Users relying on it can no longer sign in
              through it. This can't be undone.
            </DialogDescription>
            {deleteTarget?.name && <div className="dg-target" style={{ fontFamily: "var(--font-family-sans)" }}>{deleteTarget.name}</div>}
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={isDeletingOidc || isDeletingSaml}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void handleConfirmDelete()} disabled={isDeletingOidc || isDeletingSaml}>
                <Trash2 className="icon-sm" /> {isDeletingOidc || isDeletingSaml ? "Deleting…" : "Delete provider"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
