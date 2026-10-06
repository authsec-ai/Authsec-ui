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

/** Horizontal room between columns: an arrowhead and an edge's label pill fit here, with air either side. */
export const LAYER_GAP = 180;
/** Vertical room between cards in one column. */
export const NODE_GAP = 40;

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
  /**
   * The node's column: 0 workloads and outside principals, 1 identities,
   * 2 policy statements, 3 resources. Every node of a column is laid out left
   * of every node of the next, so a Detailed view's statements sit between
   * identities and resources instead of on top of them (G-03).
   */
  column?: number;
}

/** The fixed left-to-right column for a node kind (Access Graph spec, point 1). */
export function columnOfKind(kind: string): number {
  switch (kind) {
    case "workload":
    case "external_principal":
      return 0;
    case "iam_role":
    case "iam_user":
    case "iam_group":
    case "k8s_service_account":
    case "k8s_user":
    case "k8s_group":
      return 1;
    case "statement":
      return 2;
    default:
      return 3;
  }
}

export interface LayoutEdgeInput {
  id: string;
  from: string;
  to: string;
}

/** One node's ELK options: its column when columns are in use, else its first/last pin. */
function nodeOptions(n: LayoutNodeInput, columns: boolean): Record<string, string> | undefined {
  if (columns && n.column !== undefined) return { "elk.partitioning.partition": String(n.column) };
  if (n.layer) return { "elk.layered.layering.layerConstraint": n.layer === "first" ? "FIRST" : "LAST" };
  return undefined;
}

/** Full ELK layout of the drawn graph, at each node's real size. */
export async function computeLayout(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[]): Promise<Map<string, Position>> {
  if (nodes.length === 0) return new Map();
  const ids = new Set(nodes.map((n) => n.id));
  const columns = nodes.some((n) => n.column !== undefined);

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
      // Off when columns are in use: each disconnected piece would otherwise be
      // given its own columns and drawn above the main graph, out of line.
      "elk.separateConnectedComponents": columns ? "false" : "true",
      "elk.layered.compaction.connectedComponents": "true",
      ...(columns ? { "elk.partitioning.activate": "true" } : {}),
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.size.width,
      height: n.size.height,
      // Columns, when given, decide the order; a first/last pin would fight them.
      layoutOptions: nodeOptions(n, columns),
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
  if (nodes.every((n) => n.column !== undefined)) {
    // Columns known: one per column, stacked, never overlapping.
    const out = new Map<string, Position>();
    const widest = Math.max(...nodes.map((n) => n.size.width));
    const columnY = new Map<number, number>();
    // Only the columns in use, side by side: Summary has no statement column,
    // and leaving its slot empty doubled the gap before the resources.
    const used = [...new Set(nodes.map((n) => n.column!))].sort((a, b) => a - b);
    for (const n of nodes) {
      const c = used.indexOf(n.column!);
      const y = columnY.get(c) ?? 0;
      out.set(n.id, { x: c * (widest + LAYER_GAP), y });
      columnY.set(c, y + n.size.height + NODE_GAP);
    }
    return out;
  }
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
  /**
   * The node's fixed column (`columnOfKind`), when the graph uses columns. A
   * new node then goes to the x its column already has — an expanded role's
   * statements land in the statement column, its resources in the resource
   * column — instead of one layer beside whatever revealed it.
   */
  columnOf?: (id: string) => number | undefined,
): Map<string, Position> {
  const placed = new Map<string, Rect>();
  const missing: { id: string; size: Size }[] = [];
  for (const n of drawn) {
    const p = positions.get(n.id);
    if (p) placed.set(n.id, { x: p.x, y: p.y, w: n.size.width, h: n.size.height });
    else missing.push(n);
  }
  if (missing.length === 0) return new Map();

  // Where each column already stands: the leftmost card placed in it.
  const columnX = new Map<number, number>();
  if (columnOf) {
    for (const [id, r] of placed) {
      const c = columnOf(id);
      if (c !== undefined && (!columnX.has(c) || r.x < columnX.get(c)!)) columnX.set(c, r.x);
    }
  }

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
      const col = columnOf?.(n.id);
      const x = col !== undefined && columnX.has(col)
        ? columnX.get(col)!
        : anchorEdge.to === n.id ? a.x + a.w + LAYER_GAP : a.x - n.size.width - LAYER_GAP;
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
      const placedCol = columnOf?.(n.id);
      if (placedCol !== undefined && !columnX.has(placedCol)) columnX.set(placedCol, r.x);
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
