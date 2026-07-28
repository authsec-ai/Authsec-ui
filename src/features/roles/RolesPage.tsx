import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Scan,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { useListApplicationRolesQuery, useDeleteApplicationRoleMutation, type ApplicationRole } from "@/app/api/accessApi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApplicationRoleWizard } from "./components/ApplicationRoleWizard";
import { ApplicationRoleDrawer } from "./components/ApplicationRoleDrawer";

type Risk = "low" | "medium" | "high" | "critical";
const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function roleRisk(role: ApplicationRole): Risk {
  let max: Risk = "low";
  for (const s of role.scopes ?? []) {
    const r = (s.risk_level as Risk) ?? "low";
    if (RISK_ORDER[r] > RISK_ORDER[max]) max = r;
  }
  return max;
}

const SOURCE_OPTS = [
  { v: "all", label: "All" },
  { v: "manual", label: "Manual" },
  { v: "generated", label: "Generated" },
];
const DEFAULT_OPTS = [
  { v: "all", label: "All" },
  { v: "default", label: "Default" },
  { v: "non", label: "Non-default" },
];

export function RolesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [defaultFilter, setDefaultFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [drawerRole, setDrawerRole] = useState<ApplicationRole | null>(null);

  const { data, isLoading, refetch } = useListApplicationRolesQuery({
    q: query.trim() || undefined,
    source: sourceFilter === "all" ? undefined : sourceFilter,
    default: defaultFilter === "all" ? undefined : defaultFilter === "default",
  });
  const [deleteRole] = useDeleteApplicationRoleMutation();

  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);
  const total = roles.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = roles.slice((safePage - 1) * pageSize, safePage * pageSize);
  const filtersActive = query.trim() !== "" || sourceFilter !== "all" || defaultFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setSourceFilter("all");
    setDefaultFilter("all");
    setPage(1);
  };

  const isProtected = (r: ApplicationRole) => r.is_default || r.source === "generated";

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Roles</h1>
            <p className="sh-desc">
              Bundle scopes into named roles you can assign. Application roles grant an app's scopes
              to its end users.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Plus className="icon-sm" /> Create role
          </button>
        </div>

        <div className="roles-toolbar">
          <div className={`search${query ? " has-value" : ""}`}>
            <span className="search-ic">
              <Search className="icon" />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search roles, applications, or scopes"
              aria-label="Search roles"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setQuery("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="filterset">
            <span className="filterset-label">Source</span>
            <div className="segmented">
              {SOURCE_OPTS.map((o) => (
                <button
                  key={o.v}
                  data-on={sourceFilter === o.v}
                  onClick={() => {
                    setSourceFilter(o.v);
                    setPage(1);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filterset">
            <span className="filterset-label">Default</span>
            <div className="segmented">
              {DEFAULT_OPTS.map((o) => (
                <button
                  key={o.v}
                  data-on={defaultFilter === o.v}
                  onClick={() => {
                    setDefaultFilter(o.v);
                    setPage(1);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {filtersActive && (
            <button className="chip-clear" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>

        <div className="table-card">
          {isLoading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "30%" }} />
                    <span className="sk sk-line" style={{ width: "46%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 160 }} />
                  <span className="sk sk-line" style={{ width: 80, margin: "0 24px" }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 28 }} />
                </div>
              ))}
            </div>
          ) : total === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <Shield className="icon-lg" />
              </span>
              <h3 className="empty-title">{filtersActive ? "No roles match your filters" : "No roles yet"}</h3>
              <p className="empty-desc">
                {filtersActive
                  ? "Try a different search term or reset the source and default filters."
                  : "Create a role to bundle an application's scopes, then assign it to end users."}
              </p>
              <button className="btn btn-primary" onClick={filtersActive ? clearFilters : () => setWizardOpen(true)}>
                {filtersActive ? "Clear filters" : (
                  <>
                    <Plus className="icon-sm" /> Create role
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="th-context">Context</th>
                    <th>Scopes</th>
                    <th>Risk</th>
                    <th className="num th-rusers">Users</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((role) => {
                    const risk = roleRisk(role);
                    return (
                      <tr
                        key={role.id}
                        tabIndex={0}
                        onClick={() => setDrawerRole(role)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setDrawerRole(role);
                        }}
                      >
                        <td>
                          <div className="role-cell">
                            <div className="role-name-row">
                              <span className="role-name">{role.label}</span>
                              {role.is_default && (
                                <span className="role-tag default">
                                  <Star className="rt-ic" /> Default
                                </span>
                              )}
                              {role.source === "generated" && (
                                <span className="role-tag generated">
                                  <Sparkles className="rt-ic" /> Generated
                                </span>
                              )}
                            </div>
                            <span className="role-detail">
                              {role.is_default ? "Default access package" : role.description || "Custom access package"}
                            </span>
                          </div>
                        </td>
                        <td className="col-context">
                          <div className="ctx-cell">
                            <span className="ctx-app">{role.application.name}</span>
                            <span className="ctx-uri" title={role.application.resource_uri}>
                              {role.application.resource_uri}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="scopes-cell">
                            {role.scopes_count}{" "}
                            <span className="sc-sub">access label{role.scopes_count === 1 ? "" : "s"}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge--risk-${risk}`}>
                            <span className="bdot" />
                            {cap(risk)}
                          </span>
                        </td>
                        <td className={`num-cell col-rusers${role.users_count === 0 ? " zero" : ""}`}>
                          {role.users_count}
                        </td>
                        <td>
                          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="icon-btn" aria-label="Role actions">
                                  <MoreHorizontal className="icon" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                                <DropdownMenuItem
                                  className="menu-item"
                                  onSelect={() => navigate(`/applications/${role.application.id}/access`)}
                                >
                                  <span className="mi-ic">
                                    <Scan className="icon-sm" />
                                  </span>
                                  Open access
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="menu-item"
                                  onSelect={() => navigate(`/applications/${role.application.id}/scopes`)}
                                >
                                  <span className="mi-ic">
                                    <KeyRound className="icon-sm" />
                                  </span>
                                  Review scopes
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="menu-item"
                                  onSelect={() => navigate(`/applications/${role.application.id}/role-bindings`)}
                                >
                                  <span className="mi-ic">
                                    <Link2 className="icon-sm" />
                                  </span>
                                  View assignments
                                </DropdownMenuItem>
                                <div className="menu-sep" />
                                <DropdownMenuItem
                                  className="menu-item"
                                  disabled={role.source === "generated"}
                                  onSelect={() => navigate(`/applications/${role.application.id}/access`)}
                                >
                                  <span className="mi-ic">
                                    <Pencil className="icon-sm" />
                                  </span>
                                  Edit details
                                  {role.source === "generated" && (
                                    <span className="mi-lock">
                                      <Lock className="icon-sm" />
                                    </span>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="menu-item danger"
                                  disabled={isProtected(role)}
                                  onSelect={async () => {
                                    if (isProtected(role)) return;
                                    try {
                                      await deleteRole({
                                        applicationId: role.application.id,
                                        roleId: role.id,
                                      }).unwrap();
                                      toast.success(`Role "${role.label}" deleted.`);
                                    } catch (err) {
                                      const apiErr = err as { data?: { error?: string } };
                                      toast.error(apiErr?.data?.error ?? "Couldn't delete role.");
                                    }
                                  }}
                                >
                                  <span className="mi-ic">
                                    {isProtected(role) ? <Lock className="icon-sm" /> : <Trash2 className="icon-sm" />}
                                  </span>
                                  {isProtected(role) ? "Protected" : "Delete role"}
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
              <div className="table-foot">
                <span className="foot-count">
                  Showing <b>{(safePage - 1) * pageSize + 1}</b>–<b>{(safePage - 1) * pageSize + pageRows.length}</b> of{" "}
                  <b>{total}</b> roles
                </span>
                <div className="pager">
                  <div className="select" style={{ marginRight: 12 }}>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      aria-label="Rows per page"
                      style={{ height: 32, minWidth: 96, fontSize: 13 }}
                    >
                      {[5, 10, 25, 50].map((n) => (
                        <option key={n} value={n}>
                          {n} / page
                        </option>
                      ))}
                    </select>
                    <span className="chev">
                      <ChevronDown className="icon-sm" />
                    </span>
                  </div>
                  <span className="pager-label">Page</span>
                  <div className="pager-btns">
                    <button
                      className="pager-btn"
                      aria-label="Previous page"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="icon-sm" />
                    </button>
                    <span className="pager-label mono">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      className="pager-btn"
                      aria-label="Next page"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="icon-sm" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ApplicationRoleDrawer role={drawerRole} onClose={() => setDrawerRole(null)} />
      <ApplicationRoleWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={() => refetch()} />
    </div>
  );
}
