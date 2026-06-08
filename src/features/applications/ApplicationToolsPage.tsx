import { useMemo, useState } from "react";
import { Loader2, Search, ShieldAlert, Sparkles, X } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  AccessPath,
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
  VerdictCard,
} from "@/components/console/iam-console";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useGetScopeMatrixQuery,
  useUpdateToolScopeMapMutation,
} from "@/app/api/scopeMatrixApi";
import { useMarkToolPublicMutation } from "@/app/api/setupWizardApi";
import type {
  MCPToolResponse,
  OAuthScopeResponse,
  RiskLevel,
} from "@/app/api/types/scopeMatrix";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";

import { useApplicationContext } from "./useApplicationContext";
import { StatusBadge } from "./components/ApplicationConsole";

type FilterKey = "all" | "needs-review" | "mapped" | "public" | "denied";
type ToolDecision = "public" | "mapped" | "advisory" | "unmapped";

const FILTER_DEFS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs-review", label: "Needs review" },
  { key: "mapped", label: "Mapped" },
  { key: "public", label: "Public" },
  { key: "denied", label: "Denied" },
];

const RISK_TONE: Record<RiskLevel, { chip: string; text: string }> = {
  low: {
    chip: "border-[color:color-mix(in_oklch,var(--color-success)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_8%,transparent)]",
    text: "text-[var(--color-success)]",
  },
  medium: {
    chip: "border-[color:color-mix(in_oklch,var(--color-warning)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
    text: "text-[var(--color-warning)]",
  },
  high: {
    chip: "border-[color:color-mix(in_oklch,var(--color-danger)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_8%,transparent)]",
    text: "text-[var(--color-danger)]",
  },
  critical: {
    chip: "border-[color:color-mix(in_oklch,var(--color-danger)_40%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_15%,transparent)]",
    text: "text-[var(--color-danger)]",
  },
};

function classifyTool(tool: MCPToolResponse): ToolDecision {
  if (tool.is_public) return "public";
  if (tool.scopes.some((scope) => scope.source === "admin_override")) return "mapped";
  if (tool.scopes.length > 0) return "advisory";
  return "unmapped";
}

function effectiveRisk(tool: MCPToolResponse): RiskLevel {
  const order: RiskLevel[] = ["critical", "high", "medium", "low"];
  for (const risk of order) {
    if (tool.scopes.some((scope) => scope.risk_level === risk)) return risk;
  }
  return "low";
}

function riskReasonForScope(scopeString: string): string {
  const value = scopeString.toLowerCase();
  if (value.includes("admin") || value.includes("delete")) {
    return `"${scopeString}" suggests an admin or delete capability.`;
  }
  if (/(^|[:_/-])(write|create|update)([:_/-]|$)/.test(value)) {
    return `"${scopeString}" contains a write verb.`;
  }
  if (value.includes(":*") || value.endsWith(":*")) {
    return `"${scopeString}" uses a wildcard suffix.`;
  }
  return `"${scopeString}" appears read-oriented.`;
}

function riskReasonForTool(tool: MCPToolResponse): string {
  if (tool.scopes.length === 0) {
    return tool.is_public
      ? "Public exposure bypasses scope checks."
      : "Unmapped tools are denied until an access label is assigned.";
  }
  const order: RiskLevel[] = ["critical", "high", "medium", "low"];
  for (const risk of order) {
    const scope = tool.scopes.find((entry) => entry.risk_level === risk);
    if (scope) return riskReasonForScope(scope.scope_string);
  }
  return riskReasonForScope(tool.scopes[0].scope_string);
}

function decisionLabel(decision: ToolDecision): string {
  if (decision === "public") return "Public";
  if (decision === "mapped") return "Role-gated";
  if (decision === "advisory") return "Suggested only";
  return "Denied";
}

