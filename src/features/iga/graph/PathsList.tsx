/**
 * The Paths presentation (SPEC-iga-phase2-graph.md §2.14.11 *The path list*)
 * — a readable alternative to the canvas, from the same loaded data, and the
 * default below 768 px (§2.14.14).
 *
 * Each path is a numbered list of steps joined by the relationship's own
 * verb; every verb opens that relationship's evidence, every object selects
 * it, and "Show on canvas" traces the same path there. Nothing grouped or
 * hidden on the canvas is grouped or hidden here — two grants are two
 * steps. A path is never called "can access", and a path whose last object
 * has more relationships not loaded says it continues rather than ending.
 */

import { useState } from "react";
import { ArrowDown, Route } from "lucide-react";

import type { GraphEdge, GraphFrontier, GraphNode, GraphRef } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { REL_STATE_TONE, accountLabel, limitationText } from "../shared/labels";
import { KIND_LABEL, EDGE_LABEL, frontierAriaLabel, frontierLabel } from "./graphLabels";
import type { FrontierControl } from "./nodes";
import type { RawPath } from "./types"
;

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

function StepObject({ node, selected, onSelect }: { node: GraphNode | undefined; selected: boolean; onSelect: (ref: GraphRef) => void }) {
  if (!node) return <span className="italic text-(--color-text-muted)">Not loaded</span>;
  const context = node.kind === "statement" ? node.policy : node.account ? accountLabel(node.account) : null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => onSelect(node.ref)}
        aria-pressed={selected}
        className={cn(
          "min-w-0 truncate rounded px-1 text-left font-medium text-(--color-text) outline-none hover:underline focus-visible:ring-2 focus-visible:ring-(--color-primary)",
          selected && "bg-(--color-surface-subtle)",
        )}
        title={node.label}
      >
        {node.label}
      </button>
      <span className="text-xs text-(--color-text-muted)">
        {KIND_LABEL[node.kind]}
        {context ? ` · ${context}` : ""}
      </span>
      {node.state !== "current" ? <StatusBadge tone={REL_STATE_TONE[node.state]}>{node.state}</StatusBadge> : null}
      {node.exclusions?.length ? (
        <span className="rounded bg-(--color-warning-soft) px-1.5 text-[11px] text-(--color-warning-text)">
          except {node.exclusions.map((x) => x.text).join(", ")}
        </span>
      ) : null}
    </span>
  );
}

function edgeWord(e: GraphEdge, statementPolicy: string | undefined, reverse: boolean): string {
  const inverse: Record<GraphEdge["kind"], string> = {
    executes_as: "is the execution identity of",
    task_execution_role: "is the task execution role of",
    member_of: "has member",
    can_assume: "may be assumed by",
    grant: "is declared by",
    target: "is named by statement",
    observed_access: "observed from",
    backed_by_directory: "directory backing",
  };
  const base = reverse ? inverse[e.kind] : EDGE_LABEL[e.kind];
  return e.kind === "grant" && statementPolicy && !reverse ? `${base} ${statementPolicy}` : base;
}

