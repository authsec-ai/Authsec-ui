/**
 * The React Flow canvas (SPEC-iga-phase2-graph.md §2.14.15). Positions and
 * sizes are owned by the caller (`layout.ts`, `nodeView.ts`); this draws
 * them and turns pointer and keyboard interaction into callbacks.
 *
 * Viewport rules:
 * - A graph seen for the first time, or just arranged, opens on its starting
 *   object at a readable scale (`revealStart`): the whole graph when it fits
 *   legibly, otherwise the start object near the left edge.
 * - A graph seen before reopens where the customer left it (`viewport`).
 *   Nothing refits it afterwards — not an expansion, not a selection, not
 *   the inspector opening. Fit graph is the customer's to press.
 * - When the canvas narrows (the inspector opens), the selected item is kept
 *   in view by panning, never by zooming out.
 * - When no loaded node is in view, the canvas says so and offers the way
 *   back, instead of looking empty.
 * - React Flow's container is `overflow: hidden`, and a browser still
 *   scrolls such a box to reveal a focused descendant — which slid the whole
 *   drawing out of the pane when focus moved to a card or label near its
 *   edge. The container's scroll offset is pinned to zero.
 *
 * Pointer: dragging a card moves that card (its lines follow); dragging the
 * background pans; a click selects; a drag never selects. A moved card's
 * position is handed to the caller on release (`onMoveNode`) and becomes
 * the customer's — nothing about the graph's facts changes.
 *
 * Keyboard (§2.14.14): Tab follows React Flow's node order; Enter, Shift+Enter
 * and +/- are handled on the card (`nodes.tsx`); arrow keys move along
 * edges (left/right) or to the nearest card above or below; Escape clears.
 * Moving cards is never needed to reach anything.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Background,
  Controls,
  MarkerType,
  Position as Side,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { GraphFrontier, GraphRef } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { GraphEdgeView, type GraphEdgeData, type RFGraphEdge } from "./edges";
import { GraphNodeView, type FrontierControl, type GraphNodeData, type RFGraphNode } from "./nodes";
import type { Position, Size } from "./layout";
import type { NodeDescription } from "./nodeView";
import type { GraphSelection, VisualEdge, VisualNode } from "./types";

const nodeTypes = {
  workload: GraphNodeView,
  iam_role: GraphNodeView,
  iam_user: GraphNodeView,
  iam_group: GraphNodeView,
  external_principal: GraphNodeView,
  statement: GraphNodeView,
  exact: GraphNodeView,
  selector: GraphNodeView,
  external: GraphNodeView,
};

const edgeTypes = { graphEdge: GraphEdgeView };

/** Below this, a fitted graph is too small to read; open on the start object instead. */
const READABLE_ZOOM = 0.65;
const START_ZOOM = 0.9;

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** What the toolbar can ask the canvas to do. */
export interface CanvasApi {
  fitGraph: () => void;
  revealStart: () => void;
  /** Pan (not zoom) until this drawn node or edge is in view. */
  bringIntoView: (sel: GraphSelection) => void;
}

