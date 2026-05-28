import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  MoreHorizontal,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  useListEndUsersQuery,
  useReactivateEndUserMutation,
  useSuspendEndUserMutation,
  type EndUserStatus,
  type TenantEndUserState,
} from "@/app/api/membershipApi";
import { useGetApplicationEffectiveAccessQuery } from "@/app/api/accessApi";
import { useDeleteRSBindingMutation } from "@/app/api/setupWizardApi";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  AccessPath,
  ConsoleFilterBar,
  EntityCell,
  VerdictCard,
} from "@/components/console/iam-console";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/lib/toast";
import { TableCard } from "@/theme/components/cards";
import { resolveWorkspaceId } from "@/utils/workspace";

const StatusBadge: React.FC<{ status: EndUserStatus }> = ({ status }) =>
  status === "active" ? (
    <Badge variant="default">Active</Badge>
  ) : (
    <Badge variant="destructive">Suspended</Badge>
  );

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

function userLabel(user: TenantEndUserState) {
  return user.user_email ?? user.user_username ?? user.user_id;
}

function EffectiveAccessDrawer({
  user,
  initialApplicationId,
  open,
  onOpenChange,
}: {
  user: TenantEndUserState | null;
  initialApplicationId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [applicationId, setApplicationId] = useState(initialApplicationId ?? "");
  const [deleteBinding, deleteState] = useDeleteRSBindingMutation();
  const applications = user?.applications ?? [];
  const selectedApplicationId = applicationId || applications[0]?.application_id || "";
  const { data, refetch } = useGetApplicationEffectiveAccessQuery(
    { applicationId: selectedApplicationId, userId: user?.user_id ?? "" },
    { skip: !user || !selectedApplicationId },
  );

  React.useEffect(() => {
    if (open) setApplicationId(initialApplicationId ?? applications[0]?.application_id ?? "");
  }, [applications, initialApplicationId, open]);

  const handleRemoveBinding = async (bindingId: string) => {
    if (!selectedApplicationId) return;
    const confirmed = window.confirm("Remove this user's application role binding?");
    if (!confirmed) return;
    try {
      await deleteBinding({ rsId: selectedApplicationId, bindingId }).unwrap();
      toast.success("Access removed");
      refetch();
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed to remove access");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Effective access</SheetTitle>
          <SheetDescription>
            {user ? userLabel(user) : "Select a user"} across application roles, scopes, and tools.
          </SheetDescription>
        </SheetHeader>

        {user ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedApplicationId} onValueChange={setApplicationId}>
                <SelectTrigger className="h-9 min-w-[260px] flex-1">
                  <SelectValue placeholder="Application" />
                </SelectTrigger>
                <SelectContent>
                  {applications.map((app) => (
                    <SelectItem key={app.application_id} value={app.application_id}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <VerdictCard
              verdict={data?.roles?.length ? "allow" : "review"}
              title={data?.roles?.length ? "Application access is active" : "No app role grants this user access"}
              body={
                data?.roles?.length
                  ? "Access resolves through application roles, mapped scopes, and remembered consent where required."
                  : "Assign an application role or inspect recent denials before escalating."
              }
            />

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Access path
              </h3>
              <AccessPath
                steps={[
                  {
                    label: user.status === "active" ? "User active" : "User suspended",
                    detail:
                      user.status === "active"
                        ? "The identity can authenticate."
                        : user.suspended_reason || "Suspended users should not receive runtime access.",
                    state: user.status === "active" ? "ok" : "blocked",
                  },
                  {
                    label: selectedApplicationId ? "Application selected" : "No application access",
                    detail:
                      applications.find((app) => app.application_id === selectedApplicationId)?.name ||
                      "Pick an application to inspect role and scope grants.",
                    state: selectedApplicationId ? "ok" : "warn",
                  },
                  {
                    label: data?.roles?.length ? "Role grants scopes" : "No role grant",
                    detail: data?.roles?.length
                      ? `${data.roles.length} role${data.roles.length === 1 ? "" : "s"} found for this application.`
                      : "No application role binding was found.",
                    state: data?.roles?.length ? "ok" : "blocked",
                  },
                ]}
              />
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Role bindings
              </h3>
              <div className="divide-y overflow-hidden rounded-lg border">
                    {data?.roles?.length ? (
                      data.roles.map((role) => (
                        <div key={`${role.id}:${role.binding_id}`} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <div className="font-medium">{role.label}</div>
                            <div className="truncate font-mono text-xs text-muted-foreground">{role.name}</div>
                          </div>
                          {role.binding_id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveBinding(role.binding_id!)}
                              disabled={deleteState.isLoading}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground">No role binding for this application.</div>
                    )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Effective scopes
              </h3>
              <div className="grid gap-2">
                    {data?.scopes?.length ? (
                      data.scopes.map((scope) => (
                        <div key={scope.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                          <div>
                            <div className="font-mono text-sm">{scope.scope_string}</div>
                            <div className="text-xs text-muted-foreground">{scope.display_name}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={scope.status === "granted" ? "default" : "outline"}>
                              {scope.status === "granted" ? "Granted" : "Not granted"}
                            </Badge>
                            <Badge variant="outline">{scope.risk_level}</Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground">No scopes found.</div>
                    )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Applications
              </h3>
                {applications.length ? (
                  applications.map((app) => (
                    <div key={app.binding_id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{app.name}</div>
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            {app.resource_uri}
                          </div>
                        </div>
                        <Badge variant="secondary">{app.scopes_count} scopes</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline">{app.role_label || app.role_name}</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setApplicationId(app.application_id)}
                        >
                          Inspect
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border p-6 text-sm text-muted-foreground">
                    This user has no application access yet.
                  </div>
                )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function EndUsersPage() {
  const navigate = useNavigate();
  const workspaceId = resolveWorkspaceId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatus | "all">("all");
  const [accessDrawer, setAccessDrawer] = useState<{
    open: boolean;
    user: TenantEndUserState | null;
    applicationId?: string;
  }>({ open: false, user: null });

  const { data, isLoading } = useListEndUsersQuery(
    {
      workspaceId: workspaceId || "",
      status: statusFilter === "all" ? undefined : statusFilter,
      q: search.trim() || undefined,
    },
    { skip: !workspaceId },
  );

  const [suspend, suspendState] = useSuspendEndUserMutation();
  const [reactivate, reactivateState] = useReactivateEndUserMutation();
  const rows: TenantEndUserState[] = useMemo(() => data?.items ?? [], [data]);

  const handleSuspend = async (userId: string) => {
    if (!workspaceId) return;
    try {
      await suspend({ workspaceId, userId, reason: "Manual suspension via End Users page" }).unwrap();
      toast.success("End user suspended");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed to suspend");
    }
  };

  const handleReactivate = async (userId: string) => {
    if (!workspaceId) return;
    try {
      await reactivate({ workspaceId, userId }).unwrap();
      toast.success("End user reactivated");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed to reactivate");
    }
  };

  const columns = useMemo<AdaptiveColumn<TenantEndUserState>[]>(
    () => [
      {
        id: "user",
        header: "User",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={userLabel(row.original)}
            detail={
              row.original.user_name && row.original.user_name !== "Not Provided"
                ? row.original.user_name
                : row.original.user_username
            }
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "applications",
        header: "Applications",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.applications_count ?? row.original.applications?.length ?? 0} app
            {(row.original.applications_count ?? row.original.applications?.length ?? 0) === 1 ? "" : "s"}
          </span>
        ),
      },
      {
        id: "access",
        header: "Risk / access summary",
        priority: 3,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.access_summary || "No application access"}</div>
            {(row.original.effective_scopes_count ?? 0) > 0 ? (
              <div className="text-xs text-muted-foreground">
                {row.original.effective_scopes_count} effective scope
                {row.original.effective_scopes_count === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "lastActivity",
        header: "Last relevant activity",
        priority: 4,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.last_seen_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 72,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/end-users/${row.original.user_id}`)}>
                <UserRound className="mr-2 h-4 w-4" />
                View profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setAccessDrawer({ open: true, user: row.original })}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Effective access
              </DropdownMenuItem>
              {row.original.status === "active" ? (
                <DropdownMenuItem
                  onClick={() => handleSuspend(row.original.user_id)}
                  disabled={suspendState.isLoading}
                >
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Suspend
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => handleReactivate(row.original.user_id)}
                  disabled={reactivateState.isLoading}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Reactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableHiding: false,
      },
    ],
    [handleReactivate, handleSuspend, navigate, reactivateState.isLoading, suspendState.isLoading],
  );

  if (!workspaceId) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">
          No tenant selected. Switch to a tenant to manage end users.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="End Users"
        description="Consumers of this workspace's published Applications. These are not members; they connect to your AI agents, MCP servers, or web apps via OAuth."
      />

      <div className="space-y-4 p-6">
        <ConsoleFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by email, name, or username"
          trailing={
            <>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EndUserStatus | "all")}>
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                {search.trim() || statusFilter !== "all" ? (
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
                ) : null}
            </>
          }
        />

        <TableCard>
          <CardContent variant="flush">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Loading end users...
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No end users yet. Once a public user connects an AI client to one of your Applications, they'll show up here.
              </div>
            ) : (
              <AdaptiveTable
                tableId="end-users"
                data={rows}
                columns={columns}
                enableSelection={false}
                enableExpansion={false}
                getRowId={(row) => row.user_id}
                pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
              />
            )}
          </CardContent>
        </TableCard>

        <div className="text-xs text-muted-foreground">
          {rows.length} end user{rows.length === 1 ? "" : "s"} in this workspace.
        </div>
      </div>
      <EffectiveAccessDrawer
        open={accessDrawer.open}
        user={accessDrawer.user}
        initialApplicationId={accessDrawer.applicationId}
        onOpenChange={(open) => setAccessDrawer((current) => ({ ...current, open }))}
      />
    </>
  );
}
