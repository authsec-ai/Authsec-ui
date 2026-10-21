/**
 * AccessControlPage — workspace-level access management (AuthZ).
 *
 * Route-driven via `initialTab` (each is a tab of the Policies page):
 *   roles       — Roles: workspace / MCP-server roles
 *   scopes      — Scopes: the OAuth scope catalog ("Scope" at the token layer,
 *                 per the AGENTS.md term map; "Permission" stays for RBAC)
 *   assignments — Who has what: role bindings
 *
 * Roles' main button is "Add role"; Scopes and Who has what open the
 * assign-role wizard ("Give access"). Rows carry no overflow menu: a row opens
 * its drawer, where giving and deleting live. Key column headers carry a
 * dotted underline that explains the word on hover.
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
  useGetAuthSecRoleDetailQuery,
  useAddUserDefinedRolesMutation,
  useDeleteUserDefinedRolesMutation,
  roleDeleteErrorMessage,
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
import { ACCESS_TERMS, Term } from "./Term";

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

/** The built-in roles carry operator access; the backend refuses to delete
 *  them (409), so the console does not offer it. */
const isBuiltInRole = (r: Pick<AuthSecRole, "name">) => ["owner", "admin"].includes(r.name.toLowerCase());

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

/**
 * A role's own name and the MCP server it applies on. Auto-generated MCP
 * server roles are named `rs-{uuid}:{type}`; the type is the role and the
 * uuid the server. Every other role applies on the whole workspace.
 */
function roleParts(name: string, appMap: Map<string, string>): { role: string; server: string | null } {
  const fmt = formatRoleName(name, appMap);
  if (!fmt.isAppScoped) return { role: name, server: "All MCPs" };
  // Server resolved: primary is its name, badge the role type.
  if (fmt.badge && fmt.badge !== "App-scoped") return { role: fmt.badge, server: fmt.primary };
  // Server not found among this workspace's MCP servers.
  return { role: fmt.primary, server: null };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function GiveAccessButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} className="text-white">
      <Plus className="mr-1.5 size-3.5" /> Give access
    </Button>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{label}</div>;
}

