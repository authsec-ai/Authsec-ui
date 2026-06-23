import { useState, useRef, useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import {
  Play,
  Pause,
  Download,
  Terminal,
  CheckCircle,
  XCircle,
  MinusCircle,
  RotateCcw,
  Loader2,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import type { M2MLog } from "../../../../types/entities";
import type { PaginationMetadata } from "../../../../app/api/logsApi";

interface M2MLogsViewProps {
  logs: M2MLog[];
  onExport: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  pagination?: PaginationMetadata;
  onPageChange?: (page: number) => void;
}

type EffectStyle = { text: string; icon: string };

const EFFECT_STYLES: Record<string, EffectStyle> = {
  permit: {
    text: "text-emerald-700 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  deny: {
    text: "text-rose-700 dark:text-rose-300",
    icon: "text-rose-600 dark:text-rose-400",
  },
  no_policy: {
    text: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
  },
};

function effectStyle(effect: string): EffectStyle {
  return EFFECT_STYLES[effect] ?? EFFECT_STYLES.no_policy;
}

function EffectIcon({ effect }: { effect: string }) {
  if (effect === "permit") return <CheckCircle className="h-4 w-4" />;
  if (effect === "deny") return <XCircle className="h-4 w-4" />;
  return <MinusCircle className="h-4 w-4" />;
}

function EffectBadge({ value, label }: { value: string; label?: string }) {
  const cls =
    value === "permit"
      ? "badge--success"
      : value === "deny"
      ? "badge--danger"
      : "badge--warning";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${
        value === "permit"
          ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
          : value === "deny"
          ? "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
          : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
      }`}
    >
      {label ?? value}
    </span>
  );
}

export function M2MLogsView({
  logs,
  onExport,
  onRefresh,
  isRefreshing,
  pagination,
  onPageChange,
}: M2MLogsViewProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [pagination?.page]);

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatMainLine = (log: M2MLog) => {
    const ts = new Date(log.createdAt).toISOString();
    const pdp = log.pdpEffect.toUpperCase().padEnd(10);
    return `[${ts}] ${pdp} client=${log.clientId} rs=${log.resourceServerId}`;
  };

  const formatDetailsLine = (log: M2MLog) => {
    const parts: string[] = [];
    parts.push(`family=${log.tokenFamily}`);
    parts.push(`subject=${log.subjectType}${log.subjectId ? `:${log.subjectId}` : ""}`);
    parts.push(`gate=${log.gateEffect}`);
    parts.push(`pdp_agrees=${log.pdpAgrees}`);
    return `    ${parts.join(" ")}`;
  };

  return (
    <div className="overflow-hidden border border-slate-200 dark:border-neutral-900 bg-white dark:bg-neutral-950 shadow-lg dark:shadow-[0_24px_40px_rgba(5,5,8,0.45)]">
      {/* Controls */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-neutral-950/90 border-b border-slate-200 dark:border-neutral-900">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-slate-300 dark:border-neutral-800 bg-white dark:bg-neutral-950/80">
            <Terminal className="h-4 w-4 text-blue-500 dark:text-blue-300" />
            <span className="text-slate-700 dark:text-blue-100 font-mono text-sm tracking-[0.12em] uppercase">
              M2M Logs Console
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-slate-600 dark:text-zinc-300 border-slate-300 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900/80 font-mono text-[11px] tracking-[0.12em] uppercase"
          >
            {logs.length} entries
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="h-9 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-neutral-900/70 hover:text-slate-900 dark:hover:text-blue-100"
          >
            {isPaused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
            {isPaused ? "Resume" : "Pause"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-neutral-900/70 hover:text-slate-900 dark:hover:text-blue-100 disabled:opacity-70"
          >
            {isRefreshing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3 mr-1" />
            )}
            Refresh
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            className="h-9 px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-neutral-900/70 hover:text-slate-900 dark:hover:text-blue-100"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Console Output */}
      <div className="bg-slate-50 dark:bg-neutral-950/70 border-b border-slate-200 dark:border-neutral-900">
        <div
          className="h-[600px] w-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-track-slate-200 dark:scrollbar-track-neutral-900 scrollbar-thumb-slate-400 dark:scrollbar-thumb-zinc-700"
          ref={scrollContainerRef}
        >
          <div className="p-6 font-mono text-sm text-slate-700 dark:text-zinc-300">
            {logs.length === 0 ? (
              <div className="text-slate-500 dark:text-zinc-500 text-center py-16">
                <Terminal className="h-12 w-12 mx-auto mb-4 text-slate-400 dark:text-zinc-600" />
                <p className="text-lg font-semibold tracking-[0.08em] text-slate-600 dark:text-zinc-300">
                  No M2M logs to display
                </p>
                <p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">
                  M2M token issuance logs will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-slate-200 dark:divide-neutral-900/70">
                {logs.map((log) => {
                  const style = effectStyle(log.pdpEffect);
                  const isExpanded = expandedRows.has(log.id);

                  return (
                    <div key={log.id} className="py-3">
                      <div
                        className="flex items-start gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-neutral-900/50 transition-colors rounded-lg px-2 -mx-2 py-2"
                        onClick={() => toggleRowExpansion(log.id)}
                      >
                        <div className="flex h-7 w-7 items-center justify-center shrink-0 mt-0.5">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-500 dark:text-zinc-400" />
                          )}
                        </div>

                        <div className={`flex h-7 w-7 items-center justify-center shrink-0 mt-0.5 ${style.icon}`}>
                          <EffectIcon effect={log.pdpEffect} />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className={`text-[13px] leading-relaxed ${style.text}`}>
                            {formatMainLine(log)}
                          </div>
                          <div className="pl-2 text-[12px] text-slate-600 dark:text-zinc-500/80 whitespace-pre-wrap">
                            {formatDetailsLine(log)}
                          </div>
                          {/* inline effect badges */}
                          <div className="pl-2 flex flex-wrap items-center gap-1.5 mt-1">
                            <EffectBadge value={log.pdpEffect} label={`PDP: ${log.pdpEffect}`} />
                            <EffectBadge value={log.gateEffect} label={`Gate: ${log.gateEffect}`} />
                            {log.scopesGranted && (
                              <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
                                scopes={log.scopesGranted}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="ml-16 mt-2 p-4 bg-slate-100/50 dark:bg-neutral-900/30 rounded-lg border border-slate-200 dark:border-neutral-800">
                          <div className="space-y-3 text-[12px] font-mono">
                            {/* Token Info */}
                            <div>
                              <div className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                                Token Info:
                              </div>
                              <div className="pl-3 space-y-1 text-slate-600 dark:text-zinc-400">
                                <div>• Token Family: {log.tokenFamily}</div>
                                <div>• Client ID: {log.clientId}</div>
                                <div>• Resource Server: {log.resourceServerId}</div>
                                <div>• Workspace: {log.workspaceId}</div>
                              </div>
                            </div>

                            {/* Subject */}
                            <div>
                              <div className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                                Subject:
                              </div>
                              <div className="pl-3 space-y-1 text-slate-600 dark:text-zinc-400">
                                <div>• Type: {log.subjectType}</div>
                                {log.subjectId && <div>• ID: {log.subjectId}</div>}
                              </div>
                            </div>

                            {/* PDP Decision */}
                            <div>
                              <div className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                                PDP Decision:
                              </div>
                              <div className="pl-3 space-y-1 text-slate-600 dark:text-zinc-400">
                                <div className="flex items-center gap-2">
                                  • PDP Effect: <EffectBadge value={log.pdpEffect} />
                                </div>
                                <div className="flex items-center gap-2">
                                  • Gate Effect: <EffectBadge value={log.gateEffect} />
                                </div>
                                <div>• PDP Agrees: {log.pdpAgrees ? "Yes" : "No"}</div>
                                {log.pdpReason && <div>• Reason: {log.pdpReason}</div>}
                              </div>
                            </div>

                            {/* Scopes */}
                            <div>
                              <div className="font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                                Scopes:
                              </div>
                              <div className="pl-3 space-y-1 text-slate-600 dark:text-zinc-400 break-all">
                                <div>• Requested: {log.scopesRequested || "—"}</div>
                                <div>• Granted: {log.scopesGranted || "—"}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Console Footer */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-neutral-950/90 text-[11px] uppercase tracking-[0.18em] text-slate-600 dark:text-zinc-500 border-t border-slate-200 dark:border-neutral-800/70">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isPaused
                  ? "bg-amber-500 dark:bg-amber-300"
                  : "bg-emerald-500 dark:bg-emerald-300"
              }`}
            />
            <span>Status: {isPaused ? "PAUSED" : "LIVE"}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {pagination && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPageChange?.(pagination.page - 1)}
                disabled={!pagination.has_prev || isRefreshing}
                className="h-7 w-7 p-0 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-neutral-900/70 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="rounded-full border border-slate-300 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/70 px-3 py-1">
                Page {pagination.page} of {pagination.total_pages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPageChange?.(pagination.page + 1)}
                disabled={!pagination.has_next || isRefreshing}
                className="h-7 w-7 p-0 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-neutral-900/70 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <span className="rounded-full border border-slate-300 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/70 px-3 py-1">
            {pagination
              ? `${pagination.total_items} total`
              : `${logs.length} entries`}
          </span>
          <span className="rounded-full border border-slate-300 dark:border-neutral-800/60 bg-white dark:bg-neutral-900/70 px-3 py-1">
            Last updated:{" "}
            {logs.length > 0
              ? new Date(logs[0].createdAt).toLocaleTimeString()
              : "Never"}
          </span>
        </div>
      </div>
    </div>
  );
}