export default function ApplicationToolsPage() {
  const { application } = useApplicationContext();
  const { data: matrix, isLoading } = useGetScopeMatrixQuery(application.id);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<MCPToolResponse | null>(null);
  const [query, setQuery] = useState("");
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<"assign" | "remove" | null>(null);
  const [updateMap, { isLoading: bulkSaving }] = useUpdateToolScopeMapMutation();

  const tools = useMemo(() => matrix?.tools ?? [], [matrix?.tools]);
  const allScopes = useMemo<OAuthScopeResponse[]>(
    () => matrix?.scopes ?? matrix?.unmapped_scopes ?? [],
    [matrix?.scopes, matrix?.unmapped_scopes],
  );

  const counts = useMemo(() => {
    let mapped = 0;
    let publicCount = 0;
    let unmapped = 0;
    let advisory = 0;
    for (const tool of tools) {
      const decision = classifyTool(tool);
      if (decision === "public") publicCount += 1;
      else if (decision === "mapped") mapped += 1;
      else if (decision === "advisory") advisory += 1;
      else unmapped += 1;
    }
    return { all: tools.length, mapped, public: publicCount, unmapped, advisory };
  }, [tools]);

  const selectedTools = useMemo(
    () => tools.filter((tool) => selectedToolIds.includes(tool.id)),
    [tools, selectedToolIds],
  );

  // Scopes mapped to EVERY selected tool — the safe "remove" target. If only
  // one tool is selected, this is just its scopes; with multiple, this is the
  // intersection so removal applies cleanly across the whole selection.
  const sharedScopes = useMemo(() => {
    if (selectedTools.length === 0) return [];
    const first = selectedTools[0].scopes;
    return first.filter((scope) =>
      selectedTools.every((tool) =>
        tool.scopes.some((entry) => entry.scope_id === scope.scope_id),
      ),
    );
  }, [selectedTools]);

  // Scopes already mapped to ALL selected tools — hide these from the assign picker
  // (mapping a tool to a scope it already has is a no-op the backend rejects).
  const scopesAlreadyOnAll = useMemo(
    () => new Set(sharedScopes.map((scope) => scope.scope_id)),
    [sharedScopes],
  );
  const assignableScopes = useMemo(
    () =>
      allScopes.filter((scope) => !scopesAlreadyOnAll.has(scope.id)),
    [allScopes, scopesAlreadyOnAll],
  );

  const visibleTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const decision = classifyTool(tool);
      const matchesFilter =
        filter === "all" ||
        (filter === "needs-review" &&
          (decision === "unmapped" || decision === "advisory" || decision === "public")) ||
        (filter === "mapped" && decision === "mapped") ||
        (filter === "public" && decision === "public") ||
        (filter === "denied" && decision === "unmapped");
      if (!matchesFilter) return false;
      if (!q) return true;
      return [
        tool.name,
        tool.title,
        tool.description,
        ...(tool.suggested_scopes ?? []),
        ...tool.scopes.flatMap((scope) => [scope.scope_string, scope.display_name]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [filter, query, tools]);

  const visibleToolIds = useMemo(
    () => visibleTools.map((tool) => tool.id),
    [visibleTools],
  );
  const allVisibleSelected =
    visibleToolIds.length > 0 &&
    visibleToolIds.every((id) => selectedToolIds.includes(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleToolIds.some((id) => selectedToolIds.includes(id));

  const handleSelectAllVisible = () => {
    if (allVisibleSelected) {
      // Drop only the currently-visible ones; preserve selections hidden by filter.
      setSelectedToolIds((prev) => prev.filter((id) => !visibleToolIds.includes(id)));
    } else {
      setSelectedToolIds((prev) =>
        Array.from(new Set([...prev, ...visibleToolIds])),
      );
    }
  };

  const applyBulkScopes = async (
    scopeIds: string[],
    mode: "assign" | "remove",
  ) => {
    if (scopeIds.length === 0 || selectedTools.length === 0) return;
    const mappings = selectedTools.flatMap((tool) =>
      scopeIds
        // Skip no-op mappings the backend would reject:
        //   - assign: tool already has this scope
        //   - remove: tool doesn't have this scope
        .filter((scopeId) => {
          const has = tool.scopes.some((entry) => entry.scope_id === scopeId);
          return mode === "assign" ? !has : has;
        })
        .map((scopeId) => ({
          tool_id: tool.id,
          scope_id: scopeId,
          ...(mode === "remove" ? { remove: true } : {}),
        })),
    );
    if (mappings.length === 0) {
      toast(
        mode === "assign"
          ? "All selected tools already have these labels."
          : "None of the selected tools have these labels.",
      );
      return;
    }
    try {
      await updateMap({
        rsId: application.id,
        body: { mappings },
      }).unwrap();
      const toolNoun = selectedTools.length === 1 ? "tool" : "tools";
      const labelNoun = scopeIds.length === 1 ? "label" : "labels";
      toast.success(
        mode === "assign"
          ? `Mapped ${scopeIds.length} ${labelNoun} to ${selectedTools.length} ${toolNoun}.`
          : `Removed ${scopeIds.length} ${labelNoun} from ${selectedTools.length} ${toolNoun}.`,
      );
      setBulkMode(null);
      setSelectedToolIds([]);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Bulk update failed.");
    }
  };

  const columns = useMemo<AdaptiveColumn<MCPToolResponse>[]>(
    () => [
      {
        id: "tool",
        header: "Tool",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={<span className="font-mono text-xs">{row.original.name}</span>}
            detail={row.original.title || row.original.description || "MCP tool"}
          />
        ),
      },
      {
        id: "decision",
        header: "Runtime access",
        priority: 1,
        approxWidth: 150,
        cell: ({ row }) => {
          const decision = classifyTool(row.original);
          if (decision === "public") return <StatusBadge tone="info">public</StatusBadge>;
          if (decision === "mapped") return <StatusBadge tone="success">role-gated</StatusBadge>;
          if (decision === "advisory") return <StatusBadge tone="warning">suggested</StatusBadge>;
          return <StatusBadge tone="warning">denied</StatusBadge>;
        },
      },
      {
        id: "risk",
        header: "Risk",
        priority: 2,
        approxWidth: 120,
        cell: ({ row }) => {
          const risk = effectiveRisk(row.original);
          const tone = RISK_TONE[risk];
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                tone.chip,
                tone.text,
              )}
            >
              <span className="size-1 rounded-full bg-current" aria-hidden />
              {risk}
            </span>
          );
        },
      },
      {
        id: "access-label",
        header: "Access label",
        priority: 3,
        approxWidth: 280,
        cell: ({ row }) =>
          row.original.scopes.length === 0 ? (
            <span className="text-xs italic text-slate-500">
              {row.original.is_public ? "Public access" : "No label assigned"}
            </span>
          ) : (
            <span
              className="block truncate text-xs text-slate-700"
              title={row.original.scopes.map((scope) => scope.scope_string).join(", ")}
            >
              {row.original.scopes
                .map((scope) => scope.display_name || scope.scope_string)
                .join(", ")}
            </span>
          ),
      },
      {
        id: "used-by",
        header: "Used by",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) =>
          row.original.is_public ? (
            <span className="text-sm">Any app token</span>
          ) : row.original.scopes.length ? (
            <span className="text-sm">
              {row.original.scopes.length} access label
              {row.original.scopes.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">No users</span>
          ),
      },
      {
        id: "denies",
        header: "Recent denies",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) =>
          classifyTool(row.original) === "unmapped" ? (
            <span className="text-sm text-amber-700">Denied until mapped</span>
          ) : (
            <span className="text-sm text-muted-foreground">No signal</span>
          ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 72,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              { label: "Inspect access", onSelect: () => setSelected(row.original) },
              {
                label: row.original.is_public ? "Remove public exposure" : "Review public exposure",
                onSelect: () => setSelected(row.original),
                destructive: row.original.is_public,
              },
              { label: "Simulate access", onSelect: () => setSelected(row.original) },
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          Tools
        </h2>
        <p className="max-w-3xl text-sm leading-5 text-slate-600">
          Review every MCP capability this application exposes, what gates it,
          and which tools are denied until mapped.
        </p>
      </header>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search tools, access labels, or descriptions"
        filters={FILTER_DEFS.map((filterDef) => ({
          key: filterDef.key,
          label: filterDef.label,
          count:
            filterDef.key === "all"
              ? counts.all
              : filterDef.key === "needs-review"
                ? counts.unmapped + counts.advisory + counts.public
                : filterDef.key === "mapped"
                  ? counts.mapped
                  : filterDef.key === "public"
                    ? counts.public
                    : counts.unmapped,
        }))}
        activeFilter={filter}
        onFilterChange={(next) => setFilter(next as FilterKey)}
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading tools...
            </div>
          ) : visibleTools.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {tools.length === 0
                ? "No tools discovered yet. Deploy the SDK and run a scan."
                : "No tools match this filter."}
            </div>
          ) : (
            <AdaptiveTable
              tableId="application-tools"
              data={visibleTools}
              columns={columns}
              enableSelection
              selectedRowIds={selectedToolIds}
              onRowSelectionChange={setSelectedToolIds}
              onSelectAll={handleSelectAllVisible}
              enableExpansion={false}
              onRowClick={(tool) => setSelected(tool)}
              getRowId={(tool) => tool.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <ToolInspectorDrawer
        tool={selected}
        applicationId={application.id}
        unmappedScopes={(() => {
          if (!selected) return [];
          const alreadyMapped = new Set(selected.scopes.map((scope) => scope.scope_id));
          return allScopes.filter((scope) => !alreadyMapped.has(scope.id));
        })()}
        onClose={() => setSelected(null)}
      />

      <BulkActionBar
        count={selectedToolIds.length}
        allVisibleSelected={allVisibleSelected}
        someVisibleSelected={someVisibleSelected}
        visibleCount={visibleToolIds.length}
        onSelectAllVisible={handleSelectAllVisible}
        onAssign={() => setBulkMode("assign")}
        onRemove={() => setBulkMode("remove")}
        onClear={() => setSelectedToolIds([])}
        canRemove={sharedScopes.length > 0}
      />

      <BulkScopeDialog
        mode={bulkMode}
        selectedTools={selectedTools}
        scopes={bulkMode === "remove" ? sharedScopes.map(sharedToScope) : assignableScopes}
        saving={bulkSaving}
        onCancel={() => setBulkMode(null)}
        onApply={(scopeIds) => {
          if (!bulkMode) return;
          void applyBulkScopes(scopeIds, bulkMode);
        }}
      />
    </div>
  );
}

// Shared scopes carry the ScopeMapEntry shape (scope_id, scope_string, ...).
// The dialog speaks OAuthScopeResponse shape (id, scope_string, ...). Map between.
function sharedToScope(entry: {
  scope_id: string;
  scope_string: string;
  display_name: string;
  risk_level: RiskLevel;
}): OAuthScopeResponse {
  return {
    id: entry.scope_id,
    scope_string: entry.scope_string,
    display_name: entry.display_name,
    risk_level: entry.risk_level,
    is_auto_discovered: false,
  };
}

function BulkActionBar({
  count,
  allVisibleSelected,
  someVisibleSelected,
  visibleCount,
  onSelectAllVisible,
  onAssign,
  onRemove,
  onClear,
  canRemove,
}: {
  count: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  visibleCount: number;
  onSelectAllVisible: () => void;
  onAssign: () => void;
  onRemove: () => void;
  onClear: () => void;
  canRemove: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none sticky bottom-4 z-40 flex justify-center">
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg">
        <span className="text-sm font-semibold text-slate-900">
          {count} selected
        </span>
        {!allVisibleSelected && visibleCount > count ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onSelectAllVisible}
          >
            Select all {visibleCount} in view
          </Button>
        ) : null}
        {someVisibleSelected || allVisibleSelected ? null : null}
        <span className="h-4 w-px bg-slate-200" aria-hidden />
        <Button size="sm" className="h-8" onClick={onAssign}>
          Assign access label
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={onRemove}
          disabled={!canRemove}
          title={
            canRemove
              ? undefined
              : "Selected tools have no labels in common to remove."
          }
        >
          Remove label
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClear}
        >
          <X className="mr-1 size-3" aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  );
}