/** A role's permissions, mono and joined with " · " (from the role's detail). */
function RolePermissionsCell({ role }: { role: AuthSecRole }) {
  const { data, isLoading, isError } = useGetAuthSecRoleDetailQuery(role.id);
  if (isLoading) return <span className="text-[13px] text-muted-foreground">…</span>;
  const perms = data?.permissions ?? [];
  if (isError || (!data && (role.permissions_count ?? 0) > 0)) {
    return (
      <span className="text-[13px] text-muted-foreground">
        {plural(role.permissions_count ?? 0, "permission", "permissions")}
      </span>
    );
  }
  if (perms.length === 0) return <span className="text-[13px] text-muted-foreground">None yet</span>;
  const text = perms.join(" · ");
  return (
    <span className="block truncate font-mono text-[13px] text-foreground" title={text}>
      {text}
    </span>
  );
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

  // Service accounts holding each role. The role list counts only people
  // (`users_assigned`); service-account bindings come from the bindings list.
  const { data: bindings } = useListBindingsQuery({ audience: "admin" });
  const serviceAccountsByRole = useMemo(() => {
    const m = new Map<string, Set<string>>();
    (bindings ?? []).forEach((b) => {
      if (!b.service_account_id) return;
      const set = m.get(b.role_id) ?? new Set<string>();
      set.add(b.service_account_id);
      m.set(b.role_id, set);
    });
    return m;
  }, [bindings]);
  const givenToLabel = useCallback(
    (r: AuthSecRole) => {
      const people = r.users_assigned ?? 0;
      const services = serviceAccountsByRole.get(r.id)?.size ?? 0;
      const parts = [
        people > 0 ? plural(people, "user", "users") : null,
        services > 0 ? plural(services, "service account", "service accounts") : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "No one yet";
    },
    [serviceAccountsByRole],
  );

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
      { key: "workspace", label: "All MCPs", count: list.length - app },
      { key: "app", label: "One MCP server", count: app },
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
        toast.error(roleDeleteErrorMessage(e));
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
        header: () => <Term meaning={ACCESS_TERMS.role}>Role</Term>,
        label: "Role",
        alwaysVisible: true,
        approxWidth: 200,
        cell: ({ row }) => (
          <EntityCell
            label={roleParts(row.original.name, appMap).role}
            badge={isBuiltInRole(row.original) ? <span className="role-tag generated">Built-in</span> : undefined}
          />
        ),
      },
      {
        id: "server",
        header: () => <Term meaning={ACCESS_TERMS.mcpServer}>MCP</Term>,
        label: "MCP",
        priority: 1,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-sm text-foreground">{roleParts(row.original.name, appMap).server ?? "—"}</span>
        ),
      },
      {
        id: "perms",
        header: () => <Term meaning={ACCESS_TERMS.permission}>Permissions</Term>,
        label: "Permissions",
        priority: 3,
        approxWidth: 320,
        cell: ({ row }) => <RolePermissionsCell role={row.original} />,
      },
      {
        id: "givenTo",
        header: () => <Term meaning={ACCESS_TERMS.givenTo}>Given to</Term>,
        label: "Given to",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => <span className="text-sm text-foreground">{givenToLabel(row.original)}</span>,
      },
    ],
    [appMap, givenToLabel],
  );

  return (
    <ConsolePage
      title="Roles"
      description="A role is a named set of permissions. Give it to people and service accounts, on the whole workspace or one MCP server."
      actions={
        <Button className="text-white" onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-1.5 size-3.5" /> Add role
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
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
                {search || kindFilter !== "all"
                  ? "Try a different search term or filter."
                  : "Create your first role to start bundling permissions."}
              </p>
              {!search && kindFilter === "all" && (
                <div className="mt-4 flex justify-center">
                  <Button size="sm" onClick={() => setShowCreateDialog(true)} className="text-white">
                    <Plus className="mr-1.5 size-3.5" /> Add role
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
            {selectedFmt ? `${selectedFmt.primary} — role details` : "Role details"}
          </SheetTitle>
          <SheetDescription className="sr-only">Inspect this role's permissions and who holds it.</SheetDescription>
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
                    {selectedFmt.isAppScoped
                      ? `Role on ${roleParts(selectedRole.name, appMap).server ?? "one MCP server"}`
                      : "Role on the whole workspace"}
                  </div>
                </div>
              </div>
              <div className="drawer-body">
                <div className="role-summary">
                  <div className="summary-stat-grid">
                    <div className="stat-card">
                      <div className="sc-k">People</div>
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
                        <span className="detail-k">MCP server</span>
                        <span className="detail-v">{roleParts(selectedRole.name, appMap).server ?? "—"}</span>
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
                  <UserPlus className="mr-1.5 size-3.5" /> Give this role
                </Button>
                <Button
                  variant="outline"
                  aria-label="Delete role"
                  disabled={isBuiltInRole(selectedRole)}
                  title={isBuiltInRole(selectedRole) ? "Built-in roles can't be deleted" : undefined}
                  onClick={() => setConfirmDelete(selectedRole)}
                >
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
              Name the role, then add permissions and give it to people afterwards.
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
            This removes the role from everyone who holds it. Active sessions relying on it lose
            access. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {role && (
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-[13px] break-all">{role.name}</div>
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
function ScopesTab({ onGiveAccess }: { onGiveAccess: () => void }) {
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
        header: () => <Term meaning={ACCESS_TERMS.scope}>Scope</Term>,
        label: "Scope",
        alwaysVisible: true,
        approxWidth: 320,
        cell: ({ row }) => (
          <span className="font-mono text-[13px] text-foreground">{row.original.scope_string}</span>
        ),
      },
      {
        id: "application",
        header: () => <Term meaning={ACCESS_TERMS.mcpServer}>MCP server</Term>,
        label: "MCP server",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => <span className="text-sm text-foreground">{row.original.application?.name ?? "—"}</span>,
      },
      {
        id: "risk",
        header: () => <Term meaning={ACCESS_TERMS.risk}>Risk</Term>,
        label: "Risk",
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
        id: "roles",
        header: () => <Term meaning={ACCESS_TERMS.inRoles}>In roles</Term>,
        label: "In roles",
        priority: 4,
        approxWidth: 100,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-foreground">{row.original.roles_count ?? 0}</span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Scopes"
      description="Each scope allows one kind of action on one MCP server, written as server:action. Put scopes in a role to give them out."
      actions={<GiveAccessButton onClick={onGiveAccess} />}
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
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
                {search ? "Try a different search term." : "Scopes appear as you protect MCP servers."}
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
          <SheetDescription className="sr-only">Inspect this scope's risk, MCP server and tools.</SheetDescription>
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
                      <span className="detail-k">Scope</span>
                      <span className="detail-v mono">{selected.scope_string}</span>
                    </div>
                    {selected.description && (
                      <div className="detail full">
                        <span className="detail-k">Description</span>
                        <span className="detail-v" style={{ fontWeight: 400 }}>{selected.description}</span>
                      </div>
                    )}
                    <div className="detail">
                      <span className="detail-k">MCP server</span>
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
                    <div className="detail">
                      <span className="detail-k">In roles</span>
                      <span className="detail-v">{selected.roles_count ?? 0}</span>
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
      [b.email, b.username, b.user_id, b.service_account_id, b.role_name, b.application?.name, b.source]
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
        header: () => <Term meaning={ACCESS_TERMS.who}>Who</Term>,
        label: "Who",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => {
          const b = row.original;
          const person = b.email ?? b.username ?? b.user_id;
          if (!person && b.service_account_id) {
            return <EntityCell label={b.service_account_id} detail="Service account" />;
          }
          return <span className="text-sm text-foreground">{person ?? "—"}</span>;
        },
      },
      {
        id: "role",
        header: () => <Term meaning={ACCESS_TERMS.role}>Role</Term>,
        label: "Role",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground">{roleParts(row.original.role_name, appMap).role}</span>
        ),
      },
      {
        id: "application",
        header: () => <Term meaning={ACCESS_TERMS.mcpServer}>MCP server</Term>,
        label: "MCP server",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-[13px] text-muted-foreground">
            {row.original.application?.name ?? roleParts(row.original.role_name, appMap).server ?? "—"}
          </span>
        ),
      },
      {
        id: "source",
        header: () => <Term meaning={ACCESS_TERMS.source}>Source</Term>,
        label: "Source",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => <span className="text-[13px] text-muted-foreground">{row.original.source ?? "—"}</span>,
      },
      {
        id: "expires",
        header: () => <Term meaning={ACCESS_TERMS.expires}>Expires</Term>,
        label: "Expires",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-[13px] text-muted-foreground">{row.original.expires_at ? formatDate(row.original.expires_at) : "Never"}</span>
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
      title="Who has what"
      description="Every role given out: who holds it, on the whole workspace or one MCP server, and until when."
      actions={<GiveAccessButton onClick={onNewAssignment} />}
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search people, roles, MCP servers or sources"
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <LoadingState label="Loading who has what…" />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <KeyRound className="mx-auto mb-3 size-7 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{search ? "Nothing matches" : "No one has a role yet"}</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
                {search ? "Try a different search term." : "Give someone a role to give them access."}
              </p>
              {!search && (
                <div className="mt-4 flex justify-center">
                  <Button size="sm" onClick={onNewAssignment} className="text-white">
                    <Plus className="mr-1.5 size-3.5" /> Give access
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
            <DialogTitle>Revoke this role?</DialogTitle>
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
      <ConsolePage title="Access">
        <p className="text-sm text-muted-foreground">
          No workspace selected. Switch to a workspace to manage access control.
        </p>
      </ConsolePage>
    );
  }

  return (
    <>
      {initialTab === "roles" && (
        <RolesTab workspaceId={workspaceId} onAssignUsers={handleAssignUsers} />
      )}
      {initialTab === "scopes" && <ScopesTab onGiveAccess={() => setWizardOpen(true)} />}
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
