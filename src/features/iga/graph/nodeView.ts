/**
 * What a graph card says, and therefore how tall it is
 * (SPEC-iga-phase2-graph.md §2.14.15 *Node sizing*).
 *
 * ONE description drives both the card (`nodes.tsx`) and the layout
 * (`layout.ts`): the card renders exactly these rows, each clamped to one
 * line, at the height `nodeSize` returns. The layout is therefore never told
 * one size while the card draws another — the mismatch that made cards with
 * extra badges or expansion rows overlap their neighbours.
 *
 * Reading order: name or action summary, object type, one line of context,
 * then compact indicators and expansion controls. Full identifiers live in
 * the inspector; a truncated line keeps its full text in `title` and in the
 * card's accessible name.
 */

import type { GraphFrontier, GraphNode, GraphNodeKind } from "@/app/api/igaGraphApi";

import { RUNTIME_LABEL, accountLabel } from "../shared/labels";
import { KIND_LABEL, dominantRelState, frontierLabel, mixedStateText } from "./graphLabels";
import type { VisualNode } from "./types";

export const NODE_WIDTH = 248;
const PAD_Y = 10;
/** 1px border top and bottom: the card is border-box. */
const BORDER = 2;
const TITLE = 20;
const LINE = 16;
const INDICATORS = 22;
const FRONTIER_ROW = 20;
const FRONTIER_GAP = 4;
/** Expansion rows drawn on the card; any further ones are offered in the inspector. */
export const MAX_FRONTIER_ROWS = 2;

export type IndicatorTone = "neutral" | "warning" | "info";

export interface Indicator {
  key: string;
  /** Short chip text. */
  text: string;
  /** The full statement, for the accessible name and the tooltip. */
  long: string;
  tone: IndicatorTone;
}

export type NodeIcon = "workload" | "role" | "user" | "group" | "external" | "statement" | "resource" | "selector" | "more";

export interface NodeDescription {
  icon: NodeIcon;
  title: string;
  type: string;
  /** Null when no line of context applies — never a made-up value. */
  context: string | null;
  indicators: Indicator[];
  /** Expansion rows drawn on the card, in server order. */
  frontier: GraphFrontier[];
  /** Expansion entries not drawn on the card (offered in the inspector). */
  frontierHidden: number;
}

const ICON_OF: Record<GraphNodeKind, NodeIcon> = {
  workload: "workload",
  iam_role: "role",
  iam_user: "user",
  iam_group: "group",
  external_principal: "external",
  statement: "statement",
  exact: "resource",
  selector: "selector",
  external: "resource",
};

const NOUN_OF: Partial<Record<GraphNodeKind, [string, string]>> = {
  statement: ["statement", "statements"],
  iam_role: ["role", "roles"],
  iam_user: ["user", "users"],
  iam_group: ["group", "groups"],
  workload: ["workload", "workloads"],
  exact: ["resource", "resources"],
  selector: ["selector", "selectors"],
  external: ["resource", "resources"],
  external_principal: ["principal", "principals"],
};

function plural(kind: GraphNodeKind, n: number) {
  const [one, many] = NOUN_OF[kind] ?? ["item", "items"];
  return n === 1 ? one : many;
}

/**
 * Where the node's account stands relative to the graph's starting object.
 * Three different facts, never merged: another connected account, an
 * account AuthSec cannot read, or no account on record at all.
 */
function accountIndicator(node: GraphNode, rootAccountId: string | null): Indicator | null {
  const a = node.account;
  if (!a) return null;
  if (!a.connected)
    return { key: "account", text: "not connected", long: `Account ${a.id} is not connected, so nothing about it could be read`, tone: "warning" };
  if (rootAccountId && a.id !== rootAccountId)
    return { key: "account", text: "other account", long: `In another connected account, ${a.id}`, tone: "info" };
  return null;
}

/** The line of context under the type, or null when none applies. */
function contextOf(node: GraphNode): string | null {
  switch (node.kind) {
    case "workload":
      return node.account ? accountLabel(node.account) : "Account not known";
    case "iam_role":
    case "iam_user":
    case "iam_group":
      return node.account ? accountLabel(node.account) : "Account not known";
    case "external_principal":
      // Only AWS principals have an account; for a service or an identity
      // provider the issuer or subject is the context, not "Unknown account".
      return node.account ? accountLabel(node.account) : node.issuer ?? node.subject ?? null;
    case "statement":
      return [node.policy, node.sid ? `Sid ${node.sid}` : null].filter(Boolean).join(" · ") || null;
    default:
      // A resource's account is stated only when the reference names one.
      return [node.type && node.type !== "unknown" ? node.type.replace(/_/g, " ") : null, node.account ? accountLabel(node.account) : null]
        .filter(Boolean)
        .join(" · ") || null;
  }
}

function typeOf(v: VisualNode): string {
  const first = v.members[0];
  if (first.kind === "workload") return first.runtime_kind ? `Workload · ${RUNTIME_LABEL[first.runtime_kind]}` : "Workload";
  if (first.kind === "statement") {
    const effect = first.effect === "deny" ? "Deny" : first.effect === "allow" ? "Allow" : null;
    return [v.members.length > 1 ? `${v.members.length} statements, same grant` : "Statement", effect].filter(Boolean).join(" · ");
  }
  if (first.kind === "external_principal" && first.mechanism) return `External · ${first.mechanism.replace(/_/g, " ")}`;
  return KIND_LABEL[first.kind];
}

