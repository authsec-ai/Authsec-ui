import React, { useMemo, useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
  AlertTriangle,
  Layers,
  KeyRound,
  Clock,
  Calendar,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  useListEndUsersQuery,
  useReactivateEndUserMutation,
  useSuspendEndUserMutation,
  type EndUserStatus,
  type TenantEndUserState,
} from "@/app/api/membershipApi";
import { useGetApplicationEffectiveAccessQuery } from "@/app/api/accessApi";
import { useDeleteBindingMutation } from "@/app/api/bindingsApi";
import AssignRoleWizard from "@/features/access/AssignRoleWizard";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConsoleFilterBar,
  EntityCell,
} from "@/components/console/iam-console";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { toast } from "@/lib/toast";
import { resolveWorkspaceId } from "@/utils/workspace";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function userLabel(user: TenantEndUserState): string {
  return user.user_email ?? user.user_username ?? user.user_id;
}

function userInitials(user: TenantEndUserState): string {
  const label = userLabel(user);
  const parts = label.split(/[@.\s]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "—";
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

const StatusBadge: React.FC<{ status: EndUserStatus | "invited" }> = ({ status }) => {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
        Active
      </span>
    );
  }
  if (status === "suspended") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
      {status}
    </span>
  );
};

// ─── Access section ───────────────────────────────────────────────────────────

