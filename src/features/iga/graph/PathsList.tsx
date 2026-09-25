/**
 * The Paths presentation (SPEC-iga-phase2-graph.md §2.14.11 *The path list*)
 * — the accessible equivalent of the canvas, from the same loaded data.
 * Complete for what was loaded; grouped edges are NEVER grouped here, so a
 * grant declared by two policies is two list items, each openable on its
 * own. The default presentation below 768 px (§2.14.11, §2.14.14).
 *
 * "Accessible equivalent" means it, not "a subset": every visible node's
 * outstanding frontier is offered here too (review item 5), exclusions and a
 * coverage gap are named on the step that carries them, and an edge's own
 * `stale` lifecycle is said, not just its target node's.
 */

import { useState } from "react";
import type { GraphEdge, GraphFrontier, GraphNode, GraphRef } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { accountLabel, limitationText } from "../shared/labels";
import { KIND_LABEL, EDGE_LABEL, frontierAriaLabel, frontierLabel } from "./graphLabels";
import type { FrontierControl } from "./nodes";
import type { RawPath } from "./types";

function FrontierNote({
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
  const collapse = control.expanded ? <button type="button" onClick={onCollapse} className="ml-2 font-medium text-(--color-primary-text) hover:underline" aria-label={`Collapse ${frontierLabel(frontier)}`}>Collapse</button> : null;
  if (control.pending === "paused") {
    return (
      <span className="text-(--color-info-text)">
        A newer scan published —{" "}
        <button type="button" onClick={onRefresh} className="font-medium hover:underline">
          Refresh
        </button>{collapse}
      </span>
    );
  }
  if (control.pending === "loading") return <span className="text-(--color-text-muted)">Loading…{collapse}</span>;
  if (!control.expanded) {
    if (control.pending === "failed") {
      return (
        <button type="button" onClick={onExpand} className="font-medium text-(--color-warning-text) hover:underline">
          Could not load. Retry
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={frontierAriaLabel(frontier)}
        className="font-medium text-(--color-primary-text) hover:underline"
      >
        {frontierLabel(frontier)}
      </button>
    );
  }
  if (canLoadMore) {
    return (
      <span><button type="button" onClick={onLoadMore} className="font-medium text-(--color-primary-text) hover:underline">
        {control.pending === "failed" ? "Could not load. Retry" : "Load more"}
      </button>{collapse}</span>
    );
  }
  return collapse;
}

function StepNode({
  node,
  onSelect,
  frontier,
  stateOf,
  canLoadMore,
  onExpand,
  onLoadMore,
  onCollapse,
  onRefresh,
}: {
  node: GraphNode | undefined;
  onSelect: (ref: GraphRef) => void;
  frontier: GraphFrontier[];
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
}) {
  if (!node) return <span className="italic text-(--color-text-muted)">unknown</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect(node.ref)}
        className="rounded px-1 py-0.5 text-left font-medium text-(--color-text) hover:bg-(--color-surface-subtle) hover:underline"
      >
        {node.label}{" "}
        <span className="font-normal text-(--color-text-muted)">
          ({KIND_LABEL[node.kind]}, {accountLabel(node.account ?? null)})
        </span>
        {node.state && node.state !== "current" ? (
          <StatusBadge tone={node.state === "stale" ? "warning" : "neutral"} className="ml-1">
            {node.state}
          </StatusBadge>
        ) : null}
      </button>
      {node.exclusions?.length ? (
        <span className="rounded-full bg-(--color-warning-soft) px-2 py-0.5 text-[11px] text-(--color-warning-text)">
          all resources except {node.exclusions.map((x) => x.text).join(", ")}
        </span>
      ) : null}
      {frontier.map((f) => (
        <span key={`${f.node}|${f.edge}|${f.direction}`} className="text-xs">
          <FrontierNote
            frontier={f}
            control={stateOf(f)}
            canLoadMore={canLoadMore(f)}
            onExpand={() => onExpand(f)}
            onLoadMore={() => onLoadMore(f)}
            onCollapse={() => onCollapse(f)}
            onRefresh={onRefresh}
          />
        </span>
      ))}
    </span>
  );
}

