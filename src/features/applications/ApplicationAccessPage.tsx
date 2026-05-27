/**
 * `ApplicationAccessPage` — assign access.
 *
 * Three-pane workspace for binding scopes to roles. The "default role"
 * for new users is managed inline on each role card (kebab menu →
 * "Make default role"), so the page has no separate posture row.
 *
 * Backend sources of truth:
 *   • `useGetResourceServerAccessPolicyQuery` → posture (enabled flag,
 *     default role id) + `role_options` (the role list).
 *   • `useUpdateResourceServerAccessPolicyMutation` → set/clear default
 *     role (toggles `enabled` accordingly).
 *   • `useListResourceServerScopesQuery` → all scopes for this RS
 *     (preset, discovered, manifest, manual).
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, MoreVertical, Plus, ShieldOff, Star } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { HelpTooltip } from "@/components/ui/tooltip";
import {
  useGetResourceServerAccessPolicyQuery,
  useUpdateApplicationRoleScopeGrantsMutation,
  useUpdateResourceServerAccessPolicyMutation,
  type ResourceServerRoleOption,
} from "@/app/api/resourceServersApi";
import {
  useAddUserDefinedRolesMutation,
  useGetAuthSecRoleDetailQuery,
} from "@/app/api/rolesApi";
import {
  useCreateResourceServerScopeMutation,
  useListResourceServerScopesQuery,
} from "@/app/api/scopeMatrixApi";
import type {
  OAuthScope,
  ScopePermission,
  ScopeSource,
} from "@/app/api/types/scopeMatrix";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";
import { Surface } from "./components/ApplicationConsole";
import { formatApplicationRoleName } from "./lib/formatRoleName";

const SCOPE_SOURCE_TOOLTIP: Record<ScopeSource, string> = {
  preset: "This scope was created from the starter vocabulary you picked at registration.",
  discovered: "This scope came from your server's PRM — AuthSec found it via auto-detection.",
  manifest: "This scope was published by your SDK on startup.",
  manual: "This scope was added by an operator in this admin UI.",
};

const SCOPE_SOURCE_STYLE: Record<ScopeSource, string> = {
  preset: "border-blue-200 bg-blue-50 text-blue-700",
  discovered: "border-slate-200 bg-slate-50 text-slate-600",
  manifest: "border-indigo-200 bg-indigo-50 text-indigo-700",
  manual: "border-amber-200 bg-amber-50 text-amber-700",
};

/**
 * Best-effort derivation of a scope's source until the backend
 * surfaces `source` on the OAuthScope payload. `is_auto_discovered`
 * implies it came from a PRM scan; otherwise we conservatively label
 * it "preset" if a parent scope is present, "manual" if not.
 */
function deriveScopeSource(scope: OAuthScope): ScopeSource {
  const maybeSource = (scope as unknown as { source?: ScopeSource }).source;
  if (maybeSource) return maybeSource;
  if (scope.is_auto_discovered) return "discovered";
  return "preset";
}

