/**
 * The graph card (SPEC-iga-phase2-graph.md §2.14.11, §2.14.15 *Components*).
 * One component for every kind — the kinds differ by category, icon and a
 * few lines, not by shape.
 *
 * A tinted header says what the object IS (category colour from the
 * `--color-object-*` tokens, an icon and explicit type text — colour is
 * never the only signal); the neutral body names it and gives one line of
 * context, at most two indicators and one Load control. It is drawn at
 * exactly `nodeSize`, every line clamped to one row.
 *
 * Pointer: React Flow owns click and drag on the card (`GraphCanvas`), so
 * a drag moves it and never selects it; the card's own buttons are `nodrag`
 * and handle their clicks. Keyboard: Enter or Space selects, Shift+Enter
 * opens the object's page, `+`/`-` load and collapse.
 */

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { GraphFrontier, GraphNodeKind, GraphRef } from "@/app/api/igaGraphApi";
import { cn } from "@/lib/utils";

import { frontierAriaLabel, frontierLabel } from "./graphLabels";
import { NODE_ICON } from "./icons";
import { nodeAriaLabel, type NodeDescription } from "./nodeView";
import type { FrontierControl, VisualNode } from "./types";

export type { FrontierControl };

export interface GraphNodeData extends Record<string, unknown> {
  visual: VisualNode;
  description: NodeDescription;
  isSelected: boolean;
  isRoot: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onOpen: (ref: GraphRef) => void;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
}

export type RFGraphNode = Node<GraphNodeData, GraphNodeKind>;


const TONE_CLASS = {
  neutral: "bg-(--color-surface-subtle) text-(--color-text-muted)",
  warning: "bg-(--color-warning-soft) text-(--color-warning-text)",
  info: "bg-(--color-info-soft) text-(--color-info-text)",
} as const;


function FrontierRow({
  frontier,
  control,
  canLoadMore,
  onExpand,
  onLoadMore,
  onCollapse,
  onRefresh,
}: {
  frontier: GraphFrontier;
  control: FrontierControl;
  canLoadMore: boolean;
  onExpand: () => void;
  onLoadMore: () => void;
  onCollapse: () => void;
  onRefresh: () => void;
}) {
  // Inside the card's own clickable surface: every control stops the click,
  // so expanding a card never also selects it.
  const stop = (fn: () => void) => (ev: MouseEvent) => {
    ev.stopPropagation();
    fn();
  };
  const { expanded, pending } = control;
  const row = "nodrag flex h-5 items-center gap-2 truncate text-xs";
  const link = "truncate font-medium hover:underline";

  if (!expanded) {
    if (pending === "paused")
      return (
        <span className={cn(row, "text-(--color-info-text)")}>
          Newer scan —
          <button type="button" onClick={stop(onRefresh)} className={link}>
            Refresh
          </button>
        </span>
      );
    if (pending === "loading") return <span className={cn(row, "text-(--color-text-muted)")}>Loading…</span>;
    if (pending === "failed")
      return (
        <button type="button" onClick={stop(onExpand)} className={cn(row, link, "text-(--color-warning-text)")}>
          Could not load. Retry
        </button>
      );
    return (
      <button type="button" onClick={stop(onExpand)} aria-label={frontierAriaLabel(frontier)} className={cn(row, link, "text-(--color-primary-text)")}>
        {frontierLabel(frontier)}
      </button>
    );
  }

  // Collapse never needs a read, so it is offered whatever `pending` is —
  // only Load more (a new read) waits for a refresh (review item 9).
  return (
    <span className={row}>
      <button type="button" onClick={stop(onCollapse)} className={cn(link, "text-(--color-text-muted)")}>
        Collapse
      </button>
      {!canLoadMore ? null : pending === "paused" ? (
        <button type="button" onClick={stop(onRefresh)} className={cn(link, "text-(--color-info-text)")}>
          Newer scan — Refresh
        </button>
      ) : pending === "loading" ? (
        <span className="text-(--color-text-muted)">Loading more…</span>
      ) : pending === "failed" ? (
        <button type="button" onClick={stop(onLoadMore)} className={cn(link, "text-(--color-warning-text)")}>
          Could not load more. Retry
        </button>
      ) : (
        <button type="button" onClick={stop(onLoadMore)} className={cn(link, "text-(--color-primary-text)")}>
          Load more
        </button>
      )}
    </span>
  );
}

