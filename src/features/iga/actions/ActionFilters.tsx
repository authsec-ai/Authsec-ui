/**
 * ActionFilters — filter bar for the Actions feed (UG05).
 *
 * Filters: time range, workload/runtime, host/collector, account, resource,
 * operation, source sensor, outcome, enforcement backend, policy/revision/rule,
 * coverage gaps, and event family.
 *
 * The bar is a controlled component: the parent owns `ActionFilter` and hands
 * down an `onChange`. Selects use shadcn `Select`; text filters use `Input`.
 */

import { useCallback } from "react";
import { Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { ActionFilter, ActionOutcome, EventFamily } from "./ActionsApi";

/* ─────────────────────────── Constants ──────────────────────────────────── */

export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d" | "custom";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "1h": "Last hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom",
};

const OUTCOME_OPTIONS: { value: ActionOutcome | "all"; label: string }[] = [
  { value: "all", label: "All outcomes" },
  { value: "attempted", label: "Attempted" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "denied", label: "Denied" },
  { value: "contained", label: "Contained" },
  { value: "unknown", label: "Unknown" },
];

const EVENT_FAMILY_OPTIONS: { value: EventFamily | "all"; label: string }[] = [
  { value: "all", label: "All families" },
  { value: "api_call", label: "API call" },
  { value: "file_access", label: "File access" },
  { value: "network", label: "Network" },
  { value: "process", label: "Process" },
  { value: "auth", label: "Auth" },
  { value: "dns", label: "DNS" },
  { value: "other", label: "Other" },
];

/* ─────────────────────────── Props ──────────────────────────────────────── */

export interface ActionFiltersProps {
  filters: ActionFilter;
  onFiltersChange: (next: ActionFilter) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (tr: TimeRange) => void;
  /** Show workload column filter (collector view). */
  showWorkloadFilter?: boolean;
  className?: string;
}

/* ─────────────────────────── Helpers ────────────────────────────────────── */

function countActive(filters: ActionFilter): number {
  let n = 0;
  if (filters.outcome) n++;
  if (filters.event_family) n++;
  if (filters.operation) n++;
  if (filters.resource) n++;
  if (filters.source_sensor) n++;
  if (filters.enforcement_backend) n++;
  if (filters.policy) n++;
  if (filters.policy_revision) n++;
  if (filters.policy_rule) n++;
  if (filters.account) n++;
  if (filters.host) n++;
  if (filters.collector_id) n++;
  if (filters.runtime_instance) n++;
  if (filters.workload_id) n++;
  if (filters.coverage_gaps) n++;
  return n;
}

/* ─────────────────────────── Component ──────────────────────────────────── */

export function ActionFilters({
  filters,
  onFiltersChange,
  timeRange,
  onTimeRangeChange,
  showWorkloadFilter,
  className,
}: ActionFiltersProps) {
  const set = useCallback(
    (patch: Partial<ActionFilter>) =>
      onFiltersChange({ ...filters, ...patch, cursor: undefined }),
    [filters, onFiltersChange],
  );

  const clearAll = useCallback(
    () =>
      onFiltersChange({
        sort: filters.sort,
        limit: filters.limit,
      }),
    [filters.sort, filters.limit, onFiltersChange],
  );

  const active = countActive(filters);

  return (
    <div
      role="toolbar"
      aria-label="Action filters"
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-(--color-border-subtle) px-3 py-2",
        className,
      )}
    >
      {/* Time range */}
      <Select
        value={timeRange}
        onValueChange={(v) => onTimeRangeChange(v as TimeRange)}
      >
        <SelectTrigger className="h-8 w-[140px] text-xs" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((tr) => (
            <SelectItem key={tr} value={tr}>
              {TIME_RANGE_LABELS[tr]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Outcome */}
      <Select
        value={filters.outcome ?? "all"}
        onValueChange={(v) =>
          set({ outcome: v === "all" ? undefined : (v as ActionOutcome) })
        }
      >
        <SelectTrigger className="h-8 w-[130px] text-xs" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OUTCOME_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Event family */}
      <Select
        value={filters.event_family ?? "all"}
        onValueChange={(v) =>
          set({ event_family: v === "all" ? undefined : (v as EventFamily) })
        }
      >
        <SelectTrigger className="h-8 w-[130px] text-xs" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVENT_FAMILY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operation (text) */}
      <Input
        placeholder="Operation"
        value={filters.operation ?? ""}
        onChange={(e) => set({ operation: e.target.value || undefined })}
        className="h-8 w-[120px] text-xs"
      />

      {/* Resource (text) */}
      <Input
        placeholder="Resource"
        value={filters.resource ?? ""}
        onChange={(e) => set({ resource: e.target.value || undefined })}
        className="h-8 w-[120px] text-xs"
      />

      {/* Source sensor */}
      <Input
        placeholder="Source sensor"
        value={filters.source_sensor ?? ""}
        onChange={(e) => set({ source_sensor: e.target.value || undefined })}
        className="h-8 w-[120px] text-xs"
      />

      {/* Enforcement backend */}
      <Input
        placeholder="Enforcement"
        value={filters.enforcement_backend ?? ""}
        onChange={(e) =>
          set({ enforcement_backend: e.target.value || undefined })
        }
        className="h-8 w-[120px] text-xs"
      />

      {/* Policy */}
      <Input
        placeholder="Policy"
        value={filters.policy ?? ""}
        onChange={(e) => set({ policy: e.target.value || undefined })}
        className="h-8 w-[100px] text-xs"
      />

      {/* Policy revision */}
      <Input
        placeholder="Revision"
        value={filters.policy_revision ?? ""}
        onChange={(e) => set({ policy_revision: e.target.value || undefined })}
        className="h-8 w-[90px] text-xs"
      />

      {/* Policy rule */}
      <Input
        placeholder="Rule"
        value={filters.policy_rule ?? ""}
        onChange={(e) => set({ policy_rule: e.target.value || undefined })}
        className="h-8 w-[90px] text-xs"
      />

      {/* Account */}
      <Input
        placeholder="Account"
        value={filters.account ?? ""}
        onChange={(e) => set({ account: e.target.value || undefined })}
        className="h-8 w-[110px] text-xs"
      />

      {/* Host / collector (collector view) */}
      {showWorkloadFilter ? (
        <>
          <Input
            placeholder="Host"
            value={filters.host ?? ""}
            onChange={(e) => set({ host: e.target.value || undefined })}
            className="h-8 w-[100px] text-xs"
          />
          <Input
            placeholder="Collector"
            value={filters.collector_id ?? ""}
            onChange={(e) =>
              set({ collector_id: e.target.value || undefined })
            }
            className="h-8 w-[100px] text-xs"
          />
          <Input
            placeholder="Workload"
            value={filters.workload_id ?? ""}
            onChange={(e) =>
              set({ workload_id: e.target.value || undefined })
            }
            className="h-8 w-[110px] text-xs"
          />
        </>
      ) : null}

      {/* Coverage gaps toggle */}
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 gap-1 text-xs",
          filters.coverage_gaps &&
            "bg-(--color-warning-soft) text-(--color-warning-text)",
        )}
        onClick={() => set({ coverage_gaps: !filters.coverage_gaps || undefined })}
        aria-pressed={!!filters.coverage_gaps}
      >
        <Filter className="size-3" />
        Gaps
      </Button>

      {/* Active count + clear */}
      {active > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-(--color-text-muted)"
          onClick={clearAll}
          title="Clear all filters"
        >
          <X className="size-3" />
          {active} active
        </Button>
      ) : null}
    </div>
  );
}
