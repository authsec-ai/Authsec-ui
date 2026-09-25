/**
 * The React Flow canvas (SPEC-iga-phase2-graph.md §2.14.15). Positions are
 * owned by the caller (`layout.ts` + `model.ts`); this only draws them and
 * turns pointer/keyboard interaction into the callbacks the page needs.
 *
 * Keyboard (§2.14.14, §2.14.15): Tab follows React Flow's own node order;
 * Enter/Shift+Enter/+/- are handled on the node itself (`nodes.tsx`); arrow
 * keys move focus along an edge from the node currently focused, which needs
 * the whole graph, so it lives here. Escape clears selection.
 */

import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { Background, Controls, Panel, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LocateFixed } from "lucide-react";

import type { GraphFrontier, GraphRef } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { GraphEdgeView, type GraphEdgeData, type RFGraphEdge } from "./edges";
import { GraphNodeView, type FrontierControl, type GraphNodeData, type RFGraphNode } from "./nodes";
import type { Position as XYPosition } from "./model";
import type { GraphSelection, VisualEdge, VisualNode } from "./types";

/** One entry per kind — the same component, which styles itself by kind. */
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

const edgeTypes = {
  graphEdge: GraphEdgeView,
};

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface GraphCanvasProps {
  visualNodes: VisualNode[];
  visualEdges: VisualEdge[];
  positions: Map<string, XYPosition>;
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
  onTidyLayout: () => void;
  /** Bumped by the caller exactly when a fit-to-view is wanted: first layout, Tidy layout. */
  fitViewToken: number;
  viewport?: { x: number; y: number; zoom: number };
  onViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
  rootAccountId: string | null;
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
  positions,
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
  onTidyLayout,
  fitViewToken,
  viewport,
  onViewportChange,
  rootAccountId,
}: GraphCanvasProps) {
  const reducedMotion = reducedMotionPreferred();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  // Scopes the node-transition and highlight rules to THIS canvas instance —
  // otherwise a bare `.react-flow__node` selector leaks into every other
  // React Flow instance on the page (review item 20).
  const scopeClass = `iga-graph-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const rfNodes = useMemo<RFGraphNode[]>(
    () =>
      [...visualNodes].sort((a, b) => (positions.get(a.id)?.x ?? 0) - (positions.get(b.id)?.x ?? 0) || (positions.get(a.id)?.y ?? 0) - (positions.get(b.id)?.y ?? 0)).map((v) => {
        const data: GraphNodeData = {
          visual: v,
          isSelected: selection?.kind === "node" && selection.id === v.id,
          reducedMotion,
          onSelect: onSelectNode,
          onOpen: onOpenNode,
          onExpand,
          onLoadMore,
          onCollapse,
          onRefresh,
          stateOf,
          canLoadMore,
          rootAccountId,
        };
        return {
          id: v.id,
          type: v.kind,
          position: positions.get(v.id) ?? { x: 0, y: 0 },
          data,
          draggable: false,
          connectable: false,
          className: highlightedNodeIds?.has(v.id) ? "iga-graph-highlight" : undefined,
        } satisfies RFGraphNode;
      }),
    [
      visualNodes,
      positions,
      selection,
      reducedMotion,
      onSelectNode,
      onOpenNode,
      onExpand,
      onLoadMore,
      onCollapse,
      onRefresh,
      stateOf,
      canLoadMore,
      highlightedNodeIds,
      rootAccountId,
    ],
  );

  const rfEdges = useMemo<RFGraphEdge[]>(
    () =>
      visualEdges.map((e) => {
        const data: GraphEdgeData = {
          visual: e,
          isSelected: selection?.kind === "edge" && selection.id === e.id,
          highlighted: highlightedEdgeIds?.has(e.id) ?? false,
          reducedMotion,
          onSelect: onSelectEdge,
        };
        return {
          id: e.id,
          type: "graphEdge",
          source: e.from,
          target: e.to,
          data,
          focusable: true,
        } satisfies RFGraphEdge;
      }),
    [visualEdges, selection, reducedMotion, onSelectEdge, highlightedEdgeIds],
  );

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
      el?.focus();
    };

    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      const wantForward = ev.key === "ArrowRight";
      const candidates = visualEdges
        .filter((e) => (wantForward ? e.from === currentId : e.to === currentId))
        .map((e) => (wantForward ? e.to : e.from));
      const withY = candidates.map((id) => ({ id, y: positions.get(id)?.y ?? 0 })).sort((a, b) => a.y - b.y);
      focus(withY[0]?.id);
      return;
    }

    // Up/Down: the next visible node in the same column (columns are fixed by kind, §2.14.15).
    const currentPos = positions.get(currentId);
    if (!currentPos) return;
    const sameColumn = visualNodes
      .map((n) => ({ id: n.id, pos: positions.get(n.id) }))
      .filter((n) => n.pos && n.pos.x === currentPos.x)
      .sort((a, b) => (a.pos?.y ?? 0) - (b.pos?.y ?? 0));
    const idx = sameColumn.findIndex((n) => n.id === currentId);
    if (idx < 0) return;
    const next = ev.key === "ArrowDown" ? sameColumn[idx + 1] : sameColumn[idx - 1];
    focus(next?.id);
  };

  useEffect(() => {
    if (fitViewToken > 0) void fitView({ duration: reducedMotion ? 0 : 200, padding: 0.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitViewToken]);

  return (
    <div ref={wrapperRef} onKeyDown={wrapperKeyDown} className={cn("relative h-[560px] w-full", scopeClass)}>
      <style>{`
        .${scopeClass} .iga-graph-highlight { outline: 2px solid var(--color-primary); outline-offset: 2px; }
        .${scopeClass} .react-flow__node { transition: ${reducedMotion ? "none" : "transform 180ms ease"}; }
      `}</style>
      <ReactFlow
        defaultViewport={viewport}
        onMoveEnd={(_event, next) => onViewportChange(next)}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        // Our own node div is already the one focusable, described element
        // (`nodes.tsx`); without this, React Flow's own wrapper adds a SECOND
        // tab stop per node (review item 14).
        nodesFocusable={false}
        elementsSelectable={false}
        panOnScroll
        fitView
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background />
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <Button variant="outline" size="sm" onClick={onTidyLayout}>
            <LocateFixed className="size-4" /> Tidy layout
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
