/**
 * Layout (SPEC-iga-phase2-graph.md §2.14.15 *Graph rendering*).
 *
 * Sizing contract: every node is laid out at the exact size its card is
 * drawn at (`nodeView.ts` `nodeSize`), and ELK's own coordinates are used —
 * never ELK's order re-stacked onto a fixed grid, which is what let a card
 * taller than the grid row overlap the next one.
 *
 * ELK (layered, left to right) runs ONLY on the first view of a graph and on
 * an explicit Arrange. Nodes that appear later — an expansion, a path, a
 * branch shown — are placed by `placeNewNodes` beside the node that revealed
 * them, in the first free space, and every node already on the canvas stays
 * where it is. Neither a full ELK re-layout nor its interactive mode keeps
 * existing positions (verified 23 Sep, cited in the spec).
 *
 * Kinds stay recognisable by flow, not by fixed column: workloads start the
 * line, resources end it, and a chain of role assumptions gets one layer per
 * hop instead of being stacked into one identity column.
 *
 * Runs in a Web Worker so a 150-node graph never blocks the main thread.
 */

import ELK from "elkjs/lib/elk-api";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Horizontal room between layers: an arrowhead and a selected edge's label fit here. */
export const LAYER_GAP = 120;
/** Vertical room between cards in one layer. */
export const NODE_GAP = 28;

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
  size: Size;
  /** Pin to the first layer (a workload the graph starts at) or the last (a resource). */
  layer?: "first" | "last";
}

export interface LayoutEdgeInput {
  id: string;
  from: string;
  to: string;
}

/** Full ELK layout of the drawn graph, at each node's real size. */
export async function computeLayout(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Promise<Map<string, Position>> {
  if (nodes.length === 0) return new Map();
  const ids = new Set(nodes.map((n) => n.id));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(NODE_GAP),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(LAYER_GAP),
      "elk.spacing.edgeNode": "24",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      // Disconnected pieces (an unresolved principal, say) stack below the
      // main graph instead of beside it.
      "elk.separateConnectedComponents": "true",
      "elk.layered.compaction.connectedComponents": "true",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.size.width,
      height: n.size.height,
      layoutOptions: n.layer
        ? { "elk.layered.layering.layerConstraint": n.layer === "first" ? "FIRST" : "LAST" }
        : undefined,
    })),
    edges: edges
      .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
      .map((e): ElkExtendedEdge => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  try {
    const result = await client().layout(graph);
    const out = new Map<string, Position>();
    for (const c of result.children ?? []) out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    return out;
  } catch {
    // No worker (or ELK failed): a plain breadth-first layering, still at
    // real sizes and still without overlaps.
    return fallbackLayout(nodes, edges);
  }
}

function fallbackLayout(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Map<string, Position> {
  const depth = new Map<string, number>();
  const incoming = new Set(edges.map((e) => e.to));
  const queue = nodes.filter((n) => n.layer === "first" || !incoming.has(n.id)).map((n) => n.id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.from !== id || depth.has(e.to)) continue;
      depth.set(e.to, (depth.get(id) ?? 0) + 1);
      queue.push(e.to);
    }
  }
  const out = new Map<string, Position>();
  const columnY = new Map<number, number>();
  const widest = Math.max(...nodes.map((n) => n.size.width));
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const y = columnY.get(d) ?? 0;
    out.set(n.id, { x: d * (widest + LAYER_GAP), y });
    columnY.set(d, y + n.size.height + NODE_GAP);
  }
  return out;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w + NODE_GAP / 2 && b.x < a.x + a.w + NODE_GAP / 2 && a.y < b.y + b.h + NODE_GAP / 2 && b.y < a.y + a.h + NODE_GAP / 2;
}

/**
 * Places nodes that are not on the canvas yet, leaving every placed node
 * where it is (§2.14.15, points 2–3).
 *
 * A new node goes one layer beyond the placed neighbour that revealed it —
 * right of it for a relationship pointing away from it, left for one
 * pointing at it — as close to that neighbour's height as free space
 * allows, searching down and up in small steps. Siblings are claimed in
 * server order, so a later page never moves an earlier one. A node with no
 * placed neighbour goes below everything.
 *
 * `positions` may hold positions for nodes not drawn right now (a collapsed
 * branch); only `drawn` ones count as obstacles, and a remembered position is
 * reused only when it is still free.
 */
export function placeNewNodes(
  drawn: { id: string; size: Size }[],
  edges: { from: string; to: string }[],
  positions: Map<string, Position>,
): Map<string, Position> {
  const placed = new Map<string, Rect>();
  const missing: { id: string; size: Size }[] = [];
  for (const n of drawn) {
    const p = positions.get(n.id);
    if (p) placed.set(n.id, { x: p.x, y: p.y, w: n.size.width, h: n.size.height });
    else missing.push(n);
  }
  if (missing.length === 0) return new Map();

  // Re-check remembered positions of nodes that reappeared: keep only the
  // ones nothing else has taken since.
  const out = new Map<string, Position>();
  const free = (r: Rect, self?: string) => {
    for (const [id, o] of placed) if (id !== self && overlaps(r, o)) return false;
    return true;
  };

  let pending = missing;
  // Neighbours become placeable as their anchors are placed; loop until no
  // progress, then drop the rest below everything.
  for (let guard = 0; pending.length && guard < 50; guard++) {
    const next: typeof pending = [];
    for (const n of pending) {
      const anchorEdge = edges.find((e) => (e.to === n.id && placed.has(e.from)) || (e.from === n.id && placed.has(e.to)));
      if (!anchorEdge) {
        next.push(n);
        continue;
      }
      const anchorId = anchorEdge.to === n.id ? anchorEdge.from : anchorEdge.to;
      const a = placed.get(anchorId)!;
      const x = anchorEdge.to === n.id ? a.x + a.w + LAYER_GAP : a.x - n.size.width - LAYER_GAP;
      const rect = { x, y: a.y, w: n.size.width, h: n.size.height };
      const step = 12;
      let found: Rect | null = null;
      for (let k = 0; k < 400 && !found; k++) {
        const down = { ...rect, y: a.y + k * step };
        if (free(down)) found = down;
        else if (k > 0) {
          const up = { ...rect, y: a.y - k * step };
          if (free(up)) found = up;
        }
      }
      // No free space near the anchor: below everything drawn, which is free.
      const r = found ?? { ...rect, y: Math.max(...[...placed.values()].map((o) => o.y + o.h)) + NODE_GAP };
      placed.set(n.id, r);
      out.set(n.id, { x: r.x, y: r.y });
    }
    if (next.length === pending.length) break;
    pending = next;
  }

  if (pending.length) {
    let bottom = Math.max(0, ...[...placed.values()].map((r) => r.y + r.h)) + NODE_GAP * 2;
    const left = Math.min(0, ...[...placed.values()].map((r) => r.x));
    for (const n of pending) {
      placed.set(n.id, { x: left, y: bottom, w: n.size.width, h: n.size.height });
      out.set(n.id, { x: left, y: bottom });
      bottom += n.size.height + NODE_GAP;
    }
  }
  return out;
}

/** Two placed cards would overlap (with the usual gap). */
export function rectsOverlap(p: Position, s: Size, q: Position, t: Size): boolean {
  return overlaps({ x: p.x, y: p.y, w: s.width, h: s.height }, { x: q.x, y: q.y, w: t.width, h: t.height });
}

export function terminateLayoutWorker() {
  elk?.terminateWorker();
  elk = null;
}
