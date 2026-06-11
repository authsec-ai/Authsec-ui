import { ClientsTable } from "@/features/clients/ClientsTable";
import { useApplicationContext } from "./useApplicationContext";

export default function ApplicationClientsPage() {
  const { application } = useApplicationContext();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Clients
        </h2>
        <p className="text-sm text-muted-foreground">
          OAuth clients with access to this application. Approve pending requests,
          revoke access, and pre-register new clients from this view.
          Revoking affects only this workspace.
        </p>
      </header>

      <ClientsTable
        scope={{ kind: "resource_server", rsId: application.id }}
      />
    </div>
  );
}
