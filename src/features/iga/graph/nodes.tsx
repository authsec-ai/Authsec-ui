/**
 * Custom graph nodes (SPEC-iga-phase2-graph.md §2.14.11 *The worked
 * example*, §2.14.15 *Components*). One component covers every kind —
 * registered once per `GraphNodeKind` in `nodeTypes` — because the
 * differences are a handful of conditional rows, not a different shape; each
 * kind still gets its own visual treatment (§2.14.15: "external principals
 * and selectors have their own visual treatment").
 *
 * Shows name, kind, account (always, §2.14.10) and the lifecycle badge when
 * not current. Keyboard: Enter selects, Shift+Enter opens, `+`/`-` expand and
 * collapse the node's own frontier entries (arrow-key traversal is handled
 * one level up, in `GraphCanvas`, since it needs the whole graph).
 */

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Ban, KeyRound, Lock, ShieldAlert } from "lucide-react";

import type { GraphFrontier, GraphNodeKind, GraphRef } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { cn } from "@/lib/utils";

import { accountLabel, RESOURCE_KIND_NOTE } from "../shared/labels";
import { KIND_LABEL, dominantRelState, frontierAriaLabel, frontierLabel, mixedStateText } from "./graphLabels";
import { frontierKey, type FrontierControl, type VisualNode } from "./types";

export type { FrontierControl };

export interface GraphNodeData extends Record<string, unknown> {
  visual: VisualNode;
  isSelected: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onOpen: (ref: GraphRef) => void;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
  /** The account of the object the graph started at: a node elsewhere is out of scope (§2.14.10). */
  rootAccountId: string | null;
}

export type RFGraphNode = Node<GraphNodeData, GraphNodeKind>;


function primaryLabel(v: VisualNode): string {
  const first = v.members[0];
  if (first.kind === "workload" && v.members.length > 1) return `${v.members.length} workloads loaded`;
  if (first.kind === "statement" && v.members.length > 1) {
    return first.label; // grouped statements share actions/target — same label
  }
  return first.label;
}

