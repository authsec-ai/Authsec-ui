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
import { FilterCard, TableCard } from "@/theme/components/cards";
import { useNavigate } from "react-router-dom";
import { useApplicationContext } from "./useApplicationContext";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

const labelRole = (roleName: string) => {
  const raw = roleName.includes(":") ? roleName.split(":").pop() || roleName : roleName;
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

export default function ApplicationRoleBindingsPage() {
  const navigate = useNavigate();
  const { application } = useApplicationContext();
  const [query, setQuery] = useState("");
  const { data, isLoading } = useListRSBindingsQuery(application.id);
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
        header: "User",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">
              {row.original.user_email || row.original.username || row.original.user_id}
            </div>
            {row.original.username && row.original.user_email ? (
              <div className="text-xs text-muted-foreground">{row.original.username}</div>
            ) : null}
          </div>
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
        id: "created",
        header: "Created",
        priority: 3,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-sm">
            {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/end-users/${row.original.user_id}`)}
            >
              Effective access
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={async () => {
                try {
                  await deleteBinding({
                    rsId: application.id,
                    bindingId: row.original.id,
                  }).unwrap();
                  toast.success("Role binding removed.");
                } catch (err) {
                  const apiErr = err as { data?: { error?: string } };
                  toast.error(apiErr?.data?.error ?? "Couldn't remove binding.");
                }
              }}
            >
              Remove
            </Button>
          </div>
        ),
      },
    ],
    [application.id, deleteBinding, deleting, navigate],
  );

  return (
    <div className="space-y-4">
      <FilterCard>
        <CardContent variant="compact">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-foreground">Filters</span>
            </div>
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search users, roles, or sources"
                className="h-9 pl-9"
              />
            </div>
            {query.trim() ? (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear
              </Button>
            ) : null}
          </div>
        </CardContent>
      </FilterCard>

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
              enableExpansion
              renderExpandedRow={(row) => (
                <div className="grid gap-4 p-4 text-sm md:grid-cols-3">
                  <section>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Binding
                    </div>
                    <div className="mt-2 font-mono text-xs">{row.original.id}</div>
                  </section>
                  <section>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      User
                    </div>
                    <div className="mt-2 font-mono text-xs">{row.original.user_id}</div>
                  </section>
                  <section>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Scope
                    </div>
                    <div className="mt-2 font-mono text-xs">
                      {row.original.scope_type || "-"} {row.original.scope_id || ""}
                    </div>
                  </section>
                </div>
              )}
              getRowId={(binding) => binding.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