function edgeWord(e: GraphEdge, statementPolicy: string | undefined, reverse: boolean): string {
  const inverse: Record<GraphEdge["kind"], string> = {
    executes_as: "used by workload", task_execution_role: "used for task execution by",
    member_of: "has member", can_assume: "may be assumed by",
    grant: "declared on", target: "named by statement",
  };
  const base = reverse ? inverse[e.kind] : EDGE_LABEL[e.kind];
  return e.kind === "grant" && statementPolicy ? `${base} ${statementPolicy}` : base;
}

export function PathsList({
  root,
  rootName,
  paths,
  nodesByRef,
  frontierByNode,
  truncated,
  boundByMax,
  stateOf,
  canLoadMore,
  onExpand,
  onLoadMore,
  onCollapse,
  onRefresh,
  onSelectNode,
  onSelectEdge,
}: {
  root: GraphRef;
  rootName: string;
  paths: RawPath[];
  nodesByRef: Map<GraphRef, GraphNode>;
  frontierByNode: Map<GraphRef, GraphFrontier[]>;
  truncated: boolean;
  boundByMax: boolean;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  onSelectNode: (ref: GraphRef) => void;
  onSelectEdge: (claim: GraphRef) => void;
}) {
  const [shown, setShown] = useState(50);
  const frontierOf = (ref: GraphRef) => frontierByNode.get(ref) ?? [];
  const step = (ref: GraphRef) => (
    <StepNode
      node={nodesByRef.get(ref)}
      onSelect={onSelectNode}
      frontier={frontierOf(ref)}
      stateOf={stateOf}
      canLoadMore={canLoadMore}
      onExpand={onExpand}
      onLoadMore={onLoadMore}
      onCollapse={onCollapse}
      onRefresh={onRefresh}
    />
  );

  if (paths.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-(--color-text-muted)">
        No relationships at this depth for {rootName}. {step(root)}
      </p>
    );
  }

  return (
    <div className="space-y-4 px-4 py-3">
      <ol aria-label={`Declared paths from ${rootName}`} className="space-y-3 text-sm" onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1)));
        buttons[next]?.focus();
      }}>
        {paths.slice(0, shown).map((p, i) => (
          <li key={i} className="rounded-md border border-(--color-border-subtle) p-2">
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              <li>{step(p.nodes[0])}</li>
              {p.edges.map((e, j) => {
                const to = nodesByRef.get(p.nodes[j + 1]);
                const policy = to?.kind === "statement" ? to.policy : undefined;
                const limitationNotes = (e.limitations ?? []).map(limitationText);
                return (
                  <li key={e.claim} className="flex flex-wrap items-center gap-1">
                    <span aria-hidden="true" className="text-(--color-text-muted)">
                      —
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectEdge(e.claim)}
                      className="rounded-full border border-(--color-border-subtle) bg-(--color-surface-raised) px-2 py-0.5 text-xs font-medium text-(--color-text-muted) hover:bg-(--color-surface-subtle)"
                    >
                      {edgeWord(e, policy, p.nodes[j] !== e.from)}
                      {e.state === "stale" ? " (stale)" : e.state === "ended" ? " (ended)" : ""}
                      {e.closes_cycle ? " (cycle)" : ""}
                      {e.crosses_account ? " (cross-account)" : ""}
                    </button>
                    <span aria-hidden="true" className="text-(--color-text-muted)">
                      →
                    </span>
                    {step(p.nodes[j + 1])}
                    {limitationNotes.length ? (
                      <span className="basis-full pl-4 text-[11px] text-(--color-warning-text)">
                        {limitationNotes.join(" ")}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
      {paths.length > shown ? <button type="button" onClick={() => setShown((n) => n + 50)} className="text-sm font-medium text-(--color-primary-text) hover:underline">
        Show more paths ({shown} of {paths.length} loaded)
      </button> : null}
      {boundByMax ? (
        <p className="text-xs text-(--color-warning-text)">
          Path search stopped at its display budget. More paths may exist. Focus on a specific object to narrow the graph.
        </p>
      ) : truncated ? (
        <p className="text-xs text-(--color-text-muted)">
          Showing what was loaded. More may be available — expand a node to see further paths.
        </p>
      ) : null}
    </div>
  );
}
