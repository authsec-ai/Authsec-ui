import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Code2,
  Edit,
  KeyRound,
  MessageSquareText,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type { ResourceServer } from "@/app/api/resourceServersApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDataTable,
  type ResponsiveColumnDef,
  type ResponsiveTableConfig,
} from "@/components/ui/responsive-data-table";
import { ResponsiveTableProvider } from "@/components/ui/responsive-table";

import {
  summarizeList,
} from "../resource-server-utils";
import { ResourceServerExpandedRow } from "./ResourceServerDetailsPanel";

interface ResourceServersTableProps {
  resourceServers: ResourceServer[];
  expandedRowIds: string[];
  onExpandedRowsChange: (ids: string[]) => void;
  onDetails: (server: ResourceServer) => void;
  onEdit: (server: ResourceServer) => void;
  onRegisteredOAuthClients: (server: ResourceServer) => void;
  onRotateSecret: (server: ResourceServer) => void;
  onViewSDK: (server: ResourceServer) => void;
  onGeneratePrompt: (server: ResourceServer) => void;
  onDelete: (server: ResourceServer) => void;
}

function CompactBadgeList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (!items.length) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  const visible = items.slice(0, 2);
  const overflow = items.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => (
        <Badge key={item} variant="outline" className="max-w-[120px] truncate">
          {item}
        </Badge>
      ))}
      {overflow > 0 ? <Badge variant="secondary">+{overflow}</Badge> : null}
    </div>
  );
}

function ResourceServerNameCell({ server }: { server: ResourceServer }) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-foreground">{server.name}</div>
      <div className="truncate text-xs text-muted-foreground" title={server.public_base_url}>
        {server.public_base_url}
      </div>
    </div>
  );
}

function RowActions({
  server,
  onDetails,
  onEdit,
  onRegisteredOAuthClients,
  onRotateSecret,
  onViewSDK,
  onGeneratePrompt,
  onDelete,
}: Omit<ResourceServersTableProps, "resourceServers" | "expandedRowIds" | "onExpandedRowsChange"> & {
  server: ResourceServer;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="admin-row-icon-btn h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open resource server actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" visualVariant="row-actions" className="w-56">
        <DropdownMenuItem onClick={() => onDetails(server)}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(server)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRegisteredOAuthClients(server)}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Registered OAuth Clients
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRotateSecret(server)}>
          <KeyRound className="mr-2 h-4 w-4" />
          Rotate Introspection Secret
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewSDK(server)}>
          <Code2 className="mr-2 h-4 w-4" />
          View SDK
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onGeneratePrompt(server)}>
          <MessageSquareText className="mr-2 h-4 w-4" />
          Generate Prompt
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(server)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ResourceServersTable(props: ResourceServersTableProps) {
  const columns = useMemo<ResponsiveColumnDef<ResourceServer, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => <ResourceServerNameCell server={row.original} />,
        responsive: true,
        resizable: true,
        cellClassName: "max-w-0 min-w-[240px]",
      },
      {
        id: "resource_uri",
        header: "Resource URI",
        cell: ({ row }) => (
          <Link
            to={`/resource-servers/${row.original.id}`}
            onClick={(event) => event.stopPropagation()}
            className="truncate text-sm text-primary hover:underline"
            title={row.original.resource_uri}
          >
            {row.original.resource_uri}
          </Link>
        ),
        responsive: true,
        resizable: true,
        cellClassName: "max-w-[320px]",
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "default" : "secondary"}>
            {row.original.active ? "active" : "inactive"}
          </Badge>
        ),
        responsive: true,
        resizable: true,
      },
      {
        id: "scopes",
        header: "Scopes",
        cell: ({ row }) => (
          <CompactBadgeList
            items={row.original.scopes_supported ?? []}
            emptyLabel="No scopes"
          />
        ),
        responsive: true,
        resizable: true,
      },
      {
        id: "registration_modes",
        header: "Registration Modes",
        cell: ({ row }) => (
          <CompactBadgeList
            items={row.original.registration_modes ?? []}
            emptyLabel="No modes"
          />
        ),
        responsive: true,
        resizable: true,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => <RowActions server={row.original} {...props} />,
        enableSorting: false,
        responsive: false,
        className: "w-[80px]",
        cellClassName: "text-center",
      },
    ],
    [props],
  );

  const tableConfig: ResponsiveTableConfig<ResourceServer> = {
    data: props.resourceServers,
    columns,
    features: {
      selection: false,
      dragDrop: false,
      expandable: true,
      pagination: true,
      sorting: true,
      resizing: true,
    },
    pagination: {
      pageSize: 10,
      pageSizeOptions: [10, 25, 50],
      alwaysVisible: true,
    },
    expandedRowIds: props.expandedRowIds,
    onExpandedRowsChange: props.onExpandedRowsChange,
    renderExpandedRow: (row) => <ResourceServerExpandedRow server={row.original} />,
    getRowId: (row) => row.id,
  };

  return (
    <ResponsiveTableProvider tableType="resource-servers">
      <ResponsiveDataTable {...tableConfig} />
    </ResponsiveTableProvider>
  );
}
