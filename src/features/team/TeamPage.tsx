/**
 * TeamPage — Settings → Team (Phase A).
 *
 * Manages tenant_memberships — the operators of the tenant (Owner/Admin/Member/...).
 * Distinct from End Users (consumers); see User Taxonomy in
 * docs/USER_MANAGEMENT_AND_MCP_AUTHZ.md.
 *
 * Backend: GET    /uflow/v2/tenants/:tenant_id/memberships
 *          POST   /uflow/v2/tenants/:tenant_id/memberships
 *          PATCH  /uflow/v2/tenants/:tenant_id/memberships/:user_id
 *          DELETE /uflow/v2/tenants/:tenant_id/memberships/:user_id
 */

import React, { useState, useMemo } from "react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { resolveTenantId } from "@/utils/workspace";
import {
  useListMembersQuery,
  useUpdateMembershipMutation,
  useDeleteMembershipMutation,
  type MembershipType,
  type MembershipStatus,
  type TenantMembership,
} from "@/app/api/membershipApi";
import { MoreHorizontal, ShieldOff, ShieldCheck, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const StatusBadge: React.FC<{ status: MembershipStatus }> = ({ status }) => {
  switch (status) {
    case "active":
      return <Badge variant="default">Active</Badge>;
    case "invited":
      return <Badge variant="secondary">Invited</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "left":
      return <Badge variant="outline">Left</Badge>;
  }
};

const TypeBadge: React.FC<{ type: MembershipType }> = ({ type }) => (
  <Badge variant="outline" className="capitalize">
    {type.replace("_", " ")}
  </Badge>
);

const formatDate = (iso?: string | null) =>
  !iso ? "—" : new Date(iso).toLocaleDateString();

function MembersTab({ tenantId }: { tenantId: string }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "all">("all");
  const { data, isLoading, isFetching, refetch } = useListMembersQuery({
    tenantId,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const [update] = useUpdateMembershipMutation();
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
        m.external_id?.toLowerCase().includes(s),
    );
  }, [data, search]);

  const handleSuspend = async (userId: string) => {
    try {
      await update({ tenantId, userId, status: "suspended" }).unwrap();
      toast.success("Member suspended");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed");
    }
  };
  const handleReactivate = async (userId: string) => {
    try {
      await update({ tenantId, userId, status: "active" }).unwrap();
      toast.success("Member reactivated");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed");
    }
  };
  const handleRemove = async (userId: string) => {
    if (!confirm("Remove this member? Their identity is preserved; only the tenant membership is dropped.")) return;
    try {
      await del({ tenantId, userId }).unwrap();
      toast.success("Member removed");
    } catch (e: any) {
      toast.error(e?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by email, name, or external ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-80"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MembershipStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="left">Left</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          To invite a new member, use the existing Invite Users flow.
        </div>
      </div>

      <TableCard>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No members match these filters.</TableCell></TableRow>
              ) : rows.map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="font-medium">
                      {m.user_email ?? m.user_username ?? m.user_id}
                    </div>
                    {m.user_name && m.user_name !== "Not Provided" ? (
                      <div className="text-xs text-muted-foreground">{m.user_name}</div>
                    ) : null}
                  </TableCell>
                  <TableCell><TypeBadge type={m.membership_type} /></TableCell>
                  <TableCell><StatusBadge status={m.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.source}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(m.joined_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {m.status === "active" ? (
                          <DropdownMenuItem onClick={() => handleSuspend(m.user_id)}>
                            <ShieldOff className="mr-2 h-4 w-4" />
                            Suspend
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleReactivate(m.user_id)}>
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Reactivate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleRemove(m.user_id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove from tenant
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </TableCard>

      <div className="text-xs text-muted-foreground">
        {rows.length} member{rows.length === 1 ? "" : "s"}.
      </div>
    </div>
  );
}

export default function TeamPage() {
  const tenantId = resolveTenantId();

  if (!tenantId) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">No tenant selected.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Team"
        description="Operators of this tenant — the people who can manage Applications, policies, and end users. Distinct from end users, who are managed under the End Users workspace."
      />
      <div className="p-6">
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="roles" disabled>Roles <span className="ml-1 text-xs opacity-70">(Phase F)</span></TabsTrigger>
            <TabsTrigger value="groups" disabled>Groups <span className="ml-1 text-xs opacity-70">(Phase F)</span></TabsTrigger>
            <TabsTrigger value="audit" disabled>Audit <span className="ml-1 text-xs opacity-70">(Phase F)</span></TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="mt-4">
            <MembersTab tenantId={tenantId} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
