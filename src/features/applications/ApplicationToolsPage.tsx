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
      <SheetContent className="flex h-full flex-col overflow-hidden p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="break-all font-mono text-[28px] font-semibold leading-8 tracking-normal text-slate-950">
                {tool.name}
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm leading-5 text-slate-600">
                {tool.title || "Tool details from /scope-matrix"}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={
                decision === "public"
                  ? "info"
                  : decision === "mapped"
                    ? "success"
                    : "warning"
              }
            >
              {decision === "public"
                ? "Public"
                : decision === "mapped"
                  ? "Mapped"
                  : decision === "advisory"
                    ? "Suggested only"
                    : "Denied"}
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
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold leading-5 text-slate-600">
              {tool.inventory_source ?? "source unknown"}
            </span>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/60 px-6 py-5">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              What this tool does
            </p>
            {tool.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {tool.description}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                No description returned for this tool.
              </p>
            )}
            <p className="mt-3 text-[11px] text-slate-500">
              Source: <code className="font-mono">/scope-matrix</code>{" "}
              <code className="font-mono">tool.description</code>.
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
              Runtime decision
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {decision === "public"
                ? "Public — callable by every authenticated AuthSec token."
                : decision === "mapped"
                  ? "Mapped — gated by the scopes below."
                  : decision === "advisory"
                    ? "Suggested only — not runtime-effective until applied by an admin override."
                    : "Unmapped — denied at runtime."}
            </p>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                Mapped scopes
              </p>
              <span className="text-xs text-slate-500">
                {tool.scopes.length} runtime mapping{tool.scopes.length === 1 ? "" : "s"}
              </span>
            </div>
            {tool.scopes.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No mapped scopes.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {tool.scopes.map((s) => (
                  <li
                    key={s.scope_id}
                    className="grid gap-3 bg-white px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-slate-950">
                        {s.scope_string}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
                            RISK_TONE[s.risk_level].chip,
                            RISK_TONE[s.risk_level].text,
                          )}
                        >
                          {s.risk_level}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                          {s.source ?? "source unknown"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="outline"
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
          </section>

          {tool.suggested_scopes && tool.suggested_scopes.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                SDK-suggested scopes
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tool.suggested_scopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700"
                  >
                    {scope}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Advisory until applied by an admin override.
              </p>
            </section>
          )}

          {unmappedScopes.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
                Add a scope mapping
              </p>
              <div className="mt-3 grid gap-2">
                {unmappedScopes.slice(0, 8).map((s) => (
                  <Button
                    key={s.id}
                    variant="outline"
                    size="sm"
                    disabled={mapping}
                    onClick={() => handleMap(s.id)}
                    className="h-auto justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate font-mono">
                      {s.scope_string}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">Map</span>
                  </Button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-red-200 bg-white p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-red-600">
              Public exposure
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-600">
              Public tools are callable by every authenticated AuthSec token.
              To mark public, type the exact tool name. Removing public access
              does not require confirmation.
            </p>
            {isWriteOrAdmin && !tool.is_public && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                {risk}-risk tool. Public exposure may grant write or
                administrative capability.
              </div>
            )}
            {tool.is_public && (
              <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-700">
                Currently public. Confirming will <strong>remove</strong>{" "}
                public exposure.
              </div>
            )}
            <div className="mt-3 space-y-2">
              {!tool.is_public && (
                <div>
                  <Label
                    htmlFor="confirm-name"
                    className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500"
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
                  ? "Saving..."
                  : tool.is_public
                    ? "Unmark public"
                    : "Mark public"}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
