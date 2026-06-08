/**
 * AccessControlPage — workspace-level access management (AuthZ).
 *
 * Route-driven via `initialTab` (sidebar links point here):
 *   roles       — workspace / app-scoped AuthSec roles
 *   scopes      — cross-workspace scope catalog
 *   assignments — role bindings
 *
 * Rebuilt to match the Console Refresh prototype (bespoke `[data-cr]` markup:
 * section-header, filter toolbar, prototype table, status/risk badges, Sheet
 * detail drawers, dialogs), wired to the real RTK Query data + mutations.
 */

import { useState, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  Building,
  Check,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  Server,
  Shield,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { resolveWorkspaceId } from "@/utils/workspace";
import { formatRoleName } from "@/utils/roleName";
import { toast } from "@/lib/toast";

import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import {
  useGetAuthSecRolesQuery,
  useAddUserDefinedRolesMutation,
  useDeleteUserDefinedRolesMutation,
} from "@/app/api/rolesApi";
import {
  useListBindingsQuery,
  useDeleteBindingMutation,
  type RoleBinding,
} from "@/app/api/bindingsApi";
import {
  useListScopeCatalogQuery,
  type ScopeCatalogEntry,
} from "@/app/api/accessApi";

import AssignRoleWizard from "./AssignRoleWizard";

// ─── Types ──────────────────────────────────────────────────────────────────
interface AuthSecRole {
  id: string;
  name: string;
  description?: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
  permissions_count?: number;
  users_assigned?: number;
}

export interface AccessControlPageProps {
  initialTab?: "roles" | "scopes" | "assignments";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function riskClass(risk?: string): string {
  switch (risk?.toLowerCase()) {
    case "critical":
      return "badge--risk-critical";
    case "high":
      return "badge--risk-high";
    case "medium":
      return "badge--risk-medium";
    default:
      return "badge--risk-low";
  }
}

const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

// ─── Roles tab ────────────────────────────────────────────────────────────────
function RolesTab({
  workspaceId,
  onAssignUsers,
}: {
  workspaceId: string;
  onAssignUsers: (roleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "workspace" | "app">("all");
  const [selectedRole, setSelectedRole] = useState<AuthSecRole | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AuthSecRole | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  const { data: roles, isLoading } = useGetAuthSecRolesQuery({ workspace_id: workspaceId });
  const { data: resourceServers } = useListResourceServersQuery();
  const appMap = useMemo(() => {
    const m = new Map<string, string>();
    (resourceServers ?? []).forEach((rs) => m.set(rs.id, rs.name));
    return m;
  }, [resourceServers]);

  const [addRole, addRoleState] = useAddUserDefinedRolesMutation();
  const [deleteRoles] = useDeleteUserDefinedRolesMutation();

  const rows = useMemo<AuthSecRole[]>(() => {
    const list = (roles ?? []) as AuthSecRole[];
    return list.filter((r) => {
      const fmt = formatRoleName(r.name, appMap);
      const matchSearch =
        !search ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.description?.toLowerCase().includes(search.toLowerCase());
      const matchKind =
        kindFilter === "all" ||
        (kindFilter === "app" ? fmt.isAppScoped : !fmt.isAppScoped);
      return matchSearch && matchKind;
    });
  }, [roles, search, kindFilter, appMap]);

  const handleDelete = useCallback(
    async (role: AuthSecRole) => {
      try {
        await deleteRoles({ workspace_id: workspaceId, role_ids: [role.id] }).unwrap();
        toast.success("Role deleted");
        if (selectedRole?.id === role.id) setSelectedRole(null);
        setConfirmDelete(null);
      } catch (e: unknown) {
        toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to delete role");
      }
    },
    [deleteRoles, workspaceId, selectedRole],
  );

  const handleCreate = useCallback(async () => {
    if (!newRoleName.trim()) return toast.error("Role name is required");
    try {
      await addRole({
        workspace_id: workspaceId,
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || undefined,
      }).unwrap();
      toast.success("Role created");
      setShowCreateDialog(false);
      setNewRoleName("");
      setNewRoleDesc("");
    } catch (e: unknown) {
      toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to create role");
    }
  }, [addRole, workspaceId, newRoleName, newRoleDesc]);

  const selectedFmt = selectedRole ? formatRoleName(selectedRole.name, appMap) : null;

  return (
    <div data-cr>
      <div className="content-inner">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Roles</h1>
            <p className="sh-desc">
              Workspace and application-scoped roles bundle permissions you can assign to operators
              and end users.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
            <Plus className="icon-sm" /> Create role
          </button>
        </div>

        <div className="roles-toolbar">
          <div className={`search${search ? " has-value" : ""}`}>
            <span className="search-ic">
              <Search className="icon" />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roles"
              aria-label="Search roles"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="filterset">
            <span className="filterset-label">Kind</span>
            <div className="segmented">
              {(["all", "workspace", "app"] as const).map((k) => (
                <button key={k} data-on={kindFilter === k} onClick={() => setKindFilter(k)}>
                  {k === "all" ? "All" : k === "workspace" ? "Workspace" : "App-scoped"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-card">
          {isLoading ? (
            <SkeletonRows cols={4} />
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <Shield className="icon-lg" />
              </span>
              <h3 className="empty-title">{search || kindFilter !== "all" ? "No roles match" : "No roles yet"}</h3>
              <p className="empty-desc">
                {search || kindFilter !== "all"
                  ? "Try a different search term or filter."
                  : "Create your first role to start bundling permissions."}
              </p>
              <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
                <Plus className="icon-sm" /> Create role
              </button>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="th-context">Kind</th>
                    <th className="num">Users</th>
                    <th className="num th-apps">Permissions</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((role) => {
                    const fmt = formatRoleName(role.name, appMap);
                    return (
                      <tr key={role.id} tabIndex={0} data-selected={selectedRole?.id === role.id} onClick={() => setSelectedRole(role)}>
                        <td>
                          <div className="role-cell">
                            <div className="role-name-row">
                              <span className="role-name">{fmt.primary}</span>
                              {fmt.badge && (
                                <span className="role-tag generated">{fmt.badge}</span>
                              )}
                            </div>
                            {role.description && <span className="role-detail">{role.description}</span>}
                          </div>
                        </td>
                        <td className="col-context">
                          <span className={`kind-chip ${fmt.isAppScoped ? "app" : "workspace"}`}>
                            {fmt.isAppScoped ? <Server className="kc-ic" /> : <Building className="kc-ic" />}
                            {fmt.isAppScoped ? "App-scoped" : "Workspace"}
                          </span>
                        </td>
                        <td className={`num-cell${!role.users_assigned ? " zero" : ""}`}>
                          {role.users_assigned ?? 0}
                        </td>
                        <td className={`num-cell col-apps${!role.permissions_count ? " zero" : ""}`}>
                          {role.permissions_count ?? 0}
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
                                <DropdownMenuItem className="menu-item" onSelect={() => setSelectedRole(role)}>
                                  <span className="mi-ic"><KeyRound className="icon-sm" /></span>
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuItem className="menu-item" onSelect={() => onAssignUsers(role.id)}>
                                  <span className="mi-ic"><UserPlus className="icon-sm" /></span>
                                  Assign users
                                </DropdownMenuItem>
                                <div className="menu-sep" />
                                <DropdownMenuItem className="menu-item danger" onSelect={() => setConfirmDelete(role)}>
                                  <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                                  Delete role
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
              <p className="workspace-foot" style={{ margin: 0, padding: "var(--space-3) var(--space-5)", borderTop: "1px solid var(--color-border-subtle)", background: "var(--color-surface-subtle)" }}>
                {rows.length} role{rows.length === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Role detail drawer */}
      <Sheet open={!!selectedRole} onOpenChange={(o) => !o && setSelectedRole(null)}>
        <SheetContent side="right" data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
          <SheetTitle className="sr-only">
            {selectedFmt ? `${selectedFmt.displayName} — role details` : "Role details"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Inspect this role's scopes and bindings.
          </SheetDescription>
          {selectedRole && selectedFmt && (
            <div className="flex h-full flex-col" style={{ background: "var(--color-surface-raised)" }}>
              <div className="drawer-head">
                <div className="drawer-head-top">
                  <span className={`kind-chip ${selectedFmt.isAppScoped ? "app" : "workspace"}`}>
                    {selectedFmt.isAppScoped ? <Server className="kc-ic" /> : <Building className="kc-ic" />}
                    {selectedFmt.isAppScoped ? "App-scoped role" : "Workspace role"}
                  </span>
                  <button className="icon-btn" aria-label="Close" onClick={() => setSelectedRole(null)}>
                    <X className="icon" />
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="drawer-email" style={{ fontSize: 18 }}>{selectedFmt.primary}</div>
                  <div className="drawer-username" style={{ fontFamily: "var(--font-family-sans)" }}>
                    {selectedFmt.isAppScoped ? "Application role" : "Workspace-wide · operator permissions"}
                  </div>
                </div>
              </div>
              <div className="drawer-body">
                <div className="role-summary">
                  <div className="summary-stat-grid">
                    <div className="stat-card">
                      <div className="sc-k">Assigned users</div>
                      <div className="sc-v">{selectedRole.users_assigned ?? 0}</div>
                    </div>
                    <div className="stat-card">
                      <div className="sc-k">Permissions</div>
                      <div className="sc-v">{selectedRole.permissions_count ?? 0}</div>
                    </div>
                  </div>
                  <div className="drawer-section">
                    <p className="drawer-section-label">Details</p>
                    <div className="detail-grid">
                      {selectedRole.description && (
                        <div className="detail full">
                          <span className="detail-k">Description</span>
                          <span className="detail-v" style={{ fontWeight: 400 }}>{selectedRole.description}</span>
                        </div>
                      )}
                      <div className="detail">
                        <span className="detail-k">Kind</span>
                        <span className="detail-v">{selectedFmt.isAppScoped ? "App-scoped" : "Workspace"}</span>
                      </div>
                      <div className="detail">
                        <span className="detail-k">Created</span>
                        <span className="detail-v">{formatDate(selectedRole.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="drawer-foot">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onAssignUsers(selectedRole.id)}>
                  <UserPlus className="icon-sm" /> Assign users
                </button>
                <button className="btn btn-secondary" aria-label="Delete role" onClick={() => setConfirmDelete(selectedRole)}>
                  <Trash2 className="icon-sm" />
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create role dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <DialogTitle className="dg-title">Create role</DialogTitle>
            <DialogDescription className="dg-desc">
              Name the role, then add permissions and assign users afterwards.
            </DialogDescription>
            <div className="wiz-field">
              <label className="wiz-label" htmlFor="ac-role-name">
                Name <span className="req">*</span>
              </label>
              <input
                id="ac-role-name"
                className="input"
                style={{ width: "100%" }}
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. developer, read-only-ops"
              />
            </div>
            <div className="wiz-field">
              <label className="wiz-label" htmlFor="ac-role-desc">Description</label>
              <textarea
                id="ac-role-desc"
                className="textarea"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Optional description for this role"
              />
            </div>
            <div className="dg-actions" style={{ marginTop: "var(--space-5)" }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewRoleName("");
                  setNewRoleDesc("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={addRoleState.isLoading || !newRoleName.trim()}>
                <Check className="icon-sm" /> {addRoleState.isLoading ? "Creating…" : "Create role"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        role={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={(r) => handleDelete(r)}
      />
    </div>
  );
}

function ConfirmDeleteDialog({
  role,
  onCancel,
  onConfirm,
}: {
  role: AuthSecRole | null;
  onCancel: () => void;
  onConfirm: (role: AuthSecRole) => void;
}) {
  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
        <div className="dialog" style={{ width: "100%" }}>
          <span className="dg-icon">
            <Trash2 className="icon" />
          </span>
          <DialogTitle className="dg-title">Delete role?</DialogTitle>
          <DialogDescription className="dg-desc">
            This removes the role and its bindings. Active sessions relying on it lose access. This
            can't be undone.
          </DialogDescription>
          {role && <div className="dg-target" style={{ fontFamily: "var(--font-family-sans)" }}>{role.name}</div>}
          <div className="dg-actions">
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-danger" onClick={() => role && onConfirm(role)}>
              <Trash2 className="icon-sm" /> Delete role
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Scopes tab ───────────────────────────────────────────────────────────────
function ScopesTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ScopeCatalogEntry | null>(null);
  const { data: scopeData, isLoading } = useListScopeCatalogQuery({ kind: "all" });

  const rows = useMemo<ScopeCatalogEntry[]>(() => {
    const list = scopeData?.items ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (sc) =>
        sc.scope_string.toLowerCase().includes(s) ||
        sc.display_name?.toLowerCase().includes(s) ||
        sc.description?.toLowerCase().includes(s),
    );
  }, [scopeData, search]);

  return (
    <div data-cr>
      <div className="content-inner">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Scopes</h1>
            <p className="sh-desc">
              The canonical OAuth scope vocabulary across this workspace's applications. Scopes
              become permissions once bound to a role.
            </p>
          </div>
        </div>

        <div className="filter-bar">
          <div className={`search${search ? " has-value" : ""}`}>
            <span className="search-ic">
              <Search className="icon" />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scopes"
              aria-label="Search scopes"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="icon-sm" />
            </button>
          </div>
        </div>

        <div className="table-card">
          {isLoading ? (
            <SkeletonRows cols={4} />
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <KeyRound className="icon-lg" />
              </span>
              <h3 className="empty-title">{search ? "No scopes match" : "No scopes yet"}</h3>
              <p className="empty-desc">
                {search ? "Try a different search term." : "Scopes appear as you protect applications."}
              </p>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Scope</th>
                    <th className="th-context">Application</th>
                    <th>Risk</th>
                    <th className="num th-apps">Tools</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((scope) => (
                    <tr key={scope.id} tabIndex={0} data-selected={selected?.id === scope.id} onClick={() => setSelected(scope)}>
                      <td>
                        <div className="role-cell">
                          <div className="role-name-row">
                            <span className="role-name mono">{scope.scope_string}</span>
                          </div>
                          {scope.display_name && <span className="role-detail">{scope.display_name}</span>}
                        </div>
                      </td>
                      <td className="col-context">
                        <span className="ctx-app">{scope.application?.name ?? "—"}</span>
                      </td>
                      <td>
                        <span className={`badge ${riskClass(scope.risk_level)}`}>
                          <span className="bdot" />
                          {cap(scope.risk_level)}
                        </span>
                      </td>
                      <td className={`num-cell col-apps${!scope.tools_count ? " zero" : ""}`}>
                        {scope.tools_count ?? 0}
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" aria-label="View scope" onClick={() => setSelected(scope)}>
                            <MoreHorizontal className="icon" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="workspace-foot" style={{ margin: 0, padding: "var(--space-3) var(--space-5)", borderTop: "1px solid var(--color-border-subtle)", background: "var(--color-surface-subtle)" }}>
                {rows.length} scope{rows.length === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
          <SheetTitle className="sr-only">
            {selected ? `${selected.display_name || selected.scope_string} — scope details` : "Scope details"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Inspect this scope's risk, roles, and bindings.
          </SheetDescription>
          {selected && (
            <div className="flex h-full flex-col" style={{ background: "var(--color-surface-raised)" }}>
              <div className="drawer-head">
                <div className="drawer-head-top">
                  <span className={`badge ${riskClass(selected.risk_level)}`}>
                    <span className="bdot" />
                    {cap(selected.risk_level)} risk
                  </span>
                  <button className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}>
                    <X className="icon" />
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div className="drawer-email mono" style={{ fontSize: 16 }}>{selected.scope_string}</div>
                  {selected.display_name && <div className="drawer-username" style={{ fontFamily: "var(--font-family-sans)" }}>{selected.display_name}</div>}
                </div>
              </div>
              <div className="drawer-body">
                <div className="drawer-section">
                  <p className="drawer-section-label">Overview</p>
                  <div className="detail-grid">
                    <div className="detail full">
                      <span className="detail-k">Scope string</span>
                      <span className="detail-v mono">{selected.scope_string}</span>
                    </div>
                    {selected.description && (
                      <div className="detail full">
                        <span className="detail-k">Description</span>
                        <span className="detail-v" style={{ fontWeight: 400 }}>{selected.description}</span>
                      </div>
                    )}
                    <div className="detail">
                      <span className="detail-k">Application</span>
                      <span className="detail-v">{selected.application?.name ?? "—"}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-k">Kind</span>
                      <span className="detail-v">{cap(selected.kind)}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-k">Tools</span>
                      <span className="detail-v">{selected.tools_count ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Assignments tab ────────────────────────────────────────────────────────────
function AssignmentsTab({ onNewAssignment }: { onNewAssignment: () => void }) {
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const { data: bindings, isLoading } = useListBindingsQuery({ audience: "admin" });
  const { data: resourceServers } = useListResourceServersQuery();
  const appMap = useMemo(() => {
    const m = new Map<string, string>();
    (resourceServers ?? []).forEach((rs) => m.set(rs.id, rs.name));
    return m;
  }, [resourceServers]);
  const [deleteBinding, deleteState] = useDeleteBindingMutation();
  const rows = useMemo<RoleBinding[]>(() => bindings ?? [], [bindings]);
  const confirmRevoke = useMemo(() => rows.find((r) => r.id === confirmRevokeId) ?? null, [rows, confirmRevokeId]);

  const handleRevoke = useCallback(
    async (bindingId: string) => {
      const binding = rows.find((r) => r.id === bindingId);
      const subject = binding?.email ?? binding?.username ?? binding?.user_id ?? "the user";
      const roleLabel = binding?.role_name ?? "role";
      try {
        await deleteBinding(bindingId).unwrap();
        toast.success(`Revoked ${roleLabel} from ${subject}. Active sessions were terminated.`);
        setConfirmRevokeId(null);
      } catch (e: unknown) {
        toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to revoke binding");
      }
    },
    [deleteBinding, rows],
  );

  return (
    <div data-cr>
      <div className="content-inner">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Assignments</h1>
            <p className="sh-desc">
              Role bindings grant a user a role — workspace-wide or scoped to a single application.
            </p>
          </div>
          <button className="btn btn-primary" onClick={onNewAssignment}>
            <Plus className="icon-sm" /> New assignment
          </button>
        </div>

        <div className="table-card">
          {isLoading ? (
            <SkeletonRows cols={5} />
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <Link2Icon />
              </span>
              <h3 className="empty-title">No assignments yet</h3>
              <p className="empty-desc">Assign a role to a user to grant access.</p>
              <button className="btn btn-primary" onClick={onNewAssignment}>
                <Plus className="icon-sm" /> New assignment
              </button>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th className="th-context">Application</th>
                    <th className="th-apps">Source</th>
                    <th className="th-signal">Expires</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((binding) => {
                    const fmt = formatRoleName(binding.role_name, appMap);
                    return (
                      <tr key={binding.id} style={{ cursor: "default" }}>
                        <td>
                          <span className="user-email">{binding.email ?? binding.username ?? binding.user_id ?? "—"}</span>
                        </td>
                        <td>
                          <span className="role-name-row">
                            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text)" }}>{fmt.primary}</span>
                            {fmt.badge && <span className="role-tag generated">{fmt.badge}</span>}
                          </span>
                        </td>
                        <td className="col-context">
                          <span className="ctx-app">
                            {binding.application?.name ?? <span style={{ color: "var(--color-text-subtle)" }}>Workspace-wide</span>}
                          </span>
                        </td>
                        <td className="col-apps">
                          <span className="time-cell">{binding.source ?? "—"}</span>
                        </td>
                        <td className="col-signal">
                          <span className="time-cell">
                            {binding.expires_at ? formatDate(binding.expires_at) : "Never"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-secondary"
                              style={{ height: 30, padding: "0 12px", fontSize: 12.5, color: "var(--color-danger-text)" }}
                              onClick={() => setConfirmRevokeId(binding.id)}
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="workspace-foot" style={{ margin: 0, padding: "var(--space-3) var(--space-5)", borderTop: "1px solid var(--color-border-subtle)", background: "var(--color-surface-subtle)" }}>
                {rows.length} assignment{rows.length === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
      </div>

      <Dialog open={!!confirmRevokeId} onOpenChange={(o) => !o && setConfirmRevokeId(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon" style={{ background: "var(--color-warning-soft)", color: "var(--color-warning-text)" }}>
              <AlertTriangle className="icon" />
            </span>
            <DialogTitle className="dg-title">Revoke role assignment?</DialogTitle>
            <DialogDescription className="dg-desc">
              {confirmRevoke ? (
                <>
                  Revoke <b>{confirmRevoke.role_name}</b> from{" "}
                  <b>{confirmRevoke.email ?? confirmRevoke.username ?? confirmRevoke.user_id}</b>
                  {confirmRevoke.application?.name ? <> on <b>{confirmRevoke.application.name}</b></> : ""}. Active
                  sessions are terminated immediately.
                </>
              ) : (
                "Active sessions are terminated immediately."
              )}
            </DialogDescription>
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmRevokeId(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={deleteState.isLoading}
                onClick={() => confirmRevokeId && handleRevoke(confirmRevokeId)}
              >
                {deleteState.isLoading ? "Revoking…" : "Revoke"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Link2Icon() {
  return <KeyRound className="icon-lg" />;
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="sk sk-line" style={{ width: "32%" }} />
            <span className="sk sk-line" style={{ width: "48%", height: 9 }} />
          </span>
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <span className="sk sk-line" key={j} style={{ width: 80, margin: "0 20px" }} />
          ))}
          <span className="sk sk-line" style={{ width: 28 }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccessControlPage({ initialTab = "roles" }: AccessControlPageProps) {
  const workspaceId = resolveWorkspaceId();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [preselectedRoleId, setPreselectedRoleId] = useState<string | undefined>(undefined);

  const handleAssignUsers = useCallback((roleId: string) => {
    setPreselectedRoleId(roleId);
    setWizardOpen(true);
  }, []);

  if (!workspaceId) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">No tenant selected. Switch to a tenant to manage access control.</p>
      </div>
    );
  }

  return (
    <>
      {initialTab === "roles" && <RolesTab workspaceId={workspaceId} onAssignUsers={handleAssignUsers} />}
      {initialTab === "scopes" && <ScopesTab />}
      {initialTab === "assignments" && <AssignmentsTab onNewAssignment={() => setWizardOpen(true)} />}

      <AssignRoleWizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setPreselectedRoleId(undefined);
        }}
        preselectedRoleId={preselectedRoleId}
      />
    </>
  );
}
