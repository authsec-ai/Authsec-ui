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
 * Reading order: a tinted header with the object's CATEGORY (icon, colour
 * and explicit type text — colour never alone), then the name, one line of
 * context, at most two indicators that change how the card should be read,
 * and one compact Load control. Everything else — every indicator's
 * explanation, full identifiers, further Load controls — is in the
 * selection card (`notes`).
 */

import type { GraphFrontier, GraphNode, GraphNodeKind } from "@/app/api/igaGraphApi";

import { RUNTIME_LABEL, accountLabel } from "../shared/labels";
import { KIND_LABEL, dominantRelState, frontierLabel, mixedStateText } from "./graphLabels";
import type { VisualNode } from "./types";

export const NODE_WIDTH = 240;
/** 1px border top and bottom: the card is border-box. */
const BORDER = 2;
const HEADER = 24;
const BODY_PAD_TOP = 6;
const BODY_PAD_BOTTOM = 8;
const TITLE = 20;
const LINE = 16;
const INDICATORS = 20;
const FRONTIER_ROW = 20;
/** Load controls drawn on the card; the rest are in the selection card. */
export const MAX_FRONTIER_ROWS = 1;
/** Indicators drawn on the card; all of them are in the selection card. */
const MAX_BADGES = 2;

export type IndicatorTone = "neutral" | "warning" | "info";

export interface Indicator {
  key: string;
  /** Short chip text. */
  text: string;
  /** The full statement, for the accessible name and the tooltip. */
  long: string;
  tone: IndicatorTone;
}

export type NodeIcon = "workload" | "role" | "user" | "group" | "external" | "statement" | "resource" | "selector" | "wildcard" | "more";

/**
 * What KIND of thing a card is — drawn with the `--color-object-*` tokens.
 * Never a status: a resource's colour says it is a resource, not that it is
 * safe, exposed or reachable.
 */
export type NodeCategory = "workload" | "identity" | "resource" | "statement" | "external";

export interface NodeDescription {
  icon: NodeIcon;
  category: NodeCategory;
  title: string;
  /** Explicit type text in the header: "Identity · Role", "Resource · Selector". */
  type: string;
  /** Null when no line of context applies — never a made-up value. */
  context: string | null;
  /** Drawn on the card: at most two, the ones that change how it reads. */
  indicators: Indicator[];
  /** Every indicator, for the selection card. */
  notes: Indicator[];
  /** Expansion rows drawn on the card, in server order. */
  frontier: GraphFrontier[];
  /** Expansion entries not drawn on the card (offered in the inspector). */
  frontierHidden: number;
  /** A selector that matches everything (`*`): drawn as a red, dashed "All resources" card (G-06). */
  wildcard?: boolean;
}

const SERVICE_NAME: Record<string, string> = {
  s3: "S3", ec2: "EC2", iam: "IAM", lambda: "Lambda", dynamodb: "DynamoDB", sqs: "SQS", sns: "SNS",
  kms: "KMS", secretsmanager: "Secrets Manager", ssm: "Systems Manager", ecs: "ECS", ecr: "ECR",
  rds: "RDS", logs: "CloudWatch Logs", bedrock: "Bedrock", sts: "STS", states: "Step Functions",
};

/**
 * The card title for a wildcard: "All resources" only for a bare `*`. An ARN
 * wildcard is bounded by its service, so it says which ("All S3 resources").
 */
export function wildcardTitle(text: string): string {
  const svc = text.trim().split(":")[2];
  if (!svc || svc === "*") return "All resources";
  return `All ${SERVICE_NAME[svc] ?? svc} resources`;
}

/** A selector whose pattern matches every resource: `*`, or an ARN whose resource part is only `*`. */
export function isWildcardPattern(text: string): boolean {
  const t = text.trim();
  return t === "*" || /^arn:[^:]*:[^:]*:[^:]*:[^:]*:\*$/.test(t) || /^arn:[^:]*:[^:]*:::\*$/.test(t);
}

/** Characters of the card title that fit on one line (13px semibold in a 240px card). */
const TITLE_CHARS_PER_LINE = 28;

