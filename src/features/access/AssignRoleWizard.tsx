/**
 * AssignRoleWizard — multi-step dialog for assigning a role to one or more users.
 *
 * Steps:
 *   1. Select users (multi-select)
 *   2. Select role (single-select)
 *   3. Scope (workspace-wide or application-specific)
 *   4. Expiry (never / 24h / 7d / 30d / custom)
 *   5. Review & confirm
 */

import React, { useState, useMemo, useCallback } from "react";
import { Check, ChevronLeft, ChevronRight, User, Shield, Globe, Clock, ClipboardCheck } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/utils/workspace";
import { toast } from "@/lib/toast";
import { toastWithUndo } from "@/components/primitives";

import { useListEndUsersQuery, type TenantEndUserState } from "@/app/api/membershipApi";
import { useGetAuthSecRolesQuery } from "@/app/api/rolesApi";
import {
  useListApplicationRolesQuery,
  type ApplicationRole,
} from "@/app/api/accessApi";
import {
  useCreateBindingMutation,
  useDeleteBindingMutation,
} from "@/app/api/bindingsApi";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssignRoleWizardProps {
  open: boolean;
  onClose: () => void;
  preselectedUserId?: string;
  preselectedRoleId?: string;
}

interface AuthSecRole {
  id: string;
  name: string;
  description?: string;
}

type ExpiryOption = "never" | "24h" | "7d" | "30d" | "custom";

// ─── Role name formatter ──────────────────────────────────────────────────────

/**
 * Parses `rs-{uuid}:{type}` role names and returns a clean display shape.
 * If the UUID maps to a known application, shows the app name as the primary
 * label. Falls back gracefully for roles that don't follow this convention.
 */
function parseRoleName(
  name: string,
  appMap: Map<string, string>
): { primary: string; badge?: string } {
  // Pattern: rs-{uuid}:{type}
  const m = name.match(/^rs-([0-9a-f-]{36}):(.+)$/i);
  if (m) {
    const [, uuid, role] = m;
    const appName = appMap.get(uuid);
    if (appName) {
      return { primary: appName, badge: role };
    }
    // UUID not in our map yet — show the role type without the UUID
    return { primary: role, badge: "Application" };
  }
  return { primary: name };
}

// ─── Step configuration ───────────────────────────────────────────────────────

