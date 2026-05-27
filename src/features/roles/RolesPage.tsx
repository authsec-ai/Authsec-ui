import { useMemo, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useListApplicationRolesQuery, type ApplicationRole } from "@/app/api/accessApi";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCard } from "@/theme/components/cards";
import { ApplicationRoleWizard } from "./components/ApplicationRoleWizard";

function roleRisk(role: ApplicationRole) {
  if (role.scopes.some((scope) => scope.risk_level === "critical")) return "critical";
  if (role.scopes.some((scope) => scope.risk_level === "high")) return "high";
  if (role.scopes.some((scope) => scope.risk_level === "medium")) return "medium";
  return "low";
}

function riskVariant(risk: string): "default" | "secondary" | "destructive" | "outline" {
  if (risk === "critical" || risk === "high") return "destructive";
  if (risk === "medium") return "secondary";
  return "outline";
}

export function RolesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [defaultFilter, setDefaultFilter] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data, isLoading, refetch } = useListApplicationRolesQuery({
    q: query.trim() || undefined,
    source: sourceFilter === "all" ? undefined : sourceFilter,
    default:
      defaultFilter === "all" ? undefined : defaultFilter === "default",
  });

  const roles = useMemo(() => {
    const items = data?.roles ?? [];
    return items;
  }, [data?.roles]);

  const columns = useMemo<AdaptiveColumn<ApplicationRole>[]>(
    () => [
      {
        id: "role",
        header: "Role",
        accessorKey: "label",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.label}
            detail={row.original.is_default ? "Default access package" : row.original.description || "Custom access package"}
            badge={row.original.is_default ? <Badge>Default</Badge> : undefined}
          />
        ),
      },
      {
        id: "application",
        header: "Application",
        accessorKey: "application.name",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.application.name}
            detail={row.original.application.resource_uri}
            monoDetail
          />
        ),
      },
      {
        id: "tools",
        header: "Tools granted",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.scopes_count} access label
            {row.original.scopes_count === 1 ? "" : "s"}
          </span>
        ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => {
          const risk = roleRisk(row.original);
          return <Badge variant={riskVariant(risk)}>{risk}</Badge>;
        },
      },
      {
        id: "users",
        header: "Assigned users",
        accessorKey: "users_count",
        priority: 4,
        approxWidth: 110,
        cell: ({ row }) => <span>{row.original.users_count}</span>,
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
                label: "Open access",
                onSelect: () => navigate(`/applications/${row.original.application.id}/access`),
              },
              {
                label: "Review scopes",
                onSelect: () => navigate(`/applications/${row.original.application.id}/scopes`),
              },
              {
                label: "View assignments",
                onSelect: () => navigate(`/admin/authz/role-bindings?role_id=${row.original.id}`),
              },
            ]}
          />
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
        description="Access packages that grant end users scoped access to AI applications."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create role
            </Button>
          </div>
        }
      />

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search roles, applications, or scopes"
        trailing={
          <>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={defaultFilter} onValueChange={setDefaultFilter}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="default">Default only</SelectItem>
                  <SelectItem value="non-default">Non-default</SelectItem>
                </SelectContent>
              </Select>
              {query.trim() || sourceFilter !== "all" || defaultFilter !== "all" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setSourceFilter("all");
                    setDefaultFilter("all");
                  }}
                >
                  Clear
                </Button>
              ) : null}
          </>
        }
      />

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
              enableExpansion={false}
              getRowId={(role) => role.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
      <ApplicationRoleWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => refetch()}
      />
    </div>
  );
}
