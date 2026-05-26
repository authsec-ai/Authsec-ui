import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Layers3, MoreHorizontal, Plus, Search, ShieldCheck, SlidersHorizontal, Workflow } from "lucide-react";

import {
  useAttachScopeCatalogEntryMutation,
  useCreateScopeCatalogEntryMutation,
  useListScopeCatalogQuery,
  type ScopeCatalogEntry,
} from "@/app/api/accessApi";
import { useListApplicationsQuery } from "@/app/api/applicationsApi";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterCard, TableCard } from "@/theme/components/cards";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

function riskVariant(risk?: string): "default" | "secondary" | "destructive" | "outline" {
  if (risk === "high" || risk === "critical") return "destructive";
  if (risk === "medium") return "secondary";
  if (risk === "low") return "default";
  return "outline";
}

function CatalogExpandedRow({ scope }: { scope: ScopeCatalogEntry }) {
  return (
    <div className="grid gap-4 p-4 text-sm md:grid-cols-[1.2fr_1fr_1fr]">
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </div>
        <p className="mt-2 text-muted-foreground">
          {scope.description || "No description yet."}
        </p>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Usage
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <dt className="text-muted-foreground">Tools</dt>
            <dd className="font-medium">{scope.tools_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Roles</dt>
            <dd className="font-medium">{scope.roles_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Users</dt>
            <dd className="font-medium">{scope.users_count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Consents</dt>
            <dd className="font-medium">{scope.consent_grants_count}</dd>
          </div>
        </dl>
      </section>
      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Runtime scope
        </div>
        <div className="mt-2">
          <Badge variant="outline">{scope.kind}</Badge>
        </div>
        <div className="mt-2 font-mono text-xs text-muted-foreground">
          {scope.scope_string || scope.key}
        </div>
        {scope.application ? (
          <div className="mt-2 text-muted-foreground">
            Enforced only for <span className="font-medium text-foreground">{scope.application.name}</span>.
          </div>
        ) : (
          <div className="mt-2 text-muted-foreground">
            Catalog entries are reusable templates. They do not grant runtime access.
          </div>
        )}
      </section>
    </div>
  );
}

export default function ScopeCatalogPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRisk, setNewRisk] = useState("low");
  const [attachCatalogId, setAttachCatalogId] = useState("");
  const [attachApplicationId, setAttachApplicationId] = useState("");
  const { data, isLoading, isFetching, refetch } = useListScopeCatalogQuery({
    q: query.trim() || undefined,
    kind: kindFilter as "application" | "catalog" | "global" | "all",
    risk_level: riskFilter === "all" ? undefined : riskFilter,
  });
  const { data: applications = [] } = useListApplicationsQuery();
  const [createCatalogEntry, { isLoading: creating }] = useCreateScopeCatalogEntryMutation();
  const [attachCatalogEntry, { isLoading: attaching }] = useAttachScopeCatalogEntryMutation();

  const scopes = useMemo(() => {
    const items = data?.items ?? [];
    return items;
  }, [data?.items]);

  const columns = useMemo<AdaptiveColumn<ScopeCatalogEntry>[]>(
    () => [
      {
        id: "scope",
        header: "Scope",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-sm font-medium">
              {row.original.scope_string || row.original.key}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.display_name || row.original.key}
            </div>
          </div>
        ),
      },
      {
        id: "application",
        header: "Application / Catalog",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) =>
          row.original.application ? (
            <div>
              <div className="font-medium">{row.original.application.name}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                {row.original.application.resource_uri}
              </div>
            </div>
          ) : (
            <Badge variant="outline">Catalog preset</Badge>
          ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => (
          <Badge variant={riskVariant(row.original.risk_level)}>
            {row.original.risk_level || "unspecified"}
          </Badge>
        ),
      },
      {
        id: "source",
        header: "Source",
        priority: 3,
        approxWidth: 140,
        cell: ({ row }) => <Badge variant="outline">{row.original.source || "manual"}</Badge>,
      },
      {
        id: "used",
        header: "Used by",
        priority: 4,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.roles_count} roles · {row.original.users_count} users
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
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
              {row.original.application ? (
                <DropdownMenuItem
                  onSelect={() => navigate(`/applications/${row.original.application?.id}/access`)}
                >
                  Open application access
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>Attach to application</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [navigate],
  );

  const catalogEntries = scopes.filter((scope) => scope.kind === "catalog");

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
      toast.success("Catalog scope created.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create catalog scope.");
    }
  };

  const activeFilterCount = [query.trim(), kindFilter !== "all", riskFilter !== "all"].filter(Boolean).length;

  const handleAttach = async () => {
    if (!attachCatalogId || !attachApplicationId) {
      toast.error("Choose both a catalog scope and an application.");
      return;
    }
    try {
      await attachCatalogEntry({
        catalogId: attachCatalogId,
        applicationId: attachApplicationId,
      }).unwrap();
      toast.success("Scope attached to application.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't attach scope.");
    }
  };

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        title="Application Scopes"
        description="Govern runtime scopes, reusable presets, usage, and risk posture across Applications."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add scope
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        }
      />

      <PageInfoBanner
        title="Application scopes are the runtime contract"
        description="Scopes describe exactly what an Application can authorize. Presets speed up naming, but grants still resolve against application-owned scopes."
        features={[
          { text: "Create reusable scope presets", icon: Layers3 },
          { text: "Attach presets into specific Applications", icon: Workflow },
          { text: "Review usage without implying global access", icon: ShieldCheck },
        ]}
        featuresTitle="Scope model"
        storageKey="application-scopes-info"
        dismissible
      />

      <FilterCard>
        <CardContent variant="compact" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Filters</span>
              {activeFilterCount ? (
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs text-foreground dark:bg-white/10">
                  {activeFilterCount}
                </span>
              ) : null}
            </div>
            <div className="flex w-full flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search scopes, applications, or sources"
                  className="h-9 pl-9"
                  autoComplete="off"
                />
              </div>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  <SelectItem value="application">Application scopes</SelectItem>
                  <SelectItem value="catalog">Presets</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risks</SelectItem>
                  <SelectItem value="low">Low risk</SelectItem>
                  <SelectItem value="medium">Medium risk</SelectItem>
                  <SelectItem value="high">High risk</SelectItem>
                  <SelectItem value="critical">Critical risk</SelectItem>
                </SelectContent>
              </Select>
              {activeFilterCount ? (
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
            </div>
          </div>
          <div className="grid gap-3 border-t pt-4 lg:grid-cols-[1fr_1fr_auto]">
            <Select value={attachCatalogId} onValueChange={setAttachCatalogId}>
              <SelectTrigger>
                <SelectValue placeholder="Catalog scope" />
              </SelectTrigger>
              <SelectContent>
                {catalogEntries.map((scope) => (
                  <SelectItem key={scope.id} value={scope.id}>
                    {scope.scope_string || scope.key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={attachApplicationId} onValueChange={setAttachApplicationId}>
              <SelectTrigger>
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
            <Button
              variant="outline"
              onClick={handleAttach}
              disabled={attaching || !attachCatalogId || !attachApplicationId}
            >
              {attaching ? "Attaching..." : "Attach to application"}
            </Button>
          </div>
        </CardContent>
      </FilterCard>

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading scope catalog...
            </div>
          ) : (
            <AdaptiveTable
              tableId="scope-catalog"
              data={scopes}
              columns={columns}
              enableSelection={false}
              enableExpansion
              renderExpandedRow={(row) => <CatalogExpandedRow scope={row.original} />}
              getRowId={(scope) => `${scope.kind}:${scope.id}`}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25, 50], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add scope preset</DialogTitle>
            <DialogDescription>
              Create a reusable scope definition. Attach it to an Application before it can grant access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="scope key, e.g. demo:tools:read"
              className="font-mono"
              autoComplete="off"
            />
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Display name"
              autoComplete="off"
            />
            <Input
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Description"
              autoComplete="off"
            />
            <Select value={newRisk} onValueChange={setNewRisk}>
              <SelectTrigger>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCatalogEntry} disabled={creating || !newKey.trim()}>
              {creating ? "Creating..." : "Create scope"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
