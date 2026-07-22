/**
 * `ApplicationAccessPageV2` — combined Access tab.
 *
 * Top: 3-column role↔scope matrix (from ApplicationAccessPage).
 * Bottom (collapsible card): "Who has access" identity→role assignments
 *   table (from ApplicationAccessAssignmentsPage) with a unified
 *   "Add access ▾" dropdown that collapses the three former Add buttons.
 */

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, Cpu, Loader2, MoreVertical, Plus, ShieldOff, Star, UserPlus, Users } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// CardContent removed — table renders directly inside the outer card now
import { HelpTooltip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
// TableCard removed — outer card IS the single visual boundary

import {
  useGetResourceServerAccessPolicyQuery,
  useUpdateApplicationRoleScopeGrantsMutation,
  useUpdateResourceServerAccessPolicyMutation,
  type ResourceServerRoleOption,
} from "@/app/api/resourceServersApi";
import {
  useGetAuthSecRoleDetailQuery,
} from "@/app/api/rolesApi";
import {
  useCreateResourceServerScopeMutation,
  useListResourceServerScopesQuery,
} from "@/app/api/scopeMatrixApi";
import type {
  OAuthScope,
  RiskLevel,
  ScopePermission,
  ScopeSource,
} from "@/app/api/types/scopeMatrix";
import {
  useListAccessAssignmentsQuery,
  useDeleteAssignmentMutation,
  useCreateUserAssignmentMutation,
  type AccessAssignment,
} from "@/app/api/agentIdentityApi";
import {
  useListRSRolesQuery,
  useListEligibleUsersQuery,
  useCreateApplicationRoleMutation,
} from "@/app/api/setupWizardApi";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";
import { Surface } from "./components/ApplicationConsole";
import { formatApplicationRoleName } from "./lib/formatRoleName";
import CreateAPICredentialWizard from "./components/CreateAPICredentialWizard";
import CreateWorkloadWizard from "./components/CreateWorkloadWizard";
import WorkloadAccessDebugger from "./components/WorkloadAccessDebugger";
import GrantWorkloadDialog from "./components/GrantWorkloadDialog";

// ── Scope source labels + styles ──────────────────────────────────────────────

const SCOPE_SOURCE_TOOLTIP: Record<ScopeSource, string> = {
  preset: "This scope was created from the starter vocabulary you picked at registration.",
  discovered: "This scope came from your server's PRM — AuthSec found it via auto-detection.",
  manifest: "This scope was published by your SDK on startup.",
  manual: "This scope was added by an operator in this admin UI.",
};

const SCOPE_SOURCE_STYLE: Record<ScopeSource, string> = {
  preset: "border-blue-200 bg-blue-50 text-blue-700",
  discovered: "border-border bg-muted text-muted-foreground",
  manifest: "border-indigo-200 bg-indigo-50 text-indigo-700",
  manual: "border-amber-200 bg-amber-50 text-amber-700",
};

function deriveScopeSource(scope: OAuthScope): ScopeSource {
  const maybeSource = (scope as unknown as { source?: ScopeSource }).source;
  if (maybeSource) return maybeSource;
  if (scope.is_auto_discovered) return "discovered";
  return "preset";
}

function scopePermissionStrings(scope: OAuthScope): string[] {
  const permissions = (scope.permissions ?? []) as ScopePermission[];
  return permissions.map((p) => `${p.resource}:${p.action}`);
}

// ── Identity badge config ─────────────────────────────────────────────────────

const IDENTITY_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  user: { label: "User", variant: "secondary" },
  service_account: { label: "Machine identity", variant: "outline" },
};

