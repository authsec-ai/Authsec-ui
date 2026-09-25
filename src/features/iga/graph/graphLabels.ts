/**
 * Wording and layout vocabulary specific to the graph canvas
 * (SPEC-iga-phase2-graph.md §2.14.11 *Wording*).
 *
 * Edge labels are ONLY "configured to run as", "may assume", "granted by",
 * "names" — never "can access", never "uses". `member_of` is structural
 * ("member of"), not a claim about access, so it is not one of the four.
 */

import type { EvidenceLimitation, GraphEdgeKind, GraphFrontier, GraphNodeKind, RelState } from "@/app/api/igaGraphApi";

import { IDENTITY_KIND_LABEL, RESOURCE_KIND_LABEL } from "../shared/labels";
import type { VisualEdge } from "./types";

export const EDGE_LABEL: Record<GraphEdgeKind, string> = {
  executes_as: "configured to run as",
  task_execution_role: "configured to run as",
  member_of: "member of",
  can_assume: "may assume",
  grant: "granted by",
  target: "names",
};

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
 * The expand control's label (§2.14.11 *Controls*): relationships the server
 * has NOT sent yet, so every label starts "Load" — never confused with the
 * loaded ones the canvas folds into "+N more" (`discloseVisual`). The count
 * appears only when the server counted exactly. A workload reached in
 * reverse through `executes_as` reads as the workloads that run as it; a
 * forward `can_assume` as the roles it may assume.
 */
export function frontierLabel(f: GraphFrontier): string {
  const n = f.more.exact && f.more.count != null ? f.more.count : null;
  const isUsedBy = f.direction === "reverse" && (f.edge === "executes_as" || f.edge === "task_execution_role");
  if (isUsedBy) return n != null ? `Load ${n} ${noun(f.edge, n)} that run as it` : "Load workloads that run as it";
  if (f.edge === "can_assume" && f.direction === "forward") return n != null ? `Load ${n} ${noun(f.edge, n)} it may assume` : "Load roles it may assume";
  if (f.edge === "can_assume") return n != null ? `Load ${n} that may assume it` : "Load what may assume it";
  return n != null ? `Load ${n} more ${noun(f.edge, n)}` : `Load more ${noun(f.edge, null)}`;
}

export function frontierAriaLabel(f: GraphFrontier): string {
  return `${frontierLabel(f)} (not loaded yet)`;
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

/**
 * Limitations that qualify THIS relationship and so earn a marker on it.
 * The ones true of every declared relationship (effective access not
 * evaluated, a named resource not confirmed to exist, the caller's own
 * sts:AssumeRole not checked) are stated once, in the toolbar and the
 * inspector, not repeated on every line.
 */
const MARKED: ReadonlySet<EvidenceLimitation["code"]> = new Set<EvidenceLimitation["code"]>([
  "conditions_not_evaluated",
  "negated_statement",
  "deny_statements_present",
  "permissions_boundary_present",
  "resource_policy_not_projected",
  "not_principal_unresolved",
  "surface_stale",
  "surface_partial",
  "surface_denied",
]);

export function markedLimitations(e: VisualEdge): EvidenceLimitation[] {
  const seen = new Set<string>();
  const out: EvidenceLimitation[] = [];
  for (const m of e.members)
    for (const l of m.limitations ?? [])
      if (MARKED.has(l.code) && !seen.has(l.code)) {
        seen.add(l.code);
        out.push(l);
      }
  return out;
}

export function edgeVerb(e: VisualEdge): string {
  if (e.kind === "grant" && e.members.length === 1 && (e.targetPolicy ?? e.members[0].policy))
    return `${EDGE_LABEL.grant} ${e.targetPolicy ?? e.members[0].policy}`;
  return EDGE_LABEL[e.kind];
}
