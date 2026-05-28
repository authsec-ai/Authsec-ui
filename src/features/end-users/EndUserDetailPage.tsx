import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useGetEndUserQuery, type TenantEndUserState } from "@/app/api/membershipApi";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import {
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableCard } from "@/theme/components/cards";
import { resolveWorkspaceId } from "@/utils/workspace";

type EndUserApplication = NonNullable<TenantEndUserState["applications"]>[number];

export default function EndUserDetailPage() {
  const navigate = useNavigate();
  const { userId = "" } = useParams();
  const workspaceId = resolveWorkspaceId();
  const { data: user, isLoading } = useGetEndUserQuery(
    { workspaceId: workspaceId || "", userId },
    { skip: !workspaceId || !userId },
  );

  const applications = useMemo(() => user?.applications ?? [], [user?.applications]);
  const displayName = user?.user_email || user?.user_username || user?.user_id || "End user";

  const columns = useMemo<AdaptiveColumn<EndUserApplication>[]>(
    () => [
      {
        id: "application",
        header: "Application",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell label={row.original.name} detail={row.original.resource_uri} monoDetail />
        ),
      },
      {
        id: "role",
        header: "Role",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => <Badge variant="secondary">{row.original.role_label}</Badge>,
      },
      {
        id: "scopes",
        header: "Capabilities",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => (
          <span>{row.original.scopes_count} scope{row.original.scopes_count === 1 ? "" : "s"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 76,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "Open application access",
                onSelect: () => navigate(`/applications/${row.original.application_id}/access`),
              },
              {
                label: "Review assignments",
                onSelect: () => navigate(`/applications/${row.original.application_id}/role-bindings`),
              },
              {
                label: "View consent grants",
                onSelect: () => navigate(`/applications/${row.original.application_id}/consent-grants`),
              },
            ]}
          />
        ),
      },
    ],
    [navigate],
  );

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={displayName}
        description="Consumer identity, application access, effective scopes, and remediation paths for this workspace."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <TableCard>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="mt-2">
              <Badge variant={user?.status === "active" ? "default" : "destructive"}>
                {user?.status || "unknown"}
              </Badge>
            </div>
          </CardContent>
        </TableCard>
        <TableCard>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Applications</div>
            <div className="mt-2 font-medium">{applications.length}</div>
          </CardContent>
        </TableCard>
        <TableCard>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Effective scopes</div>
            <div className="mt-2 font-medium">{user?.effective_scopes_count ?? 0}</div>
          </CardContent>
        </TableCard>
      </div>

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading end-user access...
            </div>
          ) : applications.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              This end user has no application role bindings.
            </div>
          ) : (
            <AdaptiveTable
              tableId="end-user-applications"
              data={applications}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(application) => application.binding_id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
