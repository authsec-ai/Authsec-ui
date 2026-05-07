/**
 * `ApplicationToolsPage` — review tool access, fully wired.
 *
 * Backend sources of truth:
 *   • `useGetScopeMatrixQuery`    → real tools, real risk levels, real
 *                                   `is_public`, real `inventory_source`,
 *                                   real `suggested_scopes`, real mapped
 *                                   scopes per tool.
 *   • `useUpdateToolScopeMapMutation` → apply / remove a scope mapping.
 *   • `useMarkToolPublicMutation` → mark a tool public (with confirmation).
 *   • `useRescanResourceServerMutation` → trigger a re-scan.
 *
 * The previous version fabricated queue counts and rows. They're gone.
 * This page now derives every count from `tools[]` and shows real
 * mapping state in the table + drawer.
 *
 * Scope-matrix completeness: the response type already declares
 * `is_public`, `inventory_source`, `suggested_scopes`, and a mapping
 * `source`. If the live backend doesn't populate these yet, the UI
 * gracefully falls back ("—") rather than fabricating.
 */

import { useMemo, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCcw, Search } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  useCreateManualToolMutation,
  useMarkToolPublicMutation,
  useScanWithMCPTokenMutation,
} from "@/app/api/setupWizardApi";
import type {
  MCPToolResponse,
  RiskLevel,
} from "@/app/api/types/scopeMatrix";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";
import {
  DecisionBanner,
  InlineStat,
  StatusBadge,
  Surface,
} from "./components/ApplicationConsole";

type FilterKey = "all" | "needs-review" | "mapped" | "public";
type ToolDecision = "public" | "mapped" | "advisory" | "unmapped";

const FILTER_DEFS: { key: FilterKey; label: string; tone: "info" | "warn" | "ok" }[] = [
  { key: "all", label: "All", tone: "info" },
  { key: "needs-review", label: "Needs review", tone: "warn" },
  { key: "mapped", label: "Mapped", tone: "ok" },
  { key: "public", label: "Public", tone: "info" },
];

const FILTER_DOT: Record<"info" | "warn" | "ok", string> = {
  info: "bg-blue-600",
  warn: "bg-amber-500",
  ok: "bg-emerald-600",
};

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
  if (tool.scopes.some((s) => s.source === "admin_override")) return "mapped";
  if (tool.scopes.length > 0) return "advisory";
  return "unmapped";
}

function effectiveRisk(tool: MCPToolResponse): RiskLevel {
  // The matrix response carries risk on each mapped scope. Use the
  // highest mapped risk; fall back to "low" if the tool is unmapped
  // (we don't get tool-level risk from the backend yet).
  const order: RiskLevel[] = ["critical", "high", "medium", "low"];
  for (const r of order) {
    if (tool.scopes.some((s) => s.risk_level === r)) return r;
  }
  return "low";
}

