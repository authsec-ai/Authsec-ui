/**
 * The one custom edge (SPEC-iga-phase2-graph.md §2.14.15 *Components*).
 *
 * A subtle directed connector by default. Its words — the relationship verb
 * from `EDGE_LABEL`, never "can access" — appear when the edge is selected,
 * hovered, keyboard-focused or on a highlighted path, so a dense graph is
 * not buried under repeated labels. What must stay visible stays visible as
 * a compact marker at the midpoint: several independent grants (×N), a
 * condition or other constraint that was recorded and not evaluated (!), a
 * cycle (↻), a crossing into another account (⇄); stale and ended are the
 * line's own dash. Every explanation is in the inspector.
 *
 * Every edge is selectable: the wide invisible stroke takes the pointer, and
 * the midpoint button — a small dot when there is nothing to mark — is the
 * keyboard's target and carries the full description as its name.
 */

import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { limitationText } from "../shared/labels";
import { edgeVerb, independentCount, markedLimitations, mixedStateText } from "./graphLabels";
import type { VisualEdge } from "./types";

export interface GraphEdgeData extends Record<string, unknown> {
  visual: VisualEdge;
  isSelected: boolean;
  /** On a declared path the customer asked about (§2.14.11 *View in graph*). */
  highlighted: boolean;
  hovered: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  /** Offset, in pixels, from a sibling line between the same two cards. */
  spread: number;
}

export type RFGraphEdge = Edge<GraphEdgeData, "graphEdge">;

function GraphEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<RFGraphEdge>) {
  const [focused, setFocused] = useState(false);
  if (!data) return null;
  const { visual: e } = data;
  const grants = independentCount(e);
  // Sibling lines leave and enter their cards side by side.
  const across = sourcePosition === Position.Left || sourcePosition === Position.Right;
  const dx = across ? 0 : data.spread;
  const dy = across ? data.spread : 0;
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sourceX + dx,
    sourceY: sourceY + dy,
    sourcePosition,
    targetX: targetX + dx,
    targetY: targetY + dy,
    targetPosition,
    curvature: 0.3,
  });

  const stale = e.state === "stale";
  const ended = e.state === "ended";
  const mixed = mixedStateText(e.members.map((m) => m.state ?? "current"));
  const marked = markedLimitations(e);
  const showWords = data.isSelected || data.hovered || data.highlighted || focused;
  const deny = e.summary?.effect === "deny";
  const hasMarks = grants > 1 || marked.length > 0 || e.closesCycle || e.crossesAccount;

  const stroke = data.isSelected
    ? "var(--color-primary)"
    : data.highlighted
      ? "var(--color-text)"
      : ended
        ? "var(--color-text-subtle)"
        : stale
          ? "var(--color-warning-text)"
          : data.hovered
            ? "var(--color-text-muted)"
            : "var(--color-border-strong)";

  const description = [
    edgeVerb(e),
    grants > 1 ? (e.kind === "grant" ? `${grants} independent grants` : e.kind === "declares" ? `${grants} statements` : `${grants} relationships`) : null,
    e.state !== "current" ? e.state : null,
    mixed,
    e.closesCycle ? "closes a cycle" : null,
    e.crossesAccount ? "crosses into another account" : null,
    ...marked.map(limitationText),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          // Stale and ended by dash; a Deny line by a long dash-dot, and its
          // label says "denies" — never the same line as an Allow.
          strokeDasharray: stale ? "6 4" : ended ? "2 4" : deny ? "10 3 2 3" : undefined,
          stroke,
          strokeWidth: data.isSelected || data.highlighted ? 2.25 : 1.25,
          transition: data.reducedMotion ? undefined : "stroke 150ms",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="nodrag nopan pointer-events-auto absolute"
        >
          <button
            type="button"
            data-edge-id={id}
            onClick={(ev) => {
              ev.stopPropagation();
              data.onSelect(id);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label={description}
            aria-pressed={data.isSelected}
            title={description}
            className={cn(
              "group flex items-center gap-1 rounded-full text-[11px] font-medium outline-none",
              "focus-visible:ring-2 focus-visible:ring-(--color-primary)",
              showWords || hasMarks
                ? "border bg-(--color-surface-raised) px-1.5 py-px shadow-(--shadow-xs)"
                : "size-2.5 border border-(--color-border-strong) bg-(--color-surface-raised) hover:size-3 focus-visible:size-3",
              data.isSelected ? "border-(--color-primary) text-(--color-primary-text)" : "border-(--color-border-subtle) text-(--color-text-muted)",
            )}
          >
            {showWords ? <span className="whitespace-nowrap">{edgeVerb(e)}</span> : null}
            {grants > 1 ? <span className="tabular-nums">×{grants}</span> : null}
            {marked.length ? <span className="text-(--color-warning-text)" aria-hidden="true">!</span> : null}
            {e.closesCycle ? <span aria-hidden="true">↻</span> : null}
            {e.crossesAccount ? <span className="text-(--color-info-text)" aria-hidden="true">⇄</span> : null}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const GraphEdgeView = memo(GraphEdgeImpl);