export interface GraphCanvasProps {
  visualNodes: VisualNode[];
  visualEdges: VisualEdge[];
  descriptions: Map<string, NodeDescription>;
  sizes: Map<string, Size>;
  positions: Map<string, Position>;
  rootId: string | null;
  selection: GraphSelection | null;
  highlightedNodeIds?: Set<string>;
  highlightedEdgeIds?: Set<string>;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onOpenNode: (ref: GraphRef) => void;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
  onClearSelection: () => void;
  /** A card was dragged to `position` (released). */
  onMoveNode: (id: string, position: Position) => void;
  /** Width covered by the selection card at the right edge: kept clear when bringing something into view. */
  rightInset?: number;
  /** Bumped when the start object should be revealed: first layout, Arrange. */
  revealToken: number;
  /** Where the customer left this investigation, if they have been here before. */
  viewport?: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  onApi: (api: CanvasApi | null) => void;
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({
  visualNodes,
  visualEdges,
  descriptions,
  sizes,
  positions,
  rootId,
  selection,
  highlightedNodeIds,
  highlightedEdgeIds,
  onSelectNode,
  onSelectEdge,
  onOpenNode,
  onExpand,
  onLoadMore,
  onCollapse,
  onRefresh,
  stateOf,
  canLoadMore,
  onClearSelection,
  onMoveNode,
  rightInset = 0,
  revealToken,
  viewport,
  onViewportChange,
  onApi,
}: GraphCanvasProps) {
  const reducedMotion = reducedMotionPreferred();
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const duration = reducedMotion ? 0 : 200;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();
  const scopeClass = `iga-graph-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  // Where a card is while it is being dragged; committed on release.
  const [dragging, setDragging] = useState<Map<string, Position>>(new Map());
  // The click that ends a drag is not a selection.
  const lastDragEnd = useRef<{ id: string; at: number } | null>(null);
  const [lost, setLost] = useState(false);

  const rfNodes = useMemo<RFGraphNode[]>(
    () =>
      visualNodes
        .filter((v) => positions.has(v.id) && descriptions.has(v.id))
        .sort((a, b) => positions.get(a.id)!.x - positions.get(b.id)!.x || positions.get(a.id)!.y - positions.get(b.id)!.y)
        .map((v) => {
          const size = sizes.get(v.id)!;
          const data: GraphNodeData = {
            visual: v,
            description: descriptions.get(v.id)!,
            isSelected: selection?.kind === "node" && selection.id === v.id,
            isRoot: v.id === rootId,
            reducedMotion,
            onSelect: onSelectNode,
            onOpen: onOpenNode,
            onExpand,
            onLoadMore,
            onCollapse,
            onRefresh,
            stateOf,
            canLoadMore,
          };
          return {
            id: v.id,
            type: v.kind,
            position: dragging.get(v.id) ?? positions.get(v.id)!,
            // The layout's size, handed to React Flow so fitting, edges and
            // the card itself all use the same box.
            width: size.width,
            height: size.height,
            // React Flow forgets a node's measured handles whenever it gets a
            // new node object without `measured` — every drag frame, hover
            // and selection here — and a line with no handles is not drawn.
            // Stating the size and the two anchor points makes the lines
            // independent of that DOM measurement.
            measured: { width: size.width, height: size.height },
            handles: [
              { type: "target", position: Side.Left, x: 0, y: size.height / 2 - 0.5, width: 1, height: 1 },
              { type: "source", position: Side.Right, x: size.width - 1, y: size.height / 2 - 0.5, width: 1, height: 1 },
            ],
            data,
            draggable: true,
            connectable: false,
            className: highlightedNodeIds?.has(v.id) ? "iga-graph-highlight" : undefined,
          } satisfies RFGraphNode;
        }),
    [visualNodes, positions, dragging, descriptions, sizes, selection, rootId, reducedMotion, onSelectNode, onOpenNode, onExpand, onLoadMore, onCollapse, onRefresh, stateOf, canLoadMore, highlightedNodeIds],
  );
  const drawnIds = useMemo(() => new Set(rfNodes.map((n) => n.id)), [rfNodes]);

  const rfEdges = useMemo<RFGraphEdge[]>(() => {
    const drawn = visualEdges.filter((e) => drawnIds.has(e.from) && drawnIds.has(e.to));
    // Lines between the same two cards (an Allow and a Deny, two kinds of
    // relationship) are spread apart rather than drawn on top of each other.
    const pairs = new Map<string, string[]>();
    for (const e of drawn) {
      const k = [e.from, e.to].sort().join("\u0000");
      pairs.set(k, [...(pairs.get(k) ?? []), e.id]);
    }
    return drawn.map((e) => {
          const siblings = pairs.get([e.from, e.to].sort().join("\u0000")) ?? [e.id];
          const spread = (siblings.indexOf(e.id) - (siblings.length - 1) / 2) * 14;
          const selected = selection?.kind === "edge" && selection.id === e.id;
          const highlighted = highlightedEdgeIds?.has(e.id) ?? false;
          const data: GraphEdgeData = { visual: e, isSelected: selected, highlighted, hovered: hoveredEdge === e.id, reducedMotion, onSelect: onSelectEdge, spread };
          return {
            id: e.id,
            type: "graphEdge",
            source: e.from,
            target: e.to,
            data,
            focusable: false,
            zIndex: selected || highlighted ? 1 : 0,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: selected ? "var(--color-primary)" : highlighted ? "var(--color-text)" : "var(--color-border-strong)",
            },
          } satisfies RFGraphEdge;
        });
  }, [visualEdges, drawnIds, selection, highlightedEdgeIds, hoveredEdge, reducedMotion, onSelectEdge]);

  /* ------------------------------- viewport ------------------------------- */

  const boxOf = useCallback(
    (sel: GraphSelection) => {
      if (sel.kind === "node") {
        const p = positions.get(sel.id);
        const s = sizes.get(sel.id);
        return p && s ? { x: p.x, y: p.y, w: s.width, h: s.height } : null;
      }
      const e = visualEdges.find((x) => x.id === sel.id);
      const a = e && positions.get(e.from);
      const b = e && positions.get(e.to);
      const sa = e && sizes.get(e.from);
      const sb = e && sizes.get(e.to);
      if (!a || !b || !sa || !sb) return null;
      const x1 = Math.min(a.x, b.x);
      const y1 = Math.min(a.y, b.y);
      return { x: x1, y: y1, w: Math.max(a.x + sa.width, b.x + sb.width) - x1, h: Math.max(a.y + sa.height, b.y + sb.height) - y1 };
    },
    [positions, sizes, visualEdges],
  );

  const visibleRect = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return null;
    const { x, y, zoom } = flow.getViewport();
    return { x: -x / zoom, y: -y / zoom, w: el.clientWidth / zoom, h: el.clientHeight / zoom, zoom };
  }, [flow]);

  const revealStart = useCallback(async () => {
    await flow.fitView({ padding: 0.12, maxZoom: 1, duration: 0 });
    const el = wrapperRef.current;
    const p = rootId ? positions.get(rootId) : undefined;
    const s = rootId ? sizes.get(rootId) : undefined;
    if (flow.getZoom() >= READABLE_ZOOM || !el || !p || !s) return;
    // Too large to read whole: open on the start object, near the left edge.
    const cx = p.x + (el.clientWidth / 2 - 48) / START_ZOOM;
    const cy = p.y + s.height / 2;
    await flow.setCenter(cx, cy, { zoom: START_ZOOM, duration: 0 });
  }, [flow, rootId, positions, sizes]);

  const bringIntoView = useCallback(
    (sel: GraphSelection) => {
      const box = boxOf(sel);
      const view = visibleRect();
      if (!box || !view) return;
      const m = 24 / view.zoom;
      // The selection card covers the right edge: that strip is not "in view".
      const inset = rightInset / view.zoom;
      const inside = box.x >= view.x + m && box.y >= view.y + m && box.x + box.w <= view.x + view.w - inset - m && box.y + box.h <= view.y + view.h - m;
      if (inside) return;
      void flow.setCenter(box.x + box.w / 2 + inset / 2, box.y + box.h / 2, { zoom: view.zoom, duration });
    },
    [boxOf, visibleRect, flow, duration, rightInset],
  );

  const api = useMemo<CanvasApi>(
    () => ({
      fitGraph: () => void flow.fitView({ padding: 0.12, maxZoom: 1, duration }),
      revealStart: () => void revealStart(),
      bringIntoView,
    }),
    [flow, duration, revealStart, bringIntoView],
  );
  useEffect(() => {
    onApi(api);
    return () => onApi(null);
  }, [api, onApi]);

  // First view (no saved viewport) and Arrange. Runs once React Flow knows
  // the nodes — it queues fitView until they are initialised.
  // A deep link's selection is then brought into view too.
  const revealed = useRef(viewport ? revealToken : -1);
  useEffect(() => {
    if (revealToken === revealed.current || rfNodes.length === 0) return;
    revealed.current = revealToken;
    void revealStart().then(() => {
      if (selectionRef.current) bringIntoView(selectionRef.current);
    });
  }, [revealToken, rfNodes.length, revealStart, bringIntoView]);

  const checkLost = useCallback(() => {
    const view = visibleRect();
    if (!view || rfNodes.length === 0) return setLost(false);
    const any = rfNodes.some((n) => {
      const w = n.width ?? 0;
      const h = n.height ?? 0;
      return n.position.x + w > view.x && n.position.x < view.x + view.w && n.position.y + h > view.y && n.position.y < view.y + view.h;
    });
    setLost(!any);
  }, [visibleRect, rfNodes]);
  useEffect(() => checkLost(), [checkLost]);

  // The canvas narrowed or widened (the inspector opened or closed, the
  // window changed): keep what is selected in view, then re-check.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        if (selectionRef.current) bringIntoView(selectionRef.current);
      }
      checkLost();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bringIntoView, checkLost]);

  // A new selection made off-screen (from Paths, the inspector, a link) is
  // panned to; one made by clicking is already in view and nothing moves.
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  useEffect(() => {
    if (selection) bringIntoView(selection);
    // Only when the selection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  /* ------------------------------- keyboard ------------------------------- */

  const wrapperKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === "Escape") {
      onClearSelection();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) return;
    const active = document.activeElement as HTMLElement | null;
    const currentId = active?.getAttribute("data-node-id");
    if (!currentId) return;
    ev.preventDefault();
    const focus = (id: string | undefined) => {
      if (!id) return;
      const el = wrapperRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
      el?.focus({ preventScroll: true });
      bringIntoView({ kind: "node", id });
    };
    const here = positions.get(currentId);
    if (!here) return;
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      const forward = ev.key === "ArrowRight";
      const next = visualEdges
        .filter((e) => (forward ? e.from === currentId : e.to === currentId))
        .map((e) => (forward ? e.to : e.from))
        .filter((id) => drawnIds.has(id))
        .sort((a, b) => Math.abs((positions.get(a)?.y ?? 0) - here.y) - Math.abs((positions.get(b)?.y ?? 0) - here.y));
      focus(next[0]);
      return;
    }
    // Up/Down: the nearest card above or below that overlaps this one's column.
    const w = sizes.get(currentId)?.width ?? 0;
    const down = ev.key === "ArrowDown";
    const candidates = rfNodes
      .filter((n) => n.id !== currentId && n.position.x < here.x + w && n.position.x + (n.width ?? 0) > here.x)
      .filter((n) => (down ? n.position.y > here.y : n.position.y < here.y))
      .sort((a, b) => Math.abs(a.position.y - here.y) - Math.abs(b.position.y - here.y));
    focus(candidates[0]?.id);
  };

  return (
    <div
      ref={wrapperRef}
      onKeyDown={wrapperKeyDown}
      onScrollCapture={(ev) => {
        const t = ev.target as HTMLElement;
        if (t.classList.contains("react-flow") || t.classList.contains("react-flow__renderer")) {
          t.scrollTop = 0;
          t.scrollLeft = 0;
        }
      }}
      className={cn("relative h-full min-h-0 w-full", scopeClass)}
    >
      <style>{`
        .${scopeClass} .iga-graph-highlight > div { box-shadow: 0 0 0 2px var(--color-text); }
        .${scopeClass} .react-flow__node { transition: ${reducedMotion ? "none" : "transform 180ms ease"}; }
        .${scopeClass} .react-flow__node.dragging { transition: none; z-index: 10; }
        .${scopeClass} .react-flow__controls { box-shadow: var(--shadow-xs); border-radius: 6px; overflow: hidden; }
        .${scopeClass} .react-flow__controls-button { width: 26px; height: 26px; }
      `}</style>
      <ReactFlow
        defaultViewport={viewport}
        onMoveEnd={(_event, next) => {
          onViewportChange(next);
          checkLost();
        }}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        nodeDragThreshold={4}
        onNodesChange={(changes: NodeChange<RFGraphNode>[]) => {
          const moving = changes.filter((c) => c.type === "position" && c.dragging && c.position);
          if (!moving.length) return;
          setDragging((prev) => {
            const next = new Map(prev);
            for (const c of moving) if (c.type === "position" && c.position) next.set(c.id, c.position);
            return next;
          });
        }}
        onNodeDragStop={(_event, node) => {
          lastDragEnd.current = { id: node.id, at: Date.now() };
          onMoveNode(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) });
          setDragging((prev) => {
            const next = new Map(prev);
            next.delete(node.id);
            return next;
          });
        }}
        onNodeClick={(_event, node) => {
          const d = lastDragEnd.current;
          if (d && d.id === node.id && Date.now() - d.at < 300) return;
          onSelectNode(node.id);
        }}
        onNodeDoubleClick={(_event, node) => {
          const v = visualNodes.find((x) => x.id === node.id);
          if (v) onOpenNode(v.members[0].ref);
        }}
        nodesConnectable={false}
        // Our own card is the one focusable, described element (`nodes.tsx`);
        // React Flow's wrapper would add a second tab stop per node.
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        onEdgeClick={(_event, edge) => onSelectEdge(edge.id)}
        onEdgeMouseEnter={(_event, edge) => setHoveredEdge(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdge(null)}
        panOnScroll
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background gap={24} size={1} />
        <Controls position="bottom-left" showInteractive={false} showFitView={false} />
      </ReactFlow>
      {lost ? (
        <div role="status" className="absolute inset-x-0 top-1/2 mx-auto flex w-fit -translate-y-1/2 flex-col items-center gap-2 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3 text-sm shadow-(--shadow-sm)">
          <p className="text-(--color-text-muted)">The loaded graph is outside this view.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void revealStart()}>
              Focus starting object
            </Button>
            <Button size="sm" variant="outline" onClick={api.fitGraph}>
              Fit graph
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
