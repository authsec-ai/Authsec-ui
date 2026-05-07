/**
 * `ApplicationClientsPage` — client readiness, fully wired.
 *
 * Backend returns: `client_id`, `client_name`, `registration_type`, `status`.
 * That's all we render. The previous version invented `redirect_uri` and
 * `allowed_labels` that the backend doesn't expose — those are gone.
 */

import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, CheckCircle2, Clock4, Plus } from "lucide-react";

import { useListResourceServerClientsQuery } from "@/app/api/resourceServersApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";

const STATUS_TONE: Record<
  string,
  { chip: string; chipText: string; icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  approved: {
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)]",
    chipText: "text-[var(--color-success)]",
    icon: CheckCircle2,
    label: "Approved",
  },
  ready: {
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)]",
    chipText: "text-[var(--color-success)]",
    icon: CheckCircle2,
    label: "Ready",
  },
  pending: {
    chip: "border-[color:color-mix(in_oklch,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_10%,transparent)]",
    chipText: "text-[var(--color-warning)]",
    icon: Clock4,
    label: "Pending",
  },
  rejected: {
    chip: "border-[color:color-mix(in_oklch,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_10%,transparent)]",
    chipText: "text-[var(--color-danger)]",
    icon: AlertTriangle,
    label: "Rejected",
  },
  revoked: {
    chip: "border-[color:color-mix(in_oklch,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_10%,transparent)]",
    chipText: "text-[var(--color-danger)]",
    icon: AlertTriangle,
    label: "Revoked",
  },
};

const REGISTRATION_LABEL: Record<string, string> = {
  prereg: "Pre-registered",
  dcr: "Dynamic (DCR)",
  cimd: "Client-initiated metadata",
};

export default function ApplicationClientsPage() {
  const { application } = useApplicationContext();
  const { data: clients, isLoading } = useListResourceServerClientsQuery(
    application.id,
  );

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Client readiness
        </h2>
        <p className="text-sm text-muted-foreground">
          Pre-register clients that need to call this application.
          Sourced from{" "}
          <code className="font-mono text-xs">
            GET /authsec/resource-servers/{application.id}/clients
          </code>
          .
        </p>
      </header>

      <Card className="border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_5%,transparent)] p-4">
        <p className="text-sm text-foreground">
          A client can <em>request</em> access labels, but users only
          receive labels granted by their roles or default access.
        </p>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Loading clients…"
            : (clients?.length ?? 0) === 0
              ? "No clients registered yet."
              : `${clients!.length} client${clients!.length === 1 ? "" : "s"}`}
        </p>
        <Button asChild>
          <Link to={`/resource-servers/${application.id}/clients`}>
            <Plus className="mr-1.5 size-4" />
            Manage clients
          </Link>
        </Button>
      </div>

      {isLoading && (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" />
          Loading…
        </Card>
      )}

      {!isLoading && (clients?.length ?? 0) === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No clients registered. Some applications allow dynamic client
          registration — check the connection mode in Setup.
        </Card>
      )}

      {!isLoading && (clients?.length ?? 0) > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {clients!.map((client) => (
            <ClientCard key={client.client_id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({
  client,
}: {
  client: {
    client_id: string;
    client_name: string;
    registration_type: string;
    status: string;
  };
}) {
  const tone = STATUS_TONE[client.status] ?? STATUS_TONE.pending;
  const Icon = tone.icon;
  const registrationLabel =
    REGISTRATION_LABEL[client.registration_type] ?? client.registration_type;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-foreground">
            {client.client_name}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mode:{" "}
            <span className="font-medium text-foreground">
              {registrationLabel}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
            tone.chip,
            tone.chipText,
          )}
        >
          <Icon className="size-3" />
          {tone.label}
        </span>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div>
          <dt className="font-bold uppercase tracking-wide text-muted-foreground">
            Client ID
          </dt>
          <dd className="mt-0.5 truncate font-mono text-foreground">
            {client.client_id}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
