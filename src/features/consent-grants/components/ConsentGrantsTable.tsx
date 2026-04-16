import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldX, Clock, KeyRound } from "lucide-react";
import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";

interface ConsentGrantsTableProps {
  grants: OAuthConsentGrant[];
  isAdmin: boolean;
  onRevoke: (grant: OAuthConsentGrant) => void;
}

export function ConsentGrantsTable({
  grants,
  isAdmin,
  onRevoke,
}: ConsentGrantsTableProps) {
  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShieldX className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Consent Grants</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          {isAdmin
            ? "No consent grants have been created yet. Users will grant consent when they authorize applications."
            : "You haven't granted access to any applications yet. When you authorize an application, it will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            {isAdmin && <th className="px-4 py-3">User</th>}
            <th className="px-4 py-3">Client</th>
            <th className="px-4 py-3">Resource Server</th>
            <th className="px-4 py-3">Scopes</th>
            <th className="px-4 py-3">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Granted
              </div>
            </th>
            <th className="px-4 py-3">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expires
              </div>
            </th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {grants.map((grant) => (
            <tr key={grant.id} className="hover:bg-muted/50">
              {isAdmin && (
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs text-muted-foreground">
                      {grant.user_id}
                    </span>
                  </div>
                </td>
              )}
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {grant.client_name || grant.client_id}
                  </span>
                  {grant.client_name && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {grant.client_id}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {grant.resource_name || grant.resource_server_id}
                  </span>
                  {grant.resource_name && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {grant.resource_server_id}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5 max-w-sm">
                  {grant.granted_scopes.length > 0 ? (
                    grant.granted_scopes.map((scope) => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className="font-mono text-xs"
                      >
                        <KeyRound className="h-3 w-3 mr-1" />
                        {scope}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      No scopes
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="text-muted-foreground">
                  {new Date(grant.created_at).toLocaleDateString()}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-muted-foreground">
                  {new Date(grant.expires_at).toLocaleDateString()}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onRevoke(grant)}
                  disabled={!!grant.revoked_at}
                >
                  <ShieldX className="h-3 w-3 mr-1" />
                  {grant.revoked_at ? "Revoked" : "Revoke"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
