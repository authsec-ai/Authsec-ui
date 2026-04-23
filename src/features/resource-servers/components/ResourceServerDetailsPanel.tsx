import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";
import type { ResourceServer } from "@/app/api/resourceServersApi";

import {
  computeMcpEndpointURL,
  computeMetadataPath,
  computeMetadataURL,
  formatTimestamp,
} from "../resource-server-utils";

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
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-mono text-xs text-foreground" title={value}>
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
  const mcpEndpointURL = computeMcpEndpointURL(server);
  const metadataPath = computeMetadataPath(server.resource_uri);
  const metadataURL = computeMetadataURL(server.resource_uri);

  return (
    <div
      className={cn(
        "grid gap-6",
        compact
          ? "md:grid-cols-2"
          : "xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]",
      )}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Protected Resource Details
          </h4>
          <div className="space-y-3 text-sm">
            <DetailLine label="Name" value={server.name} />
            <DetailLine label="Public base URL" value={server.public_base_url} copyable />
            <DetailLine label="Protected base path" value={server.protected_base_path} copyable />
            <DetailLine label="Resource URI" value={server.resource_uri} copyable />
            <DetailLine label="MCP endpoint URL" value={mcpEndpointURL} copyable />
            <DetailLine label="Metadata path" value={metadataPath} copyable />
            <DetailLine label="Metadata URL" value={metadataURL} copyable />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-foreground">Status</span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  server.active
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground/60"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    server.active ? "bg-emerald-500" : "bg-foreground/40"
                  }`}
                />
                {server.active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Supported Scopes</h4>
          <BadgeGroup items={server.scopes_supported ?? []} />
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Registration Modes</h4>
          <BadgeGroup items={server.registration_modes ?? []} />
        </div>
      </div>

      <div className={cn("space-y-4", !compact && "rounded-xl border bg-muted/20 p-4")}>
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          Operational Metadata
        </h4>
        <div className="space-y-3 text-sm">
            <DetailLine label="Resource server ID" value={server.id} copyable />
            <DetailLine label="Tenant ID" value={server.tenant_id} copyable />
            <DetailLine label="Created" value={formatTimestamp(server.created_at)} />
            <DetailLine label="Updated" value={formatTimestamp(server.updated_at)} />
        </div>
      </div>
    </div>
  );
}

export function ResourceServerExpandedRow({ server }: { server: ResourceServer }) {
  return <ResourceServerDetailsPanel server={server} compact />;
}
