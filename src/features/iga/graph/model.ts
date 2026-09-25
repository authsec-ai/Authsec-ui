/**
 * The graph canvas's client-side model (SPEC-iga-phase2-graph.md §2.14.11
 * *Controls*, §5.3 *Graph*, §5.4 *Traversal*).
 *
 * The server returns nodes and edges incrementally — one root read, then one
 * response per expansion — and this merges them into one picture: every node
 * and edge is reference-counted by the reads that revealed it, so collapsing
 * one expansion removes exactly what it added and nothing a different
 * expansion still needs (§2.14.11 *Collapse*). Positions are assigned
 * separately (`layout.ts`) and stored here alongside the rest.
 */

import { onGraphSessionReset } from "../shared/revision";
import { useReducer } from "react";

import type {
  GraphDirection,
  GraphEdge,
  GraphExpansion,
  GraphFrontier,
  GraphNeighbourhood,
  GraphNode,
  GraphRef,
  GraphTruncation,
} from "@/app/api/igaGraphApi";

import { dominantRelState } from "./graphLabels";
import { placeExpansionNodes } from "./layout";
import {
  ROOT_OWNER,
  anchorOf,
  frontierKey,
  type FrontierControl,
  type FrontierKey,
  type RawPath,
  type VisualEdge,
  type VisualNode,
} from "./types";

export interface Position {
  x: number;
  y: number;
}

export interface ModelState {
  root: GraphRef | null;
  generationKey: string | null;
  nodes: Map<GraphRef, GraphNode>;
  edges: Map<GraphRef, GraphEdge>;
  nodeOwners: Map<GraphRef, Set<string>>;
  edgeOwners: Map<GraphRef, Set<string>>;
  /** The first-seen frontier entry for each key — the original count/exactness (§2.14.11). */
  frontierEntries: Map<FrontierKey, GraphFrontier>;
  cursors: Map<FrontierKey, string | null | undefined>;
  expanded: Set<FrontierKey>;
  pageCounts: Map<FrontierKey, number>;
  loading: Set<FrontierKey>;
  failed: Set<FrontierKey>;
  truncated: GraphTruncation | null;
  positions: Map<string, Position>;
  /** Set once, by the layout effect, so a second ELK run is never triggered implicitly. */
  laidOut: boolean;
  viewport?: { x: number; y: number; zoom: number };
  revealedWorkloads: Set<GraphRef>;
}

export function initialModelState(): ModelState {
  return {
    root: null,
    generationKey: null,
    nodes: new Map(),
    edges: new Map(),
    nodeOwners: new Map(),
    edgeOwners: new Map(),
    frontierEntries: new Map(),
    cursors: new Map(),
    expanded: new Set(),
    pageCounts: new Map(),
    loading: new Set(),
    failed: new Set(),
    truncated: null,
    positions: new Map(),
    laidOut: false,
    revealedWorkloads: new Set(),
  };
}

type Action =
  | { type: "reset" }
  | { type: "viewport"; viewport: { x: number; y: number; zoom: number } }
  | { type: "reveal-workloads"; refs: GraphRef[] }
  | { type: "root"; key: string; root: GraphRef; data: GraphNeighbourhood }
  | { type: "expand-start"; key: FrontierKey }
  | { type: "expand-failed"; key: FrontierKey }
  | { type: "expand-abort"; key: FrontierKey }
  | { type: "expand-success"; key: FrontierKey; data: GraphExpansion }
  | { type: "collapse"; key: string }
  | { type: "path"; owner: string; anchor: GraphRef; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: "positions"; positions: Map<string, Position> }
  | { type: "position"; id: string; position: Position }
  | { type: "laid-out" }
  | { type: "relayout" };

function withOwner<K>(map: Map<K, Set<string>>, key: K, owner: string): Map<K, Set<string>> {
  const next = new Map(map);
  const owners = new Set(next.get(key) ?? []);
  owners.add(owner);
  next.set(key, owners);
  return next;
}

