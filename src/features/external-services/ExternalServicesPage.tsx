/**
 * ExternalServicesPage — Configure → Secrets. Rebuilt to the Console Refresh
 * prototype (`[data-cr]`): section-header, filter bar, bespoke table, kebab
 * actions, prototype delete dialog. Wired to the real external-services hooks.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Code2,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useGetExternalServicesQuery,
  useDeleteExternalServiceMutation,
  type RawExternalService,
} from "@/app/api/externalServiceApi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const AUTH_TONE: Record<string, string> = {
  oauth2: "badge--info",
  api_key: "badge--success",
  bearer_token: "badge--info",
  basic_auth: "badge--warning",
  none: "badge--muted",
};
const AUTH_LABEL: Record<string, string> = {
  oauth2: "OAuth2",
  api_key: "API key",
  bearer_token: "Bearer token",
  basic_auth: "Basic auth",
  none: "None",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function ExternalServicesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGetExternalServicesQuery();
  const [deleteService, deleteState] = useDeleteExternalServiceMutation();

  const [search, setSearch] = useState("");
  const [authFilter, setAuthFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<RawExternalService | null>(null);

  const services = useMemo<RawExternalService[]>(() => data ?? [], [data]);
  const authTypes = useMemo(() => Array.from(new Set(services.map((s) => s.auth_type))), [services]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (authFilter !== "all" && s.auth_type !== authFilter) return false;
      if (!q) return true;
      return [s.name, s.url, s.type, s.description].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [services, search, authFilter]);

  const filtersActive = search.trim() !== "" || authFilter !== "all";

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteService(deleteTarget.id).unwrap();
      toast.success(`Deleted "${deleteTarget.name}".`);
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to delete service.");
    }
  };

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Secrets</h1>
            <p className="sh-desc">
              Connect third-party services and manage their API credentials and secrets, accessible
              to your workloads and agents.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate("/external-services/add")}>
            <Plus className="icon-sm" /> Add service
          </button>
        </div>

        <div className="filter-bar">
          <div className={`search${search ? " has-value" : ""}`}>
            <span className="search-ic"><Search className="icon" /></span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services by name, URL, or type"
              aria-label="Search services"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="select">
            <select value={authFilter} onChange={(e) => setAuthFilter(e.target.value)} aria-label="Auth type">
              <option value="all">All auth types</option>
              {authTypes.map((t) => <option key={t} value={t}>{AUTH_LABEL[t] ?? t}</option>)}
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          {filtersActive && (
            <button className="chip-clear" onClick={() => { setSearch(""); setAuthFilter("all"); }}>Clear</button>
          )}
        </div>

        <div className="table-card">
          {isError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <KeyRound className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Unable to load services</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>
                We hit an error fetching external services and secrets.
              </p>
            </div>
          ) : isLoading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk" style={{ width: 36, height: 36, borderRadius: 8, flex: "none" }} />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "32%" }} />
                    <span className="sk sk-line" style={{ width: "46%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999, margin: "0 24px" }} />
                  <span className="sk sk-line" style={{ width: 80 }} />
                  <span className="sk sk-line" style={{ width: 28 }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic"><KeyRound className="icon-lg" /></span>
              <h3 className="empty-title">{filtersActive ? "No services match" : "No services yet"}</h3>
              <p className="empty-desc">
                {filtersActive
                  ? "Try a different search term or auth type."
                  : "Connect a third-party service to manage its credentials and expose it to your workloads."}
              </p>
              <button className="btn btn-primary" onClick={filtersActive ? () => { setSearch(""); setAuthFilter("all"); } : () => navigate("/external-services/add")}>
                {filtersActive ? "Clear filters" : (<><Plus className="icon-sm" /> Add service</>)}
              </button>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="th-apps">Type</th>
                  <th>Auth</th>
                  <th className="th-context">Agent access</th>
                  <th className="th-signal">Created</th>
                  <th className="th-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} tabIndex={0} onClick={() => navigate(`/sdk/external-services/${s.id}`)}>
                    <td>
                      <div className="app-cell">
                        <span className="app-glyph tone-info"><KeyRound className="icon-sm" /></span>
                        <span className="ac-meta">
                          <span className="ac-name">{s.name}</span>
                          <span className="ac-uri" title={s.url}>{s.url}</span>
                        </span>
                      </div>
                    </td>
                    <td className="th-apps">
                      <span className="badge badge--muted"><span className="bdot" />{s.type || "API"}</span>
                    </td>
                    <td>
                      <span className={`badge ${AUTH_TONE[s.auth_type] ?? "badge--muted"}`}>
                        <span className="bdot" />
                        {AUTH_LABEL[s.auth_type] ?? s.auth_type}
                      </span>
                    </td>
                    <td className="col-context">
                      <span className={`badge ${s.agent_accessible ? "badge--success" : "badge--muted"}`}>
                        <span className="bdot" />
                        {s.agent_accessible ? "Enabled" : "Off"}
                      </span>
                    </td>
                    <td className="col-signal">
                      <span className="time-cell">{formatDate(s.created_at)}</span>
                    </td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="icon-btn" aria-label="Service actions">
                              <MoreHorizontal className="icon" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                            <DropdownMenuItem className="menu-item" onSelect={() => navigate(`/sdk/external-services/${s.id}`)}>
                              <span className="mi-ic"><Code2 className="icon-sm" /></span>
                              View SDK code
                            </DropdownMenuItem>
                            <div className="menu-sep" />
                            <DropdownMenuItem className="menu-item danger" onSelect={() => setDeleteTarget(s)}>
                              <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                              Delete service
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

        {!isLoading && !isError && rows.length > 0 && (
          <p className="workspace-foot">{rows.length} service{rows.length === 1 ? "" : "s"} connected.</p>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleteState.isLoading && setDeleteTarget(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Delete service?</DialogTitle>
            <DialogDescription className="dg-desc">
              This removes the service and its stored credentials. Workloads relying on it lose
              access immediately. This can't be undone.
            </DialogDescription>
            {deleteTarget && <div className="dg-target">{deleteTarget.url}</div>}
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} disabled={deleteState.isLoading}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void handleDelete()} disabled={deleteState.isLoading}>
                <Trash2 className="icon-sm" /> {deleteState.isLoading ? "Deleting…" : "Delete service"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ExternalServicesPage;
