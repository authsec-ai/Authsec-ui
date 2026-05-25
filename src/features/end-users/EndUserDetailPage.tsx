import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

import { useGetEndUserQuery, type TenantEndUserState } from "@/app/api/membershipApi";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableCard } from "@/theme/components/cards";
import { resolveTenantId } from "@/utils/workspace";

type EndUserApplication = NonNullable<TenantEndUserState["applications"]>[number];

const formatDate = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatDistanceToNow(date, { addSuffix: true });
};

function ApplicationExpandedRow({
  application,
  userId,
  onEffectiveAccess,
}: {
  application: EndUserApplication;
  userId: string;
  onEffectiveAccess: () => void;
}) {
  return (
    <div className="grid gap-4 p-4 text-sm md:grid-cols-[1.2fr_1fr]">
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Application
        </div>
        <div className="mt-2 font-medium">{application.name}</div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {application.resource_uri}
        </div>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Binding metadata
        </div>
        <dl className="mt-2 space-y-1">
          <div>
            <dt className="inline text-muted-foreground">User ID: </dt>
            <dd className="inline font-mono text-xs">{userId}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Role ID: </dt>
            <dd className="inline font-mono text-xs">{application.role_id}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Binding ID: </dt>
            <dd className="inline font-mono text-xs">{application.binding_id}</dd>
          </div>
        </dl>
        <Button className="mt-4" size="sm" onClick={onEffectiveAccess}>
          Effective access
        </Button>
      </section>
    </div>
  );
}

export default function EndUserDetailPage() {
  const navigate = useNavigate();
  const { userId = "" } = useParams();
  const tenantId = resolveTenantId();
  const { data: user, isLoading } = useGetEndUserQuery(
    { tenantId: tenantId || "", userId },
    { skip: !tenantId || !userId },
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
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.original.resource_uri}
            </div>
          </div>
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
        header: "Effective scopes",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => <span>{row.original.scopes_count}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/applications/${row.original.application_id}/access`)}
            >
              Open application
            </Button>
            <Button
              size="sm"
              onClick={() =>
                navigate(
                  `/authz/effective-access?user_id=${userId}&application_id=${row.original.application_id}`,
                )
              }
            >
              Effective access
            </Button>
          </div>
        ),
      },
    ],
    [navigate, userId],
  );

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title={displayName}
        description="Consumer identity, application access, effective scopes, and consent history for this workspace."
        actions={
          <Button
            variant="outline"
            onClick={() => navigate(`/authz/effective-access?user_id=${userId}`)}
          >
            Effective access
          </Button>
        }
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
            <div className="text-sm text-muted-foreground">First consent</div>
            <div className="mt-2 font-medium">{formatDate(user?.first_consent_at)}</div>
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
              enableExpansion
              renderExpandedRow={(row) => (
                <ApplicationExpandedRow
                  application={row.original}
                  userId={userId}
                  onEffectiveAccess={() =>
                    navigate(
                      `/authz/effective-access?user_id=${userId}&application_id=${row.original.application_id}`,
                    )
                  }
                />
              )}
              getRowId={(application) => application.binding_id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
