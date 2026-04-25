import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Edit,
  Grid3X3,
  KeyRound,
  ListChecks,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type { ResourceServer } from "@/app/api/resourceServersApi";
import { Badge } from "@/components/ui/badge";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResourceServerExpandedRow } from "./ResourceServerDetailsPanel";
import { buildReadinessItems } from "../resource-server-utils";

interface ResourceServersTableProps {
  resourceServers: ResourceServer[];
  onOnboarding: (server: ResourceServer) => void;
  onDetails: (server: ResourceServer) => void;
  onEdit: (server: ResourceServer) => void;
  onScopeMatrix: (server: ResourceServer) => void;
  onRegisteredOAuthClients: (server: ResourceServer) => void;
  onRotateSecret: (server: ResourceServer) => void;
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
  const readinessItems = buildReadinessItems(server);

  return (
    <div className="space-y-1">
      <div className="font-medium text-foreground">{server.name}</div>
      <div className="truncate text-xs text-muted-foreground" title={server.public_base_url}>
        {server.public_base_url}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {readinessItems.map((item) => (
          <Badge key={item.key} variant={item.ready ? "default" : "secondary"} className="text-[10px]">
            {item.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function RowActions({
  server,
  onOnboarding,
  onDetails,
  onEdit,
  onScopeMatrix,
  onRegisteredOAuthClients,
  onRotateSecret,
  onDelete,
}: Omit<ResourceServersTableProps, "resourceServers"> & { server: ResourceServer }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="admin-row-icon-btn h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open resource server actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" visualVariant="row-actions" className="w-56">
        <DropdownMenuItem onClick={() => onOnboarding(server)}>
          <ListChecks className="mr-2 h-4 w-4" />
          Open Onboarding
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDetails(server)}>
          <ArrowRight className="mr-2 h-4 w-4" />
          Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(server)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onScopeMatrix(server)}>
          <Grid3X3 className="mr-2 h-4 w-4" />
          Scope Matrix
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRegisteredOAuthClients(server)}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Registered OAuth Clients
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRotateSecret(server)}>
          <KeyRound className="mr-2 h-4 w-4" />
          Rotate Introspection Secret
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
  const columns = useMemo<AdaptiveColumn<ResourceServer>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: ({ row }) => <ResourceServerNameCell server={row.original} />,
        alwaysVisible: true,
        enableSorting: true,
        resizable: true,
        approxWidth: 260,
      },
      {
        id: "resource_uri",
        header: "Resource URI",
        accessorKey: "resource_uri",
        priority: 1,
        enableSorting: false,
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
        resizable: true,
        approxWidth: 280,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "active",
        priority: 2,
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              row.original.active
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-foreground/60"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                row.original.active ? "bg-emerald-500" : "bg-foreground/40"
              }`}
            />
            {row.original.active ? "Active" : "Inactive"}
          </span>
        ),
        resizable: true,
        approxWidth: 140,
      },
      {
        id: "scopes",
        header: "Scopes",
        accessorKey: "scopes_supported",
        priority: 3,
        enableSorting: false,
        cell: ({ row }) => (
          <CompactBadgeList
            items={row.original.scopes_supported ?? []}
            emptyLabel="No scopes"
          />
        ),
        resizable: true,
        approxWidth: 220,
      },
      {
        id: "registration_modes",
        header: "Registration Modes",
        accessorKey: "registration_modes",
        priority: 4,
        enableSorting: false,
        cell: ({ row }) => (
          <CompactBadgeList
            items={row.original.registration_modes ?? []}
            emptyLabel="No modes"
          />
        ),
        resizable: true,
        approxWidth: 220,
      },
      {
        id: "actions",
        header: "Actions",
        alwaysVisible: true,
        cell: ({ row }) => <RowActions server={row.original} {...props} />,
        enableSorting: false,
        resizable: false,
        size: 80,
        className: "w-[80px] text-right",
        cellClassName: "text-right",
        approxWidth: 100,
      },
    ],
    [props],
  );

  return (
    <AdaptiveTable
      tableId="resource-servers"
      data={props.resourceServers}
      columns={columns}
      rowClassName={() => "[&_td]:py-3.5 [&_td]:px-4 [&_td]:align-middle"}
      enableSelection={false}
      enableExpansion
      renderExpandedRow={(row) => <ResourceServerExpandedRow server={row.original} />}
      getRowId={(server) => server.id}
      enableSorting
      enablePagination
      pagination={{
        pageSize: 10,
        pageSizeOptions: [5, 10, 25, 50],
        alwaysVisible: true,
      }}
    />
  );
}