export default function ApplicationAccessPage() {
  const { application } = useApplicationContext();

  const {
    data: policy,
    isLoading: policyLoading,
    refetch: refetchPolicy,
  } =
    useGetResourceServerAccessPolicyQuery(application.id);
  const { data: scopes = [], isLoading: scopesLoading } =
    useListResourceServerScopesQuery(application.id);

  const [updatePolicy, { isLoading: savingPosture }] =
    useUpdateResourceServerAccessPolicyMutation();
  const [updateScopeGrants, { isLoading: savingGrants }] =
    useUpdateApplicationRoleScopeGrantsMutation();
  const [addRole, { isLoading: addingRole }] = useAddUserDefinedRolesMutation();
  const [createScope, { isLoading: addingScope }] =
    useCreateResourceServerScopeMutation();

  const roleOptions = useMemo(
    () => policy?.role_options ?? [],
    [policy?.role_options],
  );
  const viewerRole = useMemo(() => {
    const rsViewerRoleName = `rs-${application.id}:viewer`;
    return (
      roleOptions.find((role) => role.name === rsViewerRoleName) ??
      roleOptions.find((role) => role.name === "viewer") ??
      null
    );
  }, [application.id, roleOptions]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [checkedScopeIds, setCheckedScopeIds] = useState<Record<string, boolean>>(
    {},
  );
  const [search, setSearch] = useState("");

  // Inline "add" forms — toggled from the "+" buttons on each pane header.
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [showAddScope, setShowAddScope] = useState(false);
  const [newScopeString, setNewScopeString] = useState("");
  const [newScopeDescription, setNewScopeDescription] = useState("");

  // Seed the selected role with the access policy's default role,
  // or fall back to the first role option.
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
        .filter((scope) => grantedScopeStrings.has(scope.scope_string))
        .map((scope) => scope.id);
    }

    const rolePermissionStrings = new Set(selectedRoleDetail?.permissions ?? []);
    if (rolePermissionStrings.size === 0) return [] as string[];
    return scopes
      .filter((scope) =>
        scopePermissionStrings(scope).some((permissionString) =>
          rolePermissionStrings.has(permissionString),
        ),
      )
      .map((scope) => scope.id);
  }, [scopes, selectedRoleDetail]);

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
  // Split granted scopes into "existing" (already persisted on the backend)
  // and "queued" (added in this session, pending Save grants). Distinguishing
  // them gives operators a clear view of what's about to change.
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
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [scopes, search]);

  const postureEnabled = policy?.enabled ?? false;
  const postureDefaultRoleId = postureEnabled ? policy?.default_role_id : undefined;

  const handleMakeDefault = async (roleId: string) => {
    try {
      await updatePolicy({
        id: application.id,
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
        id: application.id,
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
    if (!raw) {
      toast.error("Role name is required.");
      return;
    }
    // Slugify: lowercase, replace non-alphanumeric with "-", collapse runs.
    const slug = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      toast.error("Use letters or numbers for the role name.");
      return;
    }
    // RS-scoped role names follow `rs-{rsId}:{slug}` so the backend's
    // listRoleOptions query picks them up alongside the auto-generated roles.
    const name = `rs-${application.id}:${slug}`;
    if (roleOptions.some((role) => role.name === name)) {
      toast.error("A role with that name already exists.");
      return;
    }
    try {
      await addRole({
        tenant_id: application.tenant_id,
        name,
        description: "",
        permission_strings: [],
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
    if (!scopeString) {
      toast.error("Scope string is required.");
      return;
    }
    try {
      await createScope({
        rsId: application.id,
        body: {
          scope_string: scopeString,
          display_name: scopeString,
          description: newScopeDescription.trim() || undefined,
          risk_level: "low",
        },
      }).unwrap();
      toast.success(`Scope "${scopeString}" created.`);
      setNewScopeString("");
      setNewScopeDescription("");
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
    // Local optimistic state — backend wiring lands when the
    // role/scope grant mutation ships (see report at end).
    setGrantsByRole((prev) => ({
      ...prev,
      [selectedRole.role_id]: Array.from(
        new Set([...(prev[selectedRole.role_id] ?? []), ...ids]),
      ),
    }));
    setCheckedScopeIds({});
    toast.success(
      `${ids.length} scope${ids.length === 1 ? "" : "s"} queued for ${selectedRoleLabel}.`,
    );
  };

  const handleRemoveGrant = (scopeId: string) => {
    if (!selectedRole) return;
    setGrantsByRole((prev) => ({
      ...prev,
      [selectedRole.role_id]: (prev[selectedRole.role_id] ?? []).filter(
        (id) => id !== scopeId,
      ),
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
        applicationId: application.id,
        roleId: selectedRole.role_id,
        body: {
          scope_ids: grantedScopeIds,
        },
      }).unwrap();
      await Promise.all([refetchSelectedRoleDetail(), refetchPolicy()]);
      toast.success(
        `Saved ${grantedScopeIds.length} grant${grantedScopeIds.length === 1 ? "" : "s"} for ${selectedRoleLabel}.`,
      );
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
      {/* ───────── Header ───────── */}
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Assign access
        </h2>
        <p className="text-sm text-muted-foreground">
          Grant scopes to each role. Mark one role as default to assign it
          automatically on first login.
        </p>
      </header>

      {/* Closed-posture notice — shown only when no role is marked default. */}
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
        <p className="text-xs leading-5 text-slate-500">
          {selectedRoleLabel} is the default but grants nothing until you
          assign at least one scope to it.
        </p>
      )}

      {/* ───────── 3-pane workspace ───────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pane 1 — Roles */}
        <Surface className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-slate-950">Roles</h3>
              <HelpTooltip content="Bundles of scopes that you assign to users." />
            </div>
            <button
              type="button"
              onClick={() => setShowAddRole((open) => !open)}
              aria-label={showAddRole ? "Cancel add role" : "Add role"}
              aria-expanded={showAddRole}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border transition-colors",
                showAddRole
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {showAddRole && (
            <div className="mt-3 space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2.5">
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Role name (e.g. editor)"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateRole();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setShowAddRole(false);
                    setNewRoleName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleCreateRole()}
                  disabled={addingRole || !newRoleName.trim()}
                >
                  {addingRole ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          )}
          {policyLoading && !policy ? (
            <p className="mt-3 text-sm text-slate-500">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading roles…
            </p>
          ) : roleOptions.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500">
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
                  onMakeDefault={() => handleMakeDefault(role.role_id)}
                  onClearDefault={handleClearDefault}
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
              <h3 className="text-sm font-semibold text-slate-950">
                Available scopes
              </h3>
              <HelpTooltip content="All scopes that exist for this Application. They can exist without being granted." />
            </div>
            <button
              type="button"
              onClick={() => setShowAddScope((open) => !open)}
              aria-label={showAddScope ? "Cancel add scope" : "Add scope"}
              aria-expanded={showAddScope}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border transition-colors",
                showAddScope
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
              )}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {showAddScope && (
            <div className="mt-3 space-y-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2.5">
              <Input
                value={newScopeString}
                onChange={(e) => setNewScopeString(e.target.value)}
                placeholder="Scope string (e.g. demo:tools:read)"
                className="h-8 text-sm font-mono"
              />
              <Input
                value={newScopeDescription}
                onChange={(e) => setNewScopeDescription(e.target.value)}
                placeholder="Description (optional)"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateScope();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setShowAddScope(false);
                    setNewScopeString("");
                    setNewScopeDescription("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="h-7 px-2 text-xs"
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
              <p className="text-sm text-slate-500">
                <Loader2 className="mr-2 inline size-4 animate-spin" />
                Loading scopes…
              </p>
            ) : roleDetailLoading ? (
              <p className="text-sm text-slate-500">
                <Loader2 className="mr-2 inline size-4 animate-spin" />
                Loading grants…
              </p>
            ) : visibleScopes.length === 0 ? (
              <p className="text-sm text-slate-500">
                No scopes match this search.
              </p>
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
                            : "border-slate-200 bg-white hover:bg-slate-50",
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
                            <p className="truncate font-mono text-xs font-semibold text-slate-950">
                              {scope.scope_string}
                            </p>
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                                SCOPE_SOURCE_STYLE[source],
                              )}
                            >
                              {source}
                              <HelpTooltip
                                content={SCOPE_SOURCE_TOOLTIP[source]}
                              />
                            </span>
                          </div>
                          {scope.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
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
              className="mt-3 w-full"
            >
            Grant to {selectedRoleLabel}
            {checkedCount > 0 && ` (${checkedCount})`}
          </Button>
        </Surface>

        {/* Pane 3 — Granted to selected role */}
        <Surface className="flex flex-col p-4">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-950">
              Granted to {selectedRoleLabel}
            </h3>
            <HelpTooltip content="Scopes currently in this role. Removing a scope here doesn't delete it — it stays available." />
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {!selectedRole ? (
              <p className="text-sm text-slate-500">Pick a role to see its grants.</p>
            ) : grantedScopes.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                {selectedRoleLabel} has no grants yet — users will
                authenticate but receive no scoped tool access.
              </div>
            ) : (
              <div className="space-y-3">
                {existingGrantedScopes.length > 0 && (
                  <section>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
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
              onClick={handleSaveGrants}
              disabled={!selectedRole || savingGrants}
              className="flex-1"
            >
              {savingGrants ? "Saving…" : "Save grants"}
            </Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}

function scopePermissionStrings(scope: OAuthScope): string[] {
  const permissions = (scope.permissions ?? []) as ScopePermission[];
  return permissions.map((permission) => `${permission.resource}:${permission.action}`);
}

// ── helpers ────────────────────────────────────────────────────────────────

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
          : "border-slate-200 bg-white",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-xs font-semibold text-slate-950">
          {scope.scope_string}
        </p>
        {scope.description && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
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
          : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-950">
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
          <p className="mt-0.5 text-[11px] text-slate-500">{subLabel}</p>
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
            className="flex shrink-0 items-center justify-center rounded-r-md px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
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