function ingest(state: ModelState, owner: string, nodes: GraphNode[], edges: GraphEdge[]): ModelState {
  const nextNodes = new Map(state.nodes);
  const nextEdges = new Map(state.edges);
  let nodeOwners = state.nodeOwners;
  let edgeOwners = state.edgeOwners;
  for (const n of nodes) {
    nextNodes.set(n.ref, n);
    nodeOwners = withOwner(nodeOwners, n.ref, owner);
  }
  for (const e of edges) {
    nextEdges.set(e.claim, e);
    edgeOwners = withOwner(edgeOwners, e.claim, owner);
  }
  return { ...state, nodes: nextNodes, edges: nextEdges, nodeOwners, edgeOwners };
}

function ingestFrontier(state: ModelState, frontier: GraphFrontier[]): ModelState {
  const entries = new Map(state.frontierEntries);
  const cursors = new Map(state.cursors);
  for (const f of frontier) {
    const key = frontierKey(f);
    if (!entries.has(key)) entries.set(key, f);
    if (!cursors.has(key)) cursors.set(key, undefined);
  }
  return { ...state, frontierEntries: entries, cursors };
}

export function modelReducer(state: ModelState, action: Action): ModelState {
  switch (action.type) {
    case "viewport": return { ...state, viewport: action.viewport };
    case "reveal-workloads": return { ...state, revealedWorkloads: new Set(action.refs) };
    case "reset":
      return initialModelState();

    case "root": {
      let next = ingest(state, ROOT_OWNER, action.data.nodes, action.data.edges);
      next = ingestFrontier(next, action.data.frontier);
      return { ...next, root: action.root, generationKey: action.key, truncated: action.data.truncated };
    }

    case "expand-start": {
      const loading = new Set(state.loading);
      loading.add(action.key);
      const failed = new Set(state.failed);
      failed.delete(action.key);
      return { ...state, loading, failed };
    }

    case "expand-failed": {
      const loading = new Set(state.loading);
      loading.delete(action.key);
      const failed = new Set(state.failed);
      failed.add(action.key);
      return { ...state, loading, failed };
    }

    case "expand-abort": {
      // A response that answered a revision other than the one pinned, or a
      // stale `409`: never merged (review item 2), never shown as "Could not
      // load" (review item 3) — just clears the read in flight. `markStale`
      // (called by the caller) makes the control read "paused" next render.
      const loading = new Set(state.loading);
      loading.delete(action.key);
      return { ...state, loading };
    }

    case "expand-success": {
      let next = ingest(state, action.key, action.data.nodes, action.data.edges);
      next = ingestFrontier(next, action.data.frontier);
      const loading = new Set(next.loading);
      loading.delete(action.key);
      const failed = new Set(next.failed);
      failed.delete(action.key);
      const expanded = new Set(next.expanded);
      expanded.add(action.key);
      const pageCounts = new Map(next.pageCounts);
      pageCounts.set(action.key, (pageCounts.get(action.key) ?? 0) + 1);
      const cursors = new Map(next.cursors);
      cursors.set(action.key, action.data.next_cursor);

      // Placement runs HERE, inside the one serial reducer, over nodes/edges
      // actually visible after this ingest — never in a `.then()` racing a
      // second in-flight expansion against the same positions snapshot
      // (review item 7). The anchor is the node this expansion was raised on.
      const anchor = anchorOf(action.key);
      const visible = visibleFrom(next.nodeOwners);
      const touching = [...next.edges.values()]
        .filter((e) => (e.from === anchor || e.to === anchor) && visible.has(e.from) && visible.has(e.to))
        .map((e) => ({ from: e.from, to: e.to }));
      const newNodeIds = action.data.nodes
        .filter((n) => visible.has(n.ref))
        .map((n) => ({ id: n.ref, kind: n.kind }));
      const positions = placeExpansionNodes(anchor, newNodeIds, next.positions, touching);

      return {
        ...next,
        loading,
        failed,
        expanded,
        pageCounts,
        cursors,
        truncated: action.data.truncated ?? next.truncated,
        positions,
      };
    }

    case "collapse": {
      // Removes exactly what this key added, THEN cascades: any other
      // expansion whose own anchor node just became invisible is orphaned —
      // A→B (k1), B→C (k2), collapsing k1 must also free C, or C is left
      // floating with no path from root (review item 4). Repeats to a
      // fixpoint, since a cascade can itself orphan a further expansion.
      const nodeOwners = new Map(state.nodeOwners);
      const edgeOwners = new Map(state.edgeOwners);
      const expanded = new Set(state.expanded);
      const pageCounts = new Map(state.pageCounts);
      const cursors = new Map(state.cursors);
      const loading = new Set(state.loading);
      const failed = new Set(state.failed);

      const release = (key: string) => {
        for (const [ref, owners] of nodeOwners) {
          if (!owners.has(key)) continue;
          const next = new Set(owners);
          next.delete(key);
          nodeOwners.set(ref, next);
        }
        for (const [claim, owners] of edgeOwners) {
          if (!owners.has(key)) continue;
          const next = new Set(owners);
          next.delete(key);
          edgeOwners.set(claim, next);
        }
        expanded.delete(key);
        pageCounts.delete(key);
        cursors.delete(key);
        loading.delete(key);
        failed.delete(key);
      };

      release(action.key);
      let changed = true;
      while (changed) {
        changed = false;
        const visible = visibleFrom(nodeOwners);
        for (const key of new Set([...expanded, ...loading])) {
          if (!visible.has(anchorOf(key))) {
            release(key);
            changed = true;
          }
        }
      }

      // Free the slots a now-invisible node held (§2.14.11 *Collapse*); a
      // still-visible node's position is never touched.
      const visible = visibleFrom(nodeOwners);
      const positions = new Map(state.positions);
      for (const ref of nodeOwners.keys()) {
        if (!visible.has(ref)) positions.delete(ref);
      }

      return { ...state, nodeOwners, edgeOwners, expanded, pageCounts, cursors, loading, failed, positions };
    }

    case "path": {
      const next = ingest(state, action.owner, action.nodes, action.edges);
      const visible = visibleFrom(next.nodeOwners);
      const touching = [...next.edges.values()]
        .filter(
          (e) => (e.from === action.anchor || e.to === action.anchor) && visible.has(e.from) && visible.has(e.to),
        )
        .map((e) => ({ from: e.from, to: e.to }));
      const newNodeIds = action.nodes.filter((n) => visible.has(n.ref)).map((n) => ({ id: n.ref, kind: n.kind }));
      const positions = placeExpansionNodes(action.anchor, newNodeIds, next.positions, touching);
      return { ...next, positions };
    }

    case "positions": {
      const positions = new Map(state.positions);
      for (const [id, p] of action.positions) positions.set(id, p);
      return { ...state, positions };
    }

    case "position": {
      const positions = new Map(state.positions);
      positions.set(action.id, action.position);
      return { ...state, positions };
    }

    case "laid-out":
      return { ...state, laidOut: true };

    case "relayout":
      // Tidy layout / a refresh to a new revision: ELK runs again over
      // everything currently visible (§2.14.15). Existing positions are kept
      // until the new ones land, so the canvas never blanks mid-recompute.
      return { ...state, laidOut: false };

    default:
      return state;
  }
}

