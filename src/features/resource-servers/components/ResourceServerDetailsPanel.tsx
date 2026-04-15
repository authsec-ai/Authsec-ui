import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import type { ResourceServer } from "@/app/api/resourceServersApi";

import { formatTimestamp } from "../resource-server-utils";

interface ResourceServerDetailsPanelProps {
  server: ResourceServer;
  compact?: boolean;
}

function DetailLine({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value?: string;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-foreground" title={value}>
          {value}
        </span>
        {copyable ? <CopyButton text={value} label={label} size="sm" /> : null}
      </div>
    </div>
  );
}

function BadgeGroup({ items }: { items: string[] }) {
  if (!items.length) {
    return <span className="text-sm text-muted-foreground">None configured</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} variant="outline">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export function ResourceServerDetailsPanel({
  server,
  compact = false,
}: ResourceServerDetailsPanelProps) {
  return (
    <div
      className={cn(
        "grid gap-6",
        compact ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]" : "xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]",
      )}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Protected resource details</h3>
            <Badge variant={server.active ? "default" : "secondary"}>
              {server.active ? "active" : "inactive"}
            </Badge>
          </div>
          <div className="grid gap-3">
            <DetailLine label="Name" value={server.name} />
            <DetailLine label="Public base URL" value={server.public_base_url} copyable />
            <DetailLine label="Protected base path" value={server.protected_base_path} copyable />
            <DetailLine label="Resource URI" value={server.resource_uri} copyable />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Supported scopes</h4>
          <BadgeGroup items={server.scopes_supported ?? []} />
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Registration modes</h4>
          <BadgeGroup items={server.registration_modes ?? []} />
        </div>
      </div>

      <div className="space-y-5 rounded-xl border bg-muted/20 p-4">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Operational metadata</h4>
          <div className="grid gap-3">
            <DetailLine label="Resource server ID" value={server.id} copyable />
            <DetailLine label="Tenant ID" value={server.tenant_id} copyable />
            <DetailLine label="Created" value={formatTimestamp(server.created_at)} />
            <DetailLine label="Updated" value={formatTimestamp(server.updated_at)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResourceServerExpandedRow({ server }: { server: ResourceServer }) {
  return <ResourceServerDetailsPanel server={server} compact />;
}
