import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, ShieldOff } from "lucide-react";

import {
  useListBindingsQuery,
  type RoleBinding,
  type RbacAudience,
} from "@/app/api/bindingsApi";
import { useDeleteRSBindingMutation } from "@/app/api/setupWizardApi";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
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
    const applicationBindings = bindings.filter((binding) => binding.application?.id);
    if (!query) return applicationBindings;

    return applicationBindings.filter((binding) =>
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
        header: "Principal",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <EntityCell
            label={userName(row.original)}
            detail={row.original.user?.name}
          />
        ),
      },
      {
        id: "application",
        header: "Application",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.application?.name || "Application"}
            detail={row.original.application?.resource_uri}
            monoDetail
          />
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
        id: "summary",
        header: "Access summary",
        priority: 3,
        approxWidth: 170,
        cell: () => (
          <span className="text-sm text-muted-foreground">
            Role grants app scopes
          </span>
        ),
      },
      {
        id: "source",
        header: "Source / reason",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.source || "direct"}</Badge>
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
          <ConsoleRowActions
            items={[
              {
                label: "View effective access",
                icon: <KeyRound className="size-4" />,
                onSelect: () =>
                  navigate(`/end-users/${row.original.user_id || row.original.user?.id}`),
              },
              {
                label: "Change role",
                onSelect: () => navigate(`/applications/${row.original.application?.id}/access`),
              },
              {
                label: "Remove access",
                icon: <ShieldOff className="size-4" />,
                disabled: deleting,
                destructive: true,
                onSelect: async () => {
                  try {
                    await deleteBinding({
                      rsId: row.original.application?.id || "",
                      bindingId: row.original.id,
                    }).unwrap();
                    toast.success("Application access removed.");
                    refetch();
                  } catch (err) {
                    const apiErr = err as { data?: { error?: string } };
                    toast.error(apiErr?.data?.error ?? "Couldn't remove binding.");
                  }
                },
              },
            ]}
          />
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
              enableExpansion={false}
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