// Same-session Back and tab detours restore the already loaded investigation.
// Nothing is written to persistent storage, and session changes erase it.
const investigations = new Map<string, ModelState>();
onGraphSessionReset(() => investigations.clear());
export function rememberGraphModel(key: string, state: ModelState) {
  investigations.delete(key);
  investigations.set(key, { ...state, loading: new Set(), failed: new Set([...state.failed, ...state.loading]) });
  while (investigations.size > 20) investigations.delete(investigations.keys().next().value!);
}
export function useGraphModel(key: string) {
  return useReducer(modelReducer, key, (k) => investigations.get(k) ?? initialModelState());
}

/**
 * A frontier entry's control state (review item 9). `expanded` is
 * independent of `pending`: Collapse never issues a read, so it is offered
 * regardless of `paused`. Only a NEW read — the first expand, Retry, or Load
 * more — waits for a refresh while the investigation is reading a
 * superseded revision (§2.14.5).
 */
export function expandStateOf(state: ModelState, key: FrontierKey, paused: boolean): FrontierControl {
  const expanded = state.expanded.has(key);
  if (state.loading.has(key)) return { expanded, pending: "loading" };
  if (paused) return { expanded, pending: "paused" };
  if (state.failed.has(key)) return { expanded, pending: "failed" };
  return { expanded, pending: "idle" };
}

export function canLoadMoreOf(state: ModelState, key: FrontierKey): boolean {
  return typeof state.cursors.get(key) === "string";
}

/* --------------------------------- visible -------------------------------- */

