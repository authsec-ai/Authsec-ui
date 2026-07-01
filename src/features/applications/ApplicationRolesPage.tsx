import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListRSRolesQuery,
  useCreateApplicationRoleMutation,
  type RSRole,
} from "@/app/api/setupWizardApi";
import { useListResourceServerScopesQuery } from "@/app/api/scopeMatrixApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useApplicationContext } from "./useApplicationContext";

const labelRole = (name: string) => {
  const raw = name.includes(":") ? name.split(":").pop() || name : name;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

// ── Create Role Dialog ─────────────────────────────────────────────────────────

function CreateRoleDialog({
  open,
  onOpenChange,
  rsId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rsId: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedScopeIds, setSelectedScopeIds] = useState<Set<string>>(new Set());
  const [scopeSearch, setScopeSearch] = useState("");

  const { data: scopes } = useListResourceServerScopesQuery(rsId, { skip: !open });
  const [createRole, { isLoading }] = useCreateApplicationRoleMutation();

  const filteredScopes = useMemo(() => {
    const q = scopeSearch.trim().toLowerCase();
    return (scopes ?? []).filter(
      (s) =>
        !q ||
        s.scope_string.toLowerCase().includes(q) ||
        (s.display_name ?? "").toLowerCase().includes(q),
    );
  }, [scopes, scopeSearch]);

  const toggleScope = (id: string) => {
    setSelectedScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createRole({
        rsId,
        name: name.trim(),
        description: description.trim() || undefined,
        scope_ids: Array.from(selectedScopeIds),
      }).unwrap();
      toast.success("Role created.");
      onOpenChange(false);
      setName("");
      setDescription("");
      setSelectedScopeIds(new Set());
      setScopeSearch("");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create role.");
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setSelectedScopeIds(new Set());
    setScopeSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create role</DialogTitle>
          <DialogDescription>
            Roles bundle scopes and are assigned to users, Kubernetes workloads, or machine identities for this MCP server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              placeholder="e.g. Ticket Reader"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">
              The name is auto-prefixed to keep it scoped to this server.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-description">Description (optional)</Label>
            <Input
              id="role-description"
              placeholder="What can this role do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Scopes</Label>
              {selectedScopeIds.size > 0 && (
                <Badge variant="secondary">{selectedScopeIds.size} selected</Badge>
              )}
            </div>
            <Input
              placeholder="Filter scopes…"
              value={scopeSearch}
              onChange={(e) => setScopeSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
              {filteredScopes.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  {(scopes ?? []).length === 0
                    ? "No scopes defined for this server yet."
                    : "No scopes match the filter."}
                </p>
              ) : (
                filteredScopes.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 hover:bg-slate-50"
                  >
                    <Checkbox
                      checked={selectedScopeIds.has(s.id)}
                      onCheckedChange={() => toggleScope(s.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium text-slate-900">
                        {s.scope_string}
                      </p>
                      {s.display_name && s.display_name !== s.scope_string && (
                        <p className="text-[11px] text-slate-500">{s.display_name}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
            {selectedScopeIds.size === 0 && (
              <p className="text-[11px] text-amber-600">
                Select at least one scope for the role to be useful.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || isLoading}
            className="text-white"
          >
            {isLoading ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApplicationRolesPage() {
  const { application } = useApplicationContext();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useListRSRolesQuery(application?.id ?? "", {
    skip: !application?.id,
  });

  const roles = useMemo(() => {
    const items = data?.roles ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      [r.name, r.description ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [data?.roles, query]);

  const columns = useMemo<AdaptiveColumn<RSRole>[]>(
    () => [
      {
        id: "name",
        header: "Role",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <EntityCell
            label={labelRole(row.original.name)}
            detail={row.original.description || undefined}
          />
        ),
      },
      {
        id: "scopes",
        header: "Scopes",
        priority: 1,
        approxWidth: 100,
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.permissions ?? 0}
          </Badge>
        ),
      },
      {
        id: "assignments",
        header: "Assignments",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.bindings ?? 0}
          </span>
        ),
      },
      {
        id: "default",
        header: "",
        priority: 3,
        approxWidth: 90,
        cell: ({ row }) =>
          row.original.is_default ? (
            <Badge variant="outline" className="text-[11px]">
              Default
            </Badge>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search roles"
        trailing={
          <div className="flex items-center gap-2">
            {query.trim() && (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="text-white"
            >
              <Plus className="mr-1.5 size-3.5" />
              Create role
            </Button>
          </div>
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading roles…
            </div>
          ) : roles.length === 0 && !query ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                No roles yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a role to bundle scopes and grant access to users, Kubernetes workloads, or machine identities.
              </p>
              <Button
                size="sm"
                className="mt-4 text-white"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 size-3.5" />
                Create role
              </Button>
            </div>
          ) : (
            <AdaptiveTable
              tableId="application-roles"
              data={roles}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      {application?.id && (
        <CreateRoleDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          rsId={application.id}
        />
      )}
    </div>
  );
}