/** How many lines the card title takes: two at most, so a long name is never cut to one (G-05). */
export function titleLines(title: string): 1 | 2 {
  return title.length > TITLE_CHARS_PER_LINE ? 2 : 1;
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

const CATEGORY_OF: Record<GraphNodeKind, NodeCategory> = {
  workload: "workload",
  iam_role: "identity",
  iam_user: "identity",
  iam_group: "identity",
  external_principal: "external",
  statement: "statement",
  exact: "resource",
  selector: "resource",
  external: "external",
};

const SUBTYPE: Partial<Record<GraphNodeKind, string>> = {
  // The header names the kind of thing in AWS's own words, so the name under
  // it reads as "this IAM role is called …".
  iam_role: "Identity · IAM role",
  iam_user: "Identity · IAM user",
  iam_group: "Identity · IAM group",
  exact: "Resource · Specific resource",
  selector: "Resource · Pattern",
  external: "Resource · Outside connected accounts",
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
/** "AWS account prod (4294…)" — the line says what the number is. */
function accountLine(node: GraphNode): string {
  return node.account ? `AWS account ${accountLabel(node.account)}` : "AWS account not known";
}

/** "lambda_function" → "Lambda function". */
function typeWords(type: string): string {
  const t = type.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * The card's second line, every value named for what it is: an account is
 * "AWS account …", a statement's policy is "Policy …". A bare 12-digit number
 * under a name left the reader to guess what it was.
 */
function contextOf(node: GraphNode): string | null {
  switch (node.kind) {
    case "workload":
    case "iam_role":
    case "iam_user":
    case "iam_group":
      return accountLine(node);
    case "external_principal":
      // Only AWS principals have an account; for a service or an identity
      // provider the issuer or subject is the context, not "Unknown account".
      return node.account ? accountLine(node) : node.issuer ? `Issuer ${node.issuer}` : node.subject ? `Subject ${node.subject}` : null;
    case "statement":
      return [node.policy ? `Policy ${node.policy}` : null, node.sid ? `Sid ${node.sid}` : null].filter(Boolean).join(" · ") || null;
    default:
      // A resource's account is stated only when the reference names one.
      return [node.type && node.type !== "unknown" ? typeWords(node.type) : null, node.account ? accountLine(node) : null]
        .filter(Boolean)
        .join(" · ") || null;
  }
}

function typeOf(v: VisualNode): string {
  const first = v.members[0];
  if (first.kind === "workload") return first.runtime_kind ? `Workload · ${RUNTIME_LABEL[first.runtime_kind]}` : "Workload";
  if (first.kind === "statement") {
    const effect = first.effect === "deny" ? "Deny" : first.effect === "allow" ? "Allow" : null;
    return [v.members.length > 1 ? `${v.members.length} statements` : "Statement", effect].filter(Boolean).join(" · ");
  }
  if (first.kind === "external_principal") return first.mechanism ? `External principal · ${first.mechanism.replace(/_/g, " ")}` : "External principal";
  return SUBTYPE[first.kind] ?? KIND_LABEL[first.kind];
}

/** The indicators worth a place on the card, in the order they matter. */
const BADGE_ORDER = ["state", "account", "resolution", "except", "deny", "coverage"];

export function describeNode(v: VisualNode, rootAccountId: string | null): NodeDescription {
  const first = v.members[0];

  if (v.overflow) {
    const o = v.overflow;
    const shown = o.hidden.reduce((n, h) => n + h.members.length, 0);
    return {
      icon: "more",
      category: CATEGORY_OF[first.kind],
      title: o.infrastructure ? "ECS agent permissions" : `+${shown} more ${plural(first.kind, shown)}`,
      type: o.infrastructure ? "Supporting infrastructure · folded" : "Folded in this view",
      context: o.infrastructure
        ? `${shown} loaded · select to review`
        : o.moreNotLoaded
          ? "Loaded · more not fetched yet"
          : o.beyond
            ? `Loaded · ${o.beyond} more beyond`
            : "Loaded · select to review",
      indicators: [],
      notes: [],
      frontier: [],
      frontierHidden: 0,
    };
  }

  if (first.kind === "workload" && v.members.length > 1) {
    return {
      icon: "workload",
      category: "workload",
      title: `${v.members.length} workloads`,
      type: "Workloads · one shared identity",
      context: first.account ? accountLabel(first.account) : null,
      indicators: [],
      notes: [],
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
      text: `${n} direct workload${usedBy.value === 1 ? "" : "s"}`,
      long: usedBy.value == null
        ? "Bound to workloads directly; the count is not known"
        : `${usedBy.exact ? "" : "At least "}${usedBy.value} direct workload binding${usedBy.value === 1 ? "" : "s"} (runs as it, or its ECS agent uses it)`,
      tone: "neutral",
    });
  }

  if (v.members.some((m) => m.limitations?.some((l) => l.code === "surface_stale" || l.code === "surface_partial" || l.code === "surface_denied")))
    indicators.push({ key: "coverage", text: "coverage gap", long: "The collection that reads this was incomplete", tone: "warning" });

  const badges = [...indicators]
    .filter((i) => BADGE_ORDER.includes(i.key))
    .sort((a, b) => BADGE_ORDER.indexOf(a.key) - BADGE_ORDER.indexOf(b.key))
    .slice(0, MAX_BADGES);
  const wildcard = first.kind === "selector" && v.members.length === 1 && isWildcardPattern(first.text ?? first.label);
  return {
    icon: wildcard ? "wildcard" : ICON_OF[first.kind],
    category: CATEGORY_OF[first.kind],
    title: wildcard ? wildcardTitle(first.text ?? first.label) : first.label,
    type: wildcard ? `Resource · Wildcard (${first.text ?? first.label})` : typeOf(v),
    wildcard,
    context: v.members.length > 1 && first.kind === "statement"
      ? [...new Set(v.members.map((m) => m.policy).filter(Boolean))].join(", ") || null
      : contextOf(first),
    indicators: badges,
    notes: indicators,
    frontier: v.frontier.slice(0, MAX_FRONTIER_ROWS),
    frontierHidden: Math.max(0, v.frontier.length - MAX_FRONTIER_ROWS),
  };
}

/** The card's exact size: the layout reserves this, and the card is drawn at it. */
export function nodeSize(d: NodeDescription): { width: number; height: number } {
  let h = BORDER + HEADER + BODY_PAD_TOP + TITLE * titleLines(d.title) + BODY_PAD_BOTTOM;
  if (d.context) h += LINE;
  if (d.indicators.length) h += INDICATORS;
  if (d.frontier.length || d.frontierHidden) h += FRONTIER_ROW;
  return { width: NODE_WIDTH, height: h };
}

/** Everything the card shows, as one sentence, for its accessible name. */
export function nodeAriaLabel(d: NodeDescription): string {
  return [
    d.title,
    d.type,
    d.context,
    ...d.notes.map((i) => i.long),
    ...d.frontier.map((f) => frontierLabel(f)),
    d.frontierHidden ? `${d.frontierHidden} more expansion${d.frontierHidden === 1 ? "" : "s"} in the inspector` : null,
  ]
    .filter(Boolean)
    .join(", ");
}
