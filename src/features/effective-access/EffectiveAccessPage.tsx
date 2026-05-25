import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Search, ShieldCheck, Users } from "lucide-react";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import {
  useGetApplicationEffectiveAccessQuery,
  type EffectiveAccessScope,
} from "@/app/api/accessApi";
import { useListEndUsersQuery } from "@/app/api/membershipApi";
import { useDeleteRSBindingMutation } from "@/app/api/setupWizardApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageInfoBanner } from "@/components/shared/PageInfoBanner";
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
import { FilterCard, TableCard } from "@/theme/components/cards";
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
  const { data, isLoading, isFetching, refetch } = useGetApplicationEffectiveAccessQuery(
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
        header: "Scope",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-sm font-medium">{row.original.scope_string}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.display_name || row.original.scope_string}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
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
        header: "Granted through",
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
        id: "source",
        header: "Source",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) =>
          (row.original.granted_through ?? []).length ? (
            <span className="text-sm">
              {Array.from(new Set((row.original.granted_through ?? []).map((s) => s.source))).join(", ")}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 4,
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
        approxWidth: 170,
        cell: ({ row }) => {
          const sources = row.original.granted_through ?? [];
          if (row.original.status !== "granted") {
            return (
              <Button
                size="sm"
                onClick={() => navigate(`/applications/${applicationId}/access`)}
              >
                Add via role
              </Button>
            );
          }
          if (!row.original.removable || sources.length !== 1) {
            return (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/admin/authz/role-bindings?user_id=${userId}`)}
              >
                Review sources
              </Button>
            );
          }
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={deletingBinding}
              onClick={async () => {
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
              }}
            >
              Remove source
            </Button>
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
        description="Pick an end user and an Application to see which scopes are granted, why they are granted, and the safe remediation path."
        actions={
          data ? (
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          ) : null
        }
      />

      <PageInfoBanner
        title="Effective access shows why a user has each scope"
        description="Access is changed by assigning or removing application role bindings. Shared role scope changes affect every user with that role."
        features={[
          { text: "Pick one end user and one Application", icon: Users },
          { text: "Review all granting roles and binding sources", icon: ShieldCheck },
          { text: "Remove only the selected safe source", icon: KeyRound },
        ]}
        featuresTitle="Safe remediation"
        storageKey="effective-access-info"
        dismissible
      />

      <FilterCard>
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
      </FilterCard>

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
                enableExpansion
                renderExpandedRow={(row) => (
                  <EffectiveScopeExpandedRow scope={row.original} />
                )}
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

function EffectiveScopeExpandedRow({ scope }: { scope: EffectiveAccessScope }) {
  const sources = scope.granted_through ?? [];

  return (
    <div className="grid gap-4 p-4 text-sm md:grid-cols-[1.2fr_1fr]">
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Granting sources
        </div>
        {sources.length ? (
          <div className="mt-2 space-y-2">
            {sources.map((source) => (
              <div key={`${source.binding_id}:${source.role_id}`} className="rounded-md border p-3">
                <div className="font-medium">{source.role_name}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  binding {source.binding_id}
                </div>
                <Badge variant="outline" className="mt-2">
                  {source.source}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">No role currently grants this scope.</p>
        )}
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Remediation
        </div>
        <p className="mt-2 text-muted-foreground">
          {scope.status !== "granted"
            ? "Add access by assigning an existing Application role."
            : scope.removable && sources.length === 1
              ? "This scope has a single removable binding source."
              : "This scope is shared across multiple sources or a protected source. Review bindings before removing access."}
        </p>
      </section>
    </div>
  );
}
