/**
 * GraphToolbar — toolbar component for the identity graph with time window,
 * filters, coverage indicator, last event received, refresh, fit, and legend.
 *
 * Sits above the graph canvas in the Identity Graph tab. Each control is a
 * simple callback: the parent owns the state so the toolbar can be used from
 * any graph wrapper.
 */

import { useCallback, useState } from "react";
import { Clock, Filter, Maximize2, RefreshCw, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ── Time window ─────────────────────────────────────────────────────────────

export type TimeWindow = "1h" | "6h" | "24h" | "7d" | "30d" | "all";

const TIME_LABELS: Record<TimeWindow, string> = {
  "1h": "Last 1 hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

// ── Filter state ────────────────────────────────────────────────────────────

export interface GraphFilters {
  identityOnly: boolean;
  resourceOnly: boolean;
  activeRuntimeOnly: boolean;
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface GraphToolbarProps {
  /** Selected time window for event data. */
  timeWindow: TimeWindow;
  onTimeWindowChange: (tw: TimeWindow) => void;
  /** Active filters. */
  filters: GraphFilters;
  onFiltersChange: (filters: GraphFilters) => void;
  /** Coverage ratio as a string, e.g. "12/15 workloads covered". */
  coverageLabel?: string;
  /** ISO timestamp of the last event the collector reported. */
  lastEventAt?: string | null;
  onRefresh: () => void;
  onFitGraph?: () => void;
  /** Whether a refresh is in progress. */
  refreshing?: boolean;
}

function relativeTimeShort(iso: string | null | undefined): string {
  if (!iso) return "No events";
  const ago = Date.now() - new Date(iso).getTime();
  if (ago < 60_000) return "Just now";
  if (ago < 3600_000) return `${Math.floor(ago / 60_000)}m ago`;
  if (ago < 86400_000) return `${Math.floor(ago / 3600_000)}h ago`;
  return `${Math.floor(ago / 86400_000)}d ago`;
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const [open, setOpen] = useState(false);
  const items = [
    { color: "bg-(--color-object-workload-soft)", label: "Workload / Runtime instance" },
    { color: "bg-(--color-object-identity-soft)", label: "Identity (IAM role, user, group, local, K8s, AD)" },
    { color: "bg-(--color-object-resource-soft)", label: "Resource (exact reference, selector)" },
    { color: "bg-(--color-object-statement-soft)", label: "Policy statement" },
    { color: "bg-(--color-object-external-soft)", label: "External principal / resource" },
  ];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          aria-label="Legend"
          title="Legend"
        >
          <Shield className="size-3.5" />
          Legend
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} disabled className="gap-2 text-xs opacity-100">
            <span className={cn("size-3 shrink-0 rounded-sm", item.color)} />
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function GraphToolbar({
  timeWindow,
  onTimeWindowChange,
  filters,
  onFiltersChange,
  coverageLabel,
  lastEventAt,
  onRefresh,
  onFitGraph,
  refreshing,
}: GraphToolbarProps) {
  const toggleFilter = useCallback(
    (key: keyof GraphFilters) => {
      onFiltersChange({ ...filters, [key]: !filters[key] });
    },
    [filters, onFiltersChange],
  );

  const toggleClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary)",
      active ? "bg-(--color-primary) text-white" : "text-(--color-text-muted) hover:bg-(--color-surface-subtle)",
    );

  return (
    <div
      role="toolbar"
      aria-label="Identity graph controls"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--color-border-subtle) px-3 py-2"
    >
      {/* Time window */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Clock className="size-3.5" />
            {TIME_LABELS[timeWindow]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(Object.keys(TIME_LABELS) as TimeWindow[]).map((tw) => (
            <DropdownMenuItem
              key={tw}
              onSelect={() => onTimeWindowChange(tw)}
              className={cn(tw === timeWindow && "font-semibold")}
            >
              {TIME_LABELS[tw]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filters */}
      <div className="inline-flex overflow-hidden rounded-md border border-(--color-border-subtle)" role="group" aria-label="Filters">
        <button
          type="button"
          aria-pressed={filters.identityOnly}
          onClick={() => toggleFilter("identityOnly")}
          className={toggleClass(filters.identityOnly)}
          title="Show only identity nodes"
        >
          Identities
        </button>
        <button
          type="button"
          aria-pressed={filters.resourceOnly}
          onClick={() => toggleFilter("resourceOnly")}
          className={toggleClass(filters.resourceOnly)}
          title="Show only resource nodes"
        >
          Resources
        </button>
        <button
          type="button"
          aria-pressed={filters.activeRuntimeOnly}
          onClick={() => toggleFilter("activeRuntimeOnly")}
          className={toggleClass(filters.activeRuntimeOnly)}
          title="Show only active runtime instances"
        >
          Active runtime
        </button>
      </div>

      {/* Coverage and last event */}
      <div className="flex items-center gap-3 text-xs text-(--color-text-muted)">
        {coverageLabel ? <span title="Runtime coverage">{coverageLabel}</span> : null}
        {lastEventAt !== undefined ? (
          <span title={lastEventAt ?? "No events received"}>
            Last event: {relativeTimeShort(lastEventAt)}
          </span>
        ) : null}
      </div>

      {/* Right-side actions */}
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </Button>
        {onFitGraph ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onFitGraph}
            aria-label="Fit graph in view"
            title="Fit graph in view"
          >
            <Maximize2 className="size-4" />
          </Button>
        ) : null}
        <Legend />
      </div>
    </div>
  );
}
