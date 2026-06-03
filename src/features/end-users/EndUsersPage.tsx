import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  X,
  ChevronDown,
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

import { Sheet, SheetContent } from "@/components/ui/sheet";
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

const PAGE_SIZE = 10;

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

  // Only the scopes the user actually has access to (hide not_granted).
  const grantedScopes = (data?.scopes ?? []).filter((s) => s.status === "granted");

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
          {grantedScopes.length > 0 && (
            <div>
              <p className="drawer-section-label" style={{ marginBottom: 8 }}>
                Granted scopes · {grantedScopes.length}
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
          {data.roles.length === 0 && grantedScopes.length === 0 && (
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
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatus | "all">("all");
  const [page, setPage] = useState(1);
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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filtersActive = search.trim() !== "" || statusFilter !== "all";

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

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPage(1);
  };

  if (!workspaceId) {
    return <div className="p-8 text-sm text-muted-foreground">No workspace selected.</div>;
  }

  const showEmpty = !isLoading && pageRows.length === 0;

  return (
    <div data-cr>
      <div className="content-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">End Users</h1>
            <p className="page-desc">
              Consumers of this workspace's published Applications. They connect via OAuth — not
              workspace members.
            </p>
          </div>
        </div>

        <div className="filter-bar">
          <div className={cn("search", search && "has-value")}>
            <span className="search-ic">
              <Search className="icon" />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by email, name, or username"
              aria-label="Search end users"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="select">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as EndUserStatus | "all");
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <span className="chev">
              <ChevronDown className="icon-sm" />
            </span>
          </div>
        </div>

        {filtersActive && (
          <div className="chips">
            {statusFilter !== "all" && (
              <span className="chip">
                Status: {statusMeta(statusFilter).label}
                <button className="chip-x" aria-label="Remove filter" onClick={() => setStatusFilter("all")}>
                  <X className="icon-sm" />
                </button>
              </span>
            )}
            {search.trim() && (
              <span className="chip">
                "{search.trim()}"
                <button className="chip-x" aria-label="Remove filter" onClick={() => setSearch("")}>
                  <X className="icon-sm" />
                </button>
              </span>
            )}
            <button className="chip-clear" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        )}

        <div className="table-card">
          {isLoading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk sk-avatar" />
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                    <span className="sk sk-line" style={{ width: "42%" }} />
                    <span className="sk sk-line" style={{ width: "22%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 28, margin: "0 56px 0 40px" }} />
                  <span className="sk sk-line" style={{ width: 52 }} />
                </div>
              ))}
            </div>
          ) : showEmpty ? (
            <div className="empty">
              <span className="empty-ic">
                <Users className="icon-lg" />
              </span>
              <h3 className="empty-title">{filtersActive ? "No matching users" : "No end users yet"}</h3>
              <p className="empty-desc">
                {filtersActive
                  ? "Try a different search term or clear the active filters."
                  : "When someone authorizes one of this workspace's Applications via OAuth, they'll appear here."}
              </p>
              <button className="btn btn-secondary" onClick={filtersActive ? clearFilters : () => navigate("/developer/sdk-guides")}>
                {filtersActive ? "Clear filters" : "View SDK guides"}
              </button>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th className="num th-apps">Apps</th>
                    <th className="th-lastactive">Last active</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((u) => {
                    const apps = u.applications_count ?? u.applications?.length ?? 0;
                    return (
                      <tr
                        key={u.user_id}
                        tabIndex={0}
                        data-selected={selectedUser?.user_id === u.user_id}
                        onClick={() => setSelectedUser(u)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelectedUser(u);
                        }}
                      >
                        <td>
                          <div className="user-cell">
                            <span className="avatar" style={{ background: avatarBg(u) }}>
                              {userInitials(u)}
                            </span>
                            <span className="user-meta">
                              <span className="user-email">{userLabel(u)}</span>
                              <span className="user-name">@{u.user_username ?? u.user_id}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusPill status={u.status} />
                        </td>
                        <td className={cn("num-cell col-apps", apps === 0 && "zero")}>{apps}</td>
                        <td className="col-lastactive">
                          <span className="time-cell" title={formatDateTime(u.last_seen_at)}>
                            {formatRelativeTime(u.last_seen_at)}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              aria-label="Row actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUser(u);
                              }}
                            >
                              <MoreHorizontal className="icon" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="table-foot">
                <span className="foot-count">
                  Showing <b>{(safePage - 1) * PAGE_SIZE + 1}</b>–<b>{(safePage - 1) * PAGE_SIZE + pageRows.length}</b> of{" "}
                  <b>{total}</b> entries
                  {filtersActive ? " · filtered" : ""}
                </span>
                <div className="pager">
                  <span className="pager-label">Page</span>
                  <div className="pager-btns">
                    <button
                      className="pager-btn"
                      aria-label="Previous page"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="icon-sm" />
                    </button>
                    <span className="pager-label mono">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      className="pager-btn"
                      aria-label="Next page"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight className="icon-sm" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="workspace-foot">
          {total} end user{total === 1 ? "" : "s"} in this workspace.
        </p>
      </div>

      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent
          side="right"
          data-cr
          className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110"
        >
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
    </div>
  );
}
