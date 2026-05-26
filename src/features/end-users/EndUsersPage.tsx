import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  KeyRound,
  MoreHorizontal,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
  UsersRound,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageInfoBanner } from "@/components/shared/PageInfoBanner";
import { toast } from "@/lib/toast";
import { FilterCard, TableCard } from "@/theme/components/cards";
import { resolveTenantId } from "@/utils/workspace";

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

function EndUserExpandedRow({
  user,
  onOpenProfile,
  onOpenEffectiveAccess,
}: {
  user: TenantEndUserState;
  onOpenProfile: () => void;
  onOpenEffectiveAccess: (applicationId?: string) => void;
}) {
  const applications = user.applications ?? [];

  return (
    <div className="grid gap-4 p-4 text-sm md:grid-cols-[1.3fr_1fr]">
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Application access
        </div>
        {applications.length ? (
          <div className="mt-2 space-y-2">
            {applications.slice(0, 3).map((app) => (
              <div key={app.binding_id} className="rounded-md border p-3">
                <div className="font-medium">{app.name}</div>
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {app.resource_uri}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{app.role_label || app.role_name}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {app.scopes_count} scope{app.scopes_count === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => onOpenEffectiveAccess(app.application_id)}
                  >
                    Effective access
                  </Button>
                </div>
              </div>
            ))}
            {applications.length > 3 ? (
              <div className="text-xs text-muted-foreground">
                +{applications.length - 3} more application{applications.length - 3 === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">No application role bindings yet.</p>
        )}
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          User details
        </div>
        <dl className="mt-2 space-y-1">
          <div>
            <dt className="inline text-muted-foreground">User ID: </dt>
            <dd className="inline font-mono text-xs">{user.user_id}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Plan: </dt>
            <dd className="inline">{user.plan_tier || "—"}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Effective scopes: </dt>
            <dd className="inline">{user.effective_scopes_count ?? 0}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onOpenProfile}>
            View profile
          </Button>
          <Button size="sm" onClick={() => onOpenEffectiveAccess()}>
            Effective access
          </Button>
        </div>
      </section>
    </div>
  );
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
  const { data, isFetching, refetch } = useGetApplicationEffectiveAccessQuery(
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => selectedApplicationId && refetch()}
                disabled={isFetching || !selectedApplicationId}
              >
                <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <Tabs defaultValue="roles">
              <TabsList>
                <TabsTrigger value="roles">Roles & scopes</TabsTrigger>
                <TabsTrigger value="tools">Applications & tools</TabsTrigger>
              </TabsList>
              <TabsContent value="roles" className="mt-4 space-y-4">
                <section className="rounded-md border">
                  <div className="border-b px-3 py-2 text-sm font-semibold">Role bindings</div>
                  <div className="divide-y">
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

                <section className="rounded-md border">
                  <div className="border-b px-3 py-2 text-sm font-semibold">Scopes</div>
                  <div className="grid gap-2 p-3">
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
              </TabsContent>
              <TabsContent value="tools" className="mt-4 space-y-3">
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
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function EndUsersPage() {
  const navigate = useNavigate();
  const tenantId = resolveTenantId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [accessDrawer, setAccessDrawer] = useState<{
    open: boolean;
    user: TenantEndUserState | null;
    applicationId?: string;
  }>({ open: false, user: null });

  const { data, isLoading, isFetching, refetch } = useListEndUsersQuery(
    {
      tenantId: tenantId || "",
      status: statusFilter === "all" ? undefined : statusFilter,
      plan_tier: planFilter === "all" ? undefined : planFilter,
      q: search.trim() || undefined,
    },
    { skip: !tenantId },
  );

  const [suspend, suspendState] = useSuspendEndUserMutation();
  const [reactivate, reactivateState] = useReactivateEndUserMutation();
  const rows: TenantEndUserState[] = useMemo(() => data?.items ?? [], [data]);

  const handleSuspend = async (userId: string) => {
    if (!tenantId) return;
    try {
      await suspend({ tenantId, userId, reason: "Manual suspension via End Users page" }).unwrap();
      toast.success("End user suspended");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed to suspend");
    }
  };

  const handleReactivate = async (userId: string) => {
    if (!tenantId) return;
    try {
      await reactivate({ tenantId, userId }).unwrap();
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
          <div>
            <div className="font-medium">{userLabel(row.original)}</div>
            {row.original.user_name && row.original.user_name !== "Not Provided" ? (
              <div className="text-xs text-muted-foreground">{row.original.user_name}</div>
            ) : row.original.user_email && row.original.user_username ? (
              <div className="text-xs text-muted-foreground">{row.original.user_username}</div>
            ) : null}
          </div>
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
        id: "access",
        header: "Access summary",
        priority: 2,
        approxWidth: 240,
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
        id: "firstConsent",
        header: "First consent",
        priority: 3,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.first_consent_at)}
          </span>
        ),
      },
      {
        id: "lastActivity",
        header: "Last activity",
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

  if (!tenantId) {
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
        description="Consumers of this tenant's published Applications. These are not members — they connect to your AI agents, MCP servers, or web apps via OAuth."
      />

      <div className="space-y-4 p-6">
        <PageInfoBanner
          title="End users are consumer identities"
          description="These users are separate from your platform team. They appear here after consenting to an Application through OAuth."
          features={[
            { text: "Review application access without opening each app", icon: UsersRound },
            { text: "Jump to effective access for scoped troubleshooting", icon: KeyRound },
            { text: "Suspend or reactivate consumer access", icon: ShieldCheck },
          ]}
          featuresTitle="Access workflow"
          storageKey="end-users-info"
          dismissible
        />

        <FilterCard>
          <CardContent variant="compact">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-medium text-foreground">Filters</span>
              </div>
              <div className="flex w-full flex-1 flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by email or username..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-9"
                  />
                </div>
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
                <Select value={planFilter} onValueChange={setPlanFilter}>
                  <SelectTrigger className="h-9 w-40">
                    <SelectValue placeholder="Plan tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All plans</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>
          </CardContent>
        </FilterCard>

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
                enableExpansion
                renderExpandedRow={(row) => (
                  <EndUserExpandedRow
                    user={row.original}
                    onOpenProfile={() => navigate(`/end-users/${row.original.user_id}`)}
                    onOpenEffectiveAccess={(applicationId) =>
                      setAccessDrawer({ open: true, user: row.original, applicationId })
                    }
                  />
                )}
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
