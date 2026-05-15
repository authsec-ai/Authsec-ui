/**
 * EndUsersPage — Phase A default workspace for the tenant operator.
 *
 * Shows consumers of the tenant's published Applications: people who have
 * consented to one or more AI clients connecting to the tenant's MCP servers
 * or other Applications. These are NOT tenant members.
 *
 * Backend: GET /uflow/v2/tenants/:tenant_id/end-users
 *           POST /uflow/v2/tenants/:tenant_id/end-users/:user_id/suspend
 *           POST /uflow/v2/tenants/:tenant_id/end-users/:user_id/reactivate
 *           PATCH /uflow/v2/tenants/:tenant_id/end-users/:user_id  (plan_tier, …)
 */

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCard } from "@/theme/components/cards";
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
import { toast } from "@/lib/toast";
import { resolveTenantId } from "@/utils/workspace";
import {
  useListEndUsersQuery,
  useSuspendEndUserMutation,
  useReactivateEndUserMutation,
  useUpdateEndUserMutation,
  type TenantEndUserState,
  type EndUserStatus,
} from "@/app/api/membershipApi";
import { Search, ShieldOff, ShieldCheck, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const StatusBadge: React.FC<{ status: EndUserStatus }> = ({ status }) =>
  status === "active" ? (
    <Badge variant="default">Active</Badge>
  ) : (
    <Badge variant="destructive">Suspended</Badge>
  );

const PlanBadge: React.FC<{ plan?: string | null }> = ({ plan }) => {
  if (!plan) return <span className="text-muted-foreground text-sm">—</span>;
  const lower = plan.toLowerCase();
  if (lower === "free") return <Badge variant="secondary">Free</Badge>;
  if (lower === "pro") return <Badge>Pro</Badge>;
  return <Badge variant="outline">{plan}</Badge>;
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export default function EndUsersPage() {
  const navigate = useNavigate();
  const tenantId = resolveTenantId();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatus | "all">("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

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
  const [updateEndUser] = useUpdateEndUserMutation();

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

  const handleSetPlan = async (userId: string, plan: string | null) => {
    if (!tenantId) return;
    try {
      await updateEndUser({ tenantId, userId, plan_tier: plan }).unwrap();
      toast.success(plan ? `Plan set to ${plan}` : "Plan cleared");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed to update plan");
    }
  };

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
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-72"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EndUserStatus | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Plan tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {/* Table */}
        <TableCard>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>First Consent</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Loading end users…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="text-muted-foreground">
                        No end users yet. Once a public user connects an AI client to one of your{" "}
                        <button
                          onClick={() => navigate("/applications")}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Applications
                        </button>
                        , they'll show up here.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.user_id} className="hover:bg-muted/40">
                      <TableCell>
                        <div className="font-medium">
                          {r.user_email ?? r.user_username ?? r.user_id}
                        </div>
                        {r.user_email && r.user_username ? (
                          <div className="text-xs text-muted-foreground">
                            {r.user_username}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        <PlanBadge plan={r.plan_tier} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.first_consent_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.last_seen_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {r.status === "active" ? (
                              <DropdownMenuItem
                                onClick={() => handleSuspend(r.user_id)}
                                disabled={suspendState.isLoading}
                              >
                                <ShieldOff className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleReactivate(r.user_id)}
                                disabled={reactivateState.isLoading}
                              >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Reactivate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleSetPlan(r.user_id, "free")}>
                              Set plan: Free
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSetPlan(r.user_id, "pro")}>
                              Set plan: Pro
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSetPlan(r.user_id, null)}>
                              Clear plan
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

        <div className="text-xs text-muted-foreground">
          {rows.length} end user{rows.length === 1 ? "" : "s"} in this tenant.
        </div>
      </div>
    </>
  );
}