function ExpandRow({
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
  // Nested inside the node's own clickable/selectable surface: every control
  // here stops the click reaching it, so expanding a node never also selects it.
  const stop = (fn: () => void) => (ev: MouseEvent) => {
    ev.stopPropagation();
    fn();
  };
  const { expanded, pending } = control;

  if (!expanded) {
    if (pending === "paused") {
      return (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-(--color-info-text)">
          A newer scan published —{" "}
          <button type="button" onClick={stop(onRefresh)} className="font-medium hover:underline">
            Refresh
          </button>
        </span>
      );
    }
    if (pending === "loading") {
      return <span className="mt-1 block text-xs text-(--color-text-muted)">Loading…</span>;
    }
    if (pending === "failed") {
      return (
        <button
          type="button"
          onClick={stop(onExpand)}
          className="mt-1 block text-left text-xs font-medium text-(--color-warning-text) hover:underline"
        >
          Could not load. Retry
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={stop(onExpand)}
        aria-label={frontierAriaLabel(frontier)}
        className="mt-1 block text-left text-xs font-medium text-(--color-primary-text) hover:underline"
      >
        {frontierLabel(frontier)}
      </button>
    );
  }

  // Expanded: Collapse never needs a read, so it is offered regardless of
  // `pending` — only Load more (a new read) waits for a refresh (item 9).
  return (
    <span className="mt-1 flex items-center gap-2 text-xs">
      <button type="button" onClick={stop(onCollapse)} className="font-medium text-(--color-text-muted) hover:underline">
        Collapse
      </button>
      {!canLoadMore ? null : pending === "paused" ? (
        <span className="text-(--color-info-text)">
          Newer scan —{" "}
          <button type="button" onClick={stop(onRefresh)} className="font-medium hover:underline">
            Refresh
          </button>
        </span>
      ) : pending === "loading" ? (
        <span className="text-(--color-text-muted)">Loading more…</span>
      ) : pending === "failed" ? (
        <button type="button" onClick={stop(onLoadMore)} className="font-medium text-(--color-warning-text) hover:underline">
          Could not load more. Retry
        </button>
      ) : (
        <button type="button" onClick={stop(onLoadMore)} className="font-medium text-(--color-primary-text) hover:underline">
          Load more
        </button>
      )}
    </span>
  );
}

function GraphNodeViewImpl({ data, id }: NodeProps<RFGraphNode>) {
  const { visual: v } = data;
  const first = v.members[0];
  const kind = v.kind;
  const isStatement = kind === "statement";
  const isExternal = kind === "external_principal";
  const isResource = kind === "exact" || kind === "selector" || kind === "external";
  const grouped = v.members.length > 1;

  // The GROUP's own lifecycle reads current > stale > ended across every
  // member, never just `members[0]` (review item 13).
  const state = dominantRelState(v.members.map((m) => m.state ?? "current"));
  const outOfScope = !!data.rootAccountId && !!first.account && first.account.id !== data.rootAccountId;
  const accountConnected = first.account ? first.account.connected : true;
  const exclusions = v.members.flatMap((m) => m.exclusions ?? []);
  const restrictions = v.members.reduce(
    (acc, m) => ({
      deny_statements: Math.max(acc.deny_statements, m.restrictions?.deny_statements ?? 0),
      permissions_boundary: acc.permissions_boundary || !!m.restrictions?.permissions_boundary,
    }),
    { deny_statements: 0, permissions_boundary: false },
  );

  const policies = isStatement ? [...new Set(v.members.map((m) => m.policy).filter(Boolean))] : [];
  const mixed = grouped ? mixedStateText(v.members.map((m) => m.state ?? "current")) : null;

  const usedBy = v.members[0].used_by_count;
  const frontierNote = v.frontier.length
    ? v.frontier.map((f) => frontierLabel(f)).join("; ")
    : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A key press bubbling up from a nested control (Retry, Collapse, Load
    // more) is that control's own concern, not the node's (review item 14).
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      data.onOpen(first.ref);
    } else if (e.key === "Enter") {
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

  const ariaLabel = [
    `${primaryLabel(v)}, ${KIND_LABEL[kind]}`,
    accountLabel(first.account ?? null),
    state !== "current" ? state : null,
    outOfScope ? "out of scope" : null,
    isExternal && accountConnected === false ? "account not connected, unresolved" : null,
    exclusions.length ? `except ${exclusions.map((x) => x.text).join(", ")}` : null,
    restrictions.permissions_boundary ? "has a permissions boundary" : null,
    restrictions.deny_statements > 0 ? `has ${restrictions.deny_statements} Deny statement(s)` : null,
    usedBy ? (usedBy.exact ? `used by ${usedBy.value} workloads` : "used by workloads, count not exact") : null,
    frontierNote,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-node-id={id}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      aria-pressed={data.isSelected}
      onClick={() => data.onSelect(id)}
      onDoubleClick={() => data.onOpen(first.ref)}
      onKeyDown={onKeyDown}
      className={cn(
        "w-[240px] rounded-lg border-2 bg-(--color-surface-raised) px-3 py-2 text-left shadow-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-(--color-primary)",
        data.reducedMotion ? "" : "transition-colors duration-150",
        data.isSelected ? "border-(--color-primary)" : "border-(--color-border-subtle)",
        outOfScope && "border-dashed",
        isExternal && "border-dashed bg-(--color-surface-subtle)",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-(--color-border-strong)" />
      <Handle type="source" position={Position.Right} className="!bg-(--color-border-strong)" />

      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-(--color-text)" title={primaryLabel(v)}>
          {primaryLabel(v)}
        </p>
        {restrictions.permissions_boundary ? (
          <Lock className="size-3.5 shrink-0 text-(--color-warning-text)" aria-label="Has a permissions boundary" />
        ) : null}
        {restrictions.deny_statements > 0 ? (
          <ShieldAlert
            className="size-3.5 shrink-0 text-(--color-warning-text)"
            aria-label={`Has ${restrictions.deny_statements} Deny statement(s)`}
          />
        ) : null}
      </div>

      <p
        className="mt-0.5 truncate text-xs text-(--color-text-muted)"
        title={isResource ? RESOURCE_KIND_NOTE[kind as "exact" | "selector" | "external"] : undefined}
      >
        {KIND_LABEL[kind]}
      </p>

      <p className="mt-0.5 truncate text-xs text-(--color-text-muted)">{accountLabel(first.account ?? null)}</p>

      {isExternal && accountConnected === false ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-(--color-warning-text)">
          <AlertTriangle className="size-3.5 shrink-0" /> Account not connected — unresolved
        </p>
      ) : null}

      {kind === "workload" && grouped ? <button type="button" className="mt-2 text-xs font-semibold text-(--color-primary-text) hover:underline" onClick={(event) => { event.stopPropagation(); data.onOpen(first.ref); }}>Show workloads</button> : null}
      {isStatement && policies.length > 0 ? (
        <p className="mt-1 truncate text-xs text-(--color-text-muted)">
          {policies.join(", ")}
          {grouped ? <StatusBadge tone="info" className="ml-1">{v.members.length} statements</StatusBadge> : null}
        </p>
      ) : null}
      {mixed ? <p className="mt-0.5 text-[11px] text-(--color-text-muted)">{mixed}</p> : null}

      {exclusions.length > 0 ? (
        <p className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-(--color-warning-soft) px-2 py-0.5 text-[11px] text-(--color-warning-text)">
          <Ban className="size-3 shrink-0" /> except {exclusions.map((x) => x.text).join(", ")}
        </p>
      ) : null}

      {outOfScope ? (
        <p className="mt-1 text-[11px] font-medium text-(--color-text-muted)">Out of scope</p>
      ) : null}

      {state !== "current" ? (
        <StatusBadge tone={state === "stale" ? "warning" : "neutral"} className="mt-1">
          {state}
        </StatusBadge>
      ) : null}

      {v.members.some((m) => m.used_by_count) ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-(--color-text-muted)">
          <KeyRound className="size-3 shrink-0" />
          {v.members[0].used_by_count?.exact
            ? `Used by ${v.members[0].used_by_count?.value} workloads`
            : "Used by workloads (count not exact)"}
        </p>
      ) : null}

      {v.frontier.length > 0 ? (
        <div>
          {v.frontier.map((f) => (
            <ExpandRow
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
        </div>
      ) : null}
    </div>
  );
}

export const GraphNodeView = memo(GraphNodeViewImpl);

