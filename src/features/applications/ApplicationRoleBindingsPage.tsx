import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";

import {
  useDeleteRSBindingMutation,
  useListRSBindingsQuery,
  type RSBinding,
} from "@/app/api/setupWizardApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { useNavigate } from "react-router-dom";
import { useApplicationContext } from "./useApplicationContext";
import { useState } from "react";
import { isLaunched } from "./lib/computeReadiness";

const labelRole = (roleName: string) => {
  const raw = roleName.includes(":") ? roleName.split(":").pop() || roleName : roleName;
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

export default function ApplicationRoleBindingsPage() {
  const navigate = useNavigate();
  const { application } = useApplicationContext();
  const launched = isLaunched(application);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useListRSBindingsQuery(application.id, {
    skip: !launched,
  });
  const [deleteBinding, { isLoading: deleting }] = useDeleteRSBindingMutation();
  const bindings = useMemo(() => {
    const items = data?.bindings ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((binding) =>
      [
        binding.user_email,
        binding.username,
        binding.user_id,
        binding.role_name,
        binding.assignment_source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data?.bindings, query]);

  const columns = useMemo<AdaptiveColumn<RSBinding>[]>(
    () => [
      {
        id: "user",
        header: "Principal",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.user_email || row.original.username || "End user"}
            detail={row.original.username && row.original.user_email ? row.original.username : undefined}
          />
        ),
      },
      {
        id: "role",
        header: "Role",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => <Badge variant="secondary">{labelRole(row.original.role_name)}</Badge>,
      },
      {
        id: "source",
        header: "Source",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.assignment_source || "direct"}</Badge>
        ),
      },
      {
        id: "summary",
        header: "Access summary",
        priority: 3,
        approxWidth: 220,
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{labelRole(row.original.role_name)} on {application.name}</div>
            <div className="text-xs text-muted-foreground">
              Assigned {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 4,
        approxWidth: 120,
        cell: () => (
          <Badge variant="default">Active</Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 76,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "View effective access",
                onSelect: () => navigate(`/end-users/${row.original.user_id}`),
              },
              {
                label: "Change role",
                onSelect: () => navigate(`/applications/${application.id}/access`),
              },
              {
                label: "Remove access",
                disabled: deleting,
                destructive: true,
                onSelect: async () => {
                  try {
                    await deleteBinding({
                      rsId: application.id,
                      bindingId: row.original.id,
                    }).unwrap();
                    toast.success("Access removed.");
                  } catch (err) {
                    const apiErr = err as { data?: { error?: string } };
                    toast.error(apiErr?.data?.error ?? "Couldn't remove access.");
                  }
                },
              },
            ]}
          />
        ),
      },
    ],
    [application.id, application.name, deleteBinding, deleting, navigate],
  );

  return (
    <div className="space-y-4">
      {!launched ? (
        <TableCard>
          <CardContent className="space-y-3 p-6">
            <div>
              <h2 className="text-lg font-semibold">Role bindings unlock after launch</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Application role bindings are useful only after runtime policy is active.
                Finish setup on the Overview page, then return here to manage user access.
              </p>
            </div>
            <Button onClick={() => navigate(`/applications/${application.id}/overview`)}>
              Open overview
            </Button>
          </CardContent>
        </TableCard>
      ) : (
        <>
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search users, roles, or assignment reasons"
        trailing={
          query.trim() ? (
            <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
              Clear
            </Button>
          ) : null
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading role bindings...
            </div>
          ) : (
            <AdaptiveTable
              tableId="application-role-bindings"
              data={bindings}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(binding) => binding.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
        </>
      )}
    </div>
  );
}