function visibleFrom(nodeOwners: Map<GraphRef, Set<string>>): Set<GraphRef> {
  const out = new Set<GraphRef>();
  for (const [ref, owners] of nodeOwners) if (owners.size > 0) out.add(ref);
  return out;
}

export function visibleNodeRefs(state: ModelState): Set<GraphRef> {
  return visibleFrom(state.nodeOwners);
}

function visibleEdgeList(state: ModelState, visible: Set<GraphRef>): GraphEdge[] {
  const out: GraphEdge[] = [];
  for (const [claim, owners] of state.edgeOwners) {
    if (owners.size === 0) continue;
    const e = state.edges.get(claim);
    if (e && visible.has(e.from) && visible.has(e.to)) out.push(e);
  }
  return out;
}

/* -------------------------------- grouping -------------------------------- */

/**
 * Groups statement nodes that share `group_key` and the same granting
 * identity into one visual node, and their grant/target edges into one line
 * each (§2.14.11 *Grouped edges*). The grouping is visual only — every
 * member statement and grant claim is kept, for the evidence panel.
 */
export function buildVisual(state: ModelState, ungrouped: Set<GraphRef> = new Set()): { nodes: VisualNode[]; edges: VisualEdge[] } {
  const visible = visibleNodeRefs(state);
  const edges = visibleEdgeList(state, visible);

  // Every identity that grants a statement, not just the first one found —
  // grouping keys on the full sorted set (review item 8), so the bucket a
  // statement lands in never depends on Map iteration order.
  const sourcesOfStatement = new Map<GraphRef, Set<GraphRef>>();
  for (const e of edges) {
    if (e.kind !== "grant") continue;
    const set = sourcesOfStatement.get(e.to) ?? new Set<GraphRef>();
    set.add(e.from);
    sourcesOfStatement.set(e.to, set);
  }

  const membersOfBucket = new Map<string, GraphRef[]>();
  for (const ref of visible) {
    const n = state.nodes.get(ref);
    if (!n || n.kind !== "statement" || !n.group_key) continue;
    const sources = [...(sourcesOfStatement.get(ref) ?? [])].sort();
    if (sources.length === 0) continue;
    const bucketKey = `${sources.join(",")}::${n.group_key}`;
    const list = membersOfBucket.get(bucketKey) ?? [];
    list.push(ref);
    membersOfBucket.set(bucketKey, list);
  }

  // Fold only leaf workloads sharing the same execution identity. This is a
  // visual convenience, never a logical-agent correlation. Root, requested
  // objects and manually revealed members remain individually inspectable.
  for (const ref of visible) {
    const n = state.nodes.get(ref);
    if (n?.kind !== "workload" || ref === state.root || ungrouped.has(ref)) continue;
    const touching = edges.filter((e) => e.from === ref || e.to === ref);
    if (touching.length !== 1 || touching[0].kind !== "executes_as" || touching[0].from !== ref) continue;
    const bucketKey = `workloads:${touching[0].to}:${n.account?.id ?? "unknown"}`;
    const list = membersOfBucket.get(bucketKey) ?? [];
    list.push(ref);
    membersOfBucket.set(bucketKey, list);
  }

  // Maps preserve ingestion order. Anchor a group to its first loaded member,
  // so a later page containing an alphabetically earlier ref cannot move an
  // already drawn group. Every member retains its own raw position.
  const idOf = new Map<GraphRef, string>();
  for (const members of membersOfBucket.values()) {
    if (members.length < 2) continue;
    const anchor = members[0];
    for (const m of members) idOf.set(m, anchor);
  }
  const visualId = (ref: GraphRef): string => idOf.get(ref) ?? ref;

  const nodesById = new Map<string, VisualNode>();
  for (const ref of visible) {
    const n = state.nodes.get(ref);
    if (!n) continue;
    const id = visualId(ref);
    let vn = nodesById.get(id);
    if (!vn) {
      vn = { id, kind: n.kind, members: [], frontier: [] };
      nodesById.set(id, vn);
    }
    vn.members.push(n);
  }
  // Attach frontier entries: any entry whose `.node` is a member of this visual node.
  const visualIdOfRef = new Map<GraphRef, string>();
  for (const vn of nodesById.values()) for (const m of vn.members) visualIdOfRef.set(m.ref, vn.id);
  for (const f of state.frontierEntries.values()) {
    const vid = visualIdOfRef.get(f.node);
    if (!vid) continue;
    nodesById.get(vid)?.frontier.push(f);
  }

  const edgesById = new Map<string, VisualEdge>();
  for (const e of edges) {
    const from = visualId(e.from);
    const to = visualId(e.to);
    const id = `${from}=>${to}:${e.kind}`;
    let ve = edgesById.get(id);
    if (!ve) {
      ve = { id, kind: e.kind, from, to, members: [], state: "current", crossesAccount: false, closesCycle: false };
      if (e.kind === "grant") ve.targetPolicy = state.nodes.get(e.to)?.policy;
      edgesById.set(id, ve);
    }
    ve.members.push(e);
  }
  for (const ve of edgesById.values()) {
    ve.state = dominantRelState(ve.members.map((m) => m.state ?? "current"));
    ve.crossesAccount = ve.members.some((m) => m.crosses_account);
    ve.closesCycle = ve.members.some((m) => m.closes_cycle);
    // A single grant names its statement's policy directly; a grouped one
    // names the count instead (§2.14.11), so the per-member field is dropped
    // once there is more than one — the canvas reads it off `members[0]`.
    if (ve.members.length > 1) delete ve.targetPolicy;
  }

  return { nodes: [...nodesById.values()], edges: [...edgesById.values()] };
}

