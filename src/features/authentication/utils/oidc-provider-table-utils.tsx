import * as React from "react";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { MoreHorizontal, Trash2, Eye, EyeOff } from "lucide-react";
import type { ResponsiveColumnDef } from "../../../components/ui/responsive-data-table";
import type { UnifiedAuthProvider } from "../types";

// OIDC Provider interface based on aggregated API response (show-auth-providers)
export interface ApiOidcProvider {
  client_ids: string;
  display_name: string;
  is_active: boolean;
  provider_name: string;
  provider_type: string;
  sort_order: number;
  // Legacy / optional fields
  client_id?: string;
  hydra_client_id?: string;
  callback_url?: string;
  status?: string;
  created_at?: string;
  endpoints?: {
    auth_url: string;
    token_url: string;
    user_info_url?: string;
  };
  provider_config?: {
    auth_url?: string;
    token_url?: string;
    user_info_url?: string;
    scopes?: string[];
    redirect_urls?: string[];
    client_id?: string;
    client_secret?: string;
  };
}

// OIDC Provider-specific utility functions
export const OidcProviderTableUtils = {
  // Format provider name for display
  formatProviderName: (providerName: string) => {
    const nameMap: Record<string, string> = {
      google: "Google",
      github: "GitHub",
      microsoft: "Microsoft",
      facebook: "Facebook",
      twitter: "Twitter",
      linkedin: "LinkedIn",
      apple: "Apple",
    };
    return (
      nameMap[providerName.toLowerCase()] ||
      providerName.charAt(0).toUpperCase() + providerName.slice(1)
    );
  },

  // Check if provider has complete configuration
  isConfigurationComplete: (provider: ApiOidcProvider) => {
    const endpoints = provider.endpoints || provider.provider_config || {};
    return Boolean(
      endpoints.auth_url && endpoints.token_url && endpoints.user_info_url,
    );
  },
};

// OIDC Provider table action handlers interface
export interface OidcProviderTableActions {
  onDuplicate: (providerId: string) => void;
  onDelete: (providerId: string) => void;
  onToggleActive: (providerId: string, isActive: boolean) => void;
  onViewConfiguration: (providerId: string) => void;
  onTestConnection: (providerId: string) => void;
}

// Reusable provider cell component
export function ProviderCell({
  provider,
  onSelect,
}: {
  provider: UnifiedAuthProvider | ApiOidcProvider;
  onSelect?: (provider: UnifiedAuthProvider | ApiOidcProvider) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      {onSelect ? (
        <button
          type="button"
          className="w-full truncate text-left text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          title={provider.display_name}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(provider);
          }}
        >
          {provider.display_name}
        </button>
      ) : (
        <p
          className="truncate text-sm font-medium text-foreground"
          title={provider.display_name}
        >
          {provider.display_name}
        </p>
      )}
      <p className="text-xs text-foreground">
        {OidcProviderTableUtils.formatProviderName(provider.provider_name)}
      </p>
    </div>
  );
}

// Reusable status cell component
export function StatusCell({
  provider,
}: {
  provider: UnifiedAuthProvider | ApiOidcProvider;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`h-2 w-2 rounded-full ${provider.is_active ? "bg-green-500" : "bg-gray-400"}`}
      />
      <p
        className={`font-medium ${
          provider.is_active
            ? "text-green-700 dark:text-green-400"
            : "text-gray-600 dark:text-gray-400"
        }`}
      >
        {provider.is_active ? "Active" : "Inactive"}
      </p>
    </div>
  );
}

export function ConfigurationCell({ provider }: { provider: ApiOidcProvider }) {
  const scopeCount = provider.provider_config?.scopes?.length ?? 0;
  const callbackUrl =
    provider.callback_url ||
    provider.provider_config?.redirect_urls?.[0] ||
    provider.provider_config?.auth_url ||
    "";

  return (
    <div className="space-y-1 text-sm text-foreground">
      <p>
        {scopeCount} {scopeCount === 1 ? "scope" : "scopes"}
      </p>
      <p className="truncate" title={callbackUrl || "No callback URL"}>
        {callbackUrl || "No callback URL"}
      </p>
    </div>
  );
}

// Reusable endpoints cell component
export function EndpointsCell({ provider }: { provider: ApiOidcProvider }) {
  const endpoints = provider.endpoints || provider.provider_config || {};
  const hasAllEndpoints =
    endpoints.auth_url && endpoints.token_url && endpoints.user_info_url;
  const configured = [
    endpoints.auth_url ? "Auth" : null,
    endpoints.token_url ? "Token" : null,
    endpoints.user_info_url ? "User info" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-1 text-sm">
      <p className="text-foreground">
        {hasAllEndpoints
          ? "Auth • Token • User info"
          : `${configured.length}/3 endpoints configured`}
      </p>
      <p className="text-xs text-foreground">
        {hasAllEndpoints
          ? "Ready for OAuth exchange"
          : "Add the missing endpoints to finish setup"}
      </p>
    </div>
  );
}