export default function ApplicationToolsPage() {
  const { application } = useApplicationContext();
  const { data: matrix, isLoading } = useGetScopeMatrixQuery(application.id);
  const [rescan, { isLoading: rescanning }] =
    useRescanResourceServerMutation();
  const [scanWithMCPToken, { isLoading: scanningWithToken }] =
    useScanWithMCPTokenMutation();
  const [createManualTool, { isLoading: creatingManualTool }] =
    useCreateManualToolMutation();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<MCPToolResponse | null>(null);
  const [scanToken, setScanToken] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [query, setQuery] = useState("");

  const tools = useMemo(() => matrix?.tools ?? [], [matrix]);

  const counts = useMemo(() => {
    let mapped = 0;
    let publicCount = 0;
    let unmapped = 0;
    for (const tool of tools) {
      const c = classifyTool(tool);
      if (c === "public") publicCount += 1;
      else if (c === "mapped") mapped += 1;
      else unmapped += 1;
    }
    return { all: tools.length, mapped, public: publicCount, unmapped };
  }, [tools]);

  const visibleTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      const c = classifyTool(t);
      const matchesFilter =
        filter === "all" ||
        (filter === "needs-review" && (c === "unmapped" || c === "advisory")) ||
        (filter === "mapped" && c === "mapped") ||
        (filter === "public" && c === "public");
      if (!matchesFilter) return false;
      if (!q) return true;
      return [
        t.name,
        t.title,
        t.description,
        ...(t.suggested_scopes ?? []),
        ...t.scopes.map((s) => s.scope_string),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [tools, filter, query]);

  const handleRescan = async () => {
    try {
      await rescan(application.id).unwrap();
      toast.success("Rescan started.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Rescan failed.");
    }
  };

  const handleAuthenticatedScan = async () => {
    if (!scanToken.trim()) {
      toast.error("Paste a one-time bearer token for the MCP server.");
      return;
    }
    try {
      await scanWithMCPToken({
        rsId: application.id,
        mcpToken: scanToken.trim(),
      }).unwrap();
      setScanToken("");
      toast.success("Authenticated scan completed.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Authenticated scan failed.");
    }
  };

  const handleCreateManualTool = async () => {
    if (!manualName.trim()) {
      toast.error("Enter the exact tool name.");
      return;
    }
    try {
      await createManualTool({
        rsId: application.id,
        name: manualName.trim(),
        description: manualDescription.trim() || undefined,
      }).unwrap();
      setManualName("");
      setManualDescription("");
      toast.success("Manual tool added.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't add manual tool.");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Review tool access
          </h2>
          <p className="max-w-3xl text-sm leading-5 text-slate-600">
            Tools and their scope mappings come from{" "}
            <code className="font-mono text-xs">/scope-matrix</code>.
            Unmapped tools are denied at runtime.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRescan}
          disabled={rescanning}
        >
          <RefreshCcw
            className={cn("mr-2 size-4", rescanning && "animate-spin")}
          />
          Rescan
        </Button>
      </header>

      <DecisionBanner
        tone={counts.unmapped > 0 ? "warning" : "success"}
        title={
          counts.unmapped > 0
            ? `${counts.unmapped} tools need a runtime decision`
            : "Tool inventory is mapped"
        }
        body={
          counts.unmapped > 0
            ? "Keep new or unmapped tools denied until an admin maps them to access labels or marks them explicitly public."
            : "All discovered tools have an explicit policy decision. Rescan after SDK or upstream changes."
        }
        actionLabel="Rescan"
        onAction={handleRescan}
      />

      <Surface className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <InlineStat label="tools" value={isLoading ? "..." : counts.all} tone="info" />
            <InlineStat label="need review" value={isLoading ? "..." : counts.unmapped} tone={counts.unmapped > 0 ? "warning" : "success"} />
            <InlineStat label="mapped" value={isLoading ? "..." : counts.mapped} tone="success" />
            <InlineStat label="public" value={isLoading ? "..." : counts.public} tone="info" />
          </div>
          <div className="relative w-full sm:w-[22rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools or scopes"
              className="h-9 pl-9"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTER_DEFS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? counts.all
                : f.key === "needs-review"
                  ? counts.unmapped
                  : f.key === "mapped"
                    ? counts.mapped
                    : counts.public;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                <span className={cn("size-1.5 rounded-full", FILTER_DOT[f.tone])} aria-hidden />
                {f.label}
                <span className="tabular-nums text-muted-foreground">
                  {isLoading ? "…" : count}
                </span>
              </button>
            );
          })}
        </div>
      </Surface>

      <details className="group rounded-lg border border-slate-200 bg-white shadow-[0_1px_1px_rgba(15,23,42,0.02)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-950">
          Discovery fallbacks
          <span className="text-xs font-medium text-slate-500 group-open:hidden">
            Authenticated scan and manual entry
          </span>
        </summary>
        <div className="grid gap-4 border-t border-slate-200 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-blue-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-950">
              Authenticated scan
            </h3>
          </div>
          <p className="text-xs leading-5 text-slate-600">
            Use this when <code className="font-mono">tools/list</code> is
            protected and unauthenticated rescan cannot see inventory. The
            token is sent once and is not stored.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              value={scanToken}
              onChange={(e) => setScanToken(e.target.value)}
              placeholder="Bearer token for MCP tools/list"
              aria-label="MCP scan token"
            />
            <Button
              variant="outline"
              onClick={handleAuthenticatedScan}
              disabled={scanningWithToken}
            >
              {scanningWithToken ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 size-4" />
              )}
              Scan
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-blue-600" aria-hidden />
            <h3 className="text-sm font-semibold text-slate-950">
              Manual tool entry
            </h3>
          </div>
          <p className="text-xs leading-5 text-slate-600">
            Use only as a fallback for closed servers. Manual tools still
            need an admin mapping before runtime allows them.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <Input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="tool_name"
              aria-label="Manual tool name"
            />
            <Input
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="Optional description"
              aria-label="Manual tool description"
            />
            <Button
              variant="outline"
              onClick={handleCreateManualTool}
              disabled={creatingManualTool}
            >
              {creatingManualTool ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Add
            </Button>
          </div>
        </div>
        </div>
      </details>

      {/* Tools table */}
      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 text-xs">
          <span className="font-semibold text-slate-950">
            {FILTER_DEFS.find((f) => f.key === filter)?.label} ({visibleTools.length})
          </span>
          <span className="text-slate-500">
            Click any row to inspect mapping and decide.
          </span>
        </div>
        <div>
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[10%]" />
              <col className="w-[39%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Mapped scopes</th>
                <th className="px-4 py-3">Decision</th>
                <th className="px-4 py-3 text-right" aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    Loading tools…
                  </td>
                </tr>
              )}
              {!isLoading && visibleTools.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    {tools.length === 0
                      ? "No tools discovered yet. Rescan after deploying the SDK."
                    : "No tools match this filter."}
                  </td>
                </tr>
              )}
              {visibleTools.map((tool) => (
                <ToolRowRender
                  key={tool.id}
                  tool={tool}
                  onInspect={() => setSelected(tool)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      <ToolInspectorDrawer
        tool={selected}
        applicationId={application.id}
        unmappedScopes={matrix?.unmapped_scopes ?? []}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// ── Tool row ──────────────────────────────────────────────────────────────

function ToolRowRender({
  tool,
  onInspect,
}: {
  tool: MCPToolResponse;
  onInspect: () => void;
}) {
  const decision = classifyTool(tool);
  const risk = effectiveRisk(tool);
  const riskTone = RISK_TONE[risk];
  return (
    <tr
      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-blue-50/40"
      onClick={onInspect}
    >
      <td className="px-4 py-3">
        <div className="truncate font-mono text-xs font-semibold text-slate-950">
          {tool.name}
        </div>
        {tool.title ? (
          <div className="mt-0.5 truncate text-xs text-slate-500">
            {tool.title}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
            riskTone.chip,
            riskTone.text,
          )}
        >
          <span className="size-1 rounded-full bg-current" aria-hidden />
          {risk}
        </span>
      </td>
      <td className="px-4 py-3">
        {tool.scopes.length === 0 ? (
          <span className="text-xs italic text-slate-500">
            {tool.is_public ? "(public — no scope check)" : "—"}
          </span>
        ) : (
          <span className="block truncate font-mono text-xs text-slate-700" title={tool.scopes.map((s) => s.scope_string).join(", ")}>
            {tool.scopes.map((s) => s.scope_string).join(", ")}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {decision === "public" ? (
          <StatusBadge tone="info">public</StatusBadge>
        ) : decision === "mapped" ? (
          <StatusBadge tone="success">mapped</StatusBadge>
        ) : decision === "advisory" ? (
          <StatusBadge tone="warning">suggested</StatusBadge>
        ) : (
          <StatusBadge tone="warning">denied</StatusBadge>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onInspect();
          }}
        >
          Inspect
        </Button>
      </td>
    </tr>
  );
}

// ── Inspector drawer ──────────────────────────────────────────────────────

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
  const isWriteOrAdmin = risk === "high" || risk === "critical";
  const canChangePublic = tool.is_public || confirmName === tool.name;

  const handleMap = async (scopeId: string) => {
    try {
      await updateMap({
        rsId: applicationId,
        body: { mappings: [{ tool_id: tool.id, scope_id: scopeId }] },
      }).unwrap();
      toast.success("Mapping applied.");
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
      toast.success("Mapping removed.");
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
      toast.success(tool.is_public ? "Tool unmarked public." : "Tool marked public.");
      onOpenChange(false);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't change public state.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono">{tool.name}</SheetTitle>
          <SheetDescription>
            {tool.title || "Tool details from /scope-matrix"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {tool.description && (
            <Detail label="Description">
              <p className="text-sm text-foreground">{tool.description}</p>
            </Detail>
          )}

          <Detail label="Risk (highest mapped scope)">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                RISK_TONE[risk].chip,
                RISK_TONE[risk].text,
              )}
            >
              <span className="size-1 rounded-full bg-current" aria-hidden />
              {risk}
            </span>
          </Detail>

          <Detail label="Inventory source">
            <code className="font-mono text-sm text-foreground">
              {tool.inventory_source ?? "—"}
            </code>
          </Detail>

          <Detail label="Current decision">
            <span className="text-sm text-foreground">
              {decision === "public"
                ? "Public — callable by every authenticated AuthSec token."
                : decision === "mapped"
                  ? "Mapped — gated by the scopes below."
                  : decision === "advisory"
                    ? "Suggested only — not runtime-effective until applied by an admin override."
                  : "Unmapped — denied at runtime."}
            </span>
          </Detail>

          <Detail label="Mapped scopes">
            {tool.scopes.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                No mapped scopes.
              </p>
            ) : (
              <ul className="space-y-1">
                {tool.scopes.map((s) => (
                  <li
                    key={s.scope_id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                  >
                    <span className="font-mono text-xs text-foreground">
                      {s.scope_string}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                          RISK_TONE[s.risk_level].chip,
                          RISK_TONE[s.risk_level].text,
                        )}
                      >
                        {s.risk_level}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground",
                        )}
                      >
                          {s.source ?? "source unknown"}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={mapping}
                        onClick={() => handleRemoveMap(s.scope_id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Detail>

          {tool.suggested_scopes && tool.suggested_scopes.length > 0 && (
            <Detail label="SDK-suggested (advisory until applied)">
              <p className="font-mono text-xs text-foreground">
                {tool.suggested_scopes.join(", ")}
              </p>
            </Detail>
          )}

          {unmappedScopes.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Add a scope mapping
              </p>
              <div className="mt-2 grid gap-2">
                {unmappedScopes.slice(0, 8).map((s) => (
                  <Button
                    key={s.id}
                    variant="outline"
                    size="sm"
                    disabled={mapping}
                    onClick={() => handleMap(s.id)}
                    className="justify-between"
                  >
                    <span className="font-mono">{s.scope_string}</span>
                    <span className="text-xs text-muted-foreground">+ map</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Mark public */}
          <div className="border-t border-border pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-danger)]">
              Mark public — risky
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Public tools are callable by every authenticated AuthSec token.
              To mark public, type the exact tool name. Removing public access
              does not require confirmation.
            </p>
            {isWriteOrAdmin && !tool.is_public && (
              <div className="mt-2 rounded-md border border-[color:color-mix(in_oklch,var(--color-danger)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-danger)_8%,transparent)] p-2 text-xs text-[var(--color-danger)]">
                {risk}-risk tool. Public exposure may grant write or
                administrative capability.
              </div>
            )}
            {tool.is_public && (
              <div className="mt-2 rounded-md border border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_5%,transparent)] p-2 text-xs text-[var(--color-primary)]">
                Currently public. Confirming will <strong>remove</strong>{" "}
                public exposure.
              </div>
            )}
            <div className="mt-3 space-y-2">
              {!tool.is_public && (
                <div>
                  <Label
                    htmlFor="confirm-name"
                    className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    Type the tool name
                  </Label>
                  <Input
                    id="confirm-name"
                    value={confirmName}
                    placeholder={tool.name}
                    onChange={(e) => setConfirmName(e.target.value)}
                    className="mt-1 font-mono"
                  />
                </div>
              )}
              <Button
                variant="destructive"
                className="w-full"
                disabled={!canChangePublic || publishing}
                onClick={handleMarkPublic}
              >
                {publishing
                  ? "Saving…"
                  : tool.is_public
                    ? "Unmark public"
                    : "Mark public"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