/**
 * Positions are computed per RAW node ref (`layout.ts` never needs to know
 * about grouping). A grouped statement node is drawn at the position of
 * whichever member sits highest (lowest `y`) — the group's anchor.
 */
export function resolveVisualPositions(nodes: VisualNode[], raw: Map<string, Position>): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const v of nodes) {
    const direct = raw.get(v.id);
    if (direct) {
      out.set(v.id, direct);
      continue;
    }
    let best: Position | undefined;
    for (const m of v.members) {
      const p = raw.get(m.ref);
      if (p && (!best || p.y < best.y)) best = p;
    }
    if (best) out.set(v.id, best);
  }
  return out;
}

/* --------------------------------- paths ---------------------------------- */

const MAX_PATHS = 200; // matches the server's hard path budget (§5.4)
const MAX_DEPTH = 12;

export interface RawPathsResult {
  paths: RawPath[];
  /** `MAX_PATHS` bound the walk before every visible edge was covered (review item 5). */
  boundByMax: boolean;
}

/** Per-node frontier entries, for rendering "may assume more roles — expand" etc. in the Paths list. */
export function frontierByNode(state: ModelState): Map<GraphRef, GraphFrontier[]> {
  const out = new Map<GraphRef, GraphFrontier[]>();
  for (const f of state.frontierEntries.values()) {
    const list = out.get(f.node) ?? [];
    list.push(f);
    out.set(f.node, list);
  }
  return out;
}

/**
 * Every declared path from `root`, over the RAW (ungrouped) graph — the Paths
 * list never groups statements, unlike the canvas (§2.14.11 *The path
 * list*). Walks in the traversal `direction` (a resource root reads reverse,
 * "what reaches this"): forward follows `e.from → e.to`, reverse follows
 * `e.to → e.from`. Stops at an edge back to a node already on THIS path,
 * marking it `cycle`, rather than either looping or dropping the edge — a
 * `closes_cycle` edge is drawn, once, as the path's last step (review item
 * 5). Every visible edge not reached from `root` this way — a second
 * workload sharing an identity, a reverse expansion's own edges — still gets
 * its own one-step item, so the list is the accessible EQUIVALENT of the
 * canvas, not a subset of it: nothing on screen is missing from it.
 */
