import { useMemo } from "react";
import { ShieldX } from "lucide-react";

import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import {
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";

interface ConsentGrantsTableProps {
  grants: OAuthConsentGrant[];
  isAdmin: boolean;
  applicationContext?: boolean;
  onRevoke: (grant: OAuthConsentGrant) => void;
}

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function ConsentGrantsTable({
  grants,
  isAdmin,
  applicationContext = false,
  onRevoke,
}: ConsentGrantsTableProps) {
  const columns = useMemo<AdaptiveColumn<OAuthConsentGrant>[]>(
    () => [
      ...(isAdmin
        ? [
            {
              id: "user",
              header: "Principal",
              priority: 1,
              approxWidth: 190,
              cell: ({ row }) => (
                <EntityCell label="End user" detail={shortId(row.original.user_id)} monoDetail />
              ),
            } satisfies AdaptiveColumn<OAuthConsentGrant>,
          ]
        : []),
      {
        id: "client",
        header: "Client",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.client_name || "OAuth client"}
            detail={row.original.client_name ? shortId(row.original.client_id) : row.original.client_id}
            monoDetail
          />
        ),
      },
      ...(!applicationContext
        ? [
            {
              id: "resource",
              header: "Application",
              priority: 2,
              approxWidth: 240,
              cell: ({ row }) => (
                <div>
                  <div className="font-medium">
                    {row.original.resource_name || row.original.resource_server_id}
                  </div>
                  {row.original.resource_name ? (
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {row.original.resource_server_id}
                    </div>
                  ) : null}
                </div>
              ),
            } satisfies AdaptiveColumn<OAuthConsentGrant>,
          ]
        : []),
      {
        id: "scopes",
        header: "Capabilities",
        priority: 3,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.granted_scopes.slice(0, 3).map((scope) => (
              <Badge key={scope} variant="outline" className="font-mono text-xs">
                {scope}
              </Badge>
            ))}
            {row.original.granted_scopes.length > 3 ? (
              <Badge variant="secondary">
                +{row.original.granted_scopes.length - 3}
              </Badge>
            ) : null}
            {row.original.granted_scopes.length === 0 ? (
              <span className="text-sm text-muted-foreground">No scopes</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => (
          <Badge variant={row.original.revoked_at ? "destructive" : "default"}>
            {row.original.revoked_at ? "Revoked" : "Active"}
          </Badge>
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
                label: row.original.revoked_at ? "Already revoked" : "Revoke consent",
                icon: <ShieldX className="size-4" />,
                destructive: true,
                disabled: !!row.original.revoked_at,
                onSelect: () => onRevoke(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [applicationContext, isAdmin, onRevoke],
  );

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldX className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">No Consent Grants</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {isAdmin
            ? "No consent grants have been created yet. Users will grant consent when they authorize applications."
            : "You haven't granted access to any applications yet. When you authorize an application, it will appear here."}
        </p>
      </div>
    );
  }

  return (
    <AdaptiveTable
      tableId={isAdmin ? "admin-consent-grants" : "user-consent-grants"}
      data={grants}
      columns={columns}
      enableSelection={false}
      enableExpansion={false}
      getRowId={(grant) => grant.id}
      pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
    />
  );
}
