import { useMemo, useState } from "react";
import { KeyRound, Loader2, RefreshCw, Search, ShieldAlert, Sparkles, X } from "lucide-react";
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
  useRescanResourceServerMutation,
  useUpdateToolScopeMapMutation,
} from "@/app/api/scopeMatrixApi";
import { useMarkToolPublicMutation } from "@/app/api/setupWizardApi";
import type {
  MCPToolResponse,
  OAuthScopeResponse,
  RiskLevel,
  ScopeMapEntry,
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

/** Runtime policy only honors operator-created mappings.
 *
 * The scope-matrix response also carries `sdk_suggested` rows in `tool.scopes`
 * so an operator can promote them. Those rows are advisory and must never be
 * counted, displayed, removed, or skipped as if they were assigned policy.
 */
function assignedScopes(tool: MCPToolResponse): ScopeMapEntry[] {
  return tool.scopes.filter(
    (scope) => scope.source === "admin_override",
  );
}

/** Return server-suggested scopes that have not been assigned as runtime policy. */
function pendingScopeSuggestions(tool: MCPToolResponse): string[] {
  const assigned = new Set(
    assignedScopes(tool).map((scope) => scope.scope_string),
  );
  return Array.from(
    new Set([
      ...(tool.suggested_scopes ?? []),
      ...tool.scopes
        .filter((scope) => scope.source === "sdk_suggested")
        .map((scope) => scope.scope_string),
    ]),
  ).filter((scope) => !assigned.has(scope));
}

function classifyTool(tool: MCPToolResponse): ToolDecision {
  if (tool.is_public) return "public";
  if (assignedScopes(tool).length > 0) return "mapped";
  if (pendingScopeSuggestions(tool).length > 0) return "advisory";
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
  const suggestions = pendingScopeSuggestions(tool);
  if (tool.scopes.length === 0 && suggestions.length === 0) {
    return tool.is_public
      ? "Public exposure bypasses scope checks."
      : "Unmapped tools are denied until a scope is assigned.";
  }
  const order: RiskLevel[] = ["critical", "high", "medium", "low"];
  for (const risk of order) {
    const scope = tool.scopes.find((entry) => entry.risk_level === risk);
    if (scope) return riskReasonForScope(scope.scope_string);
  }
  const scopeString = tool.scopes[0]?.scope_string ?? suggestions[0];
  return riskReasonForScope(scopeString);
}

function decisionLabel(decision: ToolDecision): string {
  if (decision === "public") return "Public";
  if (decision === "mapped") return "Role-gated";
  return "Denied";
}

export default function ApplicationToolsPage() {
  const { application } = useApplicationContext();
  const { data: matrix, isLoading } = useGetScopeMatrixQuery(application.id);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<"assign" | "remove" | null>(null);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [scanToken, setScanToken] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [updateMap, { isLoading: bulkSaving }] = useUpdateToolScopeMapMutation();
  const [rescan, { isLoading: rescanning }] = useRescanResourceServerMutation();

  const closeTokenDialog = () => {
    if (rescanning) return;
    setTokenDialogOpen(false);
    setScanToken("");
    setScanError(null);
  };

  const tools = useMemo(() => matrix?.tools ?? [], [matrix?.tools]);
  const selected = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId) ?? null,
    [selectedToolId, tools],
  );
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
    const first = assignedScopes(selectedTools[0]);
    return first.filter((scope) =>
      selectedTools.every((tool) =>
        assignedScopes(tool).some((entry) => entry.scope_id === scope.scope_id),
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
        (filter === "denied" &&
          (decision === "unmapped" || decision === "advisory"));
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
          const has = assignedScopes(tool).some(
            (entry) => entry.scope_id === scopeId,
          );
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
          ? "All selected tools already have these scopes."
          : "None of the selected tools have these scopes.",
      );
      return;
    }
    try {
      await updateMap({
        rsId: application.id,
        body: { mappings },
      }).unwrap();
      const toolNoun = selectedTools.length === 1 ? "tool" : "tools";
      const scopeNoun = scopeIds.length === 1 ? "scope" : "scopes";
      toast.success(
        mode === "assign"
          ? `Assigned ${scopeIds.length} ${scopeNoun} to ${selectedTools.length} ${toolNoun}.`
          : `Removed ${scopeIds.length} ${scopeNoun} from ${selectedTools.length} ${toolNoun}.`,
      );
      setBulkMode(null);
      setSelectedToolIds([]);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Bulk update failed.");
    }
  };

  const handleRefreshTools = async (mcpToken?: string) => {
    try {
      const response = await rescan({
        rsId: application.id,
        mcpToken,
      }).unwrap();
      const result = response.result;
      const toolChanges = result.tools_added + result.tools_updated + result.tools_removed;
      const scopeChanges = result.scopes_added + result.scopes_removed;
      if (response.last_scan_status === "partial") {
        toast.error(
          "Live tools were checked, but protected-resource metadata was unavailable. Scopes were not reconciled.",
        );
      } else if (mcpToken) {
        toast.success(
          toolChanges > 0 || scopeChanges > 0
            ? `Token-visible tools checked: +${result.tools_added} / ~${result.tools_updated}; scopes +${result.scopes_added} / -${result.scopes_removed}. Inventory hidden from this token was preserved.`
            : "Token-visible tools and protected-resource scopes were checked. Inventory hidden from this token was preserved.",
        );
      } else if (toolChanges > 0 || scopeChanges > 0) {
        toast.success(
          `Live MCP check complete: tools +${result.tools_added} / ~${result.tools_updated} / -${result.tools_removed}; scopes +${result.scopes_added} / -${result.scopes_removed}.`,
        );
      } else {
        toast.success("Live MCP tools and protected-resource scopes are current.");
      }
      if (result.warnings?.length) {
        toast(result.warnings[0], { icon: "⚠️" });
      }
      setTokenDialogOpen(false);
      setScanToken("");
      setScanError(null);
      setSelectedToolId(null);
      setSelectedToolIds([]);
      setBulkMode(null);
    } catch (err) {
      const apiErr = err as {
        status?: number;
        data?: { code?: string; error?: string; failure_reason?: string };
      };
      if (apiErr?.data?.code === "mcp_token_required" || apiErr?.status === 428) {
        setTokenDialogOpen(true);
        if (mcpToken) setScanToken("");
        setScanError(
          mcpToken
            ? apiErr?.data?.failure_reason ??
                "The MCP server rejected that token. Paste a fresh token that can call tools/list."
            : null,
        );
        return;
      }
      if (mcpToken) setScanToken("");
      toast.error(
        apiErr?.data?.failure_reason ??
          apiErr?.data?.error ??
          "Failed to refresh tools — MCP server may be unreachable.",
      );
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
        header: "Assigned scopes",
        priority: 3,
        approxWidth: 280,
        cell: ({ row }) => {
          const scopes = assignedScopes(row.original);
          const suggestionCount = pendingScopeSuggestions(row.original).length;
          return scopes.length === 0 ? (
            <span className="text-xs italic text-muted-foreground">
              {row.original.is_public
                ? "Public access"
                : suggestionCount > 0
                  ? `No scope assigned · ${suggestionCount} suggested`
                  : "No scope assigned"}
            </span>
          ) : (
            <span
              className="block truncate text-xs text-muted-foreground"
              title={scopes.map((scope) => scope.scope_string).join(", ")}
            >
              {scopes
                .map((scope) => scope.display_name || scope.scope_string)
                .join(", ")}
            </span>
          );
        },
      },
      {
        id: "policy",
        header: "Policy",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) => {
          const scopes = assignedScopes(row.original);
          return row.original.is_public ? (
            <span className="text-sm">Scope checks bypassed</span>
          ) : scopes.length ? (
            <span className="text-sm">
              {scopes.length} assigned scope{scopes.length === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Deny by default</span>
          );
        },
      },
      {
        id: "denies",
        header: "Recent denies",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) =>
          ["unmapped", "advisory"].includes(classifyTool(row.original)) ? (
            <span className="text-sm text-amber-700">Denied until assigned</span>
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
              { label: "Inspect access", onSelect: () => setSelectedToolId(row.original.id) },
              {
                label: row.original.is_public ? "Remove public exposure" : "Review public exposure",
                onSelect: () => setSelectedToolId(row.original.id),
                destructive: row.original.is_public,
              },
              { label: "Simulate access", onSelect: () => setSelectedToolId(row.original.id) },
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Tools
          </h2>
          <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
            Review every MCP capability this application exposes, what gates it,
            and which tools are denied until mapped.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleRefreshTools()}
          disabled={rescanning}
        >
          <RefreshCw className={cn("mr-1.5 size-3.5", rescanning && "animate-spin")} />
          {rescanning ? "Refreshing…" : "Refresh Tools"}
        </Button>
      </header>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search tools, scopes, or descriptions"
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
                    : counts.unmapped + counts.advisory,
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
                ? "No tools discovered yet. Click Refresh Tools to scan the MCP server."
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
              onRowClick={(tool) => setSelectedToolId(tool.id)}
              getRowId={(tool) => tool.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <ToolInspectorDrawer
        tool={selected}
        applicationId={application.id}
        availableScopes={(() => {
          if (!selected) return [];
          const alreadyAssigned = new Set(
            assignedScopes(selected).map((scope) => scope.scope_id),
          );
          const suggestions = new Set(pendingScopeSuggestions(selected));
          return allScopes
            .filter((scope) => !alreadyAssigned.has(scope.id))
            .sort(
              (left, right) =>
                Number(suggestions.has(right.scope_string)) -
                Number(suggestions.has(left.scope_string)),
            );
        })()}
        onClose={() => setSelectedToolId(null)}
      />

      <Dialog
        open={tokenDialogOpen}
        onOpenChange={(open) => {
          if (open) setTokenDialogOpen(true);
          else closeTokenDialog();
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Authenticate the live MCP inventory check</DialogTitle>
            <DialogDescription>
              This server correctly protects <code>tools/list</code>. Paste a
              bearer token that can enumerate its tools. AuthSec forwards it
              only for this refresh and never stores it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!rescanning && scanToken.trim()) {
                void handleRefreshTools(scanToken.trim());
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mcp-scan-token">MCP bearer token</Label>
              <Input
                id="mcp-scan-token"
                type="password"
                autoComplete="off"
                aria-invalid={scanError ? true : undefined}
                aria-describedby={scanError ? "mcp-scan-token-error" : "mcp-scan-token-help"}
                value={scanToken}
                onChange={(event) => {
                  setScanToken(event.target.value);
                  setScanError(null);
                }}
                placeholder="Paste a token with tools/list access"
              />
              <p id="mcp-scan-token-help" className="text-xs leading-5 text-muted-foreground">
                A successful refresh calls the actual MCP server, reconciles the
                tools visible to this token, and refreshes OAuth scopes from
                protected-resource metadata. The SDK manifest remains the
                authoritative complete inventory for SDK-protected servers.
              </p>
              {scanError ? (
                <p
                  id="mcp-scan-token-error"
                  role="alert"
                  className="text-sm text-[var(--color-danger)]"
                >
                  {scanError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeTokenDialog}
                disabled={rescanning}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="text-white"
                disabled={rescanning || !scanToken.trim()}
              >
                {rescanning ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 size-4" />
                )}
                {rescanning ? "Checking live server…" : "Authenticate and refresh"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BulkActionBar
        count={selectedTools.length}
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
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
        <span className="text-sm font-semibold text-foreground">
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
        <span className="h-4 w-px bg-border" aria-hidden />
        <Button size="sm" className="h-8 text-white" onClick={onAssign}>
          Assign scope
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
              : "Selected tools have no runtime scopes in common to remove."
          }
        >
          Remove scope
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
    ? `Assign scopes to ${selectedTools.length} ${toolNoun}`
    : `Remove scopes from ${selectedTools.length} ${toolNoun}`;
  const description = isAssign
    ? "Pick one or more scopes. Each scope will be assigned to every selected tool that doesn't already have it."
    : "Only runtime scopes assigned to every selected tool are shown. Suggested scopes are advisory and are never removed as runtime policy.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {selectedTools.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted p-2">
            {selectedTools.slice(0, 6).map((tool) => (
              <span
                key={tool.id}
                className="rounded-md bg-card px-2 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border"
              >
                {tool.name}
              </span>
            ))}
            {selectedTools.length > 6 ? (
              <span className="px-1 text-[11px] text-muted-foreground">
                +{selectedTools.length - 6} more
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              isAssign ? "Search scopes..." : "Search shared scopes..."
            }
            className="pl-8"
          />
        </div>

        <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
          {filteredScopes.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {scopes.length === 0
                ? isAssign
                  ? "No more scopes left to assign."
                  : "No runtime scopes are shared across this selection."
                : "No scopes match your search."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredScopes.map((scope) => {
                const checked = picked.includes(scope.id);
                const tone = RISK_TONE[scope.risk_level];
                return (
                  <li key={scope.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted",
                        checked && "bg-muted",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(scope.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">
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
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
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
              `Assign ${picked.length || ""} scope${picked.length === 1 ? "" : "s"}`.trim()
            ) : (
              `Remove ${picked.length || ""} scope${picked.length === 1 ? "" : "s"}`.trim()
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
  availableScopes,
  onClose,
}: {
  tool: MCPToolResponse | null;
  applicationId: string;
  availableScopes: OAuthScopeResponse[];
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
    return null;
  }

  const decision = classifyTool(tool);
  const risk = effectiveRisk(tool);
  const scopes = assignedScopes(tool);
  const suggestions = pendingScopeSuggestions(tool);
  const suggestionSet = new Set(suggestions);
  const suggestedAvailableScopes = availableScopes.filter((scope) =>
    suggestionSet.has(scope.scope_string),
  );
  const otherAvailableScopes = availableScopes.filter(
    (scope) => !suggestionSet.has(scope.scope_string),
  );
  const canChangePublic = tool.is_public || confirmName === tool.name;

  const handleMap = async (scopeId: string) => {
    try {
      await updateMap({
        rsId: applicationId,
        body: { mappings: [{ tool_id: tool.id, scope_id: scopeId }] },
      }).unwrap();
      toast.success("Scope assigned.");
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
      toast.success("Scope removed.");
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
        <SheetHeader className="border-b border-border bg-card px-6 py-5 text-left">
          <SheetTitle className="break-all font-mono text-2xl font-semibold leading-8 tracking-normal text-foreground">
            {tool.name}
          </SheetTitle>
          <SheetDescription className="text-sm leading-5 text-muted-foreground">
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
            {suggestions.length > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold leading-5 text-amber-700">
                {suggestions.length} suggested scope
                {suggestions.length === 1 ? "" : "s"} not assigned
              </span>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/60 px-6 py-5">
          <VerdictCard
            verdict={
              decision === "unmapped" || decision === "advisory"
                ? "deny"
                : "allow"
            }
            title={
              decision === "unmapped"
                ? "Denied until a scope is assigned"
                : decision === "advisory"
                  ? "Denied — suggested scope is not assigned"
                  : decision === "public"
                    ? "Callable without a scope check"
                    : "Callable through assigned scopes"
            }
            body={
              decision === "unmapped"
                ? "The SDK fails closed for this tool until an operator assigns a scope."
                : decision === "advisory"
                  ? "The MCP server recommends a scope, but recommendations never grant access. Assign it below to make it runtime policy."
                  : decision === "public"
                    ? "Any authenticated token for this application audience can call this tool."
                    : "Users need a role that grants one of the assigned scopes."
            }
          />

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
                  label: tool.is_public ? "Public exposure" : "Runtime scope assignment",
                  detail: tool.is_public
                    ? "No role scope is required while public exposure is enabled."
                    : scopes.length
                      ? `${scopes.length} assigned scope${scopes.length === 1 ? "" : "s"} gate this tool.`
                      : suggestions.length
                        ? "No scope assigned; the server suggestion is advisory only."
                        : "No scope assigned; runtime denies the tool.",
                  state: tool.is_public || scopes.length ? "ok" : "blocked",
                },
                {
                  label: "User role grants scope",
                  detail: tool.is_public
                    ? "Skipped because the tool is public."
                    : scopes.length
                      ? "Open Access or Effective Access to inspect who receives this scope."
                      : "Unavailable until a runtime scope is assigned.",
                  state: tool.is_public ? "muted" : scopes.length ? "warn" : "blocked",
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Assigned scopes
              </h3>
              <span className="text-xs text-muted-foreground">
                {scopes.length} assigned
              </span>
            </div>
            {scopes.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
                No runtime scope is assigned. Requests to this tool are denied.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {scopes.map((scope) => (
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
            {tool.is_public && scopes.length > 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">
                These assignments are not enforced while public exposure is enabled.
              </p>
            ) : null}
          </section>

          {suggestions.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700">
                  Suggested scopes — not assigned
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Advisory metadata published by the MCP server. Assign a scope
                  to make it enforceable runtime policy.
                </p>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-amber-200 bg-card">
                {suggestions.map((scopeString) => {
                  const available = suggestedAvailableScopes.find(
                    (scope) => scope.scope_string === scopeString,
                  );
                  return (
                    <li
                      key={scopeString}
                      className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-foreground">
                          {scopeString}
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          Suggested only · currently denied
                        </p>
                      </div>
                      {available ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={mapping}
                          onClick={() => handleMap(available.id)}
                        >
                          Assign scope
                        </Button>
                      ) : (
                        <span className="self-center text-xs text-muted-foreground">
                          Scope not registered
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {otherAvailableScopes.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Other available scopes
              </h3>
              <div className="grid gap-2">
                {otherAvailableScopes.slice(0, 8).map((scope) => (
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
                    <span className="shrink-0 text-xs text-muted-foreground">Assign</span>
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-lg border border-red-200 bg-card p-4">
            <div className="flex items-center gap-2">
              {tool.is_public ? (
                <ShieldAlert className="size-4 text-red-600" />
              ) : (
                <Sparkles className="size-4 text-muted-foreground" />
              )}
              <h3 className="text-xs font-bold uppercase tracking-wide text-red-600">
                Public exposure
              </h3>
            </div>
            <p className="text-sm leading-5 text-muted-foreground">
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
                  className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
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

          <p className="text-xs leading-5 text-muted-foreground">
            Risk note: {riskReasonForTool(tool)}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