const STEPS = [
  { label: "Users",  icon: User },
  { label: "Role",   icon: Shield },
  { label: "Scope",  icon: Globe },
  { label: "Expiry", icon: Clock },
  { label: "Review", icon: ClipboardCheck },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-1">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all",
                done   && "bg-blue-600 text-white",
                active && "bg-blue-600 text-white ring-4 ring-blue-100",
                !done && !active && "bg-slate-100 text-slate-400"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 transition-colors",
                  i < current ? "bg-blue-600" : "bg-slate-200"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepHeader({ step }: { step: number }) {
  return (
    <div className="text-center mb-5">
      <p className="text-[11px] text-slate-400 uppercase tracking-widest font-medium">
        Step {step + 1} of {STEPS.length}
      </p>
      <h3 className="text-base font-semibold text-slate-900 mt-0.5">
        {STEPS[step].label === "Users"   && "Select users"}
        {STEPS[step].label === "Role"    && "Select role"}
        {STEPS[step].label === "Scope"   && "Choose scope"}
        {STEPS[step].label === "Expiry"  && "Set expiry"}
        {STEPS[step].label === "Review"  && "Review & confirm"}
      </h3>
    </div>
  );
}

// ─── Step 1 — Select users ────────────────────────────────────────────────────

function StepSelectUsers({
  workspaceId,
  selected,
  onToggle,
  appMap,
}: {
  workspaceId: string;
  selected: Set<string>;
  onToggle: (userId: string) => void;
  appMap: Map<string, string>;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListEndUsersQuery({
    workspaceId,
    q: search.trim() || undefined,
  });

  const rows = useMemo<TenantEndUserState[]>(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by email or username…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9"
        autoFocus
      />
      {selected.size > 0 && (
        <p className="text-xs font-medium text-blue-600">
          {selected.size} user{selected.size === 1 ? "" : "s"} selected
        </p>
      )}
      <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5">
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            {search ? "No users match your search." : "No end users found."}
          </div>
        ) : (
          rows.map((user) => {
            const label = user.user_email ?? user.user_username ?? user.user_id;
            const initials = label.slice(0, 2).toUpperCase();
            const isSelected = selected.has(user.user_id);
            // Show application roles cleaned up
            const roleTags = user.applications
              ?.flatMap((a) => {
                if (!a.role_name) return [];
                const { primary, badge } = parseRoleName(a.role_name, appMap);
                return [badge ? `${primary} · ${badge}` : primary];
              })
              .slice(0, 2) ?? [];

            return (
              <button
                key={user.user_id}
                type="button"
                onClick={() => onToggle(user.user_id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-blue-50 hover:bg-blue-50" : "hover:bg-slate-50"
                )}
              >
                {/* Checkbox */}
                <span
                  className={cn(
                    "flex-none w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                    isSelected ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </span>

                {/* Avatar */}
                <span className="flex-none h-8 w-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">
                  {initials}
                </span>

                {/* Info */}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900 truncate">
                    {label}
                  </span>
                  {roleTags.length > 0 && (
                    <span className="block text-xs text-slate-400 truncate mt-0.5">
                      {roleTags.join(", ")}
                    </span>
                  )}
                </span>

                {isSelected && (
                  <Check className="flex-none h-4 w-4 text-blue-600" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Step 2 — Select role ─────────────────────────────────────────────────────

function StepSelectRole({
  workspaceId,
  selectedRoleId,
  onSelect,
  appMap,
}: {
  workspaceId: string;
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
  appMap: Map<string, string>;
}) {
  const [search, setSearch] = useState("");
  const { data: roles, isLoading } = useGetAuthSecRolesQuery({ workspace_id: workspaceId });

  const rows = useMemo<AuthSecRole[]>(() => {
    const list = (roles ?? []) as AuthSecRole[];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (r) => r.name.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s)
    );
  }, [roles, search]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search roles…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9"
        autoFocus
      />
      <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3 py-2.5">
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-400">
            {search ? "No roles match your search." : "No roles found."}
          </div>
        ) : (
          rows.map((role) => {
            const isSelected = selectedRoleId === role.id;
            const { primary, badge } = parseRoleName(role.name, appMap);
            const desc = role.description;

            return (
              <button
                key={role.id}
                type="button"
                onClick={() => onSelect(role.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors",
                  isSelected ? "bg-blue-50 hover:bg-blue-50" : "hover:bg-slate-50"
                )}
              >
                {/* Radio dot */}
                <span
                  className={cn(
                    "flex-none w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                    isSelected ? "border-blue-600" : "border-slate-300 bg-white"
                  )}
                >
                  {isSelected && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                </span>

                {/* Text */}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">
                      {primary}
                    </span>
                    {badge && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 uppercase tracking-wide">
                        {badge}
                      </span>
                    )}
                  </span>
                  {desc && (
                    <span className="block text-xs text-slate-400 mt-0.5 truncate">
                      {desc}
                    </span>
                  )}
                </span>

                {isSelected && (
                  <Check className="flex-none h-4 w-4 text-blue-600" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Step 3 — Scope ───────────────────────────────────────────────────────────

function StepScope({
  scopeType,
  onScopeTypeChange,
  selectedApplicationId,
  onApplicationSelect,
}: {
  scopeType: "workspace" | "application";
  onScopeTypeChange: (type: "workspace" | "application") => void;
  selectedApplicationId: string | null;
  onApplicationSelect: (id: string | null) => void;
}) {
  const { data: appRolesData, isLoading: appsLoading } = useListApplicationRolesQuery(undefined, {
    skip: scopeType !== "application",
  });

  const applications = useMemo<ApplicationRole["application"][]>(() => {
    const list = appRolesData?.roles ?? [];
    const seen = new Map<string, ApplicationRole["application"]>();
    list.forEach((r) => {
      if (!seen.has(r.application.id)) seen.set(r.application.id, r.application);
    });
    return Array.from(seen.values());
  }, [appRolesData]);

  const options: { value: "workspace" | "application"; label: string; desc: string }[] = [
    {
      value: "workspace",
      label: "Workspace-wide",
      desc: "Role applies across all applications in this workspace.",
    },
    {
      value: "application",
      label: "Application-specific",
      desc: "Role applies only to the selected application.",
    },
  ];

  return (
    <div className="space-y-3">
      {options.map((opt) => {
        const active = scopeType === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onScopeTypeChange(opt.value);
              if (opt.value === "workspace") onApplicationSelect(null);
            }}
            className={cn(
              "w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all",
              active
                ? "border-blue-600 bg-blue-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex-none w-4 h-4 rounded-full border-2 flex items-center justify-center",
                active ? "border-blue-600" : "border-slate-300"
              )}
            >
              {active && <span className="w-2 h-2 rounded-full bg-blue-600" />}
            </span>
            <span>
              <span
                className={cn(
                  "block text-sm font-semibold",
                  active ? "text-blue-900" : "text-slate-900"
                )}
              >
                {opt.label}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
            </span>
          </button>
        );
      })}

      {scopeType === "application" && (
        <div className="mt-1">
          {appsLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto">
              {applications.length === 0 ? (
                <p className="text-center py-6 text-sm text-slate-400">No applications found.</p>
              ) : (
                applications.map((app) => {
                  const isSelected = selectedApplicationId === app.id;
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => onApplicationSelect(app.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                        isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex-none w-3.5 h-3.5 rounded-full border-2",
                          isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300"
                        )}
                      />
                      <span className="text-sm font-medium text-slate-900 flex-1 truncate">
                        {app.name}
                      </span>
                      {isSelected && <Check className="flex-none h-4 w-4 text-blue-600" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 4 — Expiry ──────────────────────────────────────────────────────────

function StepExpiry({
  expiry,
  onExpiryChange,
  customDate,
  onCustomDateChange,
}: {
  expiry: ExpiryOption;
  onExpiryChange: (e: ExpiryOption) => void;
  customDate: string;
  onCustomDateChange: (d: string) => void;
}) {
  const options: { value: ExpiryOption; label: string; desc: string }[] = [
    { value: "never", label: "Never", desc: "Default — no expiry" },
    { value: "24h",   label: "24 hours", desc: "Expires tomorrow" },
    { value: "7d",    label: "7 days",   desc: "Short-lived access" },
    { value: "30d",   label: "30 days",  desc: "Monthly access" },
    { value: "custom", label: "Custom",  desc: "Pick a date" },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((opt) => {
          const active = expiry === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onExpiryChange(opt.value)}
              className={cn(
                "flex flex-col items-start p-3 rounded-lg border-2 text-left transition-all",
                active
                  ? "border-blue-600 bg-blue-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <span className={cn("text-sm font-semibold", active ? "text-blue-900" : "text-slate-900")}>
                {opt.label}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</span>
            </button>
          );
        })}
      </div>
      {expiry === "custom" && (
        <div className="pt-1 space-y-1">
          <label htmlFor="custom-date" className="text-xs font-medium text-slate-600">
            Expiry date
          </label>
          <Input
            id="custom-date"
            type="date"
            value={customDate}
            onChange={(e) => onCustomDateChange(e.target.value)}
            className="h-9 w-48"
            min={new Date().toISOString().split("T")[0]}
          />
        </div>
      )}
    </div>
  );
}

// ─── Step 5 — Review ──────────────────────────────────────────────────────────

function StepReview({
  selectedUserIds,
  users,
  selectedRoleId,
  roles,
  scopeType,
  selectedApplicationId,
  applications,
  expiry,
  customDate,
  appMap,
}: {
  selectedUserIds: Set<string>;
  users: TenantEndUserState[];
  selectedRoleId: string | null;
  roles: AuthSecRole[];
  scopeType: "workspace" | "application";
  selectedApplicationId: string | null;
  applications: { id: string; name: string }[];
  expiry: ExpiryOption;
  customDate: string;
  appMap: Map<string, string>;
}) {
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const selectedApp = applications.find((a) => a.id === selectedApplicationId);
  const selectedUsers = users.filter((u) => selectedUserIds.has(u.user_id));

  const roleName = selectedRole
    ? (() => {
        const { primary, badge } = parseRoleName(selectedRole.name, appMap);
        return badge ? `${primary} · ${badge}` : primary;
      })()
    : "—";

  const expiryLabel =
    expiry === "never" ? "No expiry" :
    expiry === "24h"   ? "24 hours" :
    expiry === "7d"    ? "7 days"   :
    expiry === "30d"   ? "30 days"  :
    customDate         ? customDate : "Custom";

  return (
    <div className="space-y-4">
      {/* Summary sentence */}
      <p className="text-sm text-slate-700 leading-relaxed">
        Granting{" "}
        <span className="font-semibold text-blue-700">
          {selectedUserIds.size} user{selectedUserIds.size === 1 ? "" : "s"}
        </span>{" "}
        the{" "}
        <span className="font-semibold text-slate-900">{roleName}</span>{" "}
        role{" "}
        {scopeType === "application" && selectedApp
          ? <>on <span className="font-semibold text-slate-900">{selectedApp.name}</span></>
          : "workspace-wide"
        }
        {expiry !== "never" && (
          <> · expires in <span className="font-semibold text-slate-900">{expiryLabel}</span></>
        )}
        .
      </p>

      {/* User list */}
      <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
        {selectedUsers.map((u) => {
          const label = u.user_email ?? u.user_username ?? u.user_id;
          const initials = label.slice(0, 2).toUpperCase();
          return (
            <div key={u.user_id} className="flex items-center gap-2.5 px-3 py-2.5">
              <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </div>
              <span className="text-sm text-slate-800 truncate">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Details grid */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs space-y-2">
        {[
          { key: "Role",   val: roleName },
          { key: "Scope",  val: scopeType === "application" && selectedApp ? selectedApp.name : "Workspace-wide" },
          { key: "Expiry", val: expiry === "never" ? "No expiry" : expiryLabel },
        ].map(({ key, val }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-slate-500">{key}</span>
            <span className="font-semibold text-slate-800 text-right">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

function computeExpiresAt(expiry: ExpiryOption, customDate: string): string | undefined {
  const now = Date.now();
  if (expiry === "never")  return undefined;
  if (expiry === "24h")    return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  if (expiry === "7d")     return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (expiry === "30d")    return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  if (expiry === "custom" && customDate) return new Date(customDate).toISOString();
  return undefined;
}

export default function AssignRoleWizard({
  open,
  onClose,
  preselectedUserId,
  preselectedRoleId,
}: AssignRoleWizardProps) {
  const workspaceId = resolveWorkspaceId() ?? "";
  const [step, setStep] = useState(0);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() =>
    preselectedUserId ? new Set([preselectedUserId]) : new Set()
  );
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(preselectedRoleId ?? null);
  const [scopeType, setScopeType] = useState<"workspace" | "application">("workspace");
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [customDate, setCustomDate] = useState("");

  // Data
  const { data: userData } = useListEndUsersQuery({ workspaceId }, { skip: !workspaceId });
  const users = useMemo<TenantEndUserState[]>(() => userData?.items ?? [], [userData]);

  const { data: rolesData } = useGetAuthSecRolesQuery({ workspace_id: workspaceId }, { skip: !workspaceId });
  const roles = useMemo<AuthSecRole[]>(() => (rolesData ?? []) as AuthSecRole[], [rolesData]);

  const { data: appRolesData } = useListApplicationRolesQuery();
  const applications = useMemo(() => {
    const list = appRolesData?.roles ?? [];
    const seen = new Map<string, { id: string; name: string }>();
    list.forEach((r) => {
      if (!seen.has(r.application.id)) seen.set(r.application.id, { id: r.application.id, name: r.application.name });
    });
    return Array.from(seen.values());
  }, [appRolesData]);

  // uuid → application name map used by parseRoleName everywhere
  const appMap = useMemo(() => {
    const m = new Map<string, string>();
    applications.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [applications]);

  const [createBinding, createState] = useCreateBindingMutation();
  const [deleteBinding] = useDeleteBindingMutation();

  const toggleUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const canAdvance = useMemo(() => {
    if (step === 0) return selectedUserIds.size > 0;
    if (step === 1) return !!selectedRoleId;
    if (step === 2) return scopeType === "workspace" || (scopeType === "application" && !!selectedApplicationId);
    if (step === 3) return expiry !== "custom" || !!customDate;
    return true;
  }, [step, selectedUserIds, selectedRoleId, scopeType, selectedApplicationId, expiry, customDate]);

  const handleConfirm = useCallback(async () => {
    if (!selectedRoleId || selectedUserIds.size === 0) return;
    const expiresAt = computeExpiresAt(expiry, customDate);
    const scope =
      scopeType === "application" && selectedApplicationId
        ? { id: selectedApplicationId, type: "resource_server" }
        : undefined;

    const createdIds: string[] = [];
    try {
      await Promise.all(
        Array.from(selectedUserIds).map(async (userId) => {
          const result = await createBinding({
            user_id: userId,
            role_id: selectedRoleId,
            scope,
            conditions: expiresAt ? { expires_at: expiresAt } : undefined,
            audience: "admin",
          }).unwrap();
          if (result.id) createdIds.push(result.id);
        })
      );
      toastWithUndo({
        message: `Role assigned to ${selectedUserIds.size} user${selectedUserIds.size === 1 ? "" : "s"}`,
        onUndo: async () => {
          try {
            await Promise.all(createdIds.map((id) => deleteBinding(id).unwrap()));
            toast.success("Assignment undone");
          } catch {
            toast.error("Failed to undo — revoke manually from Assignments tab");
          }
        },
      });
      onClose();
      setStep(0);
      setSelectedUserIds(new Set());
      setSelectedRoleId(null);
      setScopeType("workspace");
      setSelectedApplicationId(null);
      setExpiry("never");
      setCustomDate("");
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast.error(err?.data?.error ?? "Failed to assign role");
    }
  }, [selectedRoleId, selectedUserIds, scopeType, selectedApplicationId, expiry, customDate, createBinding, deleteBinding, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">Assign Role</DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} />
        <StepHeader step={step} />

        <div className="min-h-[260px]">
          {step === 0 && (
            <StepSelectUsers
              workspaceId={workspaceId}
              selected={selectedUserIds}
              onToggle={toggleUser}
              appMap={appMap}
            />
          )}
          {step === 1 && (
            <StepSelectRole
              workspaceId={workspaceId}
              selectedRoleId={selectedRoleId}
              onSelect={setSelectedRoleId}
              appMap={appMap}
            />
          )}
          {step === 2 && (
            <StepScope
              scopeType={scopeType}
              onScopeTypeChange={setScopeType}
              selectedApplicationId={selectedApplicationId}
              onApplicationSelect={setSelectedApplicationId}
            />
          )}
          {step === 3 && (
            <StepExpiry
              expiry={expiry}
              onExpiryChange={setExpiry}
              customDate={customDate}
              onCustomDateChange={setCustomDate}
            />
          )}
          {step === 4 && (
            <StepReview
              selectedUserIds={selectedUserIds}
              users={users}
              selectedRoleId={selectedRoleId}
              roles={roles}
              scopeType={scopeType}
              selectedApplicationId={selectedApplicationId}
              applications={applications}
              expiry={expiry}
              customDate={customDate}
              appMap={appMap}
            />
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            disabled={createState.isLoading}
            className="gap-1.5"
          >
            {step > 0 && <ChevronLeft className="h-4 w-4" />}
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={!canAdvance || createState.isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {createState.isLoading ? "Assigning…" : "Confirm & assign"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
