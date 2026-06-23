import { useMemo, useState, useCallback } from "react";
import {
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
  AlertTriangle,
  Layers,
  KeyRound,
  Clock,
  Calendar,
  Plus,
} from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import { TableCard } from "@/theme/components/cards";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { resolveWorkspaceId } from "@/utils/workspace";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AV_GRADIENTS = [
  "linear-gradient(150deg,#22c55e,#16a34a)",
  "linear-gradient(150deg,#f59e0b,#d97706)",
  "linear-gradient(150deg,#6366f1,#4f46e5)",
  "linear-gradient(150deg,#ec4899,#db2777)",
  "linear-gradient(150deg,#06b6d4,#0891b2)",
  "linear-gradient(150deg,#8b5cf6,#7c3aed)",
];

function userLabel(user: TenantEndUserState): string {
  return user.user_email ?? user.user_username ?? user.user_id;
}

function userInitials(user: TenantEndUserState): string {
  const label = userLabel(user);
  const parts = label.split(/[@.\s]/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

function avatarBg(user: TenantEndUserState): string {
  const key = userLabel(user);
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return AV_GRADIENTS[sum % AV_GRADIENTS.length];
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "never";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
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

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const STATUS_META: Record<string, { cls: string; label: string }> = {
  active: { cls: "active", label: "Active" },
  suspended: { cls: "suspended", label: "Suspended" },
  invited: { cls: "invited", label: "Invited" },
  pending: { cls: "pending", label: "Pending" },
};

function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      cls: "pending",
      label: status.charAt(0).toUpperCase() + status.slice(1),
    }
  );
}

function StatusPill({ status }: { status: EndUserStatus | "invited" }) {
  const m = statusMeta(status);
  return (
    <span className={cn("status", m.cls)}>
      <span className="dot" />
      {m.label}
    </span>
  );
}

// ─── Access section (preserved role/scope management) ──────────────────────────

