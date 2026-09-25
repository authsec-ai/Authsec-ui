/**
 * The one custom edge type (SPEC-iga-phase2-graph.md §2.14.15 *Components*:
 * "Grouped-grants edge — a custom edge whose label is a button"). Every edge
 * uses it, grouped or not, because every edge must open evidence on
 * selection (§2.14.11 "every edge opens evidence") — a plain edge's label is
 * just a smaller, unbadged button.
 *
 * Stale is dashed; a cycle-closing edge is marked "cycle"; an edge crossing
 * an account boundary is marked. Wording is exactly the four verbs
 * (`graphLabels.ts` `EDGE_LABEL`) plus the grouped count, never "can access".
 */

import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { limitationText } from "../shared/labels";
import { EDGE_LABEL, mixedStateText } from "./graphLabels";
import type { VisualEdge } from "./types";

export interface GraphEdgeData extends Record<string, unknown> {
  visual: VisualEdge;
  isSelected: boolean;
  /** `target=<ref>` found this edge on a declared path (§2.14.11 *View in graph*). */
  highlighted: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}

export type RFGraphEdge = Edge<GraphEdgeData, "graphEdge">;

function GraphEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<RFGraphEdge>) {
  if (!data) return null;
  const { visual: e } = data;
  const grouped = e.members.length > 1;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const stale = e.state === "stale";
  const ended = e.state === "ended";

  // A single grant names its statement's policy directly; only a grouped
  // one names the count instead (review item 16).
  const label =
    e.kind === "grant"
      ? grouped
        ? `granted by · ${e.members.length} statements`
        : e.targetPolicy
          ? `granted by ${e.targetPolicy}`
          : EDGE_LABEL.grant
      : EDGE_LABEL[e.kind];

  // stale and ended are never conflated (review item 13).
  const mixed = mixedStateText(e.members.map((m) => m.state ?? "current"));

  const limitationNotes = [
    ...new Set(e.members.flatMap((m) => (m.limitations ?? []).map((l) => limitationText(l)))),
  ];

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          strokeDasharray: stale || ended ? "6 4" : undefined,
          stroke: data.isSelected
            ? "var(--color-primary)"
            : data.highlighted
              ? "var(--color-success)"
              : ended
                ? "var(--color-text-subtle)"
                : stale
                  ? "var(--color-warning-text)"
                  : "var(--color-border-strong)",
          strokeWidth: data.isSelected || data.highlighted ? 2.5 : 1.5,
          transition: data.reducedMotion ? undefined : "stroke 150ms, stroke-dasharray 150ms",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="pointer-events-auto absolute"
        >
          <button
            type="button"
            data-edge-id={id}
            onClick={(ev) => {
              ev.stopPropagation();
              data.onSelect(id);
            }}
            aria-label={`${label}${mixed ? `, ${mixed}` : ""}${e.closesCycle ? ", cycle" : ""}${e.crossesAccount ? ", crosses account" : ""}${limitationNotes.length ? `. ${limitationNotes.join(" ")}` : ""}`}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm",
              "bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle)",
              data.isSelected ? "border-(--color-primary) text-(--color-primary-text)" : "border-(--color-border-subtle)",
            )}
          >
            <span>{label}</span>
            {grouped ? (
              <span className="rounded-full bg-(--color-info-soft) px-1.5 text-(--color-info-text)">
                {e.members.length}
              </span>
            ) : null}
            {e.closesCycle ? <span className="text-(--color-warning-text)">cycle</span> : null}
            {e.crossesAccount ? <span className="text-(--color-info-text)">cross-account</span> : null}
          </button>
          {mixed ? <p className="mt-0.5 text-center text-[10px] text-(--color-text-muted)">{mixed}</p> : null}
          {limitationNotes.length ? (
            // The worked example's fifth point: a coverage gap is a visibility
            // change, never presented as if the relationship were removed.
            <p className="mt-0.5 max-w-[220px] text-center text-[10px] text-(--color-warning-text)" title={limitationNotes.join(" ")}>
              {limitationNotes[0]}
            </p>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const GraphEdgeView = memo(GraphEdgeImpl);

