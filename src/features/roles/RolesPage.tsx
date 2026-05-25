import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AppWindow, KeyRound, MoreHorizontal, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useListApplicationRolesQuery, type ApplicationRole } from "@/app/api/accessApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageInfoBanner } from "@/components/shared/PageInfoBanner";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FilterCard, TableCard } from "@/theme/components/cards";

function RoleExpandedRow({ role }: { role: ApplicationRole }) {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_1fr_1fr]">
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Scope grants
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {role.scopes.length ? (
            role.scopes.map((scope) => (
              <Badge key={scope.id} variant="outline" className="font-mono">
                {scope.scope_string}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No scopes granted.</span>
          )}
        </div>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Application
        </div>
        <div className="mt-2 text-sm font-medium">{role.application.name}</div>
        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {role.application.resource_uri}
        </div>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Role metadata
        </div>
        <div className="mt-2 space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Raw name:</span>{" "}
            <code className="font-mono text-xs">{role.name}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Source:</span> {role.source}
          </div>
          {role.description ? <div>{role.description}</div> : null}
        </div>
      </section>
    </div>
  );
}

export function RolesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { data, isLoading, isFetching, refetch } = useListApplicationRolesQuery();

  const roles = useMemo(() => {
    const items = data?.roles ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((role) =>
      [
        role.label,
        role.name,
        role.application.name,
        role.application.resource_uri,
        ...role.scopes.map((scope) => scope.scope_string),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data?.roles, query]);

  const columns = useMemo<AdaptiveColumn<ApplicationRole>[]>(
    () => [
      {
        id: "role",
        header: "Role",
        accessorKey: "label",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.label}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.is_default ? "Default role" : row.original.source}
            </div>
          </div>
        ),
      },
      {
        id: "application",
        header: "Application",
        accessorKey: "application.name",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.application.name}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.original.application.resource_uri}
            </div>
          </div>
        ),
      },
      {
        id: "default",
        header: "Default",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) =>
          row.original.is_default ? (
            <Badge>Default</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
      },
      {
        id: "users",
        header: "Users",
        accessorKey: "users_count",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => <span>{row.original.users_count}</span>,
      },
      {
        id: "scopes",
        header: "Scopes",
        accessorKey: "scopes_count",
        priority: 4,
        approxWidth: 110,
        cell: ({ row }) => <span>{row.original.scopes_count}</span>,
      },
      {
        id: "updated",
        header: "Updated",
        accessorKey: "updated_at",
        priority: 5,
        approxWidth: 160,
        cell: ({ row }) =>
          row.original.updated_at ? (
            <span className="text-sm">
              {formatDistanceToNow(new Date(row.original.updated_at), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          ),
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
              <DropdownMenuItem
                onSelect={() => navigate(`/applications/${row.original.application.id}/access`)}
              >
                Manage scopes
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => navigate(`/admin/authz/role-bindings?role_id=${row.original.id}`)}
              >
                View bindings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableHiding: false,
      },
    ],
    [navigate],
  );

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Application Roles"
        description="Manage roles that grant end users scoped access to Applications. Platform roles live in Platform Management."
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      <PageInfoBanner
        title="Application roles grant runtime access"
        description="Application roles belong to a protected Application and grant its scopes to end users. Platform admin roles are managed separately."
        features={[
          { text: "See which Application each role controls", icon: AppWindow },
          { text: "Review users and scope grants from one table", icon: Users },
          { text: "Open role bindings or the Application access page", icon: KeyRound },
        ]}
        featuresTitle="What this page shows"
        storageKey="application-roles-info"
        dismissible
      />

      <FilterCard>
        <CardContent variant="compact">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-foreground">Filters</span>
              {query.trim() ? (
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs text-foreground dark:bg-white/10">
                  1
                </span>
              ) : null}
            </div>
            <div className="flex w-full flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search roles, applications, or scopes"
                  className="h-9 pl-9"
                />
              </div>
              {query.trim() ? (
                <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </FilterCard>

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading application roles...
            </div>
          ) : (
            <AdaptiveTable
              tableId="application-roles"
              data={roles}
              columns={columns}
              enableSelection={false}
              enableExpansion
              renderExpandedRow={(row) => <RoleExpandedRow role={row.original} />}
              getRowId={(role) => role.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
