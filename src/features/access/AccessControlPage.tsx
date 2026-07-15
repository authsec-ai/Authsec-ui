/**
 * AccessControlPage — workspace-level access management (AuthZ).
 *
 * Route-driven via `initialTab` (sidebar links point here):
 *   roles       — workspace / app-scoped AuthSec roles
 *   scopes      — cross-workspace scope catalog
 *   assignments — role bindings
 *
 * Rendered on the canonical console standard: <ConsolePage> shell +
 * <ConsoleFilterBar> + <TableCard>/<AdaptiveTable>. Detail drawers + dialogs
 * reuse the shared [data-cr] primitives. This file is the reference other
 * console pages are aligned to.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Building,
  KeyRound,
  Plus,
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
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

function KindChip({ appScoped }: { appScoped: boolean }) {
  return (
    <span className={`kind-chip ${appScoped ? "app" : "workspace"}`}>
      {appScoped ? <Server className="kc-ic" /> : <Building className="kc-ic" />}
      {appScoped ? "App-scoped" : "Workspace"}
    </span>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{label}</div>;
}

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

  const filters = useMemo(() => {
    const list = (roles ?? []) as AuthSecRole[];
    const app = list.filter((r) => formatRoleName(r.name, appMap).isAppScoped).length;
    return [
      { key: "all", label: "All", count: list.length },
      { key: "workspace", label: "Workspace", count: list.length - app },
      { key: "app", label: "App-scoped", count: app },
    ];
  }, [roles, appMap]);

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

  const columns = useMemo<AdaptiveColumn<AuthSecRole>[]>(
    () => [
      {
        id: "name",
        header: "Role",
        alwaysVisible: true,
        approxWidth: 320,
        cell: ({ row }) => {
          const fmt = formatRoleName(row.original.name, appMap);
          return (
            <EntityCell
              label={fmt.primary}
              detail={row.original.description}
              badge={fmt.badge ? <span className="role-tag generated">{fmt.badge}</span> : undefined}
            />
          );
        },
      },
      {
        id: "kind",
        header: "Kind",
        priority: 1,
        approxWidth: 160,
        cell: ({ row }) => <KindChip appScoped={formatRoleName(row.original.name, appMap).isAppScoped} />,
      },
      {
        id: "users",
        header: "Users",
        priority: 3,
        approxWidth: 90,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">{row.original.users_assigned ?? 0}</span>
        ),
      },
      {
        id: "perms",
        header: "Permissions",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">{row.original.permissions_count ?? 0}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <ConsoleRowActions
              items={[
                { label: "View details", icon: <KeyRound className="size-4" />, onSelect: () => setSelectedRole(row.original) },
                { label: "Assign users", icon: <UserPlus className="size-4" />, onSelect: () => onAssignUsers(row.original.id) },
                { label: "Delete role", icon: <Trash2 className="size-4" />, destructive: true, onSelect: () => setConfirmDelete(row.original) },
              ]}
            />
          </div>
        ),
      },
    ],
    [appMap, onAssignUsers],
  );

  return (
    <ConsolePage
      title="Roles"
      description="Workspace and application-scoped roles bundle permissions you can assign to operators and end users."
      actions={
        <Button onClick={() => setShowCreateDialog(true)} className="text-white">
          <Plus className="mr-1.5 size-3.5" /> Create role
        </Button>
      }
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search roles"
        filters={filters}
        activeFilter={kindFilter}
        onFilterChange={(v) => setKindFilter(v as "all" | "workspace" | "app")}
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <LoadingState label="Loading roles…" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Shield className="mx-auto mb-3 size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                {search || kindFilter !== "all" ? "No roles match" : "No roles yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {search || kindFilter !== "all"
                  ? "Try a different search term or filter."
                  : "Create your first role to start bundling permissions."}
              </p>
              {!search && kindFilter === "all" && (
                <div className="mt-4 flex justify-center">
                  <Button size="sm" onClick={() => setShowCreateDialog(true)} className="text-white">
                    <Plus className="mr-1.5 size-3.5" /> Create role
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="roles-inventory"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              onRowClick={(r) => setSelectedRole(r)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {/* Role detail drawer */}
      <Sheet open={!!selectedRole} onOpenChange={(o) => !o && setSelectedRole(null)}>
        <SheetContent side="right" hideClose data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
          <SheetTitle className="sr-only">
            {selectedFmt ? `${selectedFmt.displayName} — role details` : "Role details"}
          </SheetTitle>
          <SheetDescription className="sr-only">Inspect this role's scopes and bindings.</SheetDescription>
          {selectedRole && selectedFmt && (
            <div className="flex h-full flex-col" style={{ background: "var(--color-surface-raised)" }}>
              <div className="drawer-head">
                <div className="drawer-head-top">
                  <KindChip appScoped={selectedFmt.isAppScoped} />
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
                <Button className="text-white" style={{ flex: 1 }} onClick={() => onAssignUsers(selectedRole.id)}>
                  <UserPlus className="mr-1.5 size-3.5" /> Assign users
                </Button>
                <Button variant="outline" aria-label="Delete role" onClick={() => setConfirmDelete(selectedRole)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create role dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
            <DialogDescription>
              Name the role, then add permissions and assign users afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ac-role-name">Name</Label>
              <Input
                id="ac-role-name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. developer, read-only-ops"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-role-desc">Description</Label>
              <Textarea
                id="ac-role-desc"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Optional description for this role"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewRoleName("");
                  setNewRoleDesc("");
                }}
              >
                Cancel
              </Button>
              <Button className="text-white" onClick={handleCreate} disabled={addRoleState.isLoading || !newRoleName.trim()}>
                {addRoleState.isLoading ? "Creating…" : "Create role"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        role={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={(r) => handleDelete(r)}
      />
    </ConsolePage>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete role?</DialogTitle>
          <DialogDescription>
            This removes the role and its bindings. Active sessions relying on it lose access. This
            can't be undone.
          </DialogDescription>
        </DialogHeader>
        {role && (
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">{role.name}</div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={() => role && onConfirm(role)}>
            <Trash2 className="mr-1.5 size-3.5" /> Delete role
          </Button>
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

  const columns = useMemo<AdaptiveColumn<ScopeCatalogEntry>[]>(
    () => [
      {
        id: "scope",
        header: "Scope",
        alwaysVisible: true,
        approxWidth: 320,
        cell: ({ row }) => (
          <EntityCell label={<span className="font-mono">{row.original.scope_string}</span>} detail={row.original.display_name} />
        ),
      },
      {
        id: "application",
        header: "Application",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.application?.name ?? "—"}</span>,
      },
      {
        id: "risk",
        header: "Risk",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className={`badge ${riskClass(row.original.risk_level)}`}>
            <span className="bdot" />
            {cap(row.original.risk_level)}
          </span>
        ),
      },
      {
        id: "tools",
        header: "Tools",
        priority: 3,
        approxWidth: 90,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground tabular-nums">{row.original.tools_count ?? 0}</span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Scopes"
      description="The canonical OAuth scope vocabulary across this workspace's applications. Scopes become permissions once bound to a role."
    >
      <ConsoleFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search scopes" />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <LoadingState label="Loading scopes…" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <KeyRound className="mx-auto mb-3 size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{search ? "No scopes match" : "No scopes yet"}</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {search ? "Try a different search term." : "Scopes appear as you protect applications."}
              </p>
            </div>
          ) : (
            <AdaptiveTable
              tableId="scopes-inventory"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(s) => s.id}
              onRowClick={(s) => setSelected(s)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" hideClose data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
          <SheetTitle className="sr-only">
            {selected ? `${selected.display_name || selected.scope_string} — scope details` : "Scope details"}
          </SheetTitle>
          <SheetDescription className="sr-only">Inspect this scope's risk, roles, and bindings.</SheetDescription>
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
                  {selected.display_name && (
                    <div className="drawer-username" style={{ fontFamily: "var(--font-family-sans)" }}>{selected.display_name}</div>
                  )}
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
    </ConsolePage>
  );
}

// ─── Assignments tab ────────────────────────────────────────────────────────────
function AssignmentsTab({ onNewAssignment }: { onNewAssignment: () => void }) {
  const [search, setSearch] = useState("");
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const { data: bindings, isLoading } = useListBindingsQuery({ audience: "admin" });
  const { data: resourceServers } = useListResourceServersQuery();
  const appMap = useMemo(() => {
    const m = new Map<string, string>();
    (resourceServers ?? []).forEach((rs) => m.set(rs.id, rs.name));
    return m;
  }, [resourceServers]);
  const [deleteBinding, deleteState] = useDeleteBindingMutation();

  const rows = useMemo<RoleBinding[]>(() => {
    const list = bindings ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((b) =>
      [b.email, b.username, b.user_id, b.role_name, b.application?.name, b.source]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [bindings, search]);

  const confirmRevoke = useMemo(
    () => (bindings ?? []).find((r) => r.id === confirmRevokeId) ?? null,
    [bindings, confirmRevokeId],
  );

  const handleRevoke = useCallback(
    async (bindingId: string) => {
      const binding = (bindings ?? []).find((r) => r.id === bindingId);
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
    [deleteBinding, bindings],
  );

  const columns = useMemo<AdaptiveColumn<RoleBinding>[]>(
    () => [
      {
        id: "user",
        header: "User",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <span className="text-sm text-foreground">{row.original.email ?? row.original.username ?? row.original.user_id ?? "—"}</span>
        ),
      },
      {
        id: "role",
        header: "Role",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => {
          const fmt = formatRoleName(row.original.role_name, appMap);
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">{fmt.primary}</span>
              {fmt.badge && <span className="role-tag generated">{fmt.badge}</span>}
            </span>
          );
        },
      },
      {
        id: "application",
        header: "Application",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) =>
          row.original.application?.name ? (
            <span className="text-xs text-muted-foreground">{row.original.application.name}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Workspace-wide</span>
          ),
      },
      {
        id: "source",
        header: "Source",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.source ?? "—"}</span>,
      },
      {
        id: "expires",
        header: "Expires",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.expires_at ? formatDate(row.original.expires_at) : "Never"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 90,
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            className="text-(--color-danger-text)"
            onClick={() => setConfirmRevokeId(row.original.id)}
          >
            Revoke
          </Button>
        ),
      },
    ],
    [appMap],
  );

  return (
    <ConsolePage
      title="Assignments"
      description="Role bindings grant a user a role — workspace-wide or scoped to a single application."
      actions={
        <Button onClick={onNewAssignment} className="text-white">
          <Plus className="mr-1.5 size-3.5" /> New assignment
        </Button>
      }
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search users, roles, applications, or sources"
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <LoadingState label="Loading assignments…" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <KeyRound className="mx-auto mb-3 size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{search ? "No assignments match" : "No assignments yet"}</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {search ? "Try a different search term." : "Assign a role to a user to grant access."}
              </p>
              {!search && (
                <div className="mt-4 flex justify-center">
                  <Button size="sm" onClick={onNewAssignment} className="text-white">
                    <Plus className="mr-1.5 size-3.5" /> New assignment
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="assignments-inventory"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(b) => b.id}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <Dialog open={!!confirmRevokeId} onOpenChange={(o) => !o && setConfirmRevokeId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke role assignment?</DialogTitle>
          <DialogDescription>
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
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setConfirmRevokeId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteState.isLoading}
              onClick={() => confirmRevokeId && handleRevoke(confirmRevokeId)}
            >
              {deleteState.isLoading ? "Revoking…" : "Revoke"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConsolePage>
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
      <ConsolePage title="Access control">
        <p className="text-sm text-muted-foreground">
          No workspace selected. Switch to a workspace to manage access control.
        </p>
      </ConsolePage>
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
