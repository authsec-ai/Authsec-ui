/**
 * Wording specific to the graph canvas (SPEC-iga-phase2-graph.md §2.14.11
 * *Wording*). Every relationship word describes configuration or a
 * declaration — never "can access".
 *
 * ECS has two roles and they are not equivalent: the TASK role is what the
 * application code runs as ("runs as"); the task EXECUTION role is used by
 * the ECS agent to pull images and write logs, and its credentials are not
 * available to the containers ("ECS agent uses").
 */

import type { EvidenceLimitation, GraphEdgeKind, GraphFrontier, GraphNodeKind, RelState } from "@/app/api/igaGraphApi";

import { ACCOUNT_KIND_LABEL, IDENTITY_KIND_LABEL, RESOURCE_KIND_LABEL } from "../shared/labels";
import { classifyEdge, edgeClassLabel, grantHonestyText } from "./v2/edgeClass";
import type { VisualEdge, VisualEdgeKind } from "./types";

export const EDGE_LABEL: Record<VisualEdgeKind, string> = {
  executes_as: "runs as",
  task_execution_role: "ECS agent uses",
  member_of: "member of",
  can_assume: "may assume",
  grant: "has statement",
  target: "applies to",
  observed_access: "Observed",
  backed_by_directory: "directory backing",
  // Overview only: identity → resource through a statement (see `summarize`).
  declares: "declares",
};

/** What each relationship means, in one sentence's worth, for the legend and the selection card. */
export const EDGE_MEANING: Record<VisualEdgeKind, string> = {
  executes_as: "The workload is configured to run as this identity. For ECS this is the task role: what the application code runs as.",
  task_execution_role: "ECS uses this role to start the task — pulling images, writing logs. The application does not run as it.",
  member_of: "The user is a member of the group, so the group's policies apply to it.",
  can_assume: "The role's trust policy names this principal. Whether the caller may call sts:AssumeRole was not checked.",
  grant: "A policy attached to the identity contains this statement.",
  target: "The statement lists this resource or pattern.",
  observed_access: "An observation of an action. It is not a declared grant.",
  backed_by_directory: "The local identity is backed by a directory identity. The two stay separate.",
  declares: "A policy statement attached to the identity lists actions on this resource or pattern.",
};

const NOUN: Partial<Record<VisualEdgeKind, [string, string]>> = {
  executes_as: ["workload", "workloads"],
  task_execution_role: ["workload", "workloads"],
  member_of: ["group", "groups"],
  can_assume: ["role", "roles"],
  grant: ["statement", "statements"],
  target: ["resource", "resources"],
  observed_access: ["observation", "observations"],
  backed_by_directory: ["directory backing", "directory backing"],
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
  if (f.direction === "reverse" && f.edge === "executes_as") return n != null ? `Load ${n} ${noun(f.edge, n)} that run as it` : "Load workloads that run as it";
  if (f.direction === "reverse" && f.edge === "task_execution_role")
    return n != null ? `Load ${n} ECS ${noun(f.edge, n)} that use it for setup` : "Load ECS workloads that use it for setup";
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
  local_user: ACCOUNT_KIND_LABEL.local_user,
  local_group: ACCOUNT_KIND_LABEL.local_group,
  k8s_service_account: ACCOUNT_KIND_LABEL.k8s_service_account,
  k8s_group: ACCOUNT_KIND_LABEL.k8s_group,
  ad_user: ACCOUNT_KIND_LABEL.ad_user,
  ad_group: ACCOUNT_KIND_LABEL.ad_group,
  ad_computer: ACCOUNT_KIND_LABEL.ad_computer,
  ad_managed_service_account: ACCOUNT_KIND_LABEL.ad_managed_service_account,
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
  const all = [...e.members.flatMap((m) => m.limitations ?? []), ...(e.summary?.limitations ?? [])];
  for (const l of all)
    if (MARKED.has(l.code) && !seen.has(l.code)) {
      seen.add(l.code);
      out.push(l);
    }
  return out;
}

export function edgeVerb(e: VisualEdge): string {
  const member = e.members[0];
  if (member && classifyEdge(member) === "directory_backing") return "directory backing";
  if (member && classifyEdge(member) === "observed") return edgeClassLabel(member);
  if (e.kind === "declares") {
    // The actions the statements behind the line list, never "can access".
    const actions = [...new Set((e.summary?.statements ?? []).flatMap((st) => st.members.map((m) => m.label)).filter(Boolean))];
    const verb = e.summary?.effect === "deny" ? "denies" : e.summary?.effect === "mixed" ? "allows and denies" : "declares";
    if (!actions.length) return verb;
    const first = actions[0].length > 34 ? `${actions[0].slice(0, 33)}…` : actions[0];
    return `${verb} ${first}${actions.length > 1 ? ` +${actions.length - 1}` : ""}`;
  }
  if (e.kind === "grant" && e.members.length === 1 && (e.targetPolicy ?? e.members[0].policy)) {
    const honesty = member ? grantHonestyText(member) : null;
    const named = `${EDGE_LABEL.grant} ${e.targetPolicy ?? e.members[0].policy}`;
    return honesty ? `${named} · ${honesty}` : named;
  }
  const honesty = member ? grantHonestyText(member) : null;
  return honesty ? `${EDGE_LABEL[e.kind]} · ${honesty}` : EDGE_LABEL[e.kind];
}

/**
 * How many independent claims a line stands for: statements behind a
 * `declares` line (each statement's grant and target are one declaration),
 * otherwise its members.
 */
export function independentCount(e: VisualEdge): number {
  if (e.kind === "declares") return (e.summary?.statements ?? []).reduce((n, st) => n + st.members.length, 0);
  return e.members.length;
}
