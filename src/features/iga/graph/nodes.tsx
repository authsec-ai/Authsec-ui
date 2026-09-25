/**
 * The graph card (SPEC-iga-phase2-graph.md §2.14.11 *The worked example*,
 * §2.14.15 *Components*). One component for every kind — the kinds differ in
 * icon and a few lines, not in shape.
 *
 * It draws exactly what `describeNode` says, at exactly the size `nodeSize`
 * returns, every line clamped to one row: the layout and the card never
 * disagree about how tall a card is. Full identifiers, every indicator's
 * explanation and any further expansions are in the inspector.
 *
 * Keyboard: Enter selects, Shift+Enter opens the object's page, `+`/`-`
 * expand and collapse the card's own frontier (arrow-key traversal is one
 * level up, in `GraphCanvas`, since it needs the whole graph).
 */

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { GraphFrontier, GraphNodeKind, GraphRef } from "@/app/api/igaGraphApi";
import { cn } from "@/lib/utils";

import { frontierAriaLabel, frontierLabel } from "./graphLabels";
import { NODE_ICON } from "./icons";
import { nodeAriaLabel, type NodeDescription } from "./nodeView";
import { frontierKey, type FrontierControl, type VisualNode } from "./types";

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

/** Chips drawn on the card; the rest are summarised as "+N" (all are in the inspector). */
const MAX_CHIPS = 3;

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
  const row = "flex h-5 items-center gap-2 truncate text-[11.5px]";
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

function GraphNodeViewImpl({ data, id, width, height }: NodeProps<RFGraphNode>) {
  const { visual: v, description: d } = data;
  const first = v.members[0];
  const Icon = NODE_ICON[d.icon];
  const external = v.kind === "external_principal" || v.kind === "external";

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

  const chips = d.indicators.slice(0, MAX_CHIPS);
  const extraChips = d.indicators.length - chips.length;

  return (
    <div
      data-node-id={id}
      tabIndex={0}
      role="button"
      aria-label={`${nodeAriaLabel(d)}${data.isRoot ? ", starting object" : ""}`}
      aria-pressed={data.isSelected}
      onClick={() => data.onSelect(id)}
      onDoubleClick={() => data.onOpen(first.ref)}
      onKeyDown={onKeyDown}
      style={{ width, height }}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-(--color-surface-raised) px-3 py-2.5 text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--color-primary) focus-visible:ring-offset-2",
        data.reducedMotion ? "" : "transition-[border-color,box-shadow] duration-150",
        data.isSelected
          ? "border-(--color-primary) shadow-[0_0_0_1px_var(--color-primary)]"
          : "border-(--color-border-subtle) shadow-(--shadow-xs) hover:border-(--color-border-strong)",
        data.isRoot && !data.isSelected && "border-(--color-text-muted)",
        (external || v.overflow) && "border-dashed",
        v.overflow && "bg-(--color-surface-subtle)",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-(--color-border-strong)" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-(--color-border-strong)" isConnectable={false} />

      <p className="flex h-5 items-center gap-1.5">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-(--color-text-muted)" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-(--color-text)" title={d.title}>
          {d.title}
        </span>
      </p>
      <p className="h-4 truncate text-[11.5px] leading-4 text-(--color-text-muted)" title={d.type}>
        {d.type}
      </p>
      {d.context ? (
        <p className="h-4 truncate text-[11.5px] leading-4 text-(--color-text-muted)" title={d.context}>
          {d.context}
        </p>
      ) : null}
      {d.indicators.length ? (
        <p className="mt-1.5 flex h-4 items-center gap-1 overflow-hidden">
          {chips.map((c) => (
            <span key={c.key} title={c.long} className={cn("shrink-0 truncate rounded px-1.5 text-[10.5px] leading-4 font-medium", TONE_CLASS[c.tone])}>
              {c.text}
            </span>
          ))}
          {extraChips > 0 ? <span className="shrink-0 text-[10.5px] text-(--color-text-muted)">+{extraChips}</span> : null}
        </p>
      ) : null}
      {d.frontier.length || d.frontierHidden ? (
        <div className="mt-1">
          {d.frontier.map((f) => (
            <FrontierRow
              key={frontierKey(f)}
              frontier={f}
              control={data.stateOf(f)}
              canLoadMore={data.canLoadMore(f)}
              onExpand={() => data.onExpand(f)}
              onLoadMore={() => data.onLoadMore(f)}
              onCollapse={() => data.onCollapse(f)}
              onRefresh={data.onRefresh}
            />
          ))}
          {d.frontierHidden ? (
            <span className="flex h-5 items-center text-[11.5px] text-(--color-text-muted)">
              +{d.frontierHidden} more to load — select the card
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const GraphNodeView = memo(GraphNodeViewImpl);
