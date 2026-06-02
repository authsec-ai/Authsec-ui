/**
 * TeamPage — Settings → Team. Rebuilt to the Console Refresh prototype
 * (`[data-cr]`): page-head + filter bar + bespoke members table + Sheet detail
 * drawer. Wired to the real membership hooks + mutations.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";

import {
  useListMembersQuery,
  useUpdateMembershipMutation,
  useDeleteMembershipMutation,
  type MembershipType,
  type MembershipStatus,
  type TenantMembership,
} from "@/app/api/membershipApi";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { resolveWorkspaceId } from "@/utils/workspace";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;
const AV = [
  "linear-gradient(150deg,#22c55e,#16a34a)",
  "linear-gradient(150deg,#f59e0b,#d97706)",
  "linear-gradient(150deg,#6366f1,#4f46e5)",
  "linear-gradient(150deg,#ec4899,#db2777)",
  "linear-gradient(150deg,#06b6d4,#0891b2)",
  "linear-gradient(150deg,#8b5cf6,#7c3aed)",
];

const MEMBERSHIP_TYPES: MembershipType[] = [
  "owner",
  "admin",
  "member",
  "contractor",
  "service_operator",
  "readonly_auditor",
];

const TYPE_LABEL: Record<MembershipType, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  contractor: "Contractor",
  service_operator: "Service operator",
  readonly_auditor: "Read-only auditor",
};

const CAPABILITY_DESCRIPTIONS: Record<MembershipType, string> = {
  owner: "Full workspace control including billing and deletion",
  admin: "Manage users, applications, and workspace settings",
  member: "Access assigned applications and view workspace data",
  contractor: "Limited temporary access to assigned resources",
  service_operator: "Programmatic access for service accounts",
  readonly_auditor: "Read-only access to audit logs and reports",
};

const STATUS_META: Record<string, { tone: string; label: string }> = {
  active: { tone: "badge--success", label: "Active" },
  invited: { tone: "badge--info", label: "Invited" },
  suspended: { tone: "badge--danger", label: "Suspended" },
  left: { tone: "badge--muted", label: "Left" },
};

function typeTone(t: MembershipType): string {
  if (t === "owner") return "badge--info";
  if (t === "admin") return "badge--info";
  return "badge--muted";
}

function memberLabel(m: TenantMembership): string {
  return m.user_email ?? m.user_username ?? m.user_id;
}
function memberInitials(m: TenantMembership): string {
  const label = memberLabel(m);
  const parts = label.split(/[@.\s]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}
function avatarBg(m: TenantMembership): string {
  const key = memberLabel(m);
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  return AV[sum % AV.length];
}
function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}
function statusMeta(s: string) {
  return STATUS_META[s] ?? { tone: "badge--muted", label: s.charAt(0).toUpperCase() + s.slice(1) };
}

export function TeamPage() {
  const workspaceId = resolveWorkspaceId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TenantMembership | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<TenantMembership | null>(null);

  const { data, isLoading } = useListMembersQuery(
    { workspaceId: workspaceId ?? "", status: statusFilter === "all" ? undefined : statusFilter },
    { skip: !workspaceId },
  );
  const [update] = useUpdateMembershipMutation();
  const [del] = useDeleteMembershipMutation();

  const allRows = useMemo<TenantMembership[]>(() => data?.items ?? [], [data]);
  const rows = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter((m) =>
      [m.user_email, m.user_name, m.user_username, m.user_id, m.external_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [allRows, search]);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersActive = search.trim() !== "" || statusFilter !== "all";

  const handleSuspend = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await update({ workspaceId, userId, status: "suspended" }).unwrap();
        toast.success("Member suspended");
      } catch (e: unknown) {
        toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to suspend");
      }
    },
    [workspaceId, update],
  );
  const handleReactivate = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await update({ workspaceId, userId, status: "active" }).unwrap();
        toast.success("Member reactivated");
      } catch (e: unknown) {
        toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to reactivate");
      }
    },
    [workspaceId, update],
  );
  const handleRemove = useCallback(
    async (m: TenantMembership) => {
      if (!workspaceId) return;
      try {
        await del({ workspaceId, userId: m.user_id }).unwrap();
        toast.success("Member removed");
        if (selected?.id === m.id) setSelected(null);
        setConfirmRemove(null);
      } catch (e: unknown) {
        toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to remove member");
      }
    },
    [workspaceId, del, selected],
  );
  const handleChangeType = useCallback(
    async (userId: string, membership_type: MembershipType) => {
      if (!workspaceId) return;
      try {
        await update({ workspaceId, userId, membership_type }).unwrap();
        toast.success(`Member type changed to ${TYPE_LABEL[membership_type]}`);
      } catch (e: unknown) {
        toast.error((e as { data?: { error?: string } })?.data?.error ?? "Failed to change type");
      }
    },
    [workspaceId, update],
  );

  if (!workspaceId) {
    return <div className="p-8 text-sm text-muted-foreground">No workspace selected.</div>;
  }

  const showEmpty = !isLoading && pageRows.length === 0;

  return (
    <div data-cr>
      <div className="content-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">Team</h1>
            <p className="page-desc">
              Workspace operators and their access. To invite a new member, use the Invite Users flow.
            </p>
          </div>
        </div>

        <div className="filter-bar">
          <div className={cn("search", search && "has-value")}>
            <span className="search-ic"><Search className="icon" /></span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by email, name, or ID"
              aria-label="Search members"
            />
            <button className="clear-ic" aria-label="Clear search" onClick={() => setSearch("")}>
              <X className="icon-sm" />
            </button>
          </div>
          <div className="select">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as MembershipStatus | "all"); setPage(1); }}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
              <option value="left">Left</option>
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
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
            <button className="chip-clear" onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}>
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
                    <span className="sk sk-line" style={{ width: "24%", height: 9 }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 80, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999, margin: "0 40px" }} />
                  <span className="sk sk-line" style={{ width: 60 }} />
                </div>
              ))}
            </div>
          ) : showEmpty ? (
            <div className="empty">
              <span className="empty-ic"><Users className="icon-lg" /></span>
              <h3 className="empty-title">{filtersActive ? "No members match" : "No team members yet"}</h3>
              <p className="empty-desc">
                {filtersActive
                  ? "Try a different search term or clear the active filters."
                  : "Invite users to your workspace to give them operator access."}
              </p>
              {filtersActive && (
                <button className="btn btn-secondary" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th className="th-lastactive">Joined</th>
                    <th className="th-actions" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((m) => (
                    <tr
                      key={m.id}
                      tabIndex={0}
                      data-selected={selected?.id === m.id}
                      onClick={() => setSelected(m)}
                      onKeyDown={(e) => { if (e.key === "Enter") setSelected(m); }}
                    >
                      <td>
                        <div className="user-cell">
                          <span className="avatar" style={{ background: avatarBg(m) }}>{memberInitials(m)}</span>
                          <span className="user-meta">
                            <span className="user-email">{memberLabel(m)}</span>
                            {m.user_name && m.user_name !== "Not Provided" && (
                              <span className="user-name" style={{ fontFamily: "var(--font-family-sans)" }}>{m.user_name}</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${typeTone(m.membership_type)}`}>
                          <span className="bdot" />
                          {TYPE_LABEL[m.membership_type] ?? m.membership_type}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${statusMeta(m.status).tone}`}>
                          <span className="bdot" />
                          {statusMeta(m.status).label}
                        </span>
                      </td>
                      <td className="col-lastactive">
                        <span className="time-cell">{formatDate(m.joined_at)}</span>
                      </td>
                      <td>
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="icon-btn" aria-label="Member actions">
                                <MoreHorizontal className="icon" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
                              <DropdownMenuItem className="menu-item" onSelect={() => setSelected(m)}>
                                <span className="mi-ic"><UserCog className="icon-sm" /></span>
                                View details
                              </DropdownMenuItem>
                              {m.status === "suspended" ? (
                                <DropdownMenuItem className="menu-item" onSelect={() => handleReactivate(m.user_id)}>
                                  <span className="mi-ic"><ShieldCheck className="icon-sm" /></span>
                                  Reactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="menu-item" onSelect={() => handleSuspend(m.user_id)}>
                                  <span className="mi-ic"><ShieldOff className="icon-sm" /></span>
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              <div className="menu-sep" />
                              <DropdownMenuItem className="menu-item danger" onSelect={() => setConfirmRemove(m)}>
                                <span className="mi-ic"><Trash2 className="icon-sm" /></span>
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span className="foot-count">
                  Showing <b>{(safePage - 1) * PAGE_SIZE + 1}</b>–<b>{(safePage - 1) * PAGE_SIZE + pageRows.length}</b> of{" "}
                  <b>{total}</b> member{total === 1 ? "" : "s"}
                </span>
                <div className="pager">
                  <span className="pager-label">Page</span>
                  <div className="pager-btns">
                    <button className="pager-btn" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <X className="icon-sm" style={{ display: "none" }} />‹
                    </button>
                    <span className="pager-label mono">{safePage} / {totalPages}</span>
                    <button className="pager-btn" aria-label="Next page" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <p className="workspace-foot">{total} member{total === 1 ? "" : "s"} in this workspace.</p>
      </div>

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
          {selected && (
            <div className="flex h-full flex-col" style={{ background: "var(--color-surface-raised)" }}>
              <div className="drawer-head">
                <div className="drawer-head-top">
                  <span className={`badge ${statusMeta(selected.status).tone}`}>
                    <span className="bdot" />
                    {statusMeta(selected.status).label}
                  </span>
                  <button className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}>
                    <X className="icon" />
                  </button>
                </div>
                <div className="drawer-id-row">
                  <span className="avatar" style={{ background: avatarBg(selected) }}>{memberInitials(selected)}</span>
                  <div className="drawer-identity">
                    <div className="drawer-email">{memberLabel(selected)}</div>
                    <div className="drawer-username" style={{ fontFamily: "var(--font-family-sans)" }}>
                      {TYPE_LABEL[selected.membership_type] ?? selected.membership_type}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="btn btn-secondary" style={{ height: 34, padding: "0 12px" }}>
                        <UserCog className="icon-sm" /> Change type
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" data-cr className="min-w-56 p-1">
                      {MEMBERSHIP_TYPES.map((t) => (
                        <DropdownMenuItem key={t} className="menu-item" onSelect={() => handleChangeType(selected.user_id, t)}>
                          <span className="mi-ic">{selected.membership_type === t ? <Check className="icon-sm" /> : <UserCog className="icon-sm" />}</span>
                          {TYPE_LABEL[t]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {selected.status === "suspended" ? (
                    <button className="btn btn-secondary" style={{ height: 34, padding: "0 12px" }} onClick={() => handleReactivate(selected.user_id)}>
                      <ShieldCheck className="icon-sm" /> Reactivate
                    </button>
                  ) : (
                    <button className="btn btn-secondary" style={{ height: 34, padding: "0 12px" }} onClick={() => handleSuspend(selected.user_id)}>
                      <ShieldOff className="icon-sm" /> Suspend
                    </button>
                  )}
                </div>
              </div>
              <div className="drawer-body">
                <div className="drawer-section">
                  <p className="drawer-section-label">Overview</p>
                  <div className="detail-grid">
                    <div className="detail full">
                      <span className="detail-k">Email</span>
                      <span className="detail-v">{selected.user_email ?? "—"}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-k">Type</span>
                      <span className="detail-v">{TYPE_LABEL[selected.membership_type] ?? selected.membership_type}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-k">Status</span>
                      <span className="detail-v">{statusMeta(selected.status).label}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-k">Joined</span>
                      <span className="detail-v">{formatDate(selected.joined_at)}</span>
                    </div>
                    <div className="detail">
                      <span className="detail-k">Source</span>
                      <span className="detail-v">{selected.source ?? "—"}</span>
                    </div>
                    <div className="detail full">
                      <span className="detail-k">User ID</span>
                      <span className="detail-v mono">{selected.user_id}</span>
                    </div>
                  </div>
                </div>
                <div className="drawer-section">
                  <p className="drawer-section-label">Capabilities</p>
                  <p className="detail-v" style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>
                    {CAPABILITY_DESCRIPTIONS[selected.membership_type] ?? "—"}
                  </p>
                </div>
              </div>
              <div className="drawer-foot">
                <button className="btn btn-secondary" style={{ flex: 1, color: "var(--color-danger-text)" }} onClick={() => setConfirmRemove(selected)}>
                  <Trash2 className="icon-sm" /> Remove from workspace
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Remove confirm */}
      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent data-cr showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md">
          <div className="dialog" style={{ width: "100%" }}>
            <span className="dg-icon"><Trash2 className="icon" /></span>
            <DialogTitle className="dg-title">Remove member?</DialogTitle>
            <DialogDescription className="dg-desc">
              Their identity is preserved; only the workspace membership is removed. They lose operator
              access immediately.
            </DialogDescription>
            {confirmRemove && <div className="dg-target" style={{ fontFamily: "var(--font-family-sans)" }}>{memberLabel(confirmRemove)}</div>}
            <div className="dg-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => confirmRemove && handleRemove(confirmRemove)}>
                <Trash2 className="icon-sm" /> Remove member
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TeamPage;
