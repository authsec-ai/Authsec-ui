import { useState } from "react";

import { useListAdminConsentGrantsQuery } from "@/app/api/consentGrantsApi";
import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";
import { CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { ConsoleFilterBar } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { ConsentGrantsTable } from "@/features/consent-grants/components/ConsentGrantsTable";
import { RevokeConsentDialog } from "@/features/consent-grants/components/RevokeConsentDialog";
import { useApplicationContext } from "./useApplicationContext";

export default function ApplicationConsentGrantsPage() {
  const { application } = useApplicationContext();
  const { data, isLoading } = useListAdminConsentGrantsQuery({ rs_id: application.id });
  const [query, setQuery] = useState("");
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean;
    grant: OAuthConsentGrant | null;
  }>({ open: false, grant: null });

  const grants = (data?.consent_grants ?? []).filter((grant) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      grant.user_id,
      grant.client_id,
      grant.client_name,
      ...grant.granted_scopes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Consent grants</h2>
        <p className="text-sm text-muted-foreground">
          App-specific OAuth grants that keep clients authorized for {application.name}.
        </p>
      </header>
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search users, clients, or capabilities"
      />
      <TableCard>
        <CardContent variant="flush">
        {isLoading ? (
          <DataTableSkeleton rows={5} columns={7} />
        ) : (
          <ConsentGrantsTable
            grants={grants}
            isAdmin
            applicationContext
            onRevoke={(grant) => setRevokeDialog({ open: true, grant })}
          />
        )}
        </CardContent>
      <RevokeConsentDialog
        grant={revokeDialog.grant}
        open={revokeDialog.open}
        onOpenChange={(open) => {
          if (!open) setRevokeDialog({ open: false, grant: null });
        }}
      />
      </TableCard>
    </div>
  );
}
