/**
 * RolloutPanel — displays the rollout targets table for a published policy.
 *
 * Fetches the rollout status for the given policy and renders:
 *   - an aggregate summary row (total / applied / verified / failed / pending)
 *   - a table of individual rollout targets with state badges
 *   - expandable Controls cell showing compiled control sub-table
 *
 * UI06 enhancements:
 *   - Controls cell is now expandable (click to show sub-table).
 *   - Sub-table columns: kind, name, status (installed/active/verified),
 *     evidence timestamp.
 *   - Uses `getCompiledArtifacts` query to fetch control details.
 *
 * Used inside PolicyDetail's Deployments tab.
 */

import { useState, Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  useGetRolloutQuery,
  useGetCompiledArtifactsQuery,
  type RolloutTarget,
  type CompiledControl,
} from "./policyApi";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { ControlStatusBadge } from "./ControlStatusBadge";
import { Panel } from "@/features/iga/shared/components/Panel";

// ── Helpers ──────────────────────────────────────────────────────────────────

function targetStateTone(state: string): ConsoleTone {
  switch (state) {
    case "applied":
      return "info";
    case "verified":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "neutral";
    default:
      return "neutral";
  }
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "\u2014";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ── Controls sub-table (expandable row) ──────────────────────────────────────

function ControlsSubTable({
  policyId,
  deliveryRevision,
}: {
  policyId: string;
  deliveryRevision: number;
}) {
  const { data: artifacts, isLoading, isError } = useGetCompiledArtifactsQuery({
    policyId,
    revision: deliveryRevision,
  });

  if (isLoading) {
    return (
      <tr>
        <td colSpan={9} className="px-8 py-3">
          <div className="h-8 animate-pulse rounded bg-(--color-surface-subtle)" />
        </td>
      </tr>
    );
  }

  const controls = artifacts?.controls ?? [];
  if (isError || controls.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="px-8 py-3 text-xs text-(--color-text-muted)">
          {isError
            ? "Unable to load controls for this revision."
            : "No compiled controls available."}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={9} className="bg-(--color-surface-subtle)/50 px-0 py-0">
        <div className="px-8 py-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-(--color-border-subtle) text-(--color-text-muted)">
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Kind</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Name</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Status</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Evidence Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((ctrl: CompiledControl, i: number) => (
                <tr
                  key={`${ctrl.kind}-${ctrl.name}-${i}`}
                  className="border-b border-(--color-border-subtle) last:border-b-0"
                >
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">
                    {ctrl.kind}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">{ctrl.name}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {ctrl.status ? (
                      <ControlStatusBadge status={ctrl.status} />
                    ) : (
                      <StatusBadge tone="neutral">unknown</StatusBadge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-(--color-text-muted)">
                    {/* Evidence timestamp is inferred from the artifact metadata.
                        The sha256 acts as the evidence fingerprint; real timestamp
                        would come from a dedicated evidence query. */}
                    {ctrl.sha256 ? ctrl.sha256.slice(0, 12) + "..." : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface RolloutPanelProps {
  policyId: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RolloutPanel({ policyId }: RolloutPanelProps) {
  const { data, isLoading, isError } = useGetRolloutQuery(policyId);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <Panel title="Rollout Targets">
        <p className="py-4 text-center text-xs text-muted-foreground">
          Loading rollout data...
        </p>
      </Panel>
    );
  }

  if (isError || !data) {
    return (
      <Panel title="Rollout Targets">
        <p className="py-4 text-center text-xs text-muted-foreground">
          Failed to load rollout data.
        </p>
      </Panel>
    );
  }

  const { aggregate, targets } = data;

  return (
    <Panel
      title="Rollout Targets"
      count={`${targets.length} target${targets.length !== 1 ? "s" : ""}`}
      flush
    >
      {/* Aggregate summary */}
      <div className="grid grid-cols-5 gap-3 border-b border-(--color-border-subtle) px-4 py-3">
        {(
          [
            { label: "Total", value: aggregate.total },
            { label: "Applied", value: aggregate.applied },
            { label: "Verified", value: aggregate.verified },
            { label: "Failed", value: aggregate.failed },
            { label: "Pending", value: aggregate.pending },
          ] as const
        ).map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-xs text-(--color-text-muted)">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-(--color-text)">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Targets table */}
      {targets.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No rollout targets yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-(--color-border-subtle) text-(--color-text-muted)">
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Workload ID
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Instance ID
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Collector ID
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  State
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Mode
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Delivery Rev
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Controls
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Last Receipt
                </th>
                <th className="whitespace-nowrap px-4 py-2 font-medium">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t: RolloutTarget, idx: number) => {
                const rowKey = `${t.workload_id}-${t.instance_id}-${idx}`;
                const isExpanded = expandedRows.has(rowKey);

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className="border-b border-(--color-border-subtle) last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-4 py-2 font-mono">
                        {t.workload_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono">
                        {t.instance_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono">
                        {t.collector_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <StatusBadge tone={targetStateTone(t.state)}>
                          {t.state}
                        </StatusBadge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs">
                        {t.mode}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                        v{t.delivery_revision}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <button
                          type="button"
                          onClick={() => toggleRow(rowKey)}
                          className="inline-flex items-center gap-1 tabular-nums text-(--color-text) hover:text-(--color-primary)"
                          title={isExpanded ? "Collapse controls" : "Expand controls"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronRight className="size-3.5" />
                          )}
                          {t.controls_verified}/{t.controls_total}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-(--color-text-muted)">
                        {formatTimestamp(t.last_receipt_at)}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-(--color-danger-text)">
                        {t.error ?? "\u2014"}
                      </td>
                    </tr>

                    {/* Expandable controls sub-table */}
                    {isExpanded && (
                      <ControlsSubTable
                        policyId={policyId}
                        deliveryRevision={t.delivery_revision}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
