/**
 * A small picture of an object's neighbourhood (SPEC-console-revamp.md
 * *Detail header*): the object and the few objects its already-loaded tab data
 * names. Never decorative — the caller passes only what it has read, the
 * sketch never invents a neighbour or an edge, and a caller with nothing
 * drawable renders its summary instead.
 *
 * Category colour always comes with an icon and the kind in words; every node
 * is a link; at most MAX_NODES are drawn, and what is not drawn is said.
 * Below 42 rem of available width the sketch is not drawn at all (text
 * would shrink below legibility); the summary beside it carries the same
 * facts as a list.
 */

import { useId } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

import { NODE_ICON } from "../../graph/icons";
import type { NodeCategory, NodeIcon } from "../../graph/nodeView";
import { viaLink } from "../links";
import type { GraphRef } from "@/app/api/igaGraphApi";
import { Panel } from "./Panel";

export const MAX_SKETCH_NODES = 7;

export interface SketchNode {
  id: string;
  /** The name, as the object is called. */
  label: string;
  /** The kind in words: "IAM role", "Exact reference". */
  kind: string;
  category: NodeCategory;
  icon: NodeIcon;
  /** The object's page; absent when the object has none (an unresolved role). */
  to?: string;
}

export interface SketchEdge {
  from: string;
  to: string;
  /** A relationship word from the graph's vocabulary: "runs as", "ECS agent uses", "declares". */
  label: string;
}

const NODE_W = 168;
const NODE_H = 42;
const GAP_Y = 14;
const WIDTH = 760;

const FILL: Record<NodeCategory, string> = {
  workload: "var(--color-object-workload-soft)",
  identity: "var(--color-object-identity-soft)",
  resource: "var(--color-object-resource-soft)",
  statement: "var(--color-object-statement-soft)",
  external: "var(--color-object-external-soft)",
};
const STROKE: Record<NodeCategory, string> = {
  workload: "var(--color-object-workload-accent)",
  identity: "var(--color-object-identity-accent)",
  resource: "var(--color-object-resource-accent)",
  statement: "var(--color-object-statement-accent)",
  external: "var(--color-object-external-accent)",
};
const TEXT: Record<NodeCategory, string> = {
  workload: "var(--color-object-workload-text)",
  identity: "var(--color-object-identity-text)",
  resource: "var(--color-object-resource-text)",
  statement: "var(--color-object-statement-text)",
  external: "var(--color-object-external-text)",
};

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function NeighbourhoodSketch({
  label,
  columns,
  edges,
  rootId,
  from,
  note,
  className,
}: {
  /** Accessible name: "Neighbourhood of refund-agent". */
  label: string;
  /** Left to right; the object itself is in one of them. */
  columns: SketchNode[][];
  edges: SketchEdge[];
  rootId: string;
  /** The object being viewed, so a followed link offers the way back. */
  from: { ref: GraphRef; name: string };
  /** What is not drawn, when something is not: "First 3 of the roles it may assume are drawn." */
  note?: string | null;
  className?: string;
}) {
  const marker = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cols = columns.filter((c) => c.length);
  const count = cols.reduce((n, c) => n + c.length, 0);
  // Nothing to draw beyond the object itself, or more than the cap: not drawn.
  if (count < 2 || count > MAX_SKETCH_NODES) return null;

  const tallest = Math.max(...cols.map((c) => c.length));
  const height = tallest * NODE_H + (tallest - 1) * GAP_Y + 24;
  const colX = (i: number) => (cols.length === 1 ? (WIDTH - NODE_W) / 2 : 12 + (i * (WIDTH - NODE_W - 24)) / (cols.length - 1));
  const pos = new Map<string, { x: number; y: number; node: SketchNode }>();
  cols.forEach((c, i) => {
    const colH = c.length * NODE_H + (c.length - 1) * GAP_Y;
    c.forEach((n, j) => pos.set(n.id, { x: colX(i), y: (height - colH) / 2 + j * (NODE_H + GAP_Y), node: n }));
  });

  const edgeGeometry = (e: SketchEdge) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return null;
    const forward = b.x >= a.x;
    const x1 = forward ? a.x + NODE_W : a.x;
    const x2 = forward ? b.x : b.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const y2 = b.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return { d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, mx, my: (y1 + y2) / 2 };
  };

  return (
    <div className={cn("@container", className)}>
      <div className="hidden @2xl:block">
        <Panel title="Access Graph" description="Drawn only from what this page has loaded. A line is a declared relationship, not proven access.">
        {/* Drawn at its own size, never scaled up: stretched to a wide card the
            text grew to ~2x and the names were cut off. It still shrinks to fit
            a narrow one. */}
        <svg viewBox={`0 0 ${WIDTH} ${height}`} role="group" aria-label={label} className="mx-auto block h-auto w-full" style={{ maxWidth: WIDTH }}>
          <defs>
            <marker id={`${marker}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--color-border-strong)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const g = edgeGeometry(e);
            if (!g) return null;
            return (
              <path key={`${e.from}>${e.to}>${e.label}`} aria-hidden="true" d={g.d} fill="none" stroke="var(--color-border-strong)" strokeWidth="1.25" markerEnd={`url(#${marker}-arrow)`} />
            );
          })}
          {[...pos.values()].map(({ x, y, node }) => {
            const Icon = NODE_ICON[node.icon];
            const body = (
              <>
                <title>{`${node.kind}: ${node.label}`}</title>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="6"
                  fill={FILL[node.category]}
                  stroke={STROKE[node.category]}
                  strokeWidth={node.id === rootId ? 2 : 1}
                  className="group-focus-visible:stroke-(--color-primary) group-focus-visible:stroke-[3]"
                />
                <Icon x={8} y={7} width={13} height={13} color={TEXT[node.category]} aria-hidden="true" />
                <text x={26} y={18} fontSize="10.5" fontWeight="600" fill={TEXT[node.category]}>
                  {clip(node.kind, 26)}
                </text>
                <text x={10} y={34} fontSize="12" fontWeight={node.id === rootId ? 600 : 500} fill="var(--color-text)">
                  {clip(node.label, 24)}
                </text>
              </>
            );
            return (
              <g key={node.id} transform={`translate(${x} ${y})`}>
                {node.to && node.id !== rootId ? (
                  <Link {...viaLink(node.to, from)} aria-label={`${node.kind}: ${node.label}`} className="group outline-none">
                    {body}
                  </Link>
                ) : (
                  <g role="img" aria-label={`${node.kind}: ${node.label}`}>
                    {body}
                  </g>
                )}
              </g>
            );
          })}
          {/* Labels last, so a node never covers the word that says what the line means. */}
          {edges.map((e) => {
            const g = edgeGeometry(e);
            if (!g) return null;
            return (
              <text
                key={`${e.from}>${e.to}>${e.label}:label`}
                aria-hidden="true"
                x={g.mx}
                y={g.my - 5}
                textAnchor="middle"
                fontSize="11"
                fill="var(--color-text-muted)"
                stroke="var(--color-surface-raised)"
                strokeWidth="4"
                paintOrder="stroke"
              >
                {e.label}
              </text>
            );
          })}
        </svg>
        {note ? <p className="mt-1 text-xs text-(--color-text-muted)">{note}</p> : null}
        </Panel>
      </div>
    </div>
  );
}
