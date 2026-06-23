import { useMemo, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { ConsolePage } from "@/components/console/ConsolePage";

import { ClientsTable } from "./ClientsTable";
import type { StatusFilter } from "./ClientsTable";
import { CreateClientWizard } from "./CreateClientWizard";

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
      title={
        <span className="flex items-center gap-2">
          Clients
          {pendingCount > 0 && (
            <button
              onClick={() => setStatusFilter("pending_approval")}
              className="inline-flex items-center gap-1 rounded-full bg-[color:color-mix(in_oklch,var(--color-warning)_15%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--color-warning)] hover:bg-[color:color-mix(in_oklch,var(--color-warning)_22%,transparent)] transition-colors"
              aria-label={`${pendingCount} clients awaiting approval`}
            >
              <AlertCircle className="size-3" aria-hidden />
              {pendingCount} awaiting approval
            </button>
          )}
        </span>
      }
      description={
        <>
          Clients with access to this workspace's MCP servers. Revoking affects only this workspace.
          {pendingCount > 0 && (
            <>
              {" "}Pending client registrations can be approved or denied in the table below.
              Role-based access requests still live inside each application's Requests tab.
            </>
          )}
        </>
      }
      actions={
        <Button
          onClick={() => setWizardOpen(true)}
          size="sm"
          className="shrink-0 text-white"
        >
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
