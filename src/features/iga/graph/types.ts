/**
 * Local view-model types for the graph canvas (SPEC-iga-phase2-graph.md
 * §2.14.11, §2.14.15). `GraphNode` / `GraphEdge` (from `igaGraphApi`) are the
 * server's truth; a `VisualNode` / `VisualEdge` is how the canvas groups and
 * draws them — grouping is visual only, and every member keeps its own claim
 * for the evidence panel and the Paths list.
 */

import type {
  EvidenceLimitation,
  GraphEdge,
  GraphEdgeKind,
  GraphFrontier,
  GraphNode,
  GraphNodeKind,
  GraphRef,
  RelState,
} from "@/app/api/igaGraphApi";

/** Identifies one frontier entry, and the expansion it produced, stably. */
export type FrontierKey = string;

export function frontierKey(f: Pick<GraphFrontier, "node" | "edge" | "direction">): FrontierKey {
  return `${f.node}|${f.edge}|${f.direction}`;
}

/** The node an expansion key was raised on — the first `|`-segment (a `GraphRef` never contains `|`). */
export function anchorOf(key: FrontierKey): GraphRef {
  return key.slice(0, key.indexOf("|")) as GraphRef;
}

/** The owner tag the initial `/graph` read stamps on every node and edge it returns. */
export const ROOT_OWNER = "root";

/**
 * Loaded relationships the view keeps out of sight until asked (§2.14.11
 * *Progressive disclosure*). Presentation only: every member keeps its own
 * identifiers and evidence, and "Show" puts each back as its own node.
 */
export interface OverflowInfo {
  /** The visual node the hidden branch hangs from. */
  parent: string;
  edgeKind: VisualEdgeKind;
  /** The hidden nodes nearest the parent, each as it would be drawn. */
  hidden: VisualNode[];
  /** Nodes reachable only through the hidden ones, hidden with them. */
  beyond: number;
  /** The parent also has relationships of this kind the server has not sent yet. */
  moreNotLoaded: boolean;
  /** What an ECS task execution role declares: supporting infrastructure, folded from the start. */
  infrastructure?: boolean;
}

/** One drawn node. `members.length > 1` for equivalent statements or workloads sharing one execution identity (§2.14.11 *Grouped edges*). */
export interface VisualNode {
  id: string;
  kind: GraphNodeKind;
  members: GraphNode[];
  /** Frontier entries outstanding on any member, for the expand control. */
  frontier: GraphFrontier[];
  /** Set on the one node standing in for a hidden branch. */
  overflow?: OverflowInfo;
}

/**
 * What a drawn line is. The server's relationship kinds, plus `declares`: the
 * Overview's summary of identity → statement → resource, drawn identity →
 * resource. It is a presentation of those claims, never a fact of its own —
 * its members are the grant and target claims it summarises.
 */
export type VisualEdgeKind = GraphEdgeKind | "declares";

/** One drawn edge. `members.length > 1` for grouped grants (and their shared target). */
export interface VisualEdge {
  id: string;
  kind: VisualEdgeKind;
  from: string;
  to: string;
  members: GraphEdge[];
  /** Solid if any member is current; dashed only if every member is stale (§2.14.11). */
  state: RelState;
  crossesAccount: boolean;
  closesCycle: boolean;
  /** A single (ungrouped) grant names its statement's policy directly (§2.14.11, review item 16). */
  targetPolicy?: string;
  /** `declares` lines only: the statements this line stands for, and their effect. */
  summary?: {
    statements: VisualNode[];
    effect: "allow" | "deny" | "mixed";
    /** NotResource exclusions on the statements behind it. */
    exclusions: string[];
    /** Limitations recorded on those statements (conditions, negation). */
    limitations: EvidenceLimitation[];
  };
}

export type GraphSelection = { kind: "node"; id: string } | { kind: "edge"; id: string };

/**
 * A frontier entry's expand control state (§2.14.11 *Controls*, §2.14.5
 * *revision moved*). `expanded` and `pending` are independent: Collapse never
 * needs a read, so it stays available while `pending` is `"paused"` — only
 * the FIRST expand, and Load more, wait for a refresh (item 9 of the review).
 */
export type PendingState = "idle" | "loading" | "failed" | "paused";
export interface FrontierControl {
  expanded: boolean;
  pending: PendingState;
}

/** A declared path through the raw (ungrouped) graph, for the Paths list and path highlighting. */
export interface RawPath {
  nodes: GraphRef[];
  edges: GraphEdge[];
}
