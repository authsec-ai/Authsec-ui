import { useMemo, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";

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
    <div className="space-y-4 p-6">
      {/* Page header */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Clients
            </h1>
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
          </div>
          <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
            Clients with access to this workspace's MCP servers. Revoking affects only this workspace.
          </p>
          {pendingCount > 0 && (
            <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
              Pending client registrations can be approved or denied in the table below. Role-based
              access requests still live inside each application's Requests tab.
            </p>
          )}
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          size="sm"
          className="shrink-0 text-white"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add client
        </Button>
      </header>

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
    </div>
  );
}
