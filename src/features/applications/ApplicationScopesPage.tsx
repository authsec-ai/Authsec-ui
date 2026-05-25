import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, Search, Trash2 } from "lucide-react";

import {
  useCreateResourceServerScopeMutation,
  useDeleteScopeMutation,
  useGetScopeMatrixQuery,
  useListResourceServerScopesQuery,
} from "@/app/api/scopeMatrixApi";
import type { OAuthScope, RiskLevel } from "@/app/api/types/scopeMatrix";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterCard, TableCard } from "@/theme/components/cards";
import { useApplicationContext } from "./useApplicationContext";

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string }> = [
  { value: "low", label: "Low risk" },
  { value: "medium", label: "Medium risk" },
  { value: "high", label: "High risk" },
  { value: "critical", label: "Critical risk" },
];

function riskVariant(risk?: string): "default" | "secondary" | "destructive" | "outline" {
  if (risk === "high" || risk === "critical") return "destructive";
  if (risk === "medium") return "secondary";
  if (risk === "low") return "default";
  return "outline";
}

export default function ApplicationScopesPage() {
  const { application } = useApplicationContext();
  const [query, setQuery] = useState("");
  const [scopeString, setScopeString] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("low");

  const { data: scopesData, isLoading } = useListResourceServerScopesQuery(application.id);
  const { data: matrix } = useGetScopeMatrixQuery(application.id);
  const [createScope, { isLoading: creating }] = useCreateResourceServerScopeMutation();
  const [deleteScope, { isLoading: deleting }] = useDeleteScopeMutation();

  const toolCountByScopeID = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of matrix?.tools ?? []) {
      for (const scope of tool.scopes ?? []) {
        if (scope.source && scope.source !== "admin_override") continue;
        counts.set(scope.scope_id, (counts.get(scope.scope_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [matrix]);

  const scopes = useMemo(() => {
    const items = scopesData ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((scope) =>
      [
        scope.scope_string,
        scope.display_name,
        scope.description,
        scope.risk_level,
        scope.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, scopesData]);

  const handleCreate = async () => {
    const trimmed = scopeString.trim();
    if (!trimmed) {
      toast.error("Scope string is required.");
      return;
    }
    try {
      await createScope({
        rsId: application.id,
        body: {
          scope_string: trimmed,
          display_name: displayName.trim() || trimmed,
          description: description.trim() || undefined,
          risk_level: riskLevel,
        },
      }).unwrap();
      setScopeString("");
      setDisplayName("");
      setDescription("");
      setRiskLevel("low");
      toast.success(`Scope "${trimmed}" created.`);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to create scope.");
    }
  };

  const handleDelete = async (scope: OAuthScope) => {
    if (
      !window.confirm(
        `Delete scope "${scope.scope_string}"? Any tool mapping that uses this scope will also be removed.`,
      )
    ) {
      return;
    }
    try {
      await deleteScope(scope.id).unwrap();
      toast.success(`Scope "${scope.scope_string}" deleted.`);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to delete scope.");
    }
  };

  const columns = useMemo<AdaptiveColumn<OAuthScope>[]>(
    () => [
      {
        id: "scope",
        header: "Scope",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <div>
            <div className="font-mono text-sm font-medium">{row.original.scope_string}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.display_name || row.original.scope_string}
            </div>
          </div>
        ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <Badge variant={riskVariant(row.original.risk_level)}>
            {row.original.risk_level}
          </Badge>
        ),
      },
      {
        id: "source",
        header: "Source",
        priority: 2,
        approxWidth: 140,
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.source || (row.original.is_auto_discovered ? "discovered" : "manual")}
          </Badge>
        ),
      },
      {
        id: "tools",
        header: "Used by tools",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => (
          <span>{toolCountByScopeID.get(row.original.id) ?? 0}</span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.updated_at ? new Date(row.original.updated_at).toLocaleDateString() : "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 90,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            disabled={deleting}
            onClick={() => handleDelete(row.original)}
            aria-label={`Delete ${row.original.scope_string}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ),
      },
    ],
    [deleting, toolCountByScopeID],
  );

  return (
    <div className="space-y-4">
      <FilterCard>
        <CardContent variant="compact" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium text-foreground">Filters</span>
            </div>
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search scopes"
                className="h-9 pl-9"
              />
            </div>
            {query.trim() ? (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className="border-t pt-4">
            <h2 className="text-sm font-semibold">Create application scope</h2>
            <p className="text-sm text-muted-foreground">
              Scopes are enforced only for {application.name} and can be granted through Application roles.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr_160px_auto]">
            <Input
              value={scopeString}
              onChange={(event) => setScopeString(event.target.value)}
              placeholder="e.g. demo:tools:read"
              className="h-9 font-mono"
            />
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              className="h-9"
            />
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Description shown during consent"
              className="h-9"
            />
            <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as RiskLevel)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} disabled={creating || !scopeString.trim()}>
              <KeyRound className="mr-2 h-4 w-4" />
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </CardContent>
      </FilterCard>

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading scopes...
            </div>
          ) : (
            <AdaptiveTable
              tableId="application-scopes"
              data={scopes}
              columns={columns}
              enableSelection={false}
              enableExpansion
              renderExpandedRow={(row) => (
                <div className="grid gap-4 p-4 text-sm md:grid-cols-[1.2fr_1fr_1fr]">
                  <section>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Description
                    </div>
                    <p className="mt-2 text-muted-foreground">
                      {row.original.description || "No description yet."}
                    </p>
                  </section>
                  <section>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tool mappings
                    </div>
                    <div className="mt-2 font-medium">
                      {toolCountByScopeID.get(row.original.id) ?? 0} tool
                      {(toolCountByScopeID.get(row.original.id) ?? 0) === 1 ? "" : "s"}
                    </div>
                  </section>
                  <section>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Raw ID
                    </div>
                    <div className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {row.original.id}
                    </div>
                  </section>
                </div>
              )}
              getRowId={(scope) => scope.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>
    </div>
  );
}