function UserAccessSection({ user }: { user: TenantEndUserState }) {
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
    { skip: !effectiveAppId },
  );

  // Split effective scopes: granted (risk-colored) vs not granted (plain).
  const grantedScopes = (data?.scopes ?? []).filter((s) => s.status === "granted");
  const ungrantedScopes = (data?.scopes ?? []).filter((s) => s.status !== "granted");

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
      <p className="detail-v" style={{ color: "var(--color-text-subtle)", fontWeight: 400 }}>
        No application access yet. Assign a role to grant access.
      </p>
    );
  }

  return (
    <div className="space-y-3">
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

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : data ? (
        <>
          {data.roles.length > 0 && (
            <div>
              <p className="drawer-section-label" style={{ marginBottom: 8 }}>
                Roles
              </p>
              {data.roles.map((role) => {
                const isPending = pendingRemoveId === role.binding_id;
                return (
                  <div key={role.id} className="app-row">
                    <span className="app-icon">
                      <KeyRound className="icon-sm" />
                    </span>
                    <span className="app-info">
                      <div className="app-name">{role.label}</div>
                      <div className="app-scope">{role.name}</div>
                    </span>
                    <button
                      className="icon-btn"
                      style={{ width: 30, height: 30 }}
                      onClick={() => handleRemoveRole(role.binding_id, role.label)}
                      disabled={removing && isPending}
                      aria-label={`Remove ${role.label}`}
                    >
                      <Trash2 className="icon-sm" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {data.scopes.length > 0 && (
            <div>
              <p className="drawer-section-label" style={{ marginBottom: 8 }}>
                Scopes
              </p>
              {grantedScopes.length > 0 && (
                <div style={{ marginBottom: ungrantedScopes.length > 0 ? 12 : 0 }}>
                  <p style={{ fontSize: 12, color: "var(--color-text-subtle)", margin: "0 0 6px" }}>
                    Granted · {grantedScopes.length}
                  </p>
                  <div className="scope-chips">
                    {grantedScopes.map((scope) => (
                      <span key={scope.id} className="scope-chip">
                        <span className={cn("rdot", scope.risk_level)} />
                        {scope.scope_string}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {ungrantedScopes.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, color: "var(--color-text-subtle)", margin: "0 0 6px" }}>
                    Not granted · {ungrantedScopes.length}
                  </p>
                  <div className="scope-chips">
                    {ungrantedScopes.map((scope) => (
                      <span key={scope.id} className="scope-chip" style={{ color: "var(--color-text-subtle)" }}>
                        {scope.scope_string}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {data.roles.length === 0 && data.scopes.length === 0 && (
            <p className="detail-v" style={{ color: "var(--color-text-subtle)", fontWeight: 400 }}>
              No roles or scopes assigned for this application.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── Detail drawer ─────────────────────────────────────────────────────────────

function UserDetailDrawer({
  user,
  onSuspend,
  onReactivate,
  suspendLoading,
  reactivateLoading,
}: {
  user: TenantEndUserState;
  onSuspend: (userId: string) => void;
  onReactivate: (userId: string) => void;
  suspendLoading: boolean;
  reactivateLoading: boolean;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const m = statusMeta(user.status);

  // A user may hold multiple roles on one app — that's still one app, not N.
  // Dedupe by application_id so the list and count don't show the app twice
  // (trust this over the backend's per-binding count).
  const apps = useMemo(() => {
    const seen = new Map<string, NonNullable<TenantEndUserState["applications"]>[number]>();
    (user.applications ?? []).forEach((a) => {
      if (!seen.has(a.application_id)) seen.set(a.application_id, a);
    });
    return Array.from(seen.values());
  }, [user.applications]);

  return (
    <div className="drawer-cr flex h-full flex-col" style={{ background: "var(--color-surface-raised)" }}>
      <div className="drawer-head">
        <div className="drawer-head-top">
          <span className={cn("status", m.cls)}>
            <span className="dot" />
            {m.label}
          </span>
          {/* Sheet renders its own close button */}
        </div>
        <div className="drawer-id-row">
          <span className="avatar" style={{ background: avatarBg(user) }}>
            {userInitials(user)}
          </span>
          <div className="drawer-identity">
            <div className="drawer-email">{userLabel(user)}</div>
            <div className="drawer-username">@{user.user_username ?? user.user_id}</div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className="btn btn-secondary" style={{ height: 34, padding: "0 12px" }} onClick={() => setAssignOpen(true)}>
            <Plus className="icon-sm" /> Assign role
          </button>
          {user.status === "active" ? (
            <button
              className="btn btn-secondary"
              style={{ height: 34, padding: "0 12px" }}
              onClick={() => onSuspend(user.user_id)}
              disabled={suspendLoading}
            >
              <ShieldOff className="icon-sm" /> Suspend
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              style={{ height: 34, padding: "0 12px" }}
              onClick={() => onReactivate(user.user_id)}
              disabled={reactivateLoading}
            >
              <ShieldCheck className="icon-sm" /> Reactivate
            </button>
          )}
        </div>
      </div>

      <div className="drawer-body">
        {user.status === "suspended" && (
          <div className="banner banner--triage" style={{ marginBottom: "var(--space-6)" }}>
            <span className="bn-icon">
              <AlertTriangle className="icon" />
            </span>
            <div className="bn-body">
              <p className="bn-title">Account suspended</p>
              {user.suspended_at && (
                <p className="bn-sub">
                  Suspended {formatRelativeTime(user.suspended_at)} · {formatDate(user.suspended_at)}
                </p>
              )}
              {user.suspended_reason && <p className="bn-sub">"{user.suspended_reason}"</p>}
            </div>
          </div>
        )}

        <div className="drawer-section">
          <p className="drawer-section-label">Profile</p>
          <div className="detail-grid">
            <div className="detail">
              <span className="detail-k">Username</span>
              <span className="detail-v mono">@{user.user_username ?? user.user_id}</span>
            </div>
            <div className="detail">
              <span className="detail-k">Status</span>
              <span className="detail-v">{m.label}</span>
            </div>
            <div className="detail full">
              <span className="detail-k">User ID</span>
              <span className="detail-v mono">{user.user_id}</span>
            </div>
            <div className="detail">
              <span className="detail-k">
                <Calendar className="icon-sm" style={{ display: "inline", marginRight: 4 }} /> First consent
              </span>
              <span className="detail-v">{formatDate(user.first_consent_at)}</span>
            </div>
            <div className="detail">
              <span className="detail-k">
                <Clock className="icon-sm" style={{ display: "inline", marginRight: 4 }} /> Last active
              </span>
              <span className="detail-v">{formatDateTime(user.last_seen_at)}</span>
            </div>
          </div>
        </div>

        <div className="drawer-section">
          <p className="drawer-section-label">
            Authorized applications · {apps.length}
          </p>
          {apps.length ? (
            apps.map((app) => (
              <div className="app-row" key={app.application_id}>
                <span className="app-icon">
                  <Layers className="icon-sm" />
                </span>
                <span className="app-info">
                  <div className="app-name">{app.name}</div>
                  {app.resource_uri && <div className="app-scope">{app.resource_uri}</div>}
                </span>
              </div>
            ))
          ) : (
            <p className="detail-v" style={{ color: "var(--color-text-subtle)", fontWeight: 400 }}>
              No authorized applications yet.
            </p>
          )}
        </div>

        <div className="drawer-section">
          <p className="drawer-section-label">Access</p>
          <UserAccessSection user={user} />
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

  const { data, isLoading } = useListEndUsersQuery(
    {
      workspaceId: workspaceId ?? "",
      status: statusFilter === "all" ? undefined : statusFilter,
      q: search.trim() || undefined,
    },
    { skip: !workspaceId },
  );

  const [suspend, suspendState] = useSuspendEndUserMutation();
  const [reactivate, reactivateState] = useReactivateEndUserMutation();

  const rows: TenantEndUserState[] = useMemo(() => data?.items ?? [], [data]);
  const total = rows.length;

  const statusFilters = useMemo(() => {
    const all = data?.items ?? [];
    const active = all.filter((u) => u.status === "active").length;
    const suspended = all.filter((u) => u.status === "suspended").length;
    return [
      { key: "all", label: "All", count: all.length },
      { key: "active", label: "Active", count: active },
      { key: "suspended", label: "Suspended", count: suspended },
    ];
  }, [data]);

  const handleSuspend = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await suspend({ workspaceId, userId, reason: "Manual suspension" }).unwrap();
        toast.success("User suspended — active sessions terminated.");
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to suspend");
      }
    },
    [workspaceId, suspend],
  );

  const handleReactivate = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await reactivate({ workspaceId, userId }).unwrap();
        toast.success("User reactivated.");
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to reactivate");
      }
    },
    [workspaceId, reactivate],
  );

  const columns = useMemo<AdaptiveColumn<TenantEndUserState>[]>(
    () => [
      {
        id: "user",
        header: "User",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex items-center gap-3">
              <span className="avatar shrink-0" style={{ background: avatarBg(u) }}>
                {userInitials(u)}
              </span>
              <EntityCell
                label={userLabel(u)}
                detail={`@${u.user_username ?? u.user_id}`}
                monoDetail
              />
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: "apps",
        header: "Apps",
        priority: 3,
        approxWidth: 80,
        cell: ({ row }) => {
          const count = row.original.applications_count ?? row.original.applications?.length ?? 0;
          return (
            <span className={cn("num-cell col-apps text-xs tabular-nums text-muted-foreground", count === 0 && "zero")}>
              {count}
            </span>
          );
        },
      },
      {
        id: "lastActive",
        header: "Last active",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => (
          <span
            className="time-cell text-xs text-muted-foreground"
            title={formatDateTime(row.original.last_seen_at)}
          >
            {formatRelativeTime(row.original.last_seen_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                items={[
                  {
                    label: "View details",
                    onSelect: () => setSelectedUser(u),
                  },
                  u.status === "active"
                    ? {
                        label: "Suspend",
                        icon: <ShieldOff className="size-4" />,
                        onSelect: () => handleSuspend(u.user_id),
                        disabled: suspendState.isLoading,
                      }
                    : {
                        label: "Reactivate",
                        icon: <ShieldCheck className="size-4" />,
                        onSelect: () => handleReactivate(u.user_id),
                        disabled: reactivateState.isLoading,
                      },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [handleSuspend, handleReactivate, suspendState.isLoading, reactivateState.isLoading],
  );

  if (!workspaceId) {
    return <div className="p-8 text-sm text-muted-foreground">No workspace selected.</div>;
  }

  return (
    <ConsolePage
      title="End Users"
      description="Consumers of this workspace's published Applications. They connect via OAuth — not workspace members."
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
        }}
        searchPlaceholder="Search by email, name, or username"
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={(v) => setStatusFilter(v as EndUserStatus | "all")}
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {search || statusFilter !== "all" ? "No matching users" : "No end users yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {search || statusFilter !== "all"
                  ? "Try a different search term or clear the active filters."
                  : "When someone authorizes one of this workspace's Applications via OAuth, they'll appear here."}
              </p>
              {!search && statusFilter === "all" && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open("https://docs.authsec.dev/getting-started", "_blank")}
                  >
                    View docs
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="end-users-inventory"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.user_id}
              onRowClick={(row) => setSelectedUser(row.original)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent
          side="right"
          data-cr
          className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110"
        >
          <SheetTitle className="sr-only">
            {selectedUser ? `${userLabel(selectedUser)} — user details` : "User details"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Inspect this end-user's identity, sessions, and access.
          </SheetDescription>
          {selectedUser && (
            <UserDetailDrawer
              user={selectedUser}
              onSuspend={handleSuspend}
              onReactivate={handleReactivate}
              suspendLoading={suspendState.isLoading}
              reactivateLoading={reactivateState.isLoading}
            />
          )}
        </SheetContent>
      </Sheet>

      <p className="workspace-foot">
        {total} end user{total === 1 ? "" : "s"} in this workspace.
      </p>
    </ConsolePage>
  );
}