export function enumerateRawPaths(state: ModelState, root: GraphRef, direction: GraphDirection): RawPathsResult {
  const visible = visibleNodeRefs(state);
  const allEdges = visibleEdgeList(state, visible);
  if (!visible.has(root)) return { paths: [], boundByMax: false };

  const bucketOf = (e: GraphEdge) => (direction === "forward" ? e.from : e.to);
  const targetOf = (e: GraphEdge) => (direction === "forward" ? e.to : e.from);

  const outByNode = new Map<GraphRef, GraphEdge[]>();
  for (const e of allEdges) {
    const list = outByNode.get(bucketOf(e)) ?? [];
    list.push(e);
    outByNode.set(bucketOf(e), list);
  }
  for (const list of outByNode.values()) list.sort((a, b) => a.claim.localeCompare(b.claim));

  const paths: RawPath[] = [];
  const usedClaims = new Set<GraphRef>();
  const stack: GraphRef[] = [root];
  const edgeStack: GraphEdge[] = [];
  let boundByMax = false;

  function record() {
    paths.push({ nodes: [...stack], edges: [...edgeStack] });
    for (const e of edgeStack) usedClaims.add(e.claim);
  }

  function visit(node: GraphRef, visitedOnPath: Set<GraphRef>) {
    if (paths.length >= MAX_PATHS) {
      boundByMax = true;
      return;
    }
    const out = outByNode.get(node) ?? [];
    if (out.length === 0 || stack.length > MAX_DEPTH) {
      record();
      return;
    }
    for (const e of out) {
      if (paths.length >= MAX_PATHS) {
        boundByMax = true;
        return;
      }
      const target = targetOf(e);
      // Trust the server's flag, but never loop even if it were somehow
      // missing: a target already on this path is a cycle either way.
      const isCycle = e.closes_cycle === true || visitedOnPath.has(target);
      stack.push(target);
      edgeStack.push(e);
      if (isCycle) {
        record();
      } else {
        const nextVisited = new Set(visitedOnPath);
        nextVisited.add(target);
        visit(target, nextVisited);
      }
      stack.pop();
      edgeStack.pop();
    }
  }

  visit(root, new Set([root]));

  // Every visible edge the walk above didn't already cover becomes its own
  // one-step item — e.g. a second workload's `executes_as` into an identity
  // already reached, which forward DFS from a single root never visits
  // (nothing points to a workload).
  for (const e of allEdges) {
    if (usedClaims.has(e.claim)) continue;
    paths.push({ nodes: [e.from, e.to], edges: [e] });
  }

  const covered = new Set(paths.flatMap((path) => path.nodes));
  for (const ref of visible) if (!covered.has(ref)) paths.push({ nodes: [ref], edges: [] });
  return { paths, boundByMax };
}

/** Bound the drawing, retaining the root and prioritising requested paths.
 * The raw model remains intact so collapsing/focusing never discards evidence.
 */
export function boundVisual(visual: ReturnType<typeof buildVisual>, root: GraphRef, preferred?: Set<GraphRef>) {
  const rootId = visual.nodes.find((n) => n.members.some((m) => m.ref === root))?.id;
  const priority = new Set(visual.nodes.filter((n) => n.members.some((m) => preferred?.has(m.ref))).map((n) => n.id));
  const queue = rootId ? [rootId] : [];
  const seen = new Set<string>();
  const selected = new Set<string>();
  while (queue.length && selected.size < 150) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id); selected.add(id);
    const neighbours = visual.edges.flatMap((e) => e.from === id ? [e.to] : e.to === id ? [e.from] : []);
    neighbours.sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)));
    queue.push(...neighbours.filter((n) => !seen.has(n)));
    queue.sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)));
  }
  // Unresolved/disconnected objects are still evidence; display remaining
  // nodes in server order, but never beyond the stated limit.
  for (const n of visual.nodes) { if (selected.size >= 150) break; selected.add(n.id); }
  const nodes = visual.nodes.filter((n) => selected.has(n.id));
  const candidates = visual.edges.filter((e) => selected.has(e.from) && selected.has(e.to));
  candidates.sort((a, b) => Number(priority.has(b.from) && priority.has(b.to)) - Number(priority.has(a.from) && priority.has(a.to)));
  const edges = candidates.slice(0, 300);
  return { nodes, edges, limited: nodes.length < visual.nodes.length || edges.length < visual.edges.length };
}

/** Paths uses precisely the raw members represented by the bounded drawing. */
export function displayedModel(state: ModelState, visual: ReturnType<typeof boundVisual>): ModelState {
  const refs = new Set(visual.nodes.flatMap((n) => n.members.map((m) => m.ref)));
  const claims = new Set(visual.edges.flatMap((e) => e.members.map((m) => m.claim)));
  return { ...state,
    nodeOwners: new Map([...state.nodeOwners].filter(([r]) => refs.has(r))),
    edgeOwners: new Map([...state.edgeOwners].filter(([r]) => claims.has(r))),
  };
}
