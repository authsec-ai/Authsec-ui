import React, { useMemo, useState, useCallback } from "react";
import {
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
import { AssignRoleWizard } from "@/features/access/AssignRoleWizard";
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
import {
  SectionNav,
  CollapsibleSection,
  DrawerPrevNext,
} from "@/components/primitives";

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
    return `${days} day${days === 1 ? "" : "s"} ago`;
  } catch {
    return "—";
  }
}

const SECTION_NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "access", label: "Access" },
  { id: "sessions", label: "Sessions" },
  { id: "activity", label: "Activity" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: EndUserStatus | "invited" }> = ({ status }) => {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
        Active
      </span>
    );
  }
  if (status === "invited") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
        Invited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700">
      <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
      Suspended
    </span>
  );
};

// ─── Right-panel access section ───────────────────────────────────────────────

function UserAccessSection({
  user,
  workspaceId,
}: {
  user: TenantEndUserState;
  workspaceId: string;
}) {
  const applications = user.applications ?? [];
  const [selectedAppId, setSelectedAppId] = useState(applications[0]?.application_id ?? "");
  const effectiveAppId = selectedAppId || applications[0]?.application_id || "";

  const { data, isLoading } = useGetApplicationEffectiveAccessQuery(
    { applicationId: effectiveAppId, userId: user.user_id },
    { skip: !effectiveAppId }
  );

  const [deleteBinding, { isLoading: removing }] = useDeleteBindingMutation();
  const [pendingRemoveBindingId, setPendingRemoveBindingId] = useState<string | null>(null);

  const handleRemoveRole = useCallback(
    async (bindingId: string | undefined, roleLabel: string) => {
      if (!bindingId) {
        toast.error("This role can't be removed from here — open the role to manage it.");
        return;
      }
      if (
        !window.confirm(
          `Remove "${roleLabel}" from ${userLabel(user)}? Active sessions for this app will be terminated.`,
        )
      ) {
        return;
      }
      setPendingRemoveBindingId(bindingId);
      try {
        await deleteBinding(bindingId).unwrap();
        toast.success(`${roleLabel} removed. The user has been signed out of connected apps.`);
      } catch (err: any) {
        toast.error(err?.data?.error ?? "Failed to remove role.");
      } finally {
        setPendingRemoveBindingId(null);
      }
    },
    [deleteBinding, user],
  );

  if (applications.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">
        No application access. Assign a role to grant access.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* App selector */}
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : data ? (
        <div className="space-y-3">
          {/* Roles */}
          {data.roles.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wide mb-1">Roles</p>
              <div className="divide-y rounded-md border">
                {data.roles.map((role) => {
                  const isPending = pendingRemoveBindingId === role.binding_id;
                  return (
                    <div key={role.id} className="flex items-center justify-between px-3 py-2 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{role.label}</p>
                        <p className="text-xs text-slate-500 font-mono truncate">{role.name}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${role.label}`}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                        onClick={() => handleRemoveRole(role.binding_id, role.label)}
                        disabled={removing && isPending}
                      >
                        <Trash2 className="h-4 w-4" />
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
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wide mb-1">
                Scopes ({data.scopes.length})
              </p>
              <div className="divide-y rounded-md border">
                {data.scopes.map((scope) => (
                  <div key={scope.id} className="flex items-center justify-between px-3 py-2 gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono truncate">{scope.scope_string}</p>
                      <p className="text-xs text-slate-500">{scope.display_name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={scope.status === "granted" ? "default" : "outline"}
                        className="text-xs"
                      >
                        {scope.status === "granted" ? "Granted" : "Not granted"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {scope.risk_level}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No data available.</p>
      )}
    </div>
  );
}

// ─── Right panel ──────────────────────────────────────────────────────────────

function UserDetailPanel({
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
  const [activeSection] = useState("overview");
  const [assignOpen, setAssignOpen] = useState(false);
  const appCount = user.applications_count ?? user.applications?.length ?? 0;
  const scopeCount = user.effective_scopes_count ?? 0;

  return (
    <>
      {/* Sticky header — SheetHeader handles a11y title; close button is
          provided by SheetContent's own SheetClose so we don't render one. */}
      <SheetHeader className="sticky top-0 z-20 bg-white border-b px-4 py-3 shrink-0 gap-2">
        {/* Row 1: prev/next + email (Sheet's close X sits to the right) */}
        <div className="flex items-center gap-3 pr-8">
          <DrawerPrevNext
            onPrev={onPrev}
            onNext={onNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            currentIndex={currentIndex}
            total={total}
          />
          <SheetTitle className="text-sm font-semibold text-slate-900 truncate flex-1 text-center">
            {userLabel(user)}
          </SheetTitle>
        </div>

        {/* Row 2: status line */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <StatusBadge status={user.status} />
          <span>·</span>
          <span>Last seen {formatRelativeTime(user.last_seen_at)}</span>
        </div>

        {/* Row 3: actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setAssignOpen(true)}
          >
            + Assign role
          </Button>
          {user.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
              onClick={() => onSuspend(user.user_id)}
              disabled={suspendLoading}
            >
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
              onClick={() => onReactivate(user.user_id)}
              disabled={reactivateLoading}
            >
              Reactivate
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-xs">Force logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetHeader>

      {/* Section nav */}
      <SectionNav sections={SECTION_NAV_ITEMS} activeId={activeSection} />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview */}
        <CollapsibleSection id="overview" title="Overview" defaultOpen={true}>
          {appCount === 0 ? (
            // Intentional empty state. Three "0" tiles next to a blank Status
            // tile read as "this view failed to render" rather than "this user
            // hasn't consented yet" — which is the real story for a brand-new
            // end user.
            <div className="rounded-md border border-dashed px-4 py-5 text-center">
              <ShieldCheck className="mx-auto h-5 w-5 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                No application access yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                This user hasn't consented to any of your apps. Assign a role to
                grant access.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold text-slate-900">{appCount}</p>
                <p className="text-xs text-slate-500">Applications</p>
              </div>
              <div className="rounded-md border p-3 text-center">
                <p className="text-lg font-semibold text-slate-900">{scopeCount}</p>
                <p className="text-xs text-slate-500">Eff. Scopes</p>
              </div>
              <div className="rounded-md border p-3 flex flex-col items-center justify-center gap-1">
                <StatusBadge status={user.status} />
                <p className="text-xs text-slate-500">Status</p>
              </div>
            </div>
          )}

          {/* MFA status placeholder */}
          <div className="mt-3 flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-xs text-slate-600">MFA</span>
            <Badge variant="outline" className="text-xs">Unknown</Badge>
          </div>

          {/* Risk warning */}
          {scopeCount > 5 && (
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              This user has {scopeCount} effective scopes. Review critical grants.
            </div>
          )}
        </CollapsibleSection>

        {/* Access */}
        <CollapsibleSection
          id="access"
          title="Access"
          defaultOpen={true}
          badge={appCount}
        >
          <UserAccessSection user={user} workspaceId={workspaceId} />
        </CollapsibleSection>

        {/* Sessions */}
        <CollapsibleSection id="sessions" title="Sessions" defaultOpen={false}>
          <div className="text-center py-6 text-sm text-slate-500">
            <p>Session history coming soon.</p>
            <p className="mt-1 text-xs text-slate-400">
              After deploying with Force Logout support, active sessions will appear here.
            </p>
          </div>
        </CollapsibleSection>

        {/* Activity */}
        <CollapsibleSection id="activity" title="Activity" defaultOpen={false}>
          <div className="text-center py-6 text-sm text-slate-500">
            Activity log coming soon.
          </div>
        </CollapsibleSection>
      </div>

      <AssignRoleWizard
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        preselectedUserId={user.user_id}
      />
    </>
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
      await suspend({ workspaceId, userId, reason: "Manual suspension via End Users page" }).unwrap();
      toast.success("End user suspended");
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast.error(err?.data?.error ?? "Failed to suspend");
    }
  }, [workspaceId, suspend]);

  const handleReactivate = useCallback(async (userId: string) => {
    if (!workspaceId) return;
    try {
      await reactivate({ workspaceId, userId }).unwrap();
      toast.success("End user reactivated");
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      toast.error(err?.data?.error ?? "Failed to reactivate");
    }
  }, [workspaceId, reactivate]);

  const handleSelectRow = useCallback(
    (user: TenantEndUserState, index: number) => {
      setSelectedUser(user);
      // Guard against undefined / NaN index from the table layer. The table
      // sometimes hands us a non-finite number (e.g. when triggered from a
      // dropdown action rather than a row click) and that propagates into
      // DrawerPrevNext as "NaN of 1". Fall back to a linear lookup.
      const safeIndex = Number.isFinite(index)
        ? index
        : rows.findIndex((r) => r.user_id === user.user_id);
      setSelectedIndex(safeIndex >= 0 ? safeIndex : 0);
    },
    [rows],
  );

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      const newIdx = selectedIndex - 1;
      setSelectedIndex(newIdx);
      setSelectedUser(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  const handleNext = useCallback(() => {
    if (selectedIndex < rows.length - 1) {
      const newIdx = selectedIndex + 1;
      setSelectedIndex(newIdx);
      setSelectedUser(rows[newIdx]);
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
              <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-semibold shrink-0">
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
          return <span className="text-sm text-slate-700">{count > 0 ? count : "—"}</span>;
        },
      },
      {
        id: "lastActivity",
        header: "Last active",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-sm text-slate-500">
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
                onClick={() => handleSelectRow(row.original, row.index)}
              >
                View details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {row.original.status === "active" ? (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => handleSuspend(row.original.user_id)}
                  disabled={suspendState.isLoading}
                >
                  <ShieldOff className="mr-2 h-3.5 w-3.5" />
                  Suspend
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => handleReactivate(row.original.user_id)}
                  disabled={reactivateState.isLoading}
                >
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                  Reactivate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs text-slate-500">Force logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [handleSelectRow, handleSuspend, handleReactivate, suspendState.isLoading, reactivateState.isLoading]
  );

  if (!workspaceId) {
    return (
      <div className="p-8">
        <p className="text-slate-500 text-sm">
          No tenant selected. Switch to a tenant to manage end users.
        </p>
      </div>
    );
  }

  // Empty state
  if (!isLoading && rows.length === 0) {
    return (
      <>
        <PageHeader
          title="End Users"
          description="Consumers of this workspace's published Applications."
        />
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No end users yet</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">
            Once a public user connects to one of your Applications via OAuth, they'll appear here.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="End Users"
        description="Consumers of this workspace's published Applications. These are not members; they connect to your AI agents, MCP servers, or web apps via OAuth."
      />

      {/* Table — full width. Detail panel slides in over it as a Sheet. */}
      <div className="h-[calc(100vh-var(--page-header-height,140px))] overflow-hidden">
        <div className="flex h-full flex-col overflow-auto">
          <div className="space-y-4 p-6">
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
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
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
                  <div className="py-16 text-center text-sm text-slate-500">
                    Loading end users...
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
                        selectedUser?.user_id === row.user_id && "bg-slate-50"
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

            <div className="text-xs text-slate-500">
              {rows.length} end user{rows.length === 1 ? "" : "s"} in this workspace.
            </div>
          </div>
        </div>

      </div>

      {/* Detail panel — slides in over the table on row click. */}
      <Sheet
        open={!!selectedUser}
        onOpenChange={(open) => {
          if (!open) setSelectedUser(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl lg:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col"
        >
          {selectedUser && (
            <UserDetailPanel
              user={selectedUser}
              onClose={() => setSelectedUser(null)}
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