export function PathsList({
  rootName,
  paths,
  nodesByRef,
  frontierByNode,
  truncated,
  boundByMax,
  depthLimited,
  stateOf,
  canLoadMore,
  onExpand,
  onLoadMore,
  onCollapse,
  onRefresh,
  onSelectNode,
  onSelectEdge,
  onTrace,
  selectedRef,
  selectedClaims,
}: {
  rootName: string;
  paths: RawPath[];
  nodesByRef: Map<GraphRef, GraphNode>;
  frontierByNode: Map<GraphRef, GraphFrontier[]>;
  /** The server stopped at a limit: more exists than is loaded. */
  truncated: boolean;
  /** This list stopped at its own path limit. */
  boundByMax: boolean;
  /** A path was cut at the depth limit. */
  depthLimited: boolean;
  stateOf: (f: GraphFrontier) => FrontierControl;
  canLoadMore: (f: GraphFrontier) => boolean;
  onExpand: (f: GraphFrontier) => void;
  onLoadMore: (f: GraphFrontier) => void;
  onCollapse: (f: GraphFrontier) => void;
  onRefresh: () => void;
  onSelectNode: (ref: GraphRef) => void;
  onSelectEdge: (claim: GraphRef) => void;
  /** Trace this path on the canvas. */
  onTrace: (claims: GraphRef[]) => void;
  selectedRef: GraphRef | null;
  selectedClaims: GraphRef[];
}) {
  const [shown, setShown] = useState(50);
  const frontierOf = (ref: GraphRef) => frontierByNode.get(ref) ?? [];
  const frontierControls = (ref: GraphRef) =>
    frontierOf(ref).map((f) => (
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
    ));

  if (paths.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-(--color-text-muted)">No relationships are loaded for {rootName}.</p>;
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-(--color-text-muted)">
        {paths.length} declared {paths.length === 1 ? "path" : "paths"} from {rootName}, over what is loaded. A path is
        configured relationships, not a request that would succeed.
      </p>
      <ol
        aria-label={`Declared paths from ${rootName}`}
        className="space-y-3 text-sm"
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
          buttons[next]?.focus();
        }}
      >
        {paths.slice(0, shown).map((p, i) => {
          const last = p.nodes[p.nodes.length - 1];
          const continues = frontierOf(last).some((f) => !stateOf(f).expanded || canLoadMore(f));
          const cycle = p.edges.some((e) => e.closes_cycle);
          const traced = p.edges.length > 0 && p.edges.every((e) => selectedClaims.includes(e.claim));
          return (
            <li key={i} className={cn("rounded-md border px-3 py-2.5", traced ? "border-(--color-text-muted)" : "border-(--color-border-subtle)")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-(--color-text-muted)">
                  Path {i + 1} · {p.edges.length} {p.edges.length === 1 ? "step" : "steps"}
                  {cycle ? " · ends in a cycle" : continues ? " · continues beyond what is loaded" : ""}
                </p>
                {p.edges.length ? (
                  <Button size="sm" variant="ghost" onClick={() => onTrace(p.edges.map((e) => e.claim))}>
                    <Route className="size-3.5" /> Show on canvas
                  </Button>
                ) : null}
              </div>
              <ol className="space-y-1">
                <li className="flex flex-wrap items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-(--color-text-muted)">1.</span>
                  <StepObject node={nodesByRef.get(p.nodes[0])} selected={selectedRef === p.nodes[0]} onSelect={onSelectNode} />
                  {p.edges.length === 0 ? frontierControls(p.nodes[0]) : null}
                </li>
                {p.edges.map((e, j) => {
                  const to = nodesByRef.get(p.nodes[j + 1]);
                  const policy = to?.kind === "statement" ? to.policy : undefined;
                  const notes = (e.limitations ?? []).filter((l) => l.code !== "effective_access_not_evaluated").map(limitationText);
                  const isLast = j === p.edges.length - 1;
                  return (
                    <li key={e.claim} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 pl-7">
                        <ArrowDown aria-hidden="true" className="size-3.5 shrink-0 text-(--color-text-muted)" />
                        <button
                          type="button"
                          onClick={() => onSelectEdge(e.claim)}
                          aria-pressed={selectedClaims.includes(e.claim)}
                          className={cn(
                            "rounded-full border px-2 py-px text-xs font-medium outline-none hover:bg-(--color-surface-subtle) focus-visible:ring-2 focus-visible:ring-(--color-primary)",
                            selectedClaims.includes(e.claim) ? "border-(--color-primary) text-(--color-primary-text)" : "border-(--color-border-subtle) text-(--color-text-muted)",
                          )}
                        >
                          {edgeWord(e, policy, p.nodes[j] !== e.from)}
                          {e.state !== "current" ? ` · ${e.state}` : ""}
                          {e.closes_cycle ? " · cycle" : ""}
                          {e.crosses_account ? " · other account" : ""}
                        </button>
                        {notes.length ? <span className="text-[11px] text-(--color-warning-text)">{notes.join(" ")}</span> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-(--color-text-muted)">{j + 2}.</span>
                        <StepObject node={to} selected={selectedRef === p.nodes[j + 1]} onSelect={onSelectNode} />
                        {isLast ? frontierControls(p.nodes[j + 1]) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
      {paths.length > shown ? (
        <button type="button" onClick={() => setShown((n) => n + 50)} className="text-sm font-medium text-(--color-primary-text) hover:underline">
          Show more paths ({shown} of {paths.length} loaded)
        </button>
      ) : null}
      {boundByMax ? (
        <p className="text-xs text-(--color-warning-text)">
          This list stopped at its limit of 200 paths, so it is not every path over what is loaded. Open an object's own
          graph to narrow it.
        </p>
      ) : null}
      {depthLimited ? (
        <p className="text-xs text-(--color-warning-text)">Some paths were cut after 12 steps; they continue beyond what is listed.</p>
      ) : null}
      {truncated ? (
        <p className="text-xs text-(--color-warning-text)">
          The server stopped at a limit, so more relationships exist than are loaded — these paths are over what is
          loaded, not a complete answer. Use the Load controls to fetch more.
        </p>
      ) : null}
      {!boundByMax && !depthLimited && !truncated ? (
        <p className="text-xs text-(--color-text-muted)">Every path over what is loaded is listed. Load controls fetch relationships not loaded yet.</p>
      ) : null}
    </div>
  );
}
