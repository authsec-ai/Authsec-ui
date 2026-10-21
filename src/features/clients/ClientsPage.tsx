import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { ConsolePage } from "@/components/console/ConsolePage";

import { ClientsTable } from "./ClientsTable";
import type { StatusFilter } from "./ClientsTable";
import { CreateClientWizard } from "./CreateClientWizard";

/** /clients — every OAuth client registered against this workspace's MCP servers. */
export function ClientsPage() {
  const { data: clients, refetch } = useListWorkspaceClientsQuery();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const pendingCount = useMemo(
    () => (clients ?? []).filter((c) => c.status === "pending_approval").length,
    [clients],
  );

  return (
    <ConsolePage
      crumbs={[{ label: "Agents", to: "/agents" }, { label: "Clients" }]}
      title="Clients"
      description={
        pendingCount > 0
          ? `OAuth clients registered on your MCP servers. ${pendingCount} pending approval.`
          : "OAuth clients registered on your MCP servers. Revoking affects only this workspace."
      }
      actions={
        // Clients normally register themselves through OAuth; this
        // pre-registers one by hand.
        <Button onClick={() => setWizardOpen(true)} variant="outline" className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" />
          Add client
        </Button>
      }
    >
      <ClientsTable
        scope={{ kind: "workspace" }}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <CreateClientWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => void refetch()}
      />
    </ConsolePage>
  );
}
