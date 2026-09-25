/**
 * Layout (SPEC-iga-phase2-graph.md §2.14.15 *Graph rendering*).
 *
 * ELK computes the layout ONCE, on first load (and again only on an explicit
 * Tidy layout, or a refresh to a new revision) — never on expand/collapse,
 * because neither a full ELK re-layout nor its interactive mode preserves
 * existing positions (verified 23 Sep, cited in the spec). Expansion places
 * new nodes with our own deterministic rule, every existing node pinned.
 *
 * Columns are fixed by kind everywhere (`graphLabels.ts` `COLUMN_OF`); ELK is
 * asked to order nodes within a column (via partitioning) to minimize edge
 * crossings, and that order becomes the vertical stacking — not ELK's own
 * coordinates, which are not guaranteed to keep external principals in the
 * identity column's upper band. Runs in a Web Worker so a 150-node graph
 * (~400 ms, per the spec's verification) never blocks the main thread.
 */

import ELK from "elkjs/lib/elk-api";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

import type { GraphEdgeKind, GraphNodeKind } from "@/app/api/igaGraphApi";

import { COLUMN_OF, COLUMN_COUNT } from "./graphLabels";
import type { Position } from "./model";

export const COLUMN_WIDTH = 300;
export const ROW_HEIGHT = 96;
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 76;

let elk: InstanceType<typeof ELK> | null = null;

function client(): InstanceType<typeof ELK> {
  if (!elk) {
    elk = new ELK({
      workerUrl: new URL("elkjs/lib/elk-worker.min.js", import.meta.url).href,
    });
  }
  return elk;
}

export interface LayoutNodeInput {
  id: string;
  kind: GraphNodeKind;
  /** External principals are drawn in the identity column's upper band. */
  upperBand?: boolean;
}

export interface LayoutEdgeInput {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
}

/**
 * Full ELK layout of the initial neighbourhood: fixed columns by kind, and
 * within a column, ELK's crossing-minimized order (external principals
 * first) becomes fixed vertical spacing.
 */
export async function computeInitialLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
): Promise<Map<string, Position>> {
  if (nodes.length === 0) return new Map();

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.partitioning.activate": "true",
      "elk.spacing.nodeNode": "24",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: { "elk.partitioning.partition": String(COLUMN_OF[n.kind] ?? COLUMN_COUNT - 1) },
    })),
    edges: edges.map((e): ElkExtendedEdge => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  let result: ElkNode;
  try {
    result = await client().layout(graph);
  } catch {
    // A worker that fails to start (e.g. no Worker support) still gets a
    // usable, if less crossing-optimal, layout: fall back to server order.
    result = graph;
  }

  const elkY = new Map<string, number>();
  for (const c of result.children ?? []) elkY.set(c.id, c.y ?? 0);

  const byColumn = new Map<number, LayoutNodeInput[]>();
  for (const n of nodes) {
    const col = COLUMN_OF[n.kind] ?? COLUMN_COUNT - 1;
    const list = byColumn.get(col) ?? [];
    list.push(n);
    byColumn.set(col, list);
  }

  const positions = new Map<string, Position>();
  for (const [col, list] of byColumn) {
    const ordered = [...list].sort((a, b) => {
      if (!!a.upperBand !== !!b.upperBand) return a.upperBand ? -1 : 1;
      return (elkY.get(a.id) ?? 0) - (elkY.get(b.id) ?? 0);
    });
    ordered.forEach((n, i) => {
      positions.set(n.id, { x: col * COLUMN_WIDTH, y: i * ROW_HEIGHT });
    });
  }
  return positions;
}

/**
 * The expansion placement rule (§2.14.15, point 2–3): a new node goes in its
 * kind's column, in the first free slot below the lowest existing node
 * connected to the node that was expanded, claimed in server order. Every
 * already-placed node is left untouched.
 */
export function placeExpansionNodes(
  expandedNode: string,
  newNodeIds: { id: string; kind: GraphNodeKind }[],
  positions: Map<string, Position>,
  edgesTouching: { from: string; to: string }[],
): Map<string, Position> {
  const next = new Map(positions);
  const parentPos = next.get(expandedNode);

  let floor = parentPos ? parentPos.y : 0;
  for (const e of edgesTouching) {
    const other = e.from === expandedNode ? e.to : e.from;
    const p = next.get(other);
    if (p) floor = Math.max(floor, p.y);
  }

  const occupied = (col: number, y: number) =>
    [...next.values()].some((p) => p.x === col * COLUMN_WIDTH && Math.abs(p.y - y) < ROW_HEIGHT / 2);

  let cursor = floor + ROW_HEIGHT;
  for (const n of newNodeIds) {
    if (next.has(n.id)) continue; // already placed by an earlier expansion; never moved
    const col = COLUMN_OF[n.kind] ?? COLUMN_COUNT - 1;
    let y = cursor;
    while (occupied(col, y)) y += ROW_HEIGHT;
    next.set(n.id, { x: col * COLUMN_WIDTH, y });
    cursor = y + ROW_HEIGHT;
  }
  return next;
}

export function terminateLayoutWorker() {
  elk?.terminateWorker();
  elk = null;
}