const labelRole = (roleName: string) => {
  const raw = roleName.includes(":")
    ? roleName.split(":").pop() || roleName
    : roleName;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

// ── Add User Dialog ───────────────────────────────────────────────────────────

function AddUserDialog({
  open,
  onOpenChange,
  rsId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rsId: string;
}) {
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");

  const { data: usersData } = useListEligibleUsersQuery(rsId, { skip: !open });
  const { data: rolesData } = useListRSRolesQuery(rsId, { skip: !open });
  const [createAssignment, { isLoading }] = useCreateUserAssignmentMutation();

  const handleSubmit = async () => {
    if (!userId || !roleId) return;
    try {
      await createAssignment({ rsId, userId, roleId }).unwrap();
      toast.success("User access granted.");
      onOpenChange(false);
      setUserId("");
      setRoleId("");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't grant access.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user access</DialogTitle>
          <DialogDescription>
            Grant a workspace user access to this MCP server by assigning a role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-select-v2">User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="user-select-v2">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {(usersData?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-select-v2">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="role-select-v2">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {(rolesData?.roles ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {labelRole(r.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!userId || !roleId || isLoading}
            className="text-white"
          >
            {isLoading ? "Granting…" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── GrantedScopeRow ───────────────────────────────────────────────────────────

function GrantedScopeRow({
  scope,
  variant,
  onRemove,
}: {
  scope: OAuthScope;
  variant: "existing" | "queued";
  onRemove: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start justify-between gap-2 rounded-md border p-2",
        variant === "queued"
          ? "border-blue-200 bg-blue-50/60"
          : "border-border bg-card",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-xs font-semibold text-foreground">
          {scope.scope_string}
        </p>
        {scope.description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {scope.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-[11px] font-semibold text-red-600 hover:underline"
      >
        Remove
      </button>
    </li>
  );
}

// ── RoleCard ──────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  selected,
  isDefault,
  onClick,
  onMakeDefault,
  onClearDefault,
  saving,
}: {
  role: ResourceServerRoleOption;
  selected: boolean;
  isDefault: boolean;
  onClick: () => void;
  onMakeDefault: () => void;
  onClearDefault: () => void;
  saving: boolean;
}) {
  const subLabel = role.is_generated ? "Generated" : "Manual";
  return (
    <li
      className={cn(
        "flex items-stretch gap-1 rounded-md border transition-colors",
        selected
          ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">
              {formatApplicationRoleName(role.name)}
            </p>
            {isDefault && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-700"
                title="Assigned automatically to new users on first login."
              >
                <Star className="size-2.5 fill-current" />
                Default
              </span>
            )}
            {role.recommended && !isDefault && (
              <span className="inline-flex items-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                Best
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subLabel}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
            role.permissions === 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          {role.permissions} {role.permissions === 1 ? "scope" : "scopes"}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={saving}
            aria-label={`Actions for ${formatApplicationRoleName(role.name)}`}
            className="flex shrink-0 items-center justify-center rounded-r-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isDefault ? (
            <DropdownMenuItem onSelect={onClearDefault}>
              Clear default (close posture)
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onMakeDefault}>
              Make default role
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

// ── ThreeColumnMatrix (top section) ──────────────────────────────────────────

function ThreeColumnMatrix({
  applicationId,
}: {
  applicationId: string;
}) {
  const {
    data: policy,
    isLoading: policyLoading,
    refetch: refetchPolicy,
  } = useGetResourceServerAccessPolicyQuery(applicationId);
  const { data: scopes = [], isLoading: scopesLoading } =
    useListResourceServerScopesQuery(applicationId);

  const [updatePolicy, { isLoading: savingPosture }] =
    useUpdateResourceServerAccessPolicyMutation();
  const [updateScopeGrants, { isLoading: savingGrants }] =
    useUpdateApplicationRoleScopeGrantsMutation();
  const [addRole, { isLoading: addingRole }] = useCreateApplicationRoleMutation();
  const [createScope, { isLoading: addingScope }] =
    useCreateResourceServerScopeMutation();

  const roleOptions = useMemo(
    () => policy?.role_options ?? [],
    [policy?.role_options],
  );
  const viewerRole = useMemo(() => {
    const rsViewerRoleName = `rs-${applicationId}:viewer`;
    return (
      roleOptions.find((r) => r.name === rsViewerRoleName) ??
      roleOptions.find((r) => r.name === "viewer") ??
      null
    );
  }, [applicationId, roleOptions]);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [checkedScopeIds, setCheckedScopeIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [showAddScope, setShowAddScope] = useState(false);
  const [newScopeString, setNewScopeString] = useState("");
  const [newScopeDisplayName, setNewScopeDisplayName] = useState("");
  const [newScopeDescription, setNewScopeDescription] = useState("");
  const [newScopeRisk, setNewScopeRisk] = useState<RiskLevel>("low");

  // Seed selected role with default or first available
  useEffect(() => {
    if (selectedRoleId) return;
    if (policy?.default_role_id) {
      setSelectedRoleId(policy.default_role_id);
    } else if (viewerRole) {
      setSelectedRoleId(viewerRole.role_id);
    } else if (roleOptions.length > 0) {
      setSelectedRoleId(roleOptions[0].role_id);
    }
  }, [policy?.default_role_id, roleOptions, selectedRoleId, viewerRole]);

  const {
    data: selectedRoleDetail,
    isFetching: roleDetailLoading,
    refetch: refetchSelectedRoleDetail,
  } = useGetAuthSecRoleDetailQuery(selectedRoleId ?? "", {
    skip: !selectedRoleId,
  });

  const [grantsByRole, setGrantsByRole] = useState<Record<string, string[]>>({});

  const selectedRole = useMemo(
    () => roleOptions.find((r) => r.role_id === selectedRoleId) ?? null,
    [roleOptions, selectedRoleId],
  );
  const selectedRoleLabel = selectedRole
    ? formatApplicationRoleName(selectedRole.name)
    : "role";

  const persistedGrantedScopeIds = useMemo(() => {
    const grantedScopeStrings = new Set(selectedRoleDetail?.granted_scopes ?? []);
    if (grantedScopeStrings.size > 0) {
      return scopes
        .filter((s) => grantedScopeStrings.has(s.scope_string))
        .map((s) => s.id);
    }
    const rolePermissionStrings = new Set(selectedRoleDetail?.permissions ?? []);
    if (rolePermissionStrings.size === 0) return [] as string[];
    return scopes
      .filter((s) =>
        scopePermissionStrings(s).some((ps) => rolePermissionStrings.has(ps)),
      )
      .map((s) => s.id);
  }, [scopes, selectedRoleDetail]);

  // Seed grants from persisted when role detail loads. Declared AFTER
  // persistedGrantedScopeIds so the dependency array doesn't hit a TDZ
  // ReferenceError during render.
  useEffect(() => {
    if (!selectedRoleId || !selectedRoleDetail) return;
    setGrantsByRole((prev) =>
      prev[selectedRoleId] ? prev : { ...prev, [selectedRoleId]: persistedGrantedScopeIds },
    );
  }, [persistedGrantedScopeIds, selectedRoleDetail, selectedRoleId]);

  const grantedScopeIds = useMemo(
    () =>
      selectedRole
        ? grantsByRole[selectedRole.role_id] ?? persistedGrantedScopeIds
        : [],
    [grantsByRole, persistedGrantedScopeIds, selectedRole],
  );

  const grantedScopes = useMemo(
    () => scopes.filter((s) => grantedScopeIds.includes(s.id)),
    [scopes, grantedScopeIds],
  );
  const existingGrantedScopes = useMemo(
    () => grantedScopes.filter((s) => persistedGrantedScopeIds.includes(s.id)),
    [grantedScopes, persistedGrantedScopeIds],
  );
  const queuedGrantedScopes = useMemo(
    () => grantedScopes.filter((s) => !persistedGrantedScopeIds.includes(s.id)),
    [grantedScopes, persistedGrantedScopeIds],
  );

  const visibleScopes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopes;
    return scopes.filter((s) =>
      [s.scope_string, s.display_name, s.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [scopes, search]);

  const postureEnabled = policy?.enabled ?? false;
  const postureDefaultRoleId = postureEnabled ? policy?.default_role_id : undefined;

  const handleMakeDefault = async (roleId: string) => {
    try {
      await updatePolicy({
        id: applicationId,
        body: { enabled: true, default_role_id: roleId },
      }).unwrap();
      toast.success("Default role updated.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't update default role.");
    }
  };

  const handleClearDefault = async () => {
    try {
      await updatePolicy({
        id: applicationId,
        body: { enabled: false, default_role_id: undefined },
      }).unwrap();
      toast.success("Default access cleared. New users get no role.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't clear default role.");
    }
  };

  const handleCreateRole = async () => {
    const raw = newRoleName.trim();
    if (!raw) { toast.error("Role name is required."); return; }
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) { toast.error("Use letters or numbers for the role name."); return; }
    const expectedName = `rs-${applicationId}:${slug}`;
    if (roleOptions.some((r) => r.name === expectedName)) {
      toast.error("A role with that name already exists."); return;
    }
    try {
      await addRole({
        rsId: applicationId,
        name: raw,
      }).unwrap();
      toast.success(`Role "${slug}" created.`);
      setNewRoleName("");
      setShowAddRole(false);
      await refetchPolicy();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create role.");
    }
  };

  const handleCreateScope = async () => {
    const scopeString = newScopeString.trim();
    if (!scopeString) { toast.error("Scope string is required."); return; }
    try {
      await createScope({
        rsId: applicationId,
        body: {
          scope_string: scopeString,
          display_name: newScopeDisplayName.trim() || scopeString,
          description: newScopeDescription.trim() || undefined,
          risk_level: newScopeRisk,
        },
      }).unwrap();
      toast.success(`Scope "${scopeString}" created.`);
      setNewScopeString("");
      setNewScopeDisplayName("");
      setNewScopeDescription("");
      setNewScopeRisk("low");
      setShowAddScope(false);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create scope.");
    }
  };

  const toggleScopeCheck = (scopeId: string) => {
    setCheckedScopeIds((prev) => ({ ...prev, [scopeId]: !prev[scopeId] }));
  };

  const checkedCount = Object.values(checkedScopeIds).filter(Boolean).length;

  const handleGrant = () => {
    if (!selectedRole) return;
    const ids = Object.keys(checkedScopeIds).filter((id) => checkedScopeIds[id]);
    if (ids.length === 0) return;
    setGrantsByRole((prev) => ({
      ...prev,
      [selectedRole.role_id]: Array.from(
        new Set([...(prev[selectedRole.role_id] ?? []), ...ids]),
      ),
    }));
    setCheckedScopeIds({});
    toast.success(`${ids.length} scope${ids.length === 1 ? "" : "s"} queued for ${selectedRoleLabel}.`);
  };

  const handleRemoveGrant = (scopeId: string) => {
    if (!selectedRole) return;
    setGrantsByRole((prev) => ({
      ...prev,
      [selectedRole.role_id]: (prev[selectedRole.role_id] ?? []).filter((id) => id !== scopeId),
    }));
  };

  const handleClearRole = () => {
    if (!selectedRole) return;
    setGrantsByRole((prev) => ({ ...prev, [selectedRole.role_id]: [] }));
  };

  const handleSaveGrants = async () => {
    if (!selectedRole) return;
    try {
      await updateScopeGrants({
        applicationId,
        roleId: selectedRole.role_id,
        body: { scope_ids: grantedScopeIds },
      }).unwrap();
      await Promise.all([refetchSelectedRoleDetail(), refetchPolicy()]);
      toast.success(`Saved ${grantedScopeIds.length} grant${grantedScopeIds.length === 1 ? "" : "s"} for ${selectedRoleLabel}.`);
    } catch (err) {
      setGrantsByRole((prev) => ({
        ...prev,
        [selectedRole.role_id]: persistedGrantedScopeIds,
      }));
      setCheckedScopeIds({});
      void refetchSelectedRoleDetail();
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't save grants.");
    }
  };

  const showViewerEmptyHelper =
    postureEnabled &&
    selectedRole != null &&
    selectedRole.permissions === 0 &&
    grantedScopeIds.length === 0;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Assign access
        </h2>
        <p className="text-sm text-muted-foreground">
          Grant scopes to each role. Mark one role as default to assign it
          automatically on first login.
        </p>
      </header>

      {!policyLoading && !postureEnabled && (
        <Surface className="flex items-start gap-3 border-l-4 border-l-amber-400 bg-amber-50/40 p-3">
          <ShieldOff className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <div className="text-xs leading-5 text-amber-900">
            <p className="font-semibold">Default access: closed</p>
            <p className="text-amber-800">
              New users authenticate but receive no role on first login. Use a
              role's <span className="font-semibold">⋮</span> menu to mark it
              as default.
            </p>
          </div>
        </Surface>
      )}
      {showViewerEmptyHelper && (
        <p className="text-xs leading-5 text-muted-foreground">
          {selectedRoleLabel} is the default but grants nothing until you
          assign at least one scope to it.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pane 1 — Roles */}
        <Surface className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">Roles</h3>
              <HelpTooltip content="Bundles of scopes that you assign to users." />
            </div>
            <button
              type="button"
              onClick={() => setShowAddRole((o) => !o)}
              aria-label={showAddRole ? "Cancel add role" : "Add role"}
              aria-expanded={showAddRole}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border transition-colors",
                showAddRole
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-border bg-card text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {showAddRole && (
            <div className="mt-3 space-y-2 rounded-md border border-dashed border-border bg-muted p-2.5">
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Role name (e.g. editor)"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleCreateRole(); }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => { setShowAddRole(false); setNewRoleName(""); }}
                >
                  Cancel
                </Button>
                <Button
                  className="h-7 px-2 text-xs text-white"
                  onClick={() => void handleCreateRole()}
                  disabled={addingRole || !newRoleName.trim()}
                >
                  {addingRole ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          )}
          {policyLoading && !policy ? (
            <p className="mt-3 text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading roles…
            </p>
          ) : roleOptions.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No roles yet. Define them on the Setup tab, then come back to
              grant scopes.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {roleOptions.map((role) => (
                <RoleCard
                  key={role.role_id}
                  role={role}
                  selected={role.role_id === selectedRoleId}
                  isDefault={role.role_id === postureDefaultRoleId}
                  onClick={() => setSelectedRoleId(role.role_id)}
                  onMakeDefault={() => void handleMakeDefault(role.role_id)}
                  onClearDefault={() => void handleClearDefault()}
                  saving={savingPosture}
                />
              ))}
            </ul>
          )}
        </Surface>

        {/* Pane 2 — Available scopes */}
        <Surface className="flex flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">
                Available scopes
              </h3>
              <HelpTooltip content="All scopes that exist for this Application. They can exist without being granted." />
            </div>
            <button
              type="button"
              onClick={() => setShowAddScope((o) => !o)}
              aria-label={showAddScope ? "Cancel add scope" : "Add scope"}
              aria-expanded={showAddScope}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border transition-colors",
                showAddScope
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-border bg-card text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {showAddScope && (
            <div className="mt-3 space-y-2 rounded-md border border-dashed border-border bg-muted p-2.5">
              <Input
                value={newScopeString}
                onChange={(e) => setNewScopeString(e.target.value)}
                placeholder="Scope string (e.g. demo:tools:read)"
                className="h-8 text-sm font-mono"
              />
              <Input
                value={newScopeDisplayName}
                onChange={(e) => setNewScopeDisplayName(e.target.value)}
                placeholder="Display name (defaults to scope string)"
                className="h-8 text-sm"
              />
              <Input
                value={newScopeDescription}
                onChange={(e) => setNewScopeDescription(e.target.value)}
                placeholder="Description (optional)"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void handleCreateScope(); }
                }}
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Risk</span>
                <Select
                  value={newScopeRisk}
                  onValueChange={(v) => setNewScopeRisk(v as RiskLevel)}
                >
                  <SelectTrigger className="h-8 flex-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setShowAddScope(false);
                    setNewScopeString("");
                    setNewScopeDisplayName("");
                    setNewScopeDescription("");
                    setNewScopeRisk("low");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="h-7 px-2 text-xs text-white"
                  onClick={() => void handleCreateScope()}
                  disabled={addingScope || !newScopeString.trim()}
                >
                  {addingScope ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scopes"
            className="mt-3 h-9"
          />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {scopesLoading ? (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline size-4 animate-spin" />
                Loading scopes…
              </p>
            ) : roleDetailLoading ? (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline size-4 animate-spin" />
                Loading grants…
              </p>
            ) : visibleScopes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scopes match this search.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleScopes.map((scope) => {
                  const source = deriveScopeSource(scope);
                  const checked = Boolean(checkedScopeIds[scope.id]);
                  const alreadyGranted = grantedScopeIds.includes(scope.id);
                  return (
                    <li key={scope.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-md border p-2 transition-colors",
                          checked
                            ? "border-blue-300 bg-blue-50/60"
                            : "border-border bg-card hover:bg-muted",
                          alreadyGranted && "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-blue-600"
                          checked={checked}
                          disabled={alreadyGranted}
                          onChange={() => toggleScopeCheck(scope.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-mono text-xs font-semibold text-foreground">
                              {scope.scope_string}
                            </p>
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                                SCOPE_SOURCE_STYLE[source],
                              )}
                            >
                              {source}
                              <HelpTooltip content={SCOPE_SOURCE_TOOLTIP[source]} />
                            </span>
                          </div>
                          {scope.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                              {scope.description}
                            </p>
                          )}
                          {alreadyGranted && (
                            <p className="mt-0.5 text-[10px] italic text-emerald-700">
                              Already granted to this role
                            </p>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Button
            onClick={handleGrant}
            disabled={!selectedRole || checkedCount === 0}
            className="mt-3 w-full text-white"
          >
            Grant to {selectedRoleLabel}
            {checkedCount > 0 && ` (${checkedCount})`}
          </Button>
        </Surface>

        {/* Pane 3 — Granted to selected role */}
        <Surface className="flex flex-col p-4">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              Granted to {selectedRoleLabel}
            </h3>
            <HelpTooltip content="Scopes currently in this role. Removing a scope here doesn't delete it — it stays available." />
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {!selectedRole ? (
              <p className="text-sm text-muted-foreground">Pick a role to see its grants.</p>
            ) : grantedScopes.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                {selectedRoleLabel} has no grants yet — users will authenticate
                but receive no scoped tool access.
              </div>
            ) : (
              <div className="space-y-3">
                {existingGrantedScopes.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Existing ({existingGrantedScopes.length})
                    </p>
                    <ul className="space-y-1.5">
                      {existingGrantedScopes.map((scope) => (
                        <GrantedScopeRow
                          key={scope.id}
                          scope={scope}
                          variant="existing"
                          onRemove={() => handleRemoveGrant(scope.id)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
                {queuedGrantedScopes.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      Queued · unsaved ({queuedGrantedScopes.length})
                    </p>
                    <ul className="space-y-1.5">
                      {queuedGrantedScopes.map((scope) => (
                        <GrantedScopeRow
                          key={scope.id}
                          scope={scope}
                          variant="queued"
                          onRemove={() => handleRemoveGrant(scope.id)}
                        />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              onClick={handleClearRole}
              disabled={!selectedRole || grantedScopes.length === 0}
              className="flex-1"
            >
              Clear role
            </Button>
            <Button
              onClick={() => void handleSaveGrants()}
              disabled={!selectedRole || savingGrants}
              className="flex-1 text-white"
            >
              {savingGrants ? "Saving…" : "Save grants"}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}

// ── WhoHasAccessPanel (bottom collapsible section) ────────────────────────────

function WhoHasAccessPanel({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [workloadWizardOpen, setWorkloadWizardOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  const { data, isLoading } = useListAccessAssignmentsQuery(applicationId);
  const [deleteAssignment, { isLoading: deleting }] = useDeleteAssignmentMutation();

  const assignments = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) =>
      [a.identity_name, a.role_name, a.identity_type, ...(a.effective_scopes ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data?.items, query]);

  const columns = useMemo<AdaptiveColumn<AccessAssignment>[]>(
    () => [
      {
        id: "identity",
        header: "Identity",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => {
          const badge = IDENTITY_BADGE[row.original.identity_type] ?? IDENTITY_BADGE.user;
          return (
            <EntityCell
              label={row.original.identity_name}
              detail={
                <Badge variant={badge.variant} className="mt-0.5">
                  {badge.label}
                </Badge>
              }
            />
          );
        },
      },
      {
        id: "role",
        header: "Role",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => (
          <Badge variant="secondary">{labelRole(row.original.role_name)}</Badge>
        ),
      },
      {
        id: "scopes",
        header: "Effective scopes",
        priority: 2,
        approxWidth: 260,
        cell: ({ row }) => {
          const scopes = row.original.effective_scopes ?? [];
          if (!scopes.length) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {scopes.slice(0, 3).map((s) => (
                <Badge key={s} variant="outline" className="font-mono text-[11px]">
                  {s}
                </Badge>
              ))}
              {scopes.length > 3 && (
                <Badge variant="outline" className="text-[11px]">
                  +{scopes.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "default" : "outline"}>
            {row.original.status ?? "active"}
          </Badge>
        ),
      },
      {
        id: "assigned",
        header: "Assigned",
        priority: 4,
        approxWidth: 140,
        cell: ({ row }) => {
          const ts = row.original.created_at ? new Date(row.original.created_at) : null;
          const valid = ts && !Number.isNaN(ts.getTime());
          return (
            <span className="text-xs text-muted-foreground">
              {valid ? formatDistanceToNow(ts, { addSuffix: true }) : "—"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 52,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "Revoke access",
                disabled: deleting,
                destructive: true,
                onSelect: async () => {
                  try {
                    await deleteAssignment({
                      rsId: applicationId,
                      assignmentId: row.original.id,
                    }).unwrap();
                    toast.success("Access revoked.");
                  } catch (err) {
                    const apiErr = err as { data?: { error?: string } };
                    toast.error(apiErr?.data?.error ?? "Couldn't revoke access.");
                  }
                },
              },
            ]}
          />
        ),
      },
    ],
    [applicationId, deleteAssignment, deleting],
  );

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Who has access</span>
          {(data?.items ?? []).length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {data!.items.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3">
          <ConsoleFilterBar
            search={query}
            onSearchChange={setQuery}
            searchPlaceholder="Search identities, roles, or scopes"
            className="border-0 shadow-none p-0"
            trailing={
              <div className="flex items-center gap-2">
                {query.trim() && (
                  <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                    Clear
                  </Button>
                )}
                {/* Unified "Add access ▾" dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="text-white">
                      Add access
                      <ChevronDown className="ml-1 size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setAddUserOpen(true)}>
                      <UserPlus className="mr-2 size-3.5" />
                      User
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setWorkloadWizardOpen(true)}>
                      <Cpu className="mr-2 size-3.5" />
                      Kubernetes workload, no secret
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setGrantOpen(true)}>
                      <Plus className="mr-2 size-3.5" />
                      Grant existing workload
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setWizardOpen(true)}>
                      <Cpu className="mr-2 size-3.5" />
                      Machine credential (secret/key)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />

          <div className="rounded-md border border-border overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  Loading access assignments…
                </div>
              ) : assignments.length === 0 && !query ? (
                <div className="py-16 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No identities can access this MCP server yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add a user, connect a Kubernetes workload without a secret, or create a fallback
                    machine credential.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" className="text-white">
                          Add access
                          <ChevronDown className="ml-1 size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center">
                        <DropdownMenuItem onSelect={() => setAddUserOpen(true)}>
                          <UserPlus className="mr-2 size-3.5" />
                          User
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setWorkloadWizardOpen(true)}>
                          <Cpu className="mr-2 size-3.5" />
                          Kubernetes workload, no secret
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setGrantOpen(true)}>
                          <Plus className="mr-2 size-3.5" />
                          Grant existing workload
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setWizardOpen(true)}>
                          <Cpu className="mr-2 size-3.5" />
                          Machine credential (secret/key)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ) : (
                <AdaptiveTable
                  tableId="access-assignments-v2"
                  data={assignments}
                  columns={columns}
                  enableSelection={false}
                  enableExpansion={false}
                  getRowId={(a) => a.id}
                  pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
                />
              )}
          </div>
        </div>
      )}

      <AddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        rsId={applicationId}
      />
      <CreateAPICredentialWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        rsId={applicationId}
      />
      <CreateWorkloadWizard
        open={workloadWizardOpen}
        onOpenChange={setWorkloadWizardOpen}
        rsId={applicationId}
      />
      <GrantWorkloadDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        rsId={applicationId}
      />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ApplicationAccessPageV2() {
  const { application } = useApplicationContext();

  return (
    <div className="space-y-6">
      <ThreeColumnMatrix applicationId={application.id} />

      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Identity assignments
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <WhoHasAccessPanel applicationId={application.id} />
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Troubleshoot
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <WorkloadAccessDebugger applicationId={application.id} />
      </div>
    </div>
  );
}
