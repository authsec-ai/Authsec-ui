/**
 * TeamPage — Settings → Team. Rebuilt to the Console Refresh prototype
 * (`[data-cr]`): ConsolePage shell + ConsoleFilterBar + TableCard +
 * AdaptiveTable. Wired to the real membership hooks + mutations.
 */

import { useState, useMemo, useCallback } from "react";
import {
  Check,
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
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
import { toast } from "@/lib/toast";
import { resolveWorkspaceId } from "@/utils/workspace";

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

  // Status filter pills
  const statusFilters = useMemo(() => {
    const allItems = data?.items ?? [];
    return [
      { key: "all", label: "All statuses", count: allItems.length },
      { key: "active", label: "Active", count: allItems.filter((m) => m.status === "active").length },
      { key: "invited", label: "Invited", count: allItems.filter((m) => m.status === "invited").length },
      { key: "suspended", label: "Suspended", count: allItems.filter((m) => m.status === "suspended").length },
      { key: "left", label: "Left", count: allItems.filter((m) => m.status === "left").length },
    ];
  }, [data]);

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

  const columns = useMemo<AdaptiveColumn<TenantMembership>[]>(
    () => [
      {
        id: "member",
        header: "Member",
        alwaysVisible: true,
        approxWidth: 300,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="flex items-center gap-3">
              <span
                className="avatar"
                style={{ background: avatarBg(m) }}
              >
                {memberInitials(m)}
              </span>
              <EntityCell
                label={memberLabel(m)}
                detail={m.user_name && m.user_name !== "Not Provided" ? m.user_name : undefined}
              />
            </div>
          );
        },
      },
      {
        id: "type",
        header: "Type",
        priority: 1,
        approxWidth: 160,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <span className={`badge ${typeTone(m.membership_type)}`}>
              <span className="bdot" />
              {TYPE_LABEL[m.membership_type] ?? m.membership_type}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => {
          const m = row.original;
          const meta = statusMeta(m.status);
          return (
            <span className={`badge ${meta.tone}`}>
              <span className="bdot" />
              {meta.label}
            </span>
          );
        },
      },
      {
        id: "joined",
        header: "Joined",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="time-cell">{formatDate(row.original.joined_at)}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                items={[
                  {
                    label: "View details",
                    icon: <UserCog className="size-4" />,
                    onSelect: () => setSelected(m),
                  },
                  ...(m.status === "suspended"
                    ? [
                        {
                          label: "Reactivate",
                          icon: <ShieldCheck className="size-4" />,
                          onSelect: () => handleReactivate(m.user_id),
                        },
                      ]
                    : [
                        {
                          label: "Suspend",
                          icon: <ShieldOff className="size-4" />,
                          onSelect: () => handleSuspend(m.user_id),
                        },
                      ]),
                  {
                    label: "Remove",
                    icon: <Trash2 className="size-4" />,
                    destructive: true,
                    onSelect: () => setConfirmRemove(m),
                  },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [handleReactivate, handleSuspend],
  );

  if (!workspaceId) {
    return <div className="p-8 text-sm text-muted-foreground">No workspace selected.</div>;
  }

  return (
    <ConsolePage
      title="Team"
      description="Workspace operators and their access. To invite a new member, use the Invite Users flow."
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={(v) => setSearch(v)}
        searchPlaceholder="Search by email, name, or ID"
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={(v) => setStatusFilter(v as MembershipStatus | "all")}
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-3 size-7 text-slate-300" />
              <p className="text-sm font-medium text-foreground">
                {search.trim() || statusFilter !== "all" ? "No members match" : "No team members yet"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                {search.trim() || statusFilter !== "all"
                  ? "Try a different search term or clear the active filters."
                  : "Invite users to your workspace to give them operator access."}
              </p>
              {(search.trim() || statusFilter !== "all") && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSearch(""); setStatusFilter("all"); }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <AdaptiveTable
              tableId="team-members"
              data={rows}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              onRowClick={(r) => setSelected(r)}
              pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <p className="text-xs text-muted-foreground">{total} member{total === 1 ? "" : "s"} in this workspace.</p>

      {/* Detail drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" hideClose data-cr className="flex h-full flex-col overflow-hidden p-0 sm:max-w-110">
          <SheetTitle className="sr-only">
            {selected ? `${memberLabel(selected)} — team member` : "Team member"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Inspect this team member's role and access.
          </SheetDescription>
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
    </ConsolePage>
  );
}

export default TeamPage;