// Reusable activity cell component
export function ActivityCell({ provider }: { provider: ApiOidcProvider }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="text-foreground">Sort order {provider.sort_order ?? "—"}</p>
      <p className="text-xs text-foreground">
        {provider.status || "No recent status"}
      </p>
    </div>
  );
}

// Reusable actions cell component
export function ActionsCell({
  provider,
  actions,
}: {
  provider: UnifiedAuthProvider | ApiOidcProvider;
  actions: OidcProviderTableActions;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  // Determine provider ID based on type
  const providerId =
    "id" in provider
      ? provider.id
      : (provider.client_ids ?? provider.client_id ?? provider.provider_name);

  // Log when dropdown state changes
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      `[ActionsCell] Dropdown for provider "${provider.display_name}" (${providerId}) is now:`,
      isOpen ? "OPEN" : "CLOSED",
    );
  }, [isOpen, provider.display_name, providerId]);

  const handleOpenChange = (open: boolean) => {
    // eslint-disable-next-line no-console
    console.log(
      `[ActionsCell] handleOpenChange called for "${provider.display_name}":`,
      open,
    );
    setIsOpen(open);
  };

  const handleToggleActive = (e: React.MouseEvent, isActive: boolean) => {
    // eslint-disable-next-line no-console
    console.log(
      `[ActionsCell] handleToggleActive for "${provider.display_name}":`,
      isActive,
    );
    e.stopPropagation();
    e.preventDefault();
    actions.onToggleActive(providerId, isActive);
    setIsOpen(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    // eslint-disable-next-line no-console
    console.log(`[ActionsCell] handleDelete for "${provider.display_name}"`);
    e.stopPropagation();
    e.preventDefault();
    actions.onDelete(providerId);
    setIsOpen(false);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    // eslint-disable-next-line no-console
    console.log(
      `[ActionsCell] Trigger button clicked for "${provider.display_name}"`,
      {
        clientId: provider.client_id,
        currentOpenState: isOpen,
        eventTarget: (e.target as HTMLElement).tagName,
      },
    );
    e.stopPropagation();
    e.preventDefault();
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // eslint-disable-next-line no-console
    console.log(
      `[ActionsCell] Container div clicked for "${provider.display_name}"`,
    );
    e.stopPropagation();
  };

  const handleContentClick = (e: React.MouseEvent) => {
    // eslint-disable-next-line no-console
    console.log(
      `[ActionsCell] Dropdown content clicked for "${provider.display_name}"`,
    );
    e.stopPropagation();
    e.preventDefault();
  };

  // Check if this is the authsec provider (system default, cannot be deleted)
  const isAuthSec = provider.provider_name?.toLowerCase() === "authsec";

  return (
    <div
      className="flex items-center justify-end gap-1"
      onClick={handleContainerClick}
    >
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="admin-row-icon-btn h-8 w-8 p-0"
            onClick={handleTriggerClick}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">
              Open menu for {provider.display_name}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          visualVariant="row-actions"
          onClick={handleContentClick}
        >
          {/* Status Toggle */}
          {provider.is_active ? (
            <DropdownMenuItem onClick={(e) => handleToggleActive(e, false)}>
              <EyeOff className="mr-2 h-4 w-4" />
              Deactivate Provider
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={(e) => handleToggleActive(e, true)}>
              <Eye className="mr-2 h-4 w-4" />
              Activate Provider
            </DropdownMenuItem>
          )}

          {/* Delete - hidden for authsec provider */}
          {!isAuthSec && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Expanded row content component with provider details
export function ProviderExpandedRow({
  provider,
}: {
  provider: UnifiedAuthProvider | ApiOidcProvider;
}) {
  const p = provider as any;
  const rawClientIds: string = p.client_ids ?? p.client_id ?? "";
  const clientIdList = rawClientIds
    ? rawClientIds
        .split(",")
        .map((id: string) => id.trim())
        .filter(Boolean)
    : [];

  const simpleFields = [
    { label: "Display Name", value: provider.display_name },
    { label: "Provider Name", value: provider.provider_name },
    { label: "Provider Type", value: p.provider_type ?? "—" },
    { label: "Status", value: provider.is_active ? "Active" : "Inactive" },
  ];

  return (
    <div className="px-0 py-2 space-y-3">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        {simpleFields.map(({ label, value }) => (
          <div key={label} className="space-y-1">
            <dt className="text-xs font-medium text-foreground">{label}</dt>
            <dd className="text-sm text-foreground">{value || "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-1">
        <dt className="text-xs font-medium text-foreground">Client IDs</dt>
        {clientIdList.length > 0 ? (
          <div className="flex flex-col gap-1">
            {clientIdList.map((id: string) => (
              <dd
                key={id}
                className="font-mono text-xs text-foreground truncate"
                title={id}
              >
                {id}
              </dd>
            ))}
          </div>
        ) : (
          <dd className="text-sm text-foreground">—</dd>
        )}
      </div>
    </div>
  );
}

// Column definitions factory
export function createOidcProviderTableColumns(
  actions: OidcProviderTableActions,
): ResponsiveColumnDef<ApiOidcProvider, any>[] {
  return [
    {
      id: "provider",
      accessorKey: "display_name",
      header: "Provider",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => {
        return <ProviderCell provider={row.original} />;
      },
      cellClassName: "max-w-0",
    },
    {
      id: "status",
      accessorKey: "is_active",
      header: "Status",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => <StatusCell provider={row.original} />,
    },
    {
      id: "configuration",
      accessorKey: "provider_config",
      header: "Configuration",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => (
        <ConfigurationCell provider={row.original} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      resizable: false,
      responsive: false,
      enableSorting: false,
      cell: ({ row }: { row: any }) => (
        <ActionsCell provider={row.original} actions={actions} />
      ),
      cellClassName: "text-center",
    },
  ];
}

// Dynamic column definitions factory
export function createDynamicOidcProviderTableColumns(
  visibleColumns: string[],
  actions: OidcProviderTableActions,
): ResponsiveColumnDef<ApiOidcProvider, any>[] {
  const availableColumns: Record<
    string,
    ResponsiveColumnDef<ApiOidcProvider, any>
  > = {
    provider: {
      id: "provider",
      accessorKey: "display_name",
      header: "Provider",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => {
        return <ProviderCell provider={row.original} />;
      },
    },
    status: {
      id: "status",
      accessorKey: "is_active",
      header: "Status",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => <StatusCell provider={row.original} />,
    },
    providerName: {
      id: "providerName",
      accessorKey: "provider_name",
      header: "Provider Type",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => (
        <span className="text-sm text-foreground">
          {OidcProviderTableUtils.formatProviderName(
            row.original.provider_name,
          )}
        </span>
      ),
    },
    clientId: {
      id: "clientId",
      accessorKey: "client_ids",
      header: "Client ID",
      resizable: true,
      responsive: true,
      cell: ({ row }: { row: any }) => {
        const raw: string =
          row.original.client_ids ?? row.original.client_id ?? "";
        const ids = raw
          ? raw
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];
        if (ids.length === 0)
          return <span className="text-sm text-foreground">—</span>;
        const visible = ids.slice(0, 2);
        const overflow = ids.length - visible.length;
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            {visible.map((id: string) => (
              <span
                key={id}
                className="font-mono text-xs text-foreground"
                title={id}
              >
                {id.substring(0, 12)}…
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-xs text-muted-foreground">
                +{overflow} more
              </span>
            )}
          </div>
        );
      },
    },
    actions: {
      id: "actions",
      header: "Actions",
      resizable: false,
      responsive: false,
      enableSorting: false,
      cell: ({ row }: { row: any }) => (
        <ActionsCell provider={row.original} actions={actions} />
      ),
      cellClassName: "text-center",
    },
  };

  return visibleColumns
    .map((columnId) => availableColumns[columnId])
    .filter(Boolean);
}

// Available columns for dynamic table configuration
export const AVAILABLE_OIDC_PROVIDER_COLUMNS = {
  provider: {
    label: "Provider",
    description: "Display name and provider type",
  },
  status: { label: "Status", description: "Active/Inactive status" },
  providerName: { label: "Provider Type", description: "Provider type" },
  clientId: { label: "Client ID", description: "Client identifier(s)" },
  actions: { label: "Actions", description: "Provider management actions" },
} as const;

// Default visible columns for the OIDC provider table
export const DEFAULT_OIDC_PROVIDER_COLUMNS = [
  "provider",
  "status",
  "clientId",
  "actions",
] as const;

// All available column keys
export const ALL_OIDC_PROVIDER_COLUMN_KEYS = Object.keys(
  AVAILABLE_OIDC_PROVIDER_COLUMNS,
) as Array<keyof typeof AVAILABLE_OIDC_PROVIDER_COLUMNS>;

// Helper function to get column metadata
export function getOidcProviderColumnMetadata(columnId: string) {
  return AVAILABLE_OIDC_PROVIDER_COLUMNS[
    columnId as keyof typeof AVAILABLE_OIDC_PROVIDER_COLUMNS
  ];
}
