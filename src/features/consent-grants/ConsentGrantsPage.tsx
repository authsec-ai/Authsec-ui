import { useState, useMemo } from "react";
import { useRbacAudience } from "@/contexts/RbacAudienceContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { RefreshCcw, Search, ShieldX } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  useListAdminConsentGrantsQuery,
  useListUserConsentGrantsQuery,
} from "@/app/api/consentGrantsApi";
import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";
import { ConsentGrantsTable } from "./components/ConsentGrantsTable";
import { RevokeConsentDialog } from "./components/RevokeConsentDialog";

/**
 * Consent Grants Page
 *
 * Displays and manages OAuth consent grants (remembered user consent for client x resource server).
 * - Admin view: Lists all consent grants across all users with optional filters
 * - End-user view: Lists consent grants for the current user
 */
export function ConsentGrantsPage() {
  const { isAdmin } = useRbacAudience();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean;
    grant: OAuthConsentGrant | null;
  }>({ open: false, grant: null });

  // Build filter object for admin queries
  const adminFilters = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || !isAdmin) return undefined;

    // Simple search - searches across user_id and client_id
    return {
      user_id: query,
      client_id: query,
    };
  }, [searchQuery, isAdmin]);

  // API queries - conditional based on audience
  const {
    data: adminData,
    isLoading: isAdminLoading,
    isFetching: isAdminFetching,
    refetch: refetchAdmin,
  } = useListAdminConsentGrantsQuery(adminFilters, {
    skip: !isAdmin,
  });

  const {
    data: userData,
    isLoading: isUserLoading,
    isFetching: isUserFetching,
    refetch: refetchUser,
  } = useListUserConsentGrantsQuery(undefined, {
    skip: isAdmin,
  });

  // Derive loading and data states
  const isLoading = isAdmin ? isAdminLoading : isUserLoading;
  const isFetching = isAdmin ? isAdminFetching : isUserFetching;
  const grants = (isAdmin ? adminData?.consent_grants : userData?.consent_grants) || [];

  // Client-side filtering for end-users (since API doesn't support filters)
  const filteredGrants = useMemo(() => {
    if (isAdmin || !searchQuery.trim()) return grants;

    const query = searchQuery.toLowerCase();
    return grants.filter(
      (grant) =>
        grant.client_id.toLowerCase().includes(query) ||
        grant.client_name?.toLowerCase().includes(query) ||
        grant.resource_server_id.toLowerCase().includes(query) ||
        grant.resource_name?.toLowerCase().includes(query)
    );
  }, [grants, searchQuery, isAdmin]);

  // Handlers
  const handleRefresh = () => {
    if (isAdmin) {
      refetchAdmin();
    } else {
      refetchUser();
    }
    toast.success("Refreshing consent grants...");
  };

  const handleRevokeClick = (grant: OAuthConsentGrant) => {
    setRevokeDialog({ open: true, grant });
  };

  const handleRevokeDialogClose = (open: boolean) => {
    if (!open) {
      setRevokeDialog({ open: false, grant: null });
    }
  };

  // Copy based on audience
  const copy = useMemo(
    () => ({
      title: "Consent Grants",
      description: isAdmin
        ? `Manage OAuth consent grants across all users. ${filteredGrants.length} total grants.`
        : `View and revoke your application access permissions. ${filteredGrants.length} active grants.`,
    }),
    [isAdmin, filteredGrants.length]
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        {/* Header */}
        <PageHeader
          title={copy.title}
          description={copy.description}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isFetching}
              >
                <RefreshCcw
                  className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          }
        />

        {/* Search/Filter Bar */}
        {grants.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={
                  isAdmin
                    ? "Search by user or client..."
                    : "Search by client or resource..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {searchQuery.trim() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Table Card */}
        <TableCard className="space-y-4 p-4 sm:p-6">
          {isLoading ? (
            <DataTableSkeleton rows={5} columns={isAdmin ? 7 : 6} />
          ) : filteredGrants.length === 0 && searchQuery.trim() ? (
            // No search results
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
              <p className="text-muted-foreground">
                No consent grants match your search "{searchQuery}"
              </p>
            </div>
          ) : (
            <ConsentGrantsTable
              grants={filteredGrants}
              isAdmin={isAdmin}
              onRevoke={handleRevokeClick}
            />
          )}

          {/* Stats Badge */}
          {!isLoading && filteredGrants.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldX className="h-4 w-4" />
                <span>
                  Showing {filteredGrants.length}{" "}
                  {filteredGrants.length === 1 ? "grant" : "grants"}
                </span>
              </div>
              {searchQuery.trim() && (
                <Badge variant="outline">Filtered</Badge>
              )}
            </div>
          )}
        </TableCard>
      </div>

      {/* Revoke Dialog */}
      <RevokeConsentDialog
        grant={revokeDialog.grant}
        open={revokeDialog.open}
        onOpenChange={handleRevokeDialogClose}
      />
    </div>
  );
}
