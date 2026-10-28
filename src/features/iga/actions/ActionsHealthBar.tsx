/**
 * ActionsHealthBar — telemetry strip above the actions table (UG05).
 *
 * Shows: connected / disconnected, last event received, processing lag,
 * coverage ratio, dropped counts, and retention boundary. Polled alongside
 * the actions list so the numbers stay current.
 */

import { Activity, AlertTriangle, Clock, Radio, Shield, Trash2 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ActionsHealth } from "./ActionsApi";

/* ─────────────────────────── Props ──────────────────────────────────────── */

export interface ActionsHealthBarProps {
  health: ActionsHealth | undefined;
  loading?: boolean;
  className?: string;
}

/* ─────────────────────────── Helpers ────────────────────────────────────── */

function relativeShort(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ago = Date.now() - new Date(iso).getTime();
  if (ago < 0) return "just now";
  if (ago < 60_000) return `${Math.floor(ago / 1_000)}s ago`;
  if (ago < 3_600_000) return `${Math.floor(ago / 60_000)}m ago`;
  if (ago < 86_400_000) return `${Math.floor(ago / 3_600_000)}h ago`;
  return `${Math.floor(ago / 86_400_000)}d ago`;
}

function lagLabel(ms: number | null | undefined): string {
  if (ms == null) return "n/a";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/* ─────────────────────────── Component ──────────────────────────────────── */

export function ActionsHealthBar({
  health,
  loading,
  className,
}: ActionsHealthBarProps) {
  if (loading || !health) {
    return (
      <div
        className={cn(
          "flex h-9 items-center gap-4 border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-4",
          className,
        )}
        aria-busy="true"
        aria-label="Loading health"
      >
        <div className="h-3 w-48 animate-pulse rounded bg-(--color-border-subtle)" />
      </div>
    );
  }

  const connected = health.connected;

  return (
    <div
      role="status"
      aria-label="Actions health"
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-(--color-border-subtle) px-4 py-1.5 text-xs",
        connected
          ? "bg-(--color-success-soft)/40"
          : "bg-(--color-danger-soft)/40",
        className,
      )}
    >
      {/* Connection status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-medium",
              connected
                ? "text-(--color-success-text)"
                : "text-(--color-danger-text)",
            )}
          >
            <Radio
              className={cn("size-3.5", connected && "animate-pulse")}
            />
            {connected ? "Connected" : "Disconnected"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {connected
            ? "The actions pipeline is receiving events."
            : "No events are reaching the pipeline. Check collector health."}
        </TooltipContent>
      </Tooltip>

      {/* Last event */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 text-(--color-text-muted)">
            <Clock className="size-3" />
            Last event: {relativeShort(health.last_event_at)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {health.last_event_at
            ? `Last event at ${new Date(health.last_event_at).toLocaleString()}`
            : "No events received yet"}
        </TooltipContent>
      </Tooltip>

      {/* Processing lag */}
      {health.processing_lag_ms != null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                health.processing_lag_ms > 30_000
                  ? "text-(--color-warning-text)"
                  : "text-(--color-text-muted)",
              )}
            >
              <Activity className="size-3" />
              Lag: {lagLabel(health.processing_lag_ms)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Time between event observation and pipeline processing.
          </TooltipContent>
        </Tooltip>
      ) : null}

      {/* Coverage */}
      {health.coverage_ratio ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 text-(--color-text-muted)">
              <Shield className="size-3" />
              Coverage: {health.coverage_ratio}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Fraction of runtime instances reporting actions.
          </TooltipContent>
        </Tooltip>
      ) : null}

      {/* Dropped */}
      {health.dropped_count > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 text-(--color-warning-text)">
              <AlertTriangle className="size-3" />
              {health.dropped_count.toLocaleString()} dropped
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Events dropped due to pipeline back-pressure or quota.
          </TooltipContent>
        </Tooltip>
      ) : null}

      {/* Retention boundary */}
      {health.retention_boundary ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1.5 text-(--color-text-muted)">
              <Trash2 className="size-3" />
              Retention: {relativeShort(health.retention_boundary)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Oldest event still available. Events before{" "}
            {new Date(health.retention_boundary).toLocaleDateString()} have been
            pruned.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
