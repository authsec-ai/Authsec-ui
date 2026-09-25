/**
 * Wording and layout vocabulary specific to the graph canvas
 * (SPEC-iga-phase2-graph.md §2.14.11 *Wording*, §2.14.15 *Layout stability*).
 *
 * Edge labels are ONLY "configured to run as", "may assume", "granted by",
 * "names" — never "can access", never "uses". `member_of` is structural
 * ("member of"), not a claim about access, so it is not one of the four.
 */

import type { GraphEdgeKind, GraphFrontier, GraphNodeKind, RelState } from "@/app/api/igaGraphApi";

import { IDENTITY_KIND_LABEL, RESOURCE_KIND_LABEL } from "../shared/labels";

export const EDGE_LABEL: Record<GraphEdgeKind, string> = {
  executes_as: "configured to run as",
  task_execution_role: "configured to run as",
  member_of: "member of",
  can_assume: "may assume",
  grant: "granted by",
  target: "names",
};

/** Fixed columns by node kind, left to right (§2.14.15 *Layout stability*, point 1). */
export const COLUMN_OF: Record<GraphNodeKind, number> = {
  workload: 0,
  iam_role: 1,
  iam_user: 1,
  iam_group: 1,
  external_principal: 1,
  statement: 2,
  exact: 3,
  selector: 3,
  external: 3,
};

export const COLUMN_COUNT = 4;

const NOUN: Partial<Record<GraphEdgeKind, [string, string]>> = {
  executes_as: ["workload", "workloads"],
  task_execution_role: ["workload", "workloads"],
  member_of: ["group", "groups"],
  can_assume: ["role", "roles"],
  grant: ["statement", "statements"],
  target: ["resource", "resources"],
};

function noun(edge: GraphEdgeKind, count: number | null): string {
  const pair = NOUN[edge] ?? ["item", "items"];
  return count === 1 ? pair[0] : pair[1];
}

/**
 * The expand control's label (§2.14.11 *Controls*, §2.14.15 *Components*):
 * "+3 roles" when the count is exact, "+ more" otherwise. A workload reached
 * in reverse through `executes_as`/`task_execution_role` reads "Used by N
 * workloads" — the count named on the identity node itself (§2.14.11's
 * question "which other workloads share that identity?"). `can_assume` uses
 * the Budgets section's own wording verbatim: "may assume more roles —
 * expand" (with the count only when the server counted it exactly).
 */
export function frontierLabel(f: GraphFrontier): string {
  const isUsedBy =
    f.direction === "reverse" && (f.edge === "executes_as" || f.edge === "task_execution_role");
  if (isUsedBy) {
    if (!f.more.exact) return "Used by workloads — expand";
    return `Used by ${f.more.count} ${noun(f.edge, f.more.count)}`;
  }
  if (f.edge === "can_assume" && f.direction === "forward") {
    if (!f.more.exact) return "may assume more roles — expand";
    return `may assume ${f.more.count} more ${noun(f.edge, f.more.count)} — expand`;
  }
  if (!f.more.exact) return "+ more";
  return `+${f.more.count} ${noun(f.edge, f.more.count)}`;
}

export function frontierAriaLabel(f: GraphFrontier): string {
  return `Expand: ${frontierLabel(f)}`;
}

/**
 * A group's own lifecycle badge (§2.14.11 *Grouped edges*: "Line style
 * follows the most-current member"): current beats stale beats ended, never
 * just the first member in whatever order the map happened to iterate.
 */
export function dominantRelState(states: RelState[]): RelState {
  if (states.some((s) => s === "current")) return "current";
  if (states.some((s) => s === "stale")) return "stale";
  return "ended";
}

/**
 * The mixed-state text for a group (*"1 current · 1 ended"*). `stale` and
 * `ended` are never conflated — each gets its own count — and nothing is
 * shown when every member agrees.
 */
export function mixedStateText(states: RelState[]): string | null {
  if (states.length < 2) return null;
  const counts: Record<RelState, number> = { current: 0, stale: 0, ended: 0 };
  for (const s of states) counts[s]++;
  if (Object.values(counts).filter((n) => n > 0).length < 2) return null;
  return (["current", "stale", "ended"] as const)
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${k}`)
    .join(" · ");
}

/** What each node kind is called on the canvas and in the side panel. */
export const KIND_LABEL: Record<GraphNodeKind, string> = {
  workload: "Workload",
  iam_role: IDENTITY_KIND_LABEL.iam_role,
  iam_user: IDENTITY_KIND_LABEL.iam_user,
  iam_group: IDENTITY_KIND_LABEL.iam_group,
  external_principal: IDENTITY_KIND_LABEL.external_principal,
  statement: "Statement",
  exact: RESOURCE_KIND_LABEL.exact,
  selector: RESOURCE_KIND_LABEL.selector,
  external: RESOURCE_KIND_LABEL.external,
};
