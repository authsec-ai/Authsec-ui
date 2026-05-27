import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Search, ShieldOff } from "lucide-react";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import {
  useGetApplicationEffectiveAccessQuery,
  type EffectiveAccessScope,
} from "@/app/api/accessApi";
import { useListEndUsersQuery } from "@/app/api/membershipApi";
import { useDeleteRSBindingMutation } from "@/app/api/setupWizardApi";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AccessPath,
  ConsoleRowActions,
  EntityCell,
  VerdictCard,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { resolveTenantId } from "@/utils/workspace";
import { toast } from "react-hot-toast";

function riskVariant(risk?: string): "default" | "secondary" | "destructive" | "outline" {
  if (risk === "high" || risk === "critical") return "destructive";
  if (risk === "medium") return "secondary";
  if (risk === "low") return "default";
  return "outline";
}

export default function EffectiveAccessPage() {
  const tenantId = resolveTenantId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userSearch, setUserSearch] = useState("");
  const [userId, setUserId] = useState(searchParams.get("user_id") || "");
  const [applicationId, setApplicationId] = useState(searchParams.get("application_id") || "");

  const { data: endUsers } = useListEndUsersQuery(
    { tenantId: tenantId || "", q: userSearch.trim() || undefined },
    { skip: !tenantId },
  );
  const { data: applications = [] } = useListApplicationsQuery();
  const { data, isLoading, refetch } = useGetApplicationEffectiveAccessQuery(
    { applicationId, userId },
    { skip: !applicationId || !userId },
  );
  const [deleteBinding, { isLoading: deletingBinding }] = useDeleteRSBindingMutation();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (userId) next.set("user_id", userId);
    else next.delete("user_id");
    if (applicationId) next.set("application_id", applicationId);
    else next.delete("application_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, applicationId]);

  const scopes = data?.scopes ?? [];
  const users = endUsers?.items ?? [];

  const columns = useMemo<AdaptiveColumn<EffectiveAccessScope>[]>(
    () => [
      {
        id: "scope",
        header: "Access label",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name || row.original.scope_string}
            detail={row.original.scope_string}
            monoDetail
          />
        ),
      },
      {
        id: "verdict",
        header: "Verdict",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "granted" ? "default" : "outline"}>
            {row.original.status === "granted" ? "Granted" : "Not granted"}
          </Badge>
        ),
      },
      {
        id: "through",
        header: "Why",
        priority: 2,
        approxWidth: 240,
        cell: ({ row }) =>
          (row.original.granted_through ?? []).length ? (
            <div className="flex flex-wrap gap-1">
              {(row.original.granted_through ?? []).map((source) => (
                <Badge key={`${source.binding_id}:${source.role_id}`} variant="secondary">
                  {source.role_name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No role grants this scope</span>
          ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <Badge variant={riskVariant(row.original.risk_level)}>
            {row.original.risk_level || "unspecified"}
          </Badge>
        ),
      },
      {
        id: "action",
        header: "Action",
        alwaysVisible: true,
        approxWidth: 76,
        cell: ({ row }) => {
          const sources = row.original.granted_through ?? [];
          return (
            <ConsoleRowActions
              items={[
                row.original.status !== "granted"
                  ? {
                      label: "Add via role",
                      icon: <KeyRound className="size-4" />,
                      onSelect: () => navigate(`/applications/${applicationId}/access`),
                    }
                  : {
                      label: "Review sources",
                      icon: <KeyRound className="size-4" />,
                      onSelect: () => navigate(`/admin/authz/role-bindings?user_id=${userId}`),
                    },
                {
                  label: "Remove only source",
                  icon: <ShieldOff className="size-4" />,
                  disabled: row.original.status !== "granted" || !row.original.removable || sources.length !== 1 || deletingBinding,
                  destructive: true,
                  onSelect: async () => {
                    try {
                      await deleteBinding({
                        rsId: applicationId,
                        bindingId: sources[0].binding_id,
                      }).unwrap();
                      toast.success("Role binding removed.");
                      refetch();
                    } catch (err) {
                      const apiErr = err as { data?: { error?: string } };
                      toast.error(apiErr?.data?.error ?? "Couldn't remove binding.");
                    }
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [applicationId, deleteBinding, deletingBinding, navigate, refetch, userId],
  );

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Effective Access"
        description="Resolve whether a user can reach an application capability, why, and the safest next fix."
      />

      <TableCard>
        <CardContent variant="compact">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium">End user</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search users by email or username"
                  className="pl-9"
                />
              </div>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an end user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.user_email || user.user_username || user.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Application</label>
              <Select value={applicationId} onValueChange={setApplicationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an application" />
                </SelectTrigger>
                <SelectContent>
                  {applications.map((application) => (
                    <SelectItem key={application.id} value={application.id}>
                      {application.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data?.application.resource_uri ? (
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {data.application.resource_uri}
                </div>
              ) : null}
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => navigate(`/applications/${applicationId}/access`)}
                disabled={!applicationId}
              >
                Configure access
              </Button>
            </div>
          </div>
        </CardContent>
      </TableCard>

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <VerdictCard
            verdict={data.roles.length ? "allow" : "deny"}
            title={data.roles.length ? "Application access is active" : "No application role grants access"}
            body={
              data.roles.length
                ? `${data.user.email || data.user.name} resolves through ${data.roles.length} application role${data.roles.length === 1 ? "" : "s"}.`
                : "Assign an application role, then confirm the client requested the matching scope."
            }
          />
          <AccessPath
            steps={[
              {
                label: "User selected",
                detail: data.user.email || data.user.name || userId,
                state: "ok",
              },
              {
                label: "Application selected",
                detail: data.application.name,
                state: "ok",
              },
              {
                label: data.roles.length ? "Role binding active" : "Missing role binding",
                detail: data.roles.length
                  ? data.roles.map((role) => role.label).join(", ")
                  : "No role path currently grants application scopes.",
                state: data.roles.length ? "ok" : "blocked",
              },
            ]}
          />
        </div>
      ) : null}

      {!applicationId || !userId ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Select both an end user and an Application to compute effective access.
        </div>
      ) : (
        <TableCard>
          <CardContent variant="flush">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Resolving effective access...
              </div>
            ) : (
              <AdaptiveTable
                tableId="effective-access"
                data={scopes}
                columns={columns}
                enableSelection={false}
                enableExpansion={false}
                getRowId={(scope) => scope.id}
                pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
              />
            )}
          </CardContent>
        </TableCard>
      )}

      {data ? (
        <div className="text-xs text-muted-foreground">
          {data.user.email || data.user.name} has {data.roles.length} role
          {data.roles.length === 1 ? "" : "s"} on {data.application.name}.
        </div>
      ) : null}
    </div>
  );
}
