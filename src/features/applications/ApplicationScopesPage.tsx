import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";

import {
  useCreateResourceServerScopeMutation,
  useDeleteScopeMutation,
  useGetScopeMatrixQuery,
  useListResourceServerScopesQuery,
} from "@/app/api/scopeMatrixApi";
import { ScopeDetailModal } from "@/features/scope-matrix/components/ScopeDetailModal";
import type { OAuthScope, RiskLevel } from "@/app/api/types/scopeMatrix";
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
  ImpactPreviewDialog,
} from "@/components/console/iam-console";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TableCard } from "@/theme/components/cards";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OAuthScope | null>(null);
  // H-7: scope-edit modal target. ScopeDetailModal wires through useUpdateScopeMutation
  // (orphan since v4.1) — clicking "Edit" on a row sets editScopeId, the modal opens,
  // submit hits PUT /authsec/scopes/:id, RTK invalidates and the table re-renders.
  const [editScopeId, setEditScopeId] = useState<string | null>(null);

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
      setCreateOpen(false);
      toast.success(`Scope "${trimmed}" created.`);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to create scope.");
    }
  };

  const handleDelete = async (scope: OAuthScope) => {
    try {
      await deleteScope(scope.id).unwrap();
      setDeleteTarget(null);
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
        header: "Access label",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name || row.original.scope_string}
            detail={row.original.scope_string}
            monoDetail
          />
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
        id: "tools",
        header: "Tools unlocked",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => (
          <span>{row.original.tools_count ?? toolCountByScopeID.get(row.original.id) ?? 0}</span>
        ),
      },
      {
        id: "roles",
        header: "Roles using it",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => (
          <span>{row.original.roles_count ?? "—"}</span>
        ),
      },
      {
        id: "users",
        header: "Users affected",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => (
          <span>{row.original.users_count ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 90,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "Edit",
                icon: <Pencil className="size-4" />,
                onSelect: () => setEditScopeId(row.original.id),
              },
              {
                label: "View tools",
                onSelect: () => {
                  setQuery(row.original.scope_string);
                },
              },
              {
                label: "Delete unused label",
                icon: <Trash2 className="size-4" />,
                onSelect: () => setDeleteTarget(row.original),
                disabled: deleting,
                destructive: true,
              },
            ]}
          />
        ),
      },
    ],
    [deleting, toolCountByScopeID],
  );

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          Scopes
        </h2>
        <p className="max-w-3xl text-sm leading-5 text-slate-600">
          Access labels define which MCP tools roles can unlock. Raw scope
          strings remain copyable metadata, not the primary operator view.
        </p>
      </header>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search access labels or scope strings"
        trailing={
          <>
            {query.trim() ? (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear
              </Button>
            ) : null}
            <Popover open={createOpen} onOpenChange={setCreateOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" className="h-9">
                  <Plus className="mr-2 h-4 w-4" />
                  Create scope
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,34rem)] p-4">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold">Create application scope</h2>
                    <p className="text-xs text-muted-foreground">
                      Scopes are enforced only for {application.name}.
                    </p>
                  </div>
                  <div className="grid gap-3">
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
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleCreate} disabled={creating || !scopeString.trim()}>
                      <KeyRound className="mr-2 h-4 w-4" />
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
              Loading scopes...
            </div>
          ) : (
            <AdaptiveTable
              tableId="application-scopes"
              data={scopes}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(scope) => scope.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <ImpactPreviewDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete access label?"
        description="AuthSec will remove this scope and any tool mappings that depend on it."
        confirmLabel={deleting ? "Deleting..." : "Delete label"}
        confirmDisabled={!deleteTarget || deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">
            {deleteTarget?.display_name || deleteTarget?.scope_string}
          </div>
          <div className="mt-1 font-mono text-xs">{deleteTarget?.scope_string}</div>
          <div className="mt-3 text-xs">
            Tools unlocked:{" "}
            {deleteTarget
              ? deleteTarget.tools_count ?? toolCountByScopeID.get(deleteTarget.id) ?? 0
              : 0}
            {" · "}Roles using it: {deleteTarget?.roles_count ?? "unknown"}
            {" · "}Users affected: {deleteTarget?.users_count ?? "unknown"}
          </div>
        </div>
      </ImpactPreviewDialog>

      <ScopeDetailModal
        scopeId={editScopeId}
        open={Boolean(editScopeId)}
        onOpenChange={(next) => {
          if (!next) setEditScopeId(null);
        }}
        rsId={application.id}
      />
    </div>
  );
}