export function describeNode(v: VisualNode, rootAccountId: string | null): NodeDescription {
  const first = v.members[0];

  if (v.overflow) {
    const o = v.overflow;
    const shown = o.hidden.reduce((n, h) => n + h.members.length, 0);
    return {
      icon: "more",
      title: `+${shown} more ${plural(first.kind, shown)}`,
      type: "Hidden in this view",
      context: o.moreNotLoaded ? "Loaded · more not fetched yet" : o.beyond ? `Loaded · ${o.beyond} more beyond` : "Loaded · select to review",
      indicators: [],
      frontier: [],
      frontierHidden: 0,
    };
  }

  if (first.kind === "workload" && v.members.length > 1) {
    return {
      icon: "workload",
      title: `${v.members.length} workloads`,
      type: "Workloads sharing one identity",
      context: first.account ? accountLabel(first.account) : null,
      indicators: [],
      frontier: v.frontier.slice(0, MAX_FRONTIER_ROWS),
      frontierHidden: Math.max(0, v.frontier.length - MAX_FRONTIER_ROWS),
    };
  }

  const indicators: Indicator[] = [];
  const state = dominantRelState(v.members.map((m) => m.state ?? "current"));
  const mixed = v.members.length > 1 ? mixedStateText(v.members.map((m) => m.state ?? "current")) : null;
  if (mixed) indicators.push({ key: "state", text: mixed, long: mixed, tone: "warning" });
  else if (state === "stale") indicators.push({ key: "state", text: "stale", long: "Not reconfirmed by the latest scan", tone: "warning" });
  else if (state === "ended") indicators.push({ key: "state", text: "ended", long: "No longer present", tone: "neutral" });

  const acct = accountIndicator(first, rootAccountId);
  if (acct) indicators.push(acct);

  if (v.members.some((m) => m.restrictions?.permissions_boundary))
    indicators.push({ key: "boundary", text: "boundary", long: "A permissions boundary is recorded; it was not evaluated", tone: "warning" });
  const deny = Math.max(0, ...v.members.map((m) => m.restrictions?.deny_statements ?? 0));
  if (deny > 0) indicators.push({ key: "deny", text: `${deny} deny`, long: `${deny} Deny statement${deny === 1 ? "" : "s"} recorded; not evaluated`, tone: "warning" });

  const exclusions = v.members.flatMap((m) => m.exclusions ?? []);
  if (exclusions.length)
    indicators.push({ key: "except", text: `except ${exclusions.length}`, long: `All resources except ${exclusions.map((x) => x.text).join(", ")}`, tone: "warning" });

  if (first.kind === "external_principal" && first.account && !first.account.connected) {
    // already said by the account indicator
  } else if (first.kind === "external_principal" && first.resolution && first.resolution.state !== "resolved") {
    indicators.push({ key: "resolution", text: "unresolved", long: `Not resolved to a known identity (${first.resolution.state.replace(/_/g, " ")})`, tone: "neutral" });
  }

  // Direct bindings only: workloads configured to run as this identity, not
  // everything that reaches it through a chain of roles.
  const usedBy = first.used_by_count;
  if (usedBy && usedBy.value !== 0) {
    const n = usedBy.value == null ? "some" : `${usedBy.exact ? "" : "≥"}${usedBy.value}`;
    indicators.push({
      key: "used-by",
      text: `run as by ${n}`,
      long: usedBy.value == null ? "Run as by workloads directly; the count is not known" : `${usedBy.exact ? "" : "At least "}${usedBy.value} workload${usedBy.value === 1 ? "" : "s"} configured to run as it directly`,
      tone: "neutral",
    });
  }

  if (v.members.some((m) => m.limitations?.some((l) => l.code === "surface_stale" || l.code === "surface_partial" || l.code === "surface_denied")))
    indicators.push({ key: "coverage", text: "coverage gap", long: "The collection that reads this was incomplete", tone: "warning" });

  return {
    icon: ICON_OF[first.kind],
    title: first.label,
    type: typeOf(v),
    context: v.members.length > 1 && first.kind === "statement"
      ? [...new Set(v.members.map((m) => m.policy).filter(Boolean))].join(", ") || null
      : contextOf(first),
    indicators,
    frontier: v.frontier.slice(0, MAX_FRONTIER_ROWS),
    frontierHidden: Math.max(0, v.frontier.length - MAX_FRONTIER_ROWS),
  };
}

/** The card's exact size: the layout reserves this, and the card is drawn at it. */
export function nodeSize(d: NodeDescription): { width: number; height: number } {
  let h = BORDER + PAD_Y * 2 + TITLE + LINE;
  if (d.context) h += LINE;
  if (d.indicators.length) h += INDICATORS;
  const rows = d.frontier.length + (d.frontierHidden ? 1 : 0);
  if (rows) h += FRONTIER_GAP + rows * FRONTIER_ROW;
  return { width: NODE_WIDTH, height: h };
}

/** Everything the card shows, as one sentence, for its accessible name. */
export function nodeAriaLabel(d: NodeDescription): string {
  return [
    d.title,
    d.type,
    d.context,
    ...d.indicators.map((i) => i.long),
    ...d.frontier.map((f) => frontierLabel(f)),
    d.frontierHidden ? `${d.frontierHidden} more expansion${d.frontierHidden === 1 ? "" : "s"} in the inspector` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