const CATEGORY_CLASS: Record<NodeDescription["category"], { header: string; icon: string }> = {
  workload: { header: "bg-(--color-object-workload-soft) text-(--color-object-workload-text)", icon: "text-(--color-object-workload-accent)" },
  identity: { header: "bg-(--color-object-identity-soft) text-(--color-object-identity-text)", icon: "text-(--color-object-identity-accent)" },
  resource: { header: "bg-(--color-object-resource-soft) text-(--color-object-resource-text)", icon: "text-(--color-object-resource-accent)" },
  statement: { header: "bg-(--color-object-statement-soft) text-(--color-object-statement-text)", icon: "text-(--color-object-statement-accent)" },
  external: { header: "bg-(--color-object-external-soft) text-(--color-object-external-text)", icon: "text-(--color-object-external-accent)" },
};

function GraphNodeViewImpl({ data, id, width, height, dragging }: NodeProps<RFGraphNode>) {
  const { visual: v, description: d } = data;
  const first = v.members[0];
  const Icon = NODE_ICON[d.icon];
  const cat = CATEGORY_CLASS[d.category];
  const dashed = d.category === "external" || !!v.overflow;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A key press from a nested control (Retry, Collapse) is that control's.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      data.onOpen(first.ref);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      data.onSelect(id);
    } else if (e.key === "+" || e.key === "=") {
      const f = v.frontier.find((fr) => !data.stateOf(fr).expanded);
      if (f) {
        e.preventDefault();
        data.onExpand(f);
      }
    } else if (e.key === "-" || e.key === "_") {
      const f = v.frontier.find((fr) => data.stateOf(fr).expanded);
      if (f) {
        e.preventDefault();
        data.onCollapse(f);
      }
    }
  };

  return (
    <div
      data-node-id={id}
      tabIndex={0}
      role="button"
      aria-label={`${nodeAriaLabel(d)}${data.isRoot ? ", starting object" : ""}`}
      aria-pressed={data.isSelected}
      onKeyDown={onKeyDown}
      style={{ width, height }}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-(--color-surface-raised) text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2",
        dragging ? "cursor-grabbing shadow-(--shadow-sm)" : "cursor-pointer",
        data.reducedMotion || dragging ? "" : "transition-[border-color,box-shadow] duration-150",
        data.isSelected
          ? "border-(--color-primary) shadow-[0_0_0_2px_var(--color-primary)]"
          : "border-(--color-border-subtle) shadow-(--shadow-xs) hover:border-(--color-border-strong)",
        dashed && !data.isSelected && "border-dashed border-(--color-border-strong)",
      )}
    >
      {/* Invisible anchors for the lines: nothing can be drawn from them. */}
      <Handle type="target" position={Position.Left} isConnectable={false} className="!pointer-events-none !opacity-0" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="!pointer-events-none !opacity-0" />

      <p className={cn("flex h-6 shrink-0 items-center gap-1.5 px-3 text-[11px] font-semibold", cat.header)}>
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", cat.icon)} />
        <span className="min-w-0 truncate" title={d.type}>
          {d.type}
        </span>
        {data.isRoot ? <span className="ml-auto shrink-0 font-medium opacity-80">start</span> : null}
      </p>
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-1.5 pb-2">
        <p className="h-5 truncate text-[13px] font-semibold leading-5 text-(--color-text)" title={d.title}>
          {d.title}
        </p>
        {d.context ? (
          <p className="h-4 truncate text-xs leading-4 text-(--color-text-muted)" title={d.context}>
            {d.context}
          </p>
        ) : null}
        {d.indicators.length ? (
          <p className="mt-1 flex h-4 items-center gap-1 overflow-hidden">
            {d.indicators.map((c) => (
              <span key={c.key} title={c.long} className={cn("shrink-0 truncate rounded px-1.5 text-[11px] leading-4 font-medium", TONE_CLASS[c.tone])}>
                {c.text}
              </span>
            ))}
          </p>
        ) : null}
        {d.frontier.length ? (
          <FrontierRow
            frontier={d.frontier[0]}
            control={data.stateOf(d.frontier[0])}
            canLoadMore={data.canLoadMore(d.frontier[0])}
            onExpand={() => data.onExpand(d.frontier[0])}
            onLoadMore={() => data.onLoadMore(d.frontier[0])}
            onCollapse={() => data.onCollapse(d.frontier[0])}
            onRefresh={data.onRefresh}
          />
        ) : d.frontierHidden ? (
          <span className="flex h-5 items-center text-xs text-(--color-text-muted)">More to load — select</span>
        ) : null}
        {d.frontier.length && d.frontierHidden ? <span className="sr-only">{d.frontierHidden} more to load in the selection card</span> : null}
      </div>
    </div>
  );
}

export const GraphNodeView = memo(GraphNodeViewImpl);
