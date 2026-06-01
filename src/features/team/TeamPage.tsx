/**
 * TeamPage — Settings → Team (Phase I-J).
 *
 * Master-detail layout matching EndUsersPage pattern:
 *   Left 55%:  members table
 *   Right 45%: inline panel with CollapsibleSections when a member is selected
 *
 * APIs: useListMembersQuery, useUpdateMembershipMutation, useDeleteMembershipMutation
 *       from membershipApi.ts
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  MoreHorizontal,
  ShieldOff,
  ShieldCheck,
  Trash2,
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
import { PageHeader } from "@/components/layout/PageHeader";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SectionNav,
  CollapsibleSection,
  DrawerPrevNext,
} from "@/components/primitives";
import { toast } from "@/lib/toast";
import { resolveWorkspaceId } from "@/utils/workspace";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

function memberLabel(m: TenantMembership): string {
  return m.user_email ?? m.user_username ?? m.user_id;
}

function memberInitials(m: TenantMembership): string {
  const label = memberLabel(m);
  const parts = label.split(/[@.\s]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

const CAPABILITY_DESCRIPTIONS: Record<MembershipType, string> = {
  owner: "Full workspace control including billing and deletion",
  admin: "Manage users, applications, and workspace settings",
  member: "Access assigned applications and view workspace data",
  contractor: "Limited temporary access to assigned resources",
  service_operator: "Programmatic access for service accounts",
  readonly_auditor: "Read-only access to audit logs and reports",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: MembershipStatus }> = ({ status }) => {
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
  if (status === "suspended") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
      Left
    </span>
  );
};

// ─── Type badge ───────────────────────────────────────────────────────────────

const TypeBadge: React.FC<{ type: MembershipType }> = ({ type }) => {
  const label = type.replace(/_/g, " ");
  const variantMap: Record<MembershipType, "default" | "secondary" | "outline" | "destructive"> = {
    owner: "default",
    admin: "secondary",
    member: "outline",
    contractor: "outline",
    service_operator: "secondary",
    readonly_auditor: "outline",
  };
  return (
    <Badge variant={variantMap[type]} className="capitalize text-xs">
      {label}
    </Badge>
  );
};

// ─── Right panel ──────────────────────────────────────────────────────────────

const MEMBER_NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "capabilities", label: "Capabilities" },
  { id: "activity", label: "Activity" },
];

const MEMBERSHIP_TYPES: MembershipType[] = [
  "owner",
  "admin",
  "member",
  "contractor",
  "service_operator",
  "readonly_auditor",
];

function MemberDetailPanel({
  member,
  workspaceId,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  total,
  onSuspend,
  onReactivate,
  onRemove,
  onChangeType,
  suspendLoading,
  reactivateLoading,
}: {
  member: TenantMembership;
  workspaceId: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  total: number;
  onSuspend: (userId: string) => void;
  onReactivate: (userId: string) => void;
  onRemove: (userId: string) => void;
  onChangeType: (userId: string, type: MembershipType) => void;
  suspendLoading: boolean;
  reactivateLoading: boolean;
}) {
  const [activeSection] = useState("overview");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const label = memberLabel(member);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 shrink-0">
        {/* Row 1: nav + label + close */}
        <div className="flex items-center justify-between gap-3">
          <DrawerPrevNext
            onPrev={onPrev}
            onNext={onNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            currentIndex={currentIndex}
            total={total}
          />
          <p className="text-sm font-semibold text-slate-900 truncate flex-1 text-center">
            {label}
          </p>
          <button
            type="button"
            aria-label="Close member detail panel"
            onClick={onClose}
            className="inline-flex items-center justify-center h-7 w-7 rounded-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Row 2: status */}
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <StatusBadge status={member.status} />
          <span>·</span>
          <TypeBadge type={member.membership_type} />
        </div>

        {/* Row 3: actions */}
        <div className="mt-3 flex items-center gap-2">
          {/* Change type dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Change type
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {MEMBERSHIP_TYPES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  className={cn(
                    "text-xs capitalize",
                    t === member.membership_type && "font-semibold"
                  )}
                  onClick={() => onChangeType(member.user_id, t)}
                  disabled={t === member.membership_type}
                >
                  {t.replace(/_/g, " ")}
                  {t === member.membership_type && " (current)"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Suspend / Reactivate */}
          {member.status === "active" || member.status === "invited" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
              onClick={() => onSuspend(member.user_id)}
              disabled={suspendLoading}
            >
              Suspend
            </Button>
          ) : member.status === "suspended" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
              onClick={() => onReactivate(member.user_id)}
              disabled={reactivateLoading}
            >
              Reactivate
            </Button>
          ) : null}

          {/* Remove */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => setConfirmRemove(true)}
            aria-label="Remove member"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Section nav */}
      <SectionNav sections={MEMBER_NAV_ITEMS} activeId={activeSection} />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection id="overview" title="Overview" defaultOpen={true}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900 truncate max-w-[60%]">
                {member.user_email ?? "—"}
              </dd>
            </div>
            {member.user_name && member.user_name !== "Not Provided" && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Name</dt>
                <dd className="text-slate-700">{member.user_name}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Type</dt>
              <dd>
                <TypeBadge type={member.membership_type} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusBadge status={member.status} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Joined</dt>
              <dd className="text-slate-700">{formatDate(member.joined_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Source</dt>
              <dd className="text-slate-700">{member.source ?? "—"}</dd>
            </div>
            {member.invited_by && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Invited by</dt>
                <dd className="text-slate-700">{member.invited_by}</dd>
              </div>
            )}
            {member.external_id && (
              <div className="flex justify-between">
                <dt className="text-slate-500">External ID</dt>
                <dd className="font-mono text-xs text-slate-600 truncate max-w-[60%]">
                  {member.external_id}
                </dd>
              </div>
            )}
          </dl>
        </CollapsibleSection>

        <CollapsibleSection
          id="capabilities"
          title="Capabilities"
          defaultOpen={true}
        >
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-800 capitalize mb-1">
              {member.membership_type.replace(/_/g, " ")}
            </p>
            <p className="text-sm text-slate-600">
              {CAPABILITY_DESCRIPTIONS[member.membership_type]}
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="activity" title="Activity" defaultOpen={false}>
          <div className="text-center py-6 text-sm text-slate-500">
            Activity log coming soon.
          </div>
        </CollapsibleSection>
      </div>

      {/* Remove confirm dialog */}
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Their identity is preserved; only the tenant membership will be
            removed. They will lose all access to this workspace immediately.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmRemove(false);
                onRemove(member.user_id);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const workspaceId = resolveWorkspaceId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "all">(
    "all"
  );
  const [selectedMember, setSelectedMember] =
    useState<TenantMembership | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data, isLoading } = useListMembersQuery(
    {
      workspaceId: workspaceId ?? "",
      status: statusFilter === "all" ? undefined : statusFilter,
    },
    { skip: !workspaceId }
  );

  const [update, updateState] = useUpdateMembershipMutation();
  const [del] = useDeleteMembershipMutation();

  const rows = useMemo<TenantMembership[]>(() => {
    const items = data?.items ?? [];
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(
      (m) =>
        m.user_email?.toLowerCase().includes(s) ||
        m.user_name?.toLowerCase().includes(s) ||
        m.user_username?.toLowerCase().includes(s) ||
        m.user_id.toLowerCase().includes(s) ||
        m.external_id?.toLowerCase().includes(s)
    );
  }, [data, search]);

  const handleSelectRow = useCallback(
    (member: TenantMembership, index: number) => {
      setSelectedMember(member);
      setSelectedIndex(index);
    },
    []
  );

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) {
      const newIdx = selectedIndex - 1;
      setSelectedIndex(newIdx);
      setSelectedMember(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  const handleNext = useCallback(() => {
    if (selectedIndex < rows.length - 1) {
      const newIdx = selectedIndex + 1;
      setSelectedIndex(newIdx);
      setSelectedMember(rows[newIdx]);
    }
  }, [selectedIndex, rows]);

  const handleSuspend = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await update({ workspaceId, userId, status: "suspended" }).unwrap();
        toast.success("Member suspended");
        // Update selected member if open
        setSelectedMember((prev) =>
          prev?.user_id === userId ? { ...prev, status: "suspended" } : prev
        );
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to suspend");
      }
    },
    [workspaceId, update]
  );

  const handleReactivate = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await update({ workspaceId, userId, status: "active" }).unwrap();
        toast.success("Member reactivated");
        setSelectedMember((prev) =>
          prev?.user_id === userId ? { ...prev, status: "active" } : prev
        );
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to reactivate");
      }
    },
    [workspaceId, update]
  );

  const handleRemove = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      try {
        await del({ workspaceId, userId }).unwrap();
        toast.success("Member removed");
        if (selectedMember?.user_id === userId) setSelectedMember(null);
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to remove member");
      }
    },
    [workspaceId, del, selectedMember]
  );

  const handleChangeType = useCallback(
    async (userId: string, type: MembershipType) => {
      if (!workspaceId) return;
      try {
        await update({
          workspaceId,
          userId,
          membership_type: type,
        }).unwrap();
        toast.success(`Member type changed to ${type.replace(/_/g, " ")}`);
        setSelectedMember((prev) =>
          prev?.user_id === userId
            ? { ...prev, membership_type: type }
            : prev
        );
      } catch (e: unknown) {
        const err = e as { data?: { error?: string } };
        toast.error(err?.data?.error ?? "Failed to change type");
      }
    },
    [workspaceId, update]
  );

  if (!workspaceId) {
    return (
      <div className="p-8">
        <p className="text-slate-500 text-sm">
          No tenant selected. Switch to a tenant to manage team members.
        </p>
      </div>
    );
  }

  // Empty state
  if (!isLoading && rows.length === 0 && !search && statusFilter === "all") {
    return (
      <>
        <PageHeader
          title="Team"
          description="Operators of this tenant — the people who can manage Applications, policies, and end users."
        />
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            No team members yet
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm">
            Invite users to your workspace to give them operator access.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Operators of this tenant — the people who can manage Applications, policies, and end users. Distinct from end users, who are managed under the Users workspace."
      />

      {/* Master-detail layout */}
      <div className="flex h-[calc(100vh-var(--page-header-height,140px))] overflow-hidden">
        {/* Left — table */}
        <div
          className={cn(
            "flex flex-col overflow-auto transition-all duration-200",
            selectedMember ? "w-[55%] min-w-0 flex-none" : "flex-1"
          )}
        >
          <div className="space-y-4 p-6">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Input
                  placeholder="Search by email, name, or ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as MembershipStatus | "all")
                }
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="left">Left</SelectItem>
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
              <div className="ml-auto text-sm text-muted-foreground text-xs">
                To invite a new member, use the Invite Users flow.
              </div>
            </div>

            <TableCard>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={5}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-12 text-slate-500"
                        >
                          No members match these filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((member, index) => (
                        <TableRow
                          key={member.id}
                          className={cn(
                            "cursor-pointer hover:bg-slate-50",
                            selectedMember?.id === member.id && "bg-slate-50"
                          )}
                          onClick={() => handleSelectRow(member, index)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-semibold shrink-0">
                                {memberInitials(member)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 text-sm truncate">
                                  {memberLabel(member)}
                                </div>
                                {member.user_name &&
                                  member.user_name !== "Not Provided" && (
                                    <div className="text-xs text-slate-500">
                                      {member.user_name}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <TypeBadge type={member.membership_type} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={member.status} />
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {formatDate(member.joined_at)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectRow(member, index);
                                  }}
                                >
                                  View details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {member.status === "active" ||
                                member.status === "invited" ? (
                                  <DropdownMenuItem
                                    className="text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSuspend(member.user_id);
                                    }}
                                    disabled={updateState.isLoading}
                                  >
                                    <ShieldOff className="mr-2 h-3.5 w-3.5" />
                                    Suspend
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReactivate(member.user_id);
                                    }}
                                    disabled={updateState.isLoading}
                                  >
                                    <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                                    Reactivate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-xs text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove(member.user_id);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </TableCard>

            <div className="text-xs text-slate-500">
              {rows.length} member{rows.length === 1 ? "" : "s"} in this
              workspace.
            </div>
          </div>
        </div>

        {/* Right — detail panel */}
        {selectedMember && (
          <div className="w-[45%] flex-none border-l bg-white overflow-y-auto">
            <MemberDetailPanel
              member={selectedMember}
              workspaceId={workspaceId}
              onClose={() => setSelectedMember(null)}
              onPrev={handlePrev}
              onNext={handleNext}
              hasPrev={selectedIndex > 0}
              hasNext={selectedIndex < rows.length - 1}
              currentIndex={selectedIndex}
              total={rows.length}
              onSuspend={handleSuspend}
              onReactivate={handleReactivate}
              onRemove={handleRemove}
              onChangeType={handleChangeType}
              suspendLoading={updateState.isLoading}
              reactivateLoading={updateState.isLoading}
            />
          </div>
        )}
      </div>
    </>
  );
}