function BulkScopeDialog({
  mode,
  selectedTools,
  scopes,
  saving,
  onCancel,
  onApply,
}: {
  mode: "assign" | "remove" | null;
  selectedTools: MCPToolResponse[];
  scopes: OAuthScopeResponse[];
  saving: boolean;
  onCancel: () => void;
  onApply: (scopeIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const open = mode !== null;

  // Reset transient state whenever the dialog re-opens.
  const onOpenChange = (next: boolean) => {
    if (!next) {
      setPicked([]);
      setSearch("");
      onCancel();
    }
  };

  const filteredScopes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopes;
    return scopes.filter((scope) =>
      [scope.scope_string, scope.display_name, scope.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [scopes, search]);

  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );

  const toolNoun = selectedTools.length === 1 ? "tool" : "tools";
  const isAssign = mode === "assign";
  const title = isAssign
    ? `Assign access labels to ${selectedTools.length} ${toolNoun}`
    : `Remove access labels from ${selectedTools.length} ${toolNoun}`;
  const description = isAssign
    ? "Pick one or more labels. Each label will be mapped to every selected tool that doesn't already have it."
    : "Only labels mapped to every selected tool are shown. Removing applies across the whole selection.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {selectedTools.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
            {selectedTools.slice(0, 6).map((tool) => (
              <span
                key={tool.id}
                className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200"
              >
                {tool.name}
              </span>
            ))}
            {selectedTools.length > 6 ? (
              <span className="px-1 text-[11px] text-slate-500">
                +{selectedTools.length - 6} more
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              isAssign ? "Search access labels..." : "Search shared labels..."
            }
            className="pl-8"
          />
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-md border border-slate-200">
          {filteredScopes.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {scopes.length === 0
                ? isAssign
                  ? "No more labels left to assign."
                  : "No labels are shared across this selection."
                : "No labels match your search."}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredScopes.map((scope) => {
                const checked = picked.includes(scope.id);
                const tone = RISK_TONE[scope.risk_level];
                return (
                  <li key={scope.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50",
                        checked && "bg-slate-50",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(scope.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate-900">
                            {scope.display_name || scope.scope_string}
                          </span>
                          <span
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                              tone.chip,
                              tone.text,
                            )}
                          >
                            {scope.risk_level}
                          </span>
                        </div>
                        <div className="truncate font-mono text-[11px] text-slate-500">
                          {scope.scope_string}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => onApply(picked)}
            disabled={picked.length === 0 || saving}
            variant={isAssign ? "default" : "destructive"}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : isAssign ? (
              `Assign ${picked.length || ""} label${picked.length === 1 ? "" : "s"}`.trim()
            ) : (
              `Remove ${picked.length || ""} label${picked.length === 1 ? "" : "s"}`.trim()
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolInspectorDrawer({
  tool,
  applicationId,
  unmappedScopes,
  onClose,
}: {
  tool: MCPToolResponse | null;
  applicationId: string;
  unmappedScopes: { id: string; scope_string: string; display_name: string }[];
  onClose: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [updateMap, { isLoading: mapping }] = useUpdateToolScopeMapMutation();
  const [markPublic, { isLoading: publishing }] = useMarkToolPublicMutation();

  const open = tool !== null;
  const onOpenChange = (next: boolean) => {
    if (!next) {
      setConfirmName("");
      onClose();
    }
  };

  if (!tool) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const decision = classifyTool(tool);
  const risk = effectiveRisk(tool);
  const canChangePublic = tool.is_public || confirmName === tool.name;

  const handleMap = async (scopeId: string) => {
    try {
      await updateMap({
        rsId: applicationId,
        body: { mappings: [{ tool_id: tool.id, scope_id: scopeId }] },
      }).unwrap();
      toast.success("Access label mapped.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't apply mapping.");
    }
  };

  const handleRemoveMap = async (scopeId: string) => {
    try {
      await updateMap({
        rsId: applicationId,
        body: { mappings: [{ tool_id: tool.id, scope_id: scopeId, remove: true }] },
      }).unwrap();
      toast.success("Access label removed.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't remove mapping.");
    }
  };

  const handleMarkPublic = async () => {
    try {
      await markPublic({
        rsId: applicationId,
        toolId: tool.id,
        body: {
          is_public: !tool.is_public,
          confirmation_token: tool.is_public ? undefined : confirmName.trim(),
        },
      }).unwrap();
      toast.success(tool.is_public ? "Public exposure removed." : "Tool marked public.");
      onOpenChange(false);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't change public state.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col overflow-hidden p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5 text-left">
          <SheetTitle className="break-all font-mono text-2xl font-semibold leading-8 tracking-normal text-slate-950">
            {tool.name}
          </SheetTitle>
          <SheetDescription className="text-sm leading-5 text-slate-600">
            {tool.title || tool.description || "MCP tool access inspector"}
          </SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={
                decision === "public"
                  ? "info"
                  : decision === "mapped"
                    ? "success"
                    : "warning"
              }
            >
              {decisionLabel(decision)}
            </StatusBadge>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5",
                RISK_TONE[risk].chip,
                RISK_TONE[risk].text,
              )}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              {risk} risk
            </span>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-6 py-5">
          <VerdictCard
            verdict={decision === "unmapped" ? "deny" : decision === "advisory" ? "review" : "allow"}
            title={
              decision === "unmapped"
                ? "Denied until mapped"
                : decision === "advisory"
                  ? "Suggestion is not runtime policy"
                  : decision === "public"
                    ? "Callable without a scope check"
                    : "Callable through access labels"
            }
            body={
              decision === "unmapped"
                ? "The SDK will fail closed for this tool until an operator maps it to an access label."
                : decision === "advisory"
                  ? "Suggested scopes document intent, but only admin mappings are enforced."
                  : decision === "public"
                    ? "Any authenticated token for this application audience can call this tool."
                    : "Users need a role that grants one of the mapped access labels."
            }
          />

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Access path
            </h3>
            <AccessPath
              steps={[
                {
                  label: "MCP tool discovered",
                  detail: tool.description || tool.title || "Tool is in the inventory.",
                  state: "ok",
                },
                {
                  label: tool.is_public ? "Public exposure" : "Access label mapping",
                  detail: tool.is_public
                    ? "No role scope is required while public exposure is enabled."
                    : tool.scopes.length
                      ? `${tool.scopes.length} mapped label${tool.scopes.length === 1 ? "" : "s"} gate this tool.`
                      : "No label assigned; runtime denies the tool.",
                  state: tool.is_public || tool.scopes.length ? "ok" : "blocked",
                },
                {
                  label: "User role grants label",
                  detail: tool.is_public
                    ? "Skipped because the tool is public."
                    : "Open Access or Effective Access to inspect who receives this label.",
                  state: tool.is_public ? "muted" : tool.scopes.length ? "warn" : "blocked",
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Access labels
              </h3>
              <span className="text-xs text-slate-500">
                {tool.scopes.length} mapped
              </span>
            </div>
            {tool.scopes.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
                No mapped labels yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {tool.scopes.map((scope) => (
                  <li
                    key={scope.scope_id}
                    className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <EntityCell
                      label={scope.display_name || scope.scope_string}
                      detail={scope.scope_string}
                      monoDetail
                      badge={
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            RISK_TONE[scope.risk_level].chip,
                            RISK_TONE[scope.risk_level].text,
                          )}
                        >
                          {scope.risk_level}
                        </span>
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={mapping}
                      onClick={() => handleRemoveMap(scope.scope_id)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {unmappedScopes.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Map to access label
              </h3>
              <div className="grid gap-2">
                {unmappedScopes.slice(0, 8).map((scope) => (
                  <Button
                    key={scope.id}
                    variant="outline"
                    size="sm"
                    disabled={mapping}
                    onClick={() => handleMap(scope.id)}
                    className="h-auto justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate">
                      {scope.display_name || scope.scope_string}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">Map</span>
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          {tool.suggested_scopes?.length ? (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                SDK suggestions
              </h3>
              <div className="flex flex-wrap gap-2">
                {tool.suggested_scopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-lg border border-red-200 bg-white p-4">
            <div className="flex items-center gap-2">
              {tool.is_public ? (
                <ShieldAlert className="size-4 text-red-600" />
              ) : (
                <Sparkles className="size-4 text-slate-500" />
              )}
              <h3 className="text-xs font-bold uppercase tracking-wide text-red-600">
                Public exposure
              </h3>
            </div>
            <p className="text-sm leading-5 text-slate-600">
              Public tools are callable by any authenticated token for this
              application. To mark public, type the exact tool name.
            </p>
            {(risk === "high" || risk === "critical") && !tool.is_public ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                {risk}-risk tool. Public exposure may grant write,
                administrative, or broad capability.
              </div>
            ) : null}
            {!tool.is_public ? (
              <div>
                <Label
                  htmlFor="confirm-name"
                  className="text-[11px] font-bold uppercase tracking-wide text-slate-500"
                >
                  Type the tool name
                </Label>
                <Input
                  id="confirm-name"
                  value={confirmName}
                  placeholder={tool.name}
                  onChange={(event) => setConfirmName(event.target.value)}
                  className="mt-1 font-mono"
                />
              </div>
            ) : null}
            <Button
              variant="destructive"
              className="w-full"
              disabled={!canChangePublic || publishing}
              onClick={handleMarkPublic}
            >
              {publishing
                ? "Saving..."
                : tool.is_public
                  ? "Remove public exposure"
                  : "Mark public"}
            </Button>
          </section>

          <p className="text-xs leading-5 text-slate-500">
            Risk note: {riskReasonForTool(tool)}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