function UserAccessSection({
  user,
  workspaceId,
}: {
  user: TenantEndUserState;
  workspaceId: string;
}) {
  // A user can hold several roles on the SAME application (e.g. admin + viewer
  // on demo server). The backend snapshot returns one row per binding, so the
  // raw list contains the app twice. Dedupe by application_id — one app is one
  // app, regardless of how many roles the user has on it. The per-app effective
  // access query below already aggregates every role/scope for that app.
  const applications = useMemo(() => {
    const seen = new Map<string, NonNullable<TenantEndUserState["applications"]>[number]>();
    (user.applications ?? []).forEach((a) => {
      if (!seen.has(a.application_id)) seen.set(a.application_id, a);
    });
    return Array.from(seen.values());
  }, [user.applications]);

  const [selectedAppId, setSelectedAppId] = useState(applications[0]?.application_id ?? "");
  const effectiveAppId = selectedAppId || applications[0]?.application_id || "";

  const { data, isLoading } = useGetApplicationEffectiveAccessQuery(
    { applicationId: effectiveAppId, userId: user.user_id },
    { skip: !effectiveAppId }
  );

  const [deleteBinding, { isLoading: removing }] = useDeleteBindingMutation();
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const handleRemoveRole = useCallback(
    async (bindingId: string | undefined, roleLabel: string) => {
      if (!bindingId) {
        toast.error("This role can't be removed from here — open the role to manage it.");
        return;
      }
      if (!window.confirm(`Remove "${roleLabel}" from ${userLabel(user)}?`)) return;
      setPendingRemoveId(bindingId);
      try {
        await deleteBinding(bindingId).unwrap();
        toast.success(`${roleLabel} removed.`);
      } catch (err: any) {
        toast.error(err?.data?.error ?? "Failed to remove role.");
      } finally {
        setPendingRemoveId(null);
      }
    },
    [deleteBinding, user],
  );

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Layers className="h-6 w-6 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">No application access.</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Assign a role above to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Application picker */}
      {applications.length > 1 && (
        <Select value={effectiveAppId} onValueChange={setSelectedAppId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select application" />
          </SelectTrigger>
          <SelectContent>
            {applications.map((app) => (
              <SelectItem key={app.application_id} value={app.application_id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {applications.length === 1 && (
        <div className="flex items-center gap-2 px-1">
          <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground">{applications[0].name}</span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : data ? (
        <div className="space-y-4">
          {/* Roles */}
          {data.roles.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                Roles
              </p>
              <div className="divide-y divide-border rounded-md border bg-card">
                {data.roles.map((role) => {
                  const isPending = pendingRemoveId === role.binding_id;
                  return (
                    <div key={role.id} className="flex items-center justify-between px-3 py-2 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{role.label}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{role.name}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => handleRemoveRole(role.binding_id, role.label)}
                        disabled={removing && isPending}
                        aria-label={`Remove ${role.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scopes */}
          {data.scopes.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                Effective Scopes
              </p>
              <div className="divide-y divide-border rounded-md border bg-card">
                {data.scopes.map((scope) => (
                  <div key={scope.id} className="flex items-center justify-between px-3 py-2 gap-3">
                    <div className="min-w-0 flex items-center gap-2">
                      <KeyRound className="h-3 w-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-mono truncate text-foreground">{scope.scope_string}</p>
                        {scope.display_name && scope.display_name !== scope.scope_string && (
                          <p className="text-[10px] text-muted-foreground truncate">{scope.display_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          scope.status === "granted"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {scope.status === "granted" ? "Granted" : "Not granted"}
                      </span>
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border border-border text-muted-foreground">
                        {scope.risk_level}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.roles.length === 0 && data.scopes.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No roles or scopes assigned for this application.
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No data available.</p>
      )}
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function UserDetailDrawer({
  user,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  total,
  workspaceId,
  onSuspend,
  onReactivate,
  suspendLoading,
  reactivateLoading,
}: {
  user: TenantEndUserState;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  total: number;
  workspaceId: string;
  onSuspend: (userId: string) => void;
  onReactivate: (userId: string) => void;
  suspendLoading: boolean;
  reactivateLoading: boolean;
}) {
  const [assignOpen, setAssignOpen] = useState(false);

  const safeIndex = Number.isFinite(currentIndex) ? currentIndex : 0;
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1;

  // Distinct applications (a user may hold multiple roles on one app — that's
  // still one app, not N). Trust this over the backend's per-binding count.
  const distinctAppCount = useMemo(
    () => new Set((user.applications ?? []).map((a) => a.application_id)).size,
    [user.applications],
  );

  return (
    // SheetContent renders in a Radix portal — sits on top of the full screen
    // including the header, exactly like the Tools inspector on ApplicationToolsPage.
    // The inner div takes over all visual styling; SheetContent is just the portal host.
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Top bar: prev/next + close */}
        <div className="flex items-center justify-between px-4 py-3">
          {/* Prev / Next */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous user"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums select-none">
              {safeIndex + 1} / {safeTotal}
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next user"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* SheetContent renders its own X — no duplicate close button here */}
          <div className="w-7" />
        </div>

        {/* User identity */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
              {userInitials(user)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate text-foreground">{userLabel(user)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={user.status} />
                {user.last_seen_at && (
                  <>
                    <span className="text-muted-foreground/40 text-xs">·</span>
                    <span className="text-xs text-muted-foreground">
                      seen {formatRelativeTime(user.last_seen_at)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAssignOpen(true)}>
            + Assign role
          </Button>
          {user.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
              onClick={() => onSuspend(user.user_id)}
              disabled={suspendLoading}
            >
              <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50"
              onClick={() => onReactivate(user.user_id)}
              disabled={reactivateLoading}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {/* Suspension warning */}
        {user.status === "suspended" && (
          <div className="mx-4 mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-red-800">Account suspended</p>
                {user.suspended_at && (
                  <p className="text-xs text-red-600 mt-0.5">
                    Suspended {formatRelativeTime(user.suspended_at)} · {formatDate(user.suspended_at)}
                  </p>
                )}
                {user.suspended_reason && (
                  <p className="text-xs text-red-700 mt-1 italic">"{user.suspended_reason}"</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="px-4 py-4 space-y-1 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Details
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              First consent
            </span>
            <span className="text-foreground text-right font-mono tabular-nums">
              {formatDate(user.first_consent_at)}
            </span>

            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              Last seen
            </span>
            <span className="text-foreground text-right font-mono tabular-nums">
              {user.last_seen_at ? formatDate(user.last_seen_at) : "—"}
            </span>

            {user.plan_tier && (
              <>
                <span className="text-muted-foreground">Plan tier</span>
                <span className="text-foreground text-right capitalize">{user.plan_tier}</span>
              </>
            )}

            <span className="text-muted-foreground">User ID</span>
            <button
              type="button"
              className="text-right font-mono text-[10px] text-muted-foreground hover:text-foreground truncate max-w-[160px] transition-colors"
              title={user.user_id}
              onClick={() => {
                navigator.clipboard.writeText(user.user_id).then(() => toast.success("ID copied"));
              }}
            >
              {user.user_id.slice(0, 8)}…{user.user_id.slice(-4)}
            </button>
          </div>
        </div>

        {/* Access */}
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Access
            </p>
            {distinctAppCount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {distinctAppCount} app{distinctAppCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <UserAccessSection user={user} workspaceId={workspaceId} />
        </div>
      </div>

      <AssignRoleWizard
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        preselectedUserId={user.user_id}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EndUsersPage() {
  const workspaceId = resolveWorkspaceId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatus | "all">("all");
  const [selectedUser, setSelectedUser] = useState<TenantEndUserState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const { data, isLoading } = useListEndUsersQuery(
    {
      workspaceId: workspaceId ?? "",
      status: statusFilter === "all" ? undefined : statusFilter,
      q: search.trim() || undefined,
    },
    { skip: !workspaceId }
  );

  const [suspend, suspendState] = useSuspendEndUserMutation();
  const [reactivate, reactivateState] = useReactivateEndUserMutation();

  const rows: TenantEndUserState[] = useMemo(() => data?.items ?? [], [data]);

  const handleSuspend = useCallback(async (userId: string) => {
    if (!workspaceId) return;
    try {
      await suspend({ workspaceId, userId, reason: "Manual suspension" }).unwrap();
      toast.success("User suspended — active sessions terminated.");
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast.error(err?.data?.error ?? "Failed to suspend");
    }
  }, [workspaceId, suspend]);

  const handleReactivate = useCallback(async (userId: string) => {
    if (!workspaceId) return;
    try {
      await reactivate({ workspaceId, userId }).unwrap();
      toast.success("User reactivated.");
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast.error(err?.data?.error ?? "Failed to reactivate");
    }
  }, [workspaceId, reactivate]);

  const handleSelectRow = useCallback(
    (user: TenantEndUserState, index: number) => {
      const safeIndex = Number.isFinite(index)
        ? index
        : rows.findIndex((r) => r.user_id === user.user_id);
      setSelectedUser(user);
      setSelectedIndex(safeIndex >= 0 ? safeIndex : 0);
    },
    [rows],
  );

  const handleClose = useCallback(() => setSelectedUser(null), []);

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      const i = selectedIndex - 1;
      setSelectedIndex(i);
      setSelectedUser(rows[i]);
    }
  }, [selectedIndex, rows]);

  const handleNext = useCallback(() => {
    if (selectedIndex < rows.length - 1) {
      const i = selectedIndex + 1;
      setSelectedIndex(i);
      setSelectedUser(rows[i]);
    }
  }, [selectedIndex, rows]);

  const columns = useMemo<AdaptiveColumn<TenantEndUserState>[]>(
    () => [
      {
        id: "user",
        header: "User",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold shrink-0">
                {userInitials(u)}
              </div>
              <EntityCell
                label={userLabel(u)}
                detail={
                  u.user_name && u.user_name !== "Not Provided"
                    ? u.user_name
                    : u.user_username
                }
              />
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 110,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "applications",
        header: "Apps",
        priority: 2,
        approxWidth: 80,
        cell: ({ row }) => {
          const count = row.original.applications_count ?? row.original.applications?.length ?? 0;
          return <span className="text-sm text-muted-foreground">{count > 0 ? count : "—"}</span>;
        },
      },
      {
        id: "lastActivity",
        header: "Last active",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.last_seen_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectRow(row.original, row.index);
                }}
              >
                View details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.original.status === "active" ? (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSuspend(row.original.user_id);
                  }}
                  disabled={suspendState.isLoading}
                >
                  <ShieldOff className="mr-2 h-3.5 w-3.5" />
                  Suspend
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReactivate(row.original.user_id);
                  }}
                  disabled={reactivateState.isLoading}
                >
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleSelectRow, handleSuspend, handleReactivate, suspendState.isLoading, reactivateState.isLoading]
  );

  if (!workspaceId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No workspace selected.
      </div>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <>
        <PageHeader
          title="End Users"
          description="Consumers of this workspace's published Applications."
        />
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">No end users yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Once a user connects to one of your Applications via OAuth, they'll appear here.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="End Users"
        description="Consumers of this workspace's published Applications. They connect via OAuth — not workspace members."
      />

      {/* Table — full width; detail panel overlays via Sheet portal (same as Tools page) */}
      <div className="h-[calc(100vh-var(--page-header-height,140px))] overflow-hidden">
        <div className="h-full flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-4">
              <ConsoleFilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by email, name, or username"
                trailing={
                  <>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as EndUserStatus | "all")}
                    >
                      <SelectTrigger className="h-9 w-40">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    {(search.trim() || statusFilter !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSearch(""); setStatusFilter("all"); }}
                      >
                        Clear
                      </Button>
                    )}
                  </>
                }
              />

              <TableCard>
                <CardContent variant="flush">
                  {isLoading ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                      Loading…
                    </div>
                  ) : (
                    <AdaptiveTable
                      tableId="end-users"
                      data={rows}
                      columns={columns}
                      enableSelection={false}
                      enableExpansion={false}
                      getRowId={(row) => row.user_id}
                      onRowClick={(row, index) => handleSelectRow(row, index)}
                      rowClassName={(row) =>
                        cn(
                          "cursor-pointer",
                          selectedUser?.user_id === row.user_id && "bg-muted/50"
                        )
                      }
                      pagination={{
                        pageSize: 10,
                        pageSizeOptions: [5, 10, 25, 50],
                        alwaysVisible: true,
                      }}
                    />
                  )}
                </CardContent>
              </TableCard>

              <p className="text-xs text-muted-foreground">
                {rows.length} end user{rows.length === 1 ? "" : "s"} in this workspace.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel — Sheet portal, overlays full screen including header */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <SheetContent
          side="right"
          className="flex h-full flex-col overflow-hidden p-0 sm:max-w-[560px]"
        >
          {selectedUser && (
            <UserDetailDrawer
              user={selectedUser}
              onClose={handleClose}
              onPrev={handlePrev}
              onNext={handleNext}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex < rows.length - 1}
              currentIndex={selectedIndex}
              total={rows.length}
              workspaceId={workspaceId}
              onSuspend={handleSuspend}
              onReactivate={handleReactivate}
              suspendLoading={suspendState.isLoading}
              reactivateLoading={reactivateState.isLoading}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
