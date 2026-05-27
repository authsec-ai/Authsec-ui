import { useState } from "react";

import { useListAdminConsentGrantsQuery } from "@/app/api/consentGrantsApi";
import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";
import { CardContent } from "@/components/ui/card";
import { DataTableSkeleton } from "@/components/ui/table-skeleton";
import { TableCard } from "@/theme/components/cards";
import { ConsentGrantsTable } from "@/features/consent-grants/components/ConsentGrantsTable";
import { RevokeConsentDialog } from "@/features/consent-grants/components/RevokeConsentDialog";
import { useApplicationContext } from "./useApplicationContext";

export default function ApplicationConsentGrantsPage() {
  const { application } = useApplicationContext();
  const { data, isLoading } = useListAdminConsentGrantsQuery({ rs_id: application.id });
  const [revokeDialog, setRevokeDialog] = useState<{
    open: boolean;
    grant: OAuthConsentGrant | null;
  }>({ open: false, grant: null });

  const grants = data?.consent_grants ?? [];

  return (
    <TableCard>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="text-lg font-semibold">Consent Grants</h2>
          <p className="text-sm text-muted-foreground">
            Remembered OAuth consent grants for {application.name}.
          </p>
        </div>
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
  );
}
