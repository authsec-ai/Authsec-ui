/**
 * AssignRoleWizard — multi-step dialog for assigning a role to one or more users.
 *
 * Steps:
 *   1. Select users (multi-select)
 *   2. Select role (single-select)
 *   3. Scope (workspace-wide or application-specific)
 *   4. Expiry (never / 24h / 7d / 30d / custom)
 *   5. Review & confirm
 *
 * Usage:
 *   <AssignRoleWizard
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     preselectedRoleId={roleId}
 *   />
 */

import React, { useState, useMemo, useCallback } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  "Select users",
  "Select role",
  "Scope",
  "Expiry",
  "Review",
];

function StepDots({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all",
            i < current
              ? "w-2 bg-blue-500"
              : i === current
              ? "w-4 bg-blue-500"
              : "w-2 bg-slate-200"
          )}
        />
      ))}
    </div>
  );
}

// ─── Step 1 — Select users ────────────────────────────────────────────────────

function StepSelectUsers({
  workspaceId,
  selected,
  onToggle,
}: {
  workspaceId: string;
  selected: Set<string>;
  onToggle: (userId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListEndUsersQuery({
    workspaceId,
    q: search.trim() || undefined,
  });

  const rows = useMemo<TenantEndUserState[]>(
    () => data?.items ?? [],
    [data]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">
        Step 1 of {STEPS.length} — {STEPS[0]}
      </p>
      <Input
        placeholder="Search by email or username..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9"
        autoFocus
      />
      {selected.size > 0 && (
        <p className="text-xs text-blue-600">
          {selected.size} user{selected.size === 1 ? "" : "s"} selected
        </p>
      )}
      <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-3 py-2">
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            {search ? "No users match your search." : "No users found."}
          </div>
        ) : (
          rows.map((user) => {
            const label =
              user.user_email ?? user.user_username ?? user.user_id;
            const isSelected = selected.has(user.user_id);
            return (
              <label
                key={user.user_id}
                className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center h-4 mt-0.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(user.user_id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold shrink-0">
                      {label.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {label}
                    </span>
                  </div>
                  {user.applications && user.applications.length > 0 && (
                    <p className="text-xs text-slate-500 mt-0.5 ml-8">
                      {user.applications
                        .map((a) => a.role_name)
                        .join(", ")}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                )}
              </label>
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
}: {
  workspaceId: string;
  selectedRoleId: string | null;
  onSelect: (roleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: roles, isLoading } = useGetAuthSecRolesQuery({
    workspace_id: workspaceId,
  });

  const rows = useMemo<AuthSecRole[]>(() => {
    const list = (roles ?? []) as AuthSecRole[];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.description?.toLowerCase().includes(s)
    );
  }, [roles, search]);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">
        Step 2 of {STEPS.length} — {STEPS[1]}
      </p>
      <Input
        placeholder="Search roles..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9"
        autoFocus
      />
      <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-3 py-2">
              <Skeleton className="h-8 w-full" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            {search ? "No roles match your search." : "No roles found."}
          </div>
        ) : (
          rows.map((role) => {
            const isSelected = selectedRoleId === role.id;
            return (
              <label
                key={role.id}
                className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center h-4 mt-0.5">
                  <input
                    type="radio"
                    name="role-select"
                    checked={isSelected}
                    onChange={() => onSelect(role.id)}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {role.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      Workspace
                    </Badge>
                  </div>
                  {role.description && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {role.description}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                )}
              </label>
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
  const { data: appRolesData, isLoading: appsLoading } =
    useListApplicationRolesQuery(undefined, {
      skip: scopeType !== "application",
    });

  // Extract unique applications from application roles
  const applications = useMemo<ApplicationRole["application"][]>(() => {
    const list = appRolesData?.roles ?? [];
    const seen = new Map<string, ApplicationRole["application"]>();
    list.forEach((r) => {
      if (!seen.has(r.application.id)) seen.set(r.application.id, r.application);
    });
    return Array.from(seen.values());
  }, [appRolesData]);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-700">
        Step 3 of {STEPS.length} — {STEPS[2]}
      </p>
      <div className="space-y-3">
        <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="radio"
            name="scope-type"
            checked={scopeType === "workspace"}
            onChange={() => {
              onScopeTypeChange("workspace");
              onApplicationSelect(null);
            }}
            className="h-4 w-4 mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <p className="text-sm font-medium text-slate-900">
              Workspace-wide (default)
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Role applies across all applications in this workspace.
            </p>
          </div>
        </label>
        <label className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="radio"
            name="scope-type"
            checked={scopeType === "application"}
            onChange={() => onScopeTypeChange("application")}
            className="h-4 w-4 mt-0.5 border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">
              Application-specific
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Role applies only to the selected application.
            </p>
          </div>
        </label>
        {scopeType === "application" && (
          <div className="ml-7">
            {appsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select
                value={selectedApplicationId ?? ""}
                onValueChange={(v) => onApplicationSelect(v || null)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select application..." />
                </SelectTrigger>
                <SelectContent>
                  {applications.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No applications found
                    </SelectItem>
                  ) : (
                    applications.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>
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
  const options: { value: ExpiryOption; label: string }[] = [
    { value: "never", label: "Never (default)" },
    { value: "24h", label: "24 hours" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-700">
        Step 4 of {STEPS.length} — {STEPS[3]}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onExpiryChange(opt.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors",
              expiry === opt.value
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {expiry === "custom" && (
        <div className="space-y-1.5">
          <label
            htmlFor="custom-date"
            className="text-sm text-slate-600"
          >
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
}) {
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const selectedApp = applications.find((a) => a.id === selectedApplicationId);
  const selectedUsers = users.filter((u) =>
    selectedUserIds.has(u.user_id)
  );

  const expiryLabel =
    expiry === "never"
      ? "No expiry"
      : expiry === "24h"
      ? "Expires in 24 hours"
      : expiry === "7d"
      ? "Expires in 7 days"
      : expiry === "30d"
      ? "Expires in 30 days"
      : `Expires on ${customDate}`;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-700">
        Step 5 of {STEPS.length} — {STEPS[4]}
      </p>
      <div className="rounded-md border bg-slate-50 p-4 space-y-3 text-sm">
        <p className="text-slate-700 font-medium">
          Granting{" "}
          <span className="text-blue-700 font-semibold">
            {selectedUserIds.size} user
            {selectedUserIds.size === 1 ? "" : "s"}
          </span>{" "}
          the{" "}
          <span className="font-semibold text-slate-900">
            {selectedRole?.name ?? "—"}
          </span>{" "}
          role{" "}
          {scopeType === "application" && selectedApp
            ? `for ${selectedApp.name}`
            : "workspace-wide"}
          {expiry !== "never" ? ` · ${expiryLabel}` : ""}
        </p>
        <div className="space-y-1">
          {selectedUsers.map((u) => (
            <div
              key={u.user_id}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <div className="h-5 w-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold shrink-0">
                {(u.user_email ?? u.user_id).slice(0, 2).toUpperCase()}
              </div>
              <span className="truncate">
                {u.user_email ?? u.user_username ?? u.user_id}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 text-xs text-slate-500 space-y-1">
          <div className="flex justify-between">
            <span>Role</span>
            <span className="font-medium text-slate-700">
              {selectedRole?.name ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Scope</span>
            <span className="font-medium text-slate-700">
              {scopeType === "application" && selectedApp
                ? selectedApp.name
                : "Workspace-wide"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Expiry</span>
            <span className="font-medium text-slate-700">{expiryLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

function computeExpiresAt(expiry: ExpiryOption, customDate: string): string | undefined {
  const now = Date.now();
  if (expiry === "never") return undefined;
  if (expiry === "24h") return new Date(now + 24 * 60 * 60 * 1000).toISOString();
  if (expiry === "7d") return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (expiry === "30d") return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
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

  // Step 1
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => {
    if (preselectedUserId) return new Set([preselectedUserId]);
    return new Set();
  });

  // Step 2
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    preselectedRoleId ?? null
  );

  // Step 3
  const [scopeType, setScopeType] = useState<"workspace" | "application">("workspace");
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  // Step 4
  const [expiry, setExpiry] = useState<ExpiryOption>("never");
  const [customDate, setCustomDate] = useState("");

  // Data
  const { data: userData } = useListEndUsersQuery(
    { workspaceId },
    { skip: !workspaceId }
  );
  const users = useMemo<TenantEndUserState[]>(
    () => userData?.items ?? [],
    [userData]
  );

  const { data: rolesData } = useGetAuthSecRolesQuery(
    { workspace_id: workspaceId },
    { skip: !workspaceId }
  );
  const roles = useMemo<AuthSecRole[]>(
    () => (rolesData ?? []) as AuthSecRole[],
    [rolesData]
  );

  const { data: appRolesData } = useListApplicationRolesQuery();
  const applications = useMemo(() => {
    const list = appRolesData?.roles ?? [];
    const seen = new Map<string, { id: string; name: string }>();
    list.forEach((r) => {
      if (!seen.has(r.application.id))
        seen.set(r.application.id, {
          id: r.application.id,
          name: r.application.name,
        });
    });
    return Array.from(seen.values());
  }, [appRolesData]);

  const [createBinding, createState] = useCreateBindingMutation();
  const [deleteBinding] = useDeleteBindingMutation();

  const toggleUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const canAdvance = useMemo(() => {
    if (step === 0) return selectedUserIds.size > 0;
    if (step === 1) return !!selectedRoleId;
    if (step === 2)
      return (
        scopeType === "workspace" ||
        (scopeType === "application" && !!selectedApplicationId)
      );
    if (step === 3)
      return expiry !== "custom" || (expiry === "custom" && !!customDate);
    return true;
  }, [
    step,
    selectedUserIds,
    selectedRoleId,
    scopeType,
    selectedApplicationId,
    expiry,
    customDate,
  ]);

  const handleConfirm = useCallback(async () => {
    if (!selectedRoleId || selectedUserIds.size === 0) return;

    const expiresAt = computeExpiresAt(expiry, customDate);
    const scope =
      scopeType === "application" && selectedApplicationId
        ? { id: selectedApplicationId, type: "application" }
        : undefined;

    const createdIds: string[] = [];

    try {
      const promises = Array.from(selectedUserIds).map(async (userId) => {
        const result = await createBinding({
          user_id: userId,
          role_id: selectedRoleId,
          scope,
          conditions: expiresAt ? { expires_at: expiresAt } : undefined,
          audience: "admin",
        }).unwrap();
        if (result.id) createdIds.push(result.id);
      });

      await Promise.all(promises);

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
      // Reset
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
  }, [
    selectedRoleId,
    selectedUserIds,
    scopeType,
    selectedApplicationId,
    expiry,
    customDate,
    createBinding,
    deleteBinding,
    onClose,
  ]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Role</DialogTitle>
        </DialogHeader>

        <StepDots current={step} total={STEPS.length} />

        <div className="min-h-[280px]">
          {step === 0 && (
            <StepSelectUsers
              workspaceId={workspaceId}
              selected={selectedUserIds}
              onToggle={toggleUser}
            />
          )}
          {step === 1 && (
            <StepSelectRole
              workspaceId={workspaceId}
              selectedRoleId={selectedRoleId}
              onSelect={setSelectedRoleId}
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
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            disabled={createState.isLoading}
          >
            {step === 0 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </>
            )}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={!canAdvance || createState.isLoading}
            >
              {createState.isLoading ? "Assigning..." : "Confirm & assign"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
