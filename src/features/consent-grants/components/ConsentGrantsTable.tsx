import { useMemo } from "react";
import { Clock, KeyRound, ShieldX } from "lucide-react";

import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ConsentGrantsTableProps {
  grants: OAuthConsentGrant[];
  isAdmin: boolean;
  applicationContext?: boolean;
  onRevoke: (grant: OAuthConsentGrant) => void;
}

function formatDate(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString();
}

function ConsentGrantExpandedRow({
  grant,
  isAdmin,
}: {
  grant: OAuthConsentGrant;
  isAdmin: boolean;
}) {
  return (
    <div className="grid gap-4 p-4 text-sm md:grid-cols-3">
      {isAdmin ? (
        <section>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            User
          </div>
          <div className="mt-2 break-all font-mono text-xs text-muted-foreground">
            {grant.user_id}
          </div>
        </section>
      ) : null}
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Client
        </div>
        <div className="mt-2 font-medium">{grant.client_name || grant.client_id}</div>
        {grant.client_name ? (
          <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {grant.client_id}
          </div>
        ) : null}
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Resource
        </div>
        <div className="mt-2 font-medium">{grant.resource_name || grant.resource_server_id}</div>
        {grant.resource_name ? (
          <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {grant.resource_server_id}
          </div>
        ) : null}
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scopes
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grant.granted_scopes.length ? (
            grant.granted_scopes.map((scope) => (
              <Badge key={scope} variant="outline" className="font-mono text-xs">
                <KeyRound className="mr-1 h-3 w-3" />
                {scope}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">No scopes</span>
          )}
        </div>
      </section>
    </div>
  );
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
              header: "User",
              priority: 1,
              approxWidth: 190,
              cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground">
                  {row.original.user_id}
                </span>
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
          <div>
            <div className="font-medium">{row.original.client_name || row.original.client_id}</div>
            {row.original.client_name ? (
              <div className="truncate font-mono text-xs text-muted-foreground">
                {row.original.client_id}
              </div>
            ) : null}
          </div>
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
        header: "Scopes",
        priority: 3,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.granted_scopes.length} scope
            {row.original.granted_scopes.length === 1 ? "" : "s"}
          </span>
        ),
      },
      {
        id: "granted",
        header: "Granted",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "expires",
        header: "Expires",
        priority: 5,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(row.original.expires_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        alwaysVisible: true,
        approxWidth: 130,
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onRevoke(row.original)}
            disabled={!!row.original.revoked_at}
          >
            <ShieldX className="mr-1 h-3 w-3" />
            {row.original.revoked_at ? "Revoked" : "Revoke"}
          </Button>
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
      enableExpansion={!applicationContext}
      renderExpandedRow={
        applicationContext
          ? undefined
          : (row) => <ConsentGrantExpandedRow grant={row.original} isAdmin={isAdmin} />
      }
      getRowId={(grant) => grant.id}
      pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
    />
  );
}
