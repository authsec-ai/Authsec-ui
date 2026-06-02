/**
 * AccessControlPage — workspace-level access management.
 *
 * Which view renders is driven by the route (and the left sidebar links that
 * point at it) via the `initialTab` prop — there is no on-screen tab bar:
 *   roles       — workspace/app-scoped roles with inline right panel
 *   scopes      — cross-workspace scope catalog with inline right panel
 *   assignments — role binding table (replaces old Role Bindings page)
 *
 * Usage:
 *   <AccessControlPage initialTab="roles" />
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Trash2,
  Plus,
  X,
  MoreHorizontal,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SectionNav,
  CollapsibleSection,
  DrawerPrevNext,
  ResourceTag,
  toastWithUndo,
} from "@/components/primitives";
import { cn } from "@/lib/utils";
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

function riskBadgeVariant(
  risk: string
): "destructive" | "secondary" | "outline" | "default" {
  switch (risk?.toLowerCase()) {
    case "critical":
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
}

// ─── Role right panel ─────────────────────────────────────────────────────────

const ROLE_NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "scopes", label: "Scopes" },
  { id: "activity", label: "Activity" },
];

function RoleDetailPanel({
  role,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  total,
  onDelete,
  onAssignUsers,
}: {
  role: AuthSecRole;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  total: number;
  onDelete: (role: AuthSecRole) => void;
  onAssignUsers: (roleId: string) => void;
}) {
  const [activeSection] = useState("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <DrawerPrevNext
            onPrev={onPrev}
            onNext={onNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            currentIndex={currentIndex}
            total={total}
          />
          <p className="text-sm font-semibold text-slate-900 truncate flex-1 text-center">
            {role.name}
          </p>
          <button
            type="button"
            aria-label="Close role detail panel"
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
            Edit name
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Section nav */}
      <SectionNav sections={ROLE_NAV_ITEMS} activeId={activeSection} />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection id="overview" title="Overview" defaultOpen={true}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">{role.name}</dd>
            </div>
            {role.description && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Description</dt>
                <dd className="text-slate-700">{role.description}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Kind</dt>
              <dd>
                <Badge variant="outline" className="text-xs">
                  Workspace-wide
                </Badge>
              </dd>
            </div>
            {role.created_at && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-700">{formatDate(role.created_at)}</dd>
              </div>
            )}
          </dl>
        </CollapsibleSection>

        <CollapsibleSection
          id="users"
          title="Users"
          defaultOpen={true}
          badge={role.users_assigned ?? 0}
        >
          {role.users_assigned && role.users_assigned > 0 ? (
            <p className="text-sm text-slate-500">
              {role.users_assigned} user
              {role.users_assigned === 1 ? "" : "s"} assigned this role.
            </p>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500">
                No users assigned this role yet.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 text-xs"
                onClick={() => onAssignUsers(role.id)}
              >
                + Assign users
              </Button>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection id="scopes" title="Scopes" defaultOpen={false}>
          <p className="text-xs text-slate-500 italic">
            Scopes are derived from the role's permissions — configure
            permissions to unlock scopes.
          </p>
        </CollapsibleSection>

        <CollapsibleSection id="activity" title="Activity" defaultOpen={false}>
          <p className="text-sm text-slate-500 text-center py-4">
            Activity tracking coming soon.
          </p>
        </CollapsibleSection>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role &quot;{role.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This action cannot be undone. Existing role bindings for this role
            will be removed.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                onDelete(role);
              }}
            >
              Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
  const [kindFilter, setKindFilter] = useState<"all" | "workspace" | "app">(
    "all"
  );
  const [selectedRole, setSelectedRole] = useState<AuthSecRole | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Create role form
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  const { data: roles, isLoading } = useGetAuthSecRolesQuery({
    workspace_id: workspaceId,
  });

  // uuid → application name, so auto-generated `rs-{uuid}:{type}` roles render
  // as "demo server · admin" instead of the raw UUID.
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
      const matchSearch =
        !search ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.description?.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [roles, search, kindFilter]);

  const handleSelectRow = useCallback((role: AuthSecRole, index: number) => {
    setSelectedRole(role);
    setSelectedIndex(index);
  }, []);

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      const newIdx = selectedIndex - 1;
      setSelectedIndex(newIdx);
      setSelectedRole(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  const handleNext = useCallback(() => {
    if (selectedIndex < rows.length - 1) {
      const newIdx = selectedIndex + 1;
      setSelectedIndex(newIdx);
      setSelectedRole(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  const handleDelete = useCallback(
    async (role: AuthSecRole) => {
      try {
        await deleteRoles({
          workspace_id: workspaceId,
          role_ids: [role.id],
        }).unwrap();
        toast.success("Role deleted");
        if (selectedRole?.id === role.id) setSelectedRole(null);
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to delete role");
      }
    },
    [deleteRoles, workspaceId, selectedRole]
  );

  const handleCreate = useCallback(async () => {
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }
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
      const err = e as { data?: { error?: string } };
      toast.error(err?.data?.error ?? "Failed to create role");
    }
  }, [addRole, workspaceId, newRoleName, newRoleDesc]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — table */}
      <div
        className={cn(
          "flex flex-col overflow-auto transition-all duration-200",
          selectedRole ? "w-[55%] min-w-0 flex-none" : "flex-1"
        )}
      >
        <div className="p-6 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Input
                placeholder="Search roles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
            {/* Kind filters */}
            <div className="flex gap-1.5">
              {(["all", "workspace", "app"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors",
                    kindFilter === k
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {k === "all"
                    ? "All"
                    : k === "workspace"
                    ? "Workspace"
                    : "App-scoped"}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="ml-auto text-white! [&_svg]:text-white!"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create Role
            </Button>
          </div>

          <TableCard>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role name</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead># Users</TableHead>
                    <TableHead># Permissions</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-12 text-slate-500"
                      >
                        {search
                          ? "No roles match your search."
                          : "No roles found. Create your first role to get started."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((role, index) => (
                      <TableRow
                        key={role.id}
                        className={cn(
                          "cursor-pointer hover:bg-slate-50",
                          selectedRole?.id === role.id && "bg-slate-50"
                        )}
                        onClick={() => handleSelectRow(role, index)}
                      >
                        <TableCell>
                          {(() => {
                            const fmt = formatRoleName(role.name, appMap);
                            return (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {fmt.primary}
                                </span>
                                {fmt.badge && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 uppercase tracking-wide">
                                    {fmt.badge}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {role.description && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              {role.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {formatRoleName(role.name, appMap).isAppScoped
                              ? "App-scoped"
                              : "Workspace"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                          {role.users_assigned ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                          {role.permissions_count ?? "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRow(role, index);
                                }}
                              >
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-xs text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(role);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </TableCard>

          <div className="text-xs text-slate-500">
            {rows.length} role{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Right — detail panel */}
      {selectedRole && (
        <div className="w-[45%] flex-none border-l bg-white overflow-y-auto">
          <RoleDetailPanel
            role={selectedRole}
            onClose={() => setSelectedRole(null)}
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex < rows.length - 1}
            currentIndex={selectedIndex}
            total={rows.length}
            onDelete={handleDelete}
            onAssignUsers={onAssignUsers}
          />
        </div>
      )}

      {/* Create role dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="role-name"
                className="text-sm font-medium text-slate-700"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="role-name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. developer, read-only-ops"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="role-desc"
                className="text-sm font-medium text-slate-700"
              >
                Description
              </label>
              <textarea
                id="role-desc"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Optional description for this role"
                className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setNewRoleName("");
                setNewRoleDesc("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={addRoleState.isLoading || !newRoleName.trim()}
            >
              {addRoleState.isLoading ? "Creating..." : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Scope right panel ────────────────────────────────────────────────────────

const SCOPE_NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "tools", label: "Tools" },
  { id: "roles-granting", label: "Roles" },
  { id: "users-computed", label: "Users" },
];

function ScopeDetailPanel({
  scope,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  total,
}: {
  scope: ScopeCatalogEntry;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  total: number;
}) {
  const [activeSection] = useState("overview");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <DrawerPrevNext
            onPrev={onPrev}
            onNext={onNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            currentIndex={currentIndex}
            total={total}
          />
          <p className="text-sm font-semibold text-slate-900 truncate flex-1 text-center font-mono">
            {scope.scope_string}
          </p>
          <button
            type="button"
            aria-label="Close scope detail panel"
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs">
            Edit
          </Button>
        </div>
      </div>

      {/* Section nav */}
      <SectionNav sections={SCOPE_NAV_ITEMS} activeId={activeSection} />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection id="overview" title="Overview" defaultOpen={true}>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-slate-500 text-xs mb-1">Scope string</dt>
              <dd className="font-mono text-xs bg-slate-50 rounded px-2 py-1">
                {scope.scope_string}
              </dd>
            </div>
            {scope.display_name && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Display name</dt>
                <dd className="text-slate-700">{scope.display_name}</dd>
              </div>
            )}
            {scope.description && (
              <div>
                <dt className="text-slate-500 text-xs mb-1">Description</dt>
                <dd className="text-slate-700 text-sm">{scope.description}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Risk</dt>
              <dd>
                <Badge
                  variant={riskBadgeVariant(scope.risk_level)}
                  className="text-xs capitalize"
                >
                  {scope.risk_level || "unknown"}
                </Badge>
              </dd>
            </div>
            {scope.application && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Application</dt>
                <dd className="text-slate-700">{scope.application.name}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Kind</dt>
              <dd>
                <Badge variant="outline" className="text-xs capitalize">
                  {scope.kind}
                </Badge>
              </dd>
            </div>
          </dl>
        </CollapsibleSection>

        <CollapsibleSection id="tools" title="Tools" defaultOpen={false}>
          <p className="text-sm text-slate-500 italic">
            Tool mappings visible in the Application &rarr; Tools tab.
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          id="roles-granting"
          title="Roles (granting)"
          defaultOpen={false}
        >
          <p className="text-sm text-slate-500 italic">
            Grant chain analysis coming soon.
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          id="users-computed"
          title="Users (computed)"
          defaultOpen={false}
        >
          <p className="text-sm text-slate-500 italic">
            Blast radius analysis coming soon.
          </p>
        </CollapsibleSection>
      </div>
    </div>
  );
}

// ─── Scopes tab ───────────────────────────────────────────────────────────────

function ScopesTab() {
  const [search, setSearch] = useState("");
  const [selectedScope, setSelectedScope] = useState<ScopeCatalogEntry | null>(
    null
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: scopeData, isLoading } = useListScopeCatalogQuery({ kind: "all" });

  const rows = useMemo<ScopeCatalogEntry[]>(() => {
    const list = scopeData?.items ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (sc) =>
        sc.scope_string.toLowerCase().includes(s) ||
        sc.display_name?.toLowerCase().includes(s) ||
        sc.description?.toLowerCase().includes(s)
    );
  }, [scopeData, search]);

  const handleSelectRow = useCallback(
    (scope: ScopeCatalogEntry, index: number) => {
      setSelectedScope(scope);
      setSelectedIndex(index);
    },
    []
  );

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      const newIdx = selectedIndex - 1;
      setSelectedIndex(newIdx);
      setSelectedScope(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  const handleNext = useCallback(() => {
    if (selectedIndex < rows.length - 1) {
      const newIdx = selectedIndex + 1;
      setSelectedIndex(newIdx);
      setSelectedScope(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — table */}
      <div
        className={cn(
          "flex flex-col overflow-auto transition-all duration-200",
          selectedScope ? "w-[55%] min-w-0 flex-none" : "flex-1"
        )}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search scopes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 flex-1 max-w-sm"
            />
          </div>

          <TableCard>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope string</TableHead>
                    <TableHead>Application</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead># Tools</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-12 text-slate-500"
                      >
                        {search
                          ? "No scopes match your search."
                          : "No scopes found in this workspace."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((scope, index) => (
                      <TableRow
                        key={scope.id}
                        className={cn(
                          "cursor-pointer hover:bg-slate-50",
                          selectedScope?.id === scope.id && "bg-slate-50"
                        )}
                        onClick={() => handleSelectRow(scope, index)}
                      >
                        <TableCell>
                          <ResourceTag kind="scope" label={scope.scope_string} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                          {scope.application?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={riskBadgeVariant(scope.risk_level)}
                            className="text-xs capitalize"
                          >
                            {scope.risk_level || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                          {scope.tools_count ?? "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRow(scope, index);
                                }}
                              >
                                View details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </TableCard>

          <div className="text-xs text-slate-500">
            {rows.length} scope{rows.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Right — detail panel */}
      {selectedScope && (
        <div className="w-[45%] flex-none border-l bg-white overflow-y-auto">
          <ScopeDetailPanel
            scope={selectedScope}
            onClose={() => setSelectedScope(null)}
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={selectedIndex > 0}
            hasNext={selectedIndex < rows.length - 1}
            currentIndex={selectedIndex}
            total={rows.length}
          />
        </div>
      )}
    </div>
  );
}

// ─── Assignments tab ──────────────────────────────────────────────────────────

function AssignmentsTab({
  onNewAssignment,
}: {
  onNewAssignment: () => void;
}) {
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const { data: bindings, isLoading } = useListBindingsQuery({
    audience: "admin",
  });

  const { data: resourceServers } = useListResourceServersQuery();
  const appMap = useMemo(() => {
    const m = new Map<string, string>();
    (resourceServers ?? []).forEach((rs) => m.set(rs.id, rs.name));
    return m;
  }, [resourceServers]);

  const [deleteBinding, deleteState] = useDeleteBindingMutation();

  const rows = useMemo<RoleBinding[]>(() => bindings ?? [], [bindings]);

  const confirmRevokeBinding = useMemo(
    () => rows.find((r) => r.id === confirmRevokeId) ?? null,
    [rows, confirmRevokeId]
  );

  const handleRevoke = useCallback(
    async (bindingId: string) => {
      const binding = rows.find((r) => r.id === bindingId);
      const subject =
        binding?.email ?? binding?.username ?? binding?.user_id ?? "the user";
      const roleLabel = binding?.role_name ?? "role";
      try {
        await deleteBinding(bindingId).unwrap();
        toast.success(
          `Revoked ${roleLabel} from ${subject}. Active sessions for connected apps have been terminated.`,
        );
        setConfirmRevokeId(null);
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to revoke binding");
      }
    },
    [deleteBinding, rows]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {rows.length} assignment{rows.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" onClick={onNewAssignment}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Assignment
        </Button>
      </div>

      <TableCard>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-12 text-slate-500"
                  >
                    No assignments yet. Click &quot;New Assignment&quot; to
                    assign a role to a user.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((binding) => (
                  <TableRow key={binding.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="font-medium text-slate-900 text-sm dark:text-white">
                        {binding.email ??
                          binding.username ??
                          binding.user_id ??
                          "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                      {(() => {
                        const fmt = formatRoleName(binding.role_name, appMap);
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-medium">{fmt.primary}</span>
                            {fmt.badge && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 uppercase tracking-wide">
                                {fmt.badge}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                      {binding.application?.name ?? (
                        <span className="text-slate-400">Workspace-wide</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {binding.source ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {binding.expires_at ? (
                        formatDate(binding.expires_at)
                      ) : (
                        <span className="text-slate-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {formatDate(binding.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setConfirmRevokeId(binding.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </TableCard>

      {/* Revoke confirm dialog */}
      <Dialog
        open={!!confirmRevokeId}
        onOpenChange={(open) => {
          if (!open) setConfirmRevokeId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Revoke role assignment?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            {confirmRevokeBinding && (
              <p>
                Revoke{" "}
                <span className="font-medium text-slate-900 dark:text-white">
                  {confirmRevokeBinding.role_name}
                </span>{" "}
                from{" "}
                <span className="font-medium text-slate-900 dark:text-white">
                  {confirmRevokeBinding.email ??
                    confirmRevokeBinding.username ??
                    confirmRevokeBinding.user_id}
                </span>
                {confirmRevokeBinding.application?.name && (
                  <>
                    {" "}on{" "}
                    <span className="font-medium text-slate-900 dark:text-white">
                      {confirmRevokeBinding.application.name}
                    </span>
                  </>
                )}
                ?
              </p>
            )}
            <p>
              Active sessions for connected apps will be terminated immediately.
              Re-granting the role requires a new assignment.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRevokeId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteState.isLoading}
              onClick={() => {
                if (confirmRevokeId) handleRevoke(confirmRevokeId);
              }}
            >
              {deleteState.isLoading ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccessControlPage({
  initialTab = "roles",
}: AccessControlPageProps) {
  const workspaceId = resolveWorkspaceId();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [preselectedRoleId, setPreselectedRoleId] = useState<
    string | undefined
  >(undefined);

  const handleAssignUsers = useCallback((roleId: string) => {
    setPreselectedRoleId(roleId);
    setWizardOpen(true);
  }, []);

  if (!workspaceId) {
    return (
      <div className="p-8">
        <p className="text-slate-500 text-sm">
          No tenant selected. Switch to a tenant to manage access control.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Access Control"
        description="Manage workspace roles, OAuth scopes, and user assignments."
        actions={
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            Workspace: {workspaceId.slice(0, 8)}...
          </div>
        }
      />

      <div className="flex flex-col h-[calc(100vh-var(--page-header-height,140px))] overflow-hidden">
        {initialTab === "roles" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <RolesTab
              workspaceId={workspaceId}
              onAssignUsers={handleAssignUsers}
            />
          </div>
        )}
        {initialTab === "scopes" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <ScopesTab />
          </div>
        )}
        {initialTab === "assignments" && (
          <div className="flex-1 overflow-auto">
            <AssignmentsTab onNewAssignment={() => setWizardOpen(true)} />
          </div>
        )}
      </div>

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
