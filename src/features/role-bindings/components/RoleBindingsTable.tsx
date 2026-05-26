import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal } from "lucide-react";

import {
  useListBindingsQuery,
  type RoleBinding,
  type RbacAudience,
} from "@/app/api/bindingsApi";
import { useDeleteRSBindingMutation } from "@/app/api/setupWizardApi";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2 } from "lucide-react";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { MapRoleToScopeModal } from "./MapRoleToScopeModal";
import { toast } from "react-hot-toast";

interface RoleBindingsTableProps {
  searchQuery: string;
  isMapModalOpen: boolean;
  onMapModalOpenChange: (open: boolean) => void;
  onBindingSuccess?: () => void;
  audience: RbacAudience;
}

const roleLabel = (binding: RoleBinding) =>
  binding.role?.label || binding.role?.name || binding.role_name || "-";

const userName = (binding: RoleBinding) =>
  binding.user?.email ||
  binding.user?.name ||
  binding.email ||
  binding.username ||
  (binding.user_id ? `User ${binding.user_id.slice(0, 8)}` : "-");

function BindingExpandedRow({ binding }: { binding: RoleBinding }) {
  return (
    <div className="grid gap-4 p-4 text-sm md:grid-cols-3">
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Binding
        </div>
        <dl className="mt-2 space-y-1">
          <div>
            <dt className="inline text-muted-foreground">ID: </dt>
            <dd className="inline font-mono text-xs">{binding.id}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Source: </dt>
            <dd className="inline">{binding.source || "direct"}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Status: </dt>
            <dd className="inline">{binding.expires_at ? "Expiring" : "Active"}</dd>
          </div>
        </dl>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Raw identifiers
        </div>
        <dl className="mt-2 space-y-1">
          <div>
            <dt className="inline text-muted-foreground">User: </dt>
            <dd className="inline font-mono text-xs">{binding.user_id || binding.user?.id || "-"}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Role: </dt>
            <dd className="inline font-mono text-xs">{binding.role_id}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Scope: </dt>
            <dd className="inline font-mono text-xs">
              {binding.scope_type || "-"} {binding.scope_id || ""}
            </dd>
          </div>
        </dl>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Application
        </div>
        <div className="mt-2 font-medium">{binding.application?.name || "Tenant-wide"}</div>
        {binding.application?.resource_uri ? (
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {binding.application.resource_uri}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function RoleBindingsTable({
  searchQuery,
  isMapModalOpen,
  onMapModalOpenChange,
  onBindingSuccess,
  audience,
}: RoleBindingsTableProps) {
  const navigate = useNavigate();
  const { data: bindings = [], isLoading: isLoadingBindings, refetch } = useListBindingsQuery({
    audience,
  });
  const [deleteBinding, { isLoading: deleting }] = useDeleteRSBindingMutation();

  const filteredBindings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return bindings;

    return bindings.filter((binding) =>
      [
        userName(binding),
        binding.user_id,
        roleLabel(binding),
        binding.role_id,
        binding.application?.name,
        binding.application?.resource_uri,
        binding.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [bindings, searchQuery]);

  const columns: AdaptiveColumn<RoleBinding>[] = useMemo(
    () => [
      {
        id: "user",
        header: "User",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{userName(row.original)}</div>
            {row.original.user?.name && row.original.user?.email ? (
              <div className="truncate text-xs text-muted-foreground">{row.original.user.name}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: "application",
        header: "Application",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">
              {row.original.application?.name || "Tenant-wide"}
            </div>
            {row.original.application?.resource_uri ? (
              <div className="truncate font-mono text-xs text-muted-foreground">
                {row.original.application.resource_uri}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "role",
        header: "Role",
        priority: 2,
        approxWidth: 180,
        cell: ({ row }) => <Badge variant="secondary">{roleLabel(row.original)}</Badge>,
      },
      {
        id: "source",
        header: "Source",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.source || "direct"}</Badge>
        ),
      },
      {
        id: "created",
        header: "Created",
        accessorKey: "created_at",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) =>
          row.original.created_at ? (
            <span className="text-sm">
              {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        priority: 5,
        approxWidth: 120,
        cell: ({ row }) => {
          const expiresAt = row.original.expires_at ? new Date(row.original.expires_at) : null;
          const expired = expiresAt ? expiresAt < new Date() : false;
          return (
            <Badge variant={expired ? "destructive" : "default"}>
              {expired ? "Expired" : "Active"}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 72,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.original.application?.id && (row.original.user_id || row.original.user?.id) ? (
                <DropdownMenuItem
                  onSelect={() =>
                    navigate(`/end-users/${row.original.user_id || row.original.user?.id}`)
                  }
                >
                  View effective access
                </DropdownMenuItem>
              ) : null}
              {row.original.application?.id ? (
                <DropdownMenuItem
                  onSelect={() => navigate(`/applications/${row.original.application?.id}/access`)}
                >
                  Change role
                </DropdownMenuItem>
              ) : null}
              {row.original.application?.id ? (
                <DropdownMenuItem
                  disabled={deleting}
                  variant="destructive"
                  onSelect={async () => {
                    try {
                      await deleteBinding({
                        rsId: row.original.application?.id || "",
                        bindingId: row.original.id,
                      }).unwrap();
                      toast.success("Role binding removed.");
                      refetch();
                    } catch (err) {
                      const apiErr = err as { data?: { error?: string } };
                      toast.error(apiErr?.data?.error ?? "Couldn't remove binding.");
                    }
                  }}
                >
                  Remove binding
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [deleteBinding, deleting, navigate, refetch],
  );

  return (
    <>
      <TableCard>
        <CardContent variant="flush">
          {isLoadingBindings ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-foreground/50" />
            </div>
          ) : (
            <AdaptiveTable
              tableId="role-bindings"
              data={filteredBindings}
              columns={columns}
              enableSelection={false}
              enableExpansion
              renderExpandedRow={(row) => <BindingExpandedRow binding={row.original} />}
              pagination={{
                pageSize: 10,
                pageSizeOptions: [5, 10, 25, 50, 100],
                alwaysVisible: true,
              }}
              getRowId={(row) => row.id}
            />
          )}
        </CardContent>
      </TableCard>

      <MapRoleToScopeModal
        open={isMapModalOpen}
        onOpenChange={onMapModalOpenChange}
        onSuccess={() => {
          refetch();
          onBindingSuccess?.();
        }}
        audience={audience}
      />
    </>
  );
}
