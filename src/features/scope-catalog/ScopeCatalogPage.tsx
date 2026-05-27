import { useMemo, useState } from "react";
import { KeyRound, Link2, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useAttachScopeCatalogEntryMutation,
  useCreateScopeCatalogEntryMutation,
  useListScopeCatalogQuery,
  type ScopeCatalogEntry,
} from "@/app/api/accessApi";
import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";

function riskVariant(risk?: string): "default" | "secondary" | "destructive" | "outline" {
  if (risk === "high" || risk === "critical") return "destructive";
  if (risk === "medium") return "secondary";
  if (risk === "low") return "default";
  return "outline";
}

export default function ScopeCatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRisk, setNewRisk] = useState("low");
  const [attachCatalogId, setAttachCatalogId] = useState("");
  const [attachApplicationId, setAttachApplicationId] = useState("");

  const { data, isLoading } = useListScopeCatalogQuery({
    q: query.trim() || undefined,
    kind: kindFilter as "application" | "catalog" | "global" | "all",
    risk_level: riskFilter === "all" ? undefined : riskFilter,
  });
  const { data: applications = [] } = useListApplicationsQuery();
  const [createCatalogEntry, { isLoading: creating }] = useCreateScopeCatalogEntryMutation();
  const [attachCatalogEntry, { isLoading: attaching }] = useAttachScopeCatalogEntryMutation();

  const scopes = data?.items ?? [];
  const catalogEntries = useMemo(
    () => scopes.filter((scope) => scope.kind === "catalog"),
    [scopes],
  );

  const handleCreateCatalogEntry = async () => {
    const key = newKey.trim();
    if (!key) {
      toast.error("Scope key is required.");
      return;
    }
    try {
      await createCatalogEntry({
        key,
        display_name: newName.trim() || key,
        description: newDescription.trim() || undefined,
        risk_level: newRisk,
      }).unwrap();
      setNewKey("");
      setNewName("");
      setNewDescription("");
      setNewRisk("low");
      setCreateOpen(false);
      toast.success("Access label created.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create access label.");
    }
  };

  const handleAttach = async () => {
    if (!attachCatalogId || !attachApplicationId) {
      toast.error("Choose both a catalog label and an application.");
      return;
    }
    try {
      await attachCatalogEntry({
        catalogId: attachCatalogId,
        applicationId: attachApplicationId,
      }).unwrap();
      setAttachOpen(false);
      toast.success("Access label attached to application.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't attach access label.");
    }
  };

  const columns = useMemo<AdaptiveColumn<ScopeCatalogEntry>[]>(
    () => [
      {
        id: "scope",
        header: "Access label",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name || row.original.key}
            detail={row.original.scope_string || row.original.key}
            monoDetail
          />
        ),
      },
      {
        id: "owner",
        header: "Runtime owner",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) =>
          row.original.application ? (
            <EntityCell
              label={row.original.application.name}
              detail={row.original.application.resource_uri}
              monoDetail
            />
          ) : (
            <Badge variant="outline">Catalog preset</Badge>
          ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => (
          <Badge variant={riskVariant(row.original.risk_level)}>
            {row.original.risk_level || "unspecified"}
          </Badge>
        ),
      },
      {
        id: "tools",
        header: "Tools unlocked",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <span>{row.original.tools_count ?? 0}</span>,
      },
      {
        id: "roles",
        header: "Roles using it",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => <span>{row.original.roles_count ?? 0}</span>,
      },
      {
        id: "users",
        header: "Users affected",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) => <span>{row.original.users_count ?? 0}</span>,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 76,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              row.original.application
                ? {
                    label: "Open application access",
                    icon: <KeyRound className="size-4" />,
                    onSelect: () => navigate(`/applications/${row.original.application?.id}/access`),
                  }
                : {
                    label: "Attach to application",
                    icon: <Link2 className="size-4" />,
                    onSelect: () => {
                      setAttachCatalogId(row.original.id);
                      setAttachOpen(true);
                    },
                  },
              {
                label: "Preview removal",
                icon: <Trash2 className="size-4" />,
                destructive: true,
                disabled: true,
                onSelect: () => undefined,
              },
            ]}
          />
        ),
      },
    ],
    [navigate],
  );

  const hasFilters = query.trim() || kindFilter !== "all" || riskFilter !== "all";

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Application Scopes"
        description="Access labels that connect AI tools, application roles, users, and consented OAuth clients."
      />

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search labels, applications, or scope strings"
        trailing={
          <>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All labels</SelectItem>
                <SelectItem value="application">Application labels</SelectItem>
                <SelectItem value="catalog">Presets</SelectItem>
                <SelectItem value="global">Global</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risks</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setKindFilter("all");
                  setRiskFilter("all");
                }}
              >
                Clear
              </Button>
            ) : null}
            <Popover open={attachOpen} onOpenChange={setAttachOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Link2 className="mr-2 h-4 w-4" />
                  Attach preset
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,34rem)] p-4">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Attach access label</h2>
                    <p className="text-xs text-muted-foreground">
                      Attach a reusable catalog preset to one application before it can grant runtime access.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <Select value={attachCatalogId} onValueChange={setAttachCatalogId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Catalog preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogEntries.map((scope) => (
                          <SelectItem key={scope.id} value={scope.id}>
                            {scope.display_name || scope.scope_string || scope.key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={attachApplicationId} onValueChange={setAttachApplicationId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Application" />
                      </SelectTrigger>
                      <SelectContent>
                        {applications.map((application) => (
                          <SelectItem key={application.id} value={application.id}>
                            {application.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAttachOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAttach}
                      disabled={attaching || !attachCatalogId || !attachApplicationId}
                    >
                      {attaching ? "Attaching..." : "Attach"}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Popover open={createOpen} onOpenChange={setCreateOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" className="h-9">
                  <Plus className="mr-2 h-4 w-4" />
                  Add label
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,34rem)] p-4">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Create reusable access label</h2>
                    <p className="text-xs text-muted-foreground">
                      Presets speed up naming. They do not grant access until attached to an application role.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <Input
                      value={newKey}
                      onChange={(event) => setNewKey(event.target.value)}
                      placeholder="e.g. demo:tools:read"
                      className="h-9 font-mono"
                      autoComplete="off"
                    />
                    <Input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Display name"
                      className="h-9"
                      autoComplete="off"
                    />
                    <Input
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                      placeholder="Description shown during consent"
                      className="h-9"
                      autoComplete="off"
                    />
                    <Select value={newRisk} onValueChange={setNewRisk}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low risk</SelectItem>
                        <SelectItem value="medium">Medium risk</SelectItem>
                        <SelectItem value="high">High risk</SelectItem>
                        <SelectItem value="critical">Critical risk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateCatalogEntry}
                      disabled={creating || !newKey.trim()}
                    >
                      {creating ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </>
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading access labels...
            </div>
          ) : (
            <AdaptiveTable
              tableId="scope-catalog"
              data={scopes}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(scope) => `${scope.kind}:${scope.id}`}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
