/**
 * What a workload's DECLARED access amounts to, said in a reader's words.
 *
 * The API gives raw facts per grant — a resource (`kind`, `text`), a statement's
 * `actions` / `not_actions` strings — and nothing that says "read", "write" or
 * "broad". This module derives those from the strings, on the client, and is
 * the one place the rules live so they can be tested and tightened together.
 *
 * Everything here is INFERRED from names. It is not an evaluation: conditions,
 * Deny statements, permissions boundaries and resource policies are not
 * combined with the grants, and callers must keep saying so ("declared access,
 * not evaluated"). A level of `other` means "we could not tell from the
 * action's name" — it is never rounded down to `read`.
 *
 * Pure: no React, no network. Types only from the API module.
 */

import type { GrantLine, ResourceSummary, WorkloadResourceRow } from "@/app/api/igaGraphApi";

/* --------------------------------- scope ---------------------------------- */

/** How much of the world a grant's resource names. */
export type AccessScope =
  /** `*`, or every resource of one type (`…:log-group:*`, `…:table/*`). */
  | "all"
  /** A wildcard narrowed by something fixed (`bucket/attachments/*`). */
  | "pattern"
  /** One named resource. */
  | "specific"
  /** An account AuthSec is not connected to, or an ARN that did not resolve. */
  | "other_account";

export const SCOPE_LABEL: Record<AccessScope, string> = {
  // Covers both `*` (everything) and `…:table/*` (every table), so it names neither.
  all: "All resources (wildcard)",
  pattern: "Resource pattern",
  specific: "Specific resource",
  other_account: "Other account or unresolved",
};

export const SCOPE_MEANING: Record<AccessScope, string> = {
  all: "The permission is not limited to a named resource: a wildcard covers every resource of a type, or, for `*`, every resource there is.",
  pattern: "The permission applies to every resource matching a pattern, such as everything under a path.",
  specific: "The permission names exactly one resource.",
  other_account: "The resource is in an account that is not connected, or its ARN could not be resolved.",
};

/**
 * The part of an ARN after the fifth colon: what the service itself calls the
 * resource. Null when the text is not an ARN.
 */
function arnResource(text: string): { service: string; resource: string } | null {
  const parts = text.split(":");
  if (parts.length < 6 || parts[0] !== "arn") return null;
  return { service: parts[2], resource: parts.slice(5).join(":") };
}

export function accessScope(r: Pick<ResourceSummary, "kind" | "text">): AccessScope {
  if (r.kind === "external") return "other_account";
  const text = r.text.trim();
  if (text === "*") return "all";
  if (r.kind === "exact") return "specific";

  const arn = arnResource(text);
  if (arn) {
    // `arn:aws:s3:::*`, `arn:aws:sqs:…:*`
    if (arn.resource === "*") return "all";
    // `…:log-group:*` — one type word, then a wildcard: every resource of the
    // type. `…:table/*` likewise. S3 is excluded from the `/` form: there the
    // word before the slash is a BUCKET NAME the owner chose, so `bucket/*` is
    // "everything in one bucket", a pattern, not "every bucket".
    if (/^[A-Za-z0-9_.-]+:\*$/.test(arn.resource)) return "all";
    if (arn.service !== "s3" && /^[A-Za-z0-9_.-]+\/\*$/.test(arn.resource)) return "all";
  }
  return "pattern";
}

/* --------------------------------- level ---------------------------------- */

/** Highest wins: read < write < full. `other` is "could not tell". */
export type AccessLevel = "read" | "write" | "full" | "other";

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  read: "Read",
  write: "Write",
  full: "Full access",
  other: "Other",
};

export const LEVEL_MEANING: Record<AccessLevel, string> = {
  read: "Only actions whose names read or list (Get…, List…, Describe…).",
  write: "Includes actions whose names create, change, delete or run something.",
  full: "Every action of the service, or every action except a few.",
  other: "Includes actions we could not classify from their names, such as iam:PassRole or sts:AssumeRole. Not assumed to be read-only.",
};

const READ_VERB = /^(Get|List|Describe|Head|BatchGet|Query|Scan|Search|Lookup|View|Read|Select|Check)/;
const WRITE_VERB =
  /^(Put|Create|Update|Delete|Remove|Attach|Detach|Add|Set|Modify|Start|Stop|Terminate|Run|Invoke|Send|Publish|Tag|Untag|Write|Reboot|Restore|Import|Register|Deregister|Associate|Disassociate|Enable|Disable|Revoke|Authorize|Rotate|Cancel|Execute|Upload|Copy|Replace|Reset|Change|Batch(Write|Put|Delete|Update))/;

/** `s3:GetObject` → `s3`; `*` → null. */
export function serviceOfAction(action: string): string | null {
  const i = action.indexOf(":");
  return i > 0 ? action.slice(0, i).toLowerCase() : null;
}

function levelOfAction(action: string): AccessLevel {
  if (action === "*") return "full";
  const i = action.indexOf(":");
  const verb = i >= 0 ? action.slice(i + 1) : action;
  if (verb === "*") return "full";
  // `GetObject*`, `List*`: a verb-prefix wildcard stays at the verb's level.
  if (WRITE_VERB.test(verb)) return "write";
  if (READ_VERB.test(verb)) return "read";
  return "other";
}

/** Highest wins. Exported so every view of a service ranks levels the same way. */
export const LEVEL_RANK: Record<AccessLevel, number> = { read: 0, other: 1, write: 2, full: 3 };

/**
 * The level of a set of actions. `not_actions` means "everything except", which
 * is broader than anything listed, so it is full access whatever else is there.
 *
 * Mixed read and unclassifiable is `other`, not `read`: if one action's effect
 * is unknown the set cannot be called read-only.
 */
export function accessLevel(actions: string[], notActions: string[] = []): AccessLevel {
  if (notActions.length) return "full";
  let level: AccessLevel = "read";
  if (!actions.length) return "other";
  for (const a of actions) {
    const l = levelOfAction(a);
    if (LEVEL_RANK[l] > LEVEL_RANK[level]) level = l;
  }
  return level;
}

/* --------------------------------- broad ---------------------------------- */

/**
 * "Broad": the permission is not limited to anything named. That is a grant on
 * `all` of a type, or full access to a service — read on every secret is broad
 * as much as write on every log group.
 *
 * A PREFIX PATTERN (`bucket/attachments/*`) is deliberately NOT broad: it is
 * narrowed by something fixed. Flagging every wildcard would make "broad"
 * mean "has a `*` in it", and the flag would stop meaning anything. Tighten
 * this one function, not its callers, if that turns out to be too lenient.
 */
export function isBroad(scope: AccessScope, level: AccessLevel): boolean {
  return scope === "all" || level === "full";
}

/* ------------------------------- full admin ------------------------------- */

/** An action pattern that names every action of every service. */
function isEveryAction(a: string): boolean {
  return a === "*" || a === "*:*";
}

/**
 * Allow every action on every resource — `Allow * on *`, administrator access
 * with nothing narrowing it (X-06). Deliberately literal: a NotAction or a
 * service-wide `s3:*` is already "broad"; this is the one shape that deserves a
 * red flag of its own on the page header.
 *
 * "Nothing narrowing it" is checked, not assumed: a condition, a NotResource
 * exclusion, or a statement that is no longer current is not flagged.
 */
export function isFullAdmin(s: {
  effect: "allow" | "deny";
  actions: string[];
  resources: string[];
  conditional?: boolean;
  excluded?: boolean;
  current?: boolean;
}): boolean {
  if (s.effect !== "allow" || s.conditional || s.excluded || s.current === false) return false;
  return s.actions.some(isEveryAction) && s.resources.some((r) => r === "*");
}

/* --------------------------------- summary -------------------------------- */

export const SERVICE_LABEL: Record<string, string> = {
  s3: "S3",
  secretsmanager: "Secrets Manager",
  ssm: "Systems Manager (SSM)",
  logs: "CloudWatch Logs",
  cloudwatch: "CloudWatch",
  dynamodb: "DynamoDB",
  sqs: "SQS",
  sns: "SNS",
  kms: "KMS",
  iam: "IAM",
  sts: "STS",
  ec2: "EC2",
  lambda: "Lambda",
  ecr: "ECR",
  ecs: "ECS",
  eks: "EKS",
  bedrock: "Bedrock",
  "bedrock-agentcore": "Bedrock AgentCore",
  events: "EventBridge",
  states: "Step Functions",
  kinesis: "Kinesis",
  rds: "RDS",
  xray: "X-Ray",
  any: "Any service",
};

export function serviceLabel(service: string): string {
  return SERVICE_LABEL[service] ?? service;
}

/** One service's declared access, across every grant that names it. */
export interface ServiceAccess {
  service: string;
  /** Highest level across its grants. */
  level: AccessLevel;
  /** The widest scope among them, so one `all` is not hidden behind a `specific`. */
  scope: AccessScope;
  /** Distinct resources the grants name. */
  resources: number;
  /** Grant lines (a resource × a statement). */
  grants: number;
  /** Grant lines that are broad. */
  broad: number;
  /** Each distinct (level, scope) a broad grant has, so it can be described exactly. */
  broadShapes?: { level: AccessLevel; scope: AccessScope }[];
}

export interface AccessSummary {
  services: ServiceAccess[];
  /** Distinct resource rows: what the reader calls "access paths". */
  paths: number;
  /** Broad grant lines in total. */
  broad: number;
  /** More pages exist, so every count above is "at least". */
  partial: boolean;
}

const SCOPE_RANK: Record<AccessScope, number> = { specific: 0, other_account: 1, pattern: 2, all: 3 };

/** A grant line, seen from one service: which of its actions belong to it. */
export interface GrantView {
  service: string;
  level: AccessLevel;
  scope: AccessScope;
  broad: boolean;
  /** The statement's actions that belong to this service (all of them, when the resource names it). */
  actions: string[];
  notActions: string[];
}

/** The Access tab's filter, kept in the URL as `?filter=`. */
export type AccessFilter = "all" | "broad" | "read" | "write";

export const ACCESS_FILTERS: AccessFilter[] = ["all", "broad", "read", "write"];

export function parseAccessFilter(v: string | null): AccessFilter {
  return (ACCESS_FILTERS as string[]).includes(v ?? "") ? (v as AccessFilter) : "all";
}

/** `write` includes full access: a filter for "can change things" must not hide `iam:*`. */
export function matchesFilter(v: Pick<GrantView, "broad" | "level">, f: AccessFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "broad":
      return v.broad;
    case "read":
      return v.level === "read";
    case "write":
      return v.level === "write" || v.level === "full";
  }
}

/**
 * The service views of one grant on one resource. A resource that names its
 * service (an ARN) is one view over all the statement's actions. A bare `*`
 * names none, so the statement's actions are split by their own service prefix
 * — `logs:*` and `ssm:GetParameter` on `*` are two services, not one.
 */
export function grantViews(resource: ResourceSummary, grant: Pick<GrantLine, "statement">): GrantView[] {
  const { actions, not_actions } = grant.statement;
  const scope = accessScope(resource);
  const bySvc = new Map<string, string[]>();

  const fromArn = resource.service ?? arnResource(resource.text.trim())?.service ?? null;
  if (fromArn) {
    // One statement can allow actions of several services on several resources
    // (`s3:GetObject` and `sqs:SendMessage` on an S3 ARN and an SQS ARN). Only
    // this service's actions describe THIS resource: counting the others made
    // the S3 row "Write" because of an SQS action, and `kms:*` made it full
    // access. A bare `*` belongs to every service. If none match (an ARN whose
    // service name differs from its actions' prefix) all of them are kept —
    // showing too much is better than a grant that disappears.
    const svc = fromArn.toLowerCase();
    const mine = actions.filter((a) => {
      const s = serviceOfAction(a);
      return s === null || s === svc;
    });
    bySvc.set(svc, mine.length ? mine : actions);
  } else if (not_actions.length || !actions.length) {
    bySvc.set("any", actions);
  } else {
    for (const a of actions) {
      const s = serviceOfAction(a) ?? "any";
      bySvc.set(s, [...(bySvc.get(s) ?? []), a]);
    }
  }

  return [...bySvc.entries()].map(([service, acts]) => {
    const level = accessLevel(acts, not_actions);
    return { service, level, scope, broad: isBroad(scope, level), actions: acts, notActions: not_actions };
  });
}

/** Broad first, then the higher level, then by name: the order every service list uses. */
export function compareServices(
  a: { service: string; broad: number; level: AccessLevel },
  b: { service: string; broad: number; level: AccessLevel },
): number {
  return b.broad - a.broad || LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || serviceLabel(a.service).localeCompare(serviceLabel(b.service));
}

export function summarizeAccess(rows: WorkloadResourceRow[], opts: { partial?: boolean } = {}): AccessSummary {
  const by = new Map<string, ServiceAccess & { seen: Set<string> }>();
  let broad = 0;

  for (const row of rows) {
    for (const g of row.grants) {
      for (const v of grantViews(row.resource, g)) {
        let s = by.get(v.service);
        if (!s) {
          s = { service: v.service, level: v.level, scope: v.scope, resources: 0, grants: 0, broad: 0, seen: new Set() };
          by.set(v.service, s);
        }
        if (LEVEL_RANK[v.level] > LEVEL_RANK[s.level]) s.level = v.level;
        if (SCOPE_RANK[v.scope] > SCOPE_RANK[s.scope]) s.scope = v.scope;
        s.grants += 1;
        if (!s.seen.has(row.resource.ref)) {
          s.seen.add(row.resource.ref);
          s.resources += 1;
        }
        if (v.broad) {
          s.broad += 1;
          broad += 1;
          const shapes = (s.broadShapes ??= []);
          if (!shapes.some((x) => x.level === v.level && x.scope === v.scope)) shapes.push({ level: v.level, scope: v.scope });
        }
      }
    }
  }

  const services = [...by.values()].map(({ seen: _seen, ...s }) => s).sort(compareServices);

  return { services, paths: rows.length, broad, partial: !!opts.partial };
}

/** Where a broad grant reaches, in words. `any` is the service of a bare `*` action. */
function reachText(service: string, scope: AccessScope): string {
  const any = service === "any";
  const svc = serviceLabel(service);
  switch (scope) {
    case "all":
      return any ? "every resource" : `all ${svc} resources`;
    case "pattern":
      return any ? "resources matching a pattern" : `${svc} resources matching a pattern`;
    case "specific":
      return any ? "a named resource" : `a named ${svc} resource`;
    default:
      return "resources in another account, or not resolved";
  }
}

function shapeText(service: string, shape: { level: AccessLevel; scope: AccessScope }): string {
  const where = reachText(service, shape.scope);
  switch (shape.level) {
    // "Full" is also a NotAction ("everything except …"), so not "every action".
    case "full":
      return service === "any" ? `full access to ${where} in any service` : `full access to ${where}`;
    case "write":
      return `write access to ${where}`;
    case "read":
      return `read access to ${where}`;
    default:
      return `unclassified actions on ${where}`;
  }
}

/**
 * What a service's broad access amounts to, in words, one phrase per distinct
 * kind of broad grant, widest reach first: "Write access to all CloudWatch
 * Logs resources; full access to a named S3 resource". Null when nothing is broad.
 */
export function broadText(s: Pick<ServiceAccess, "service" | "broadShapes">): string | null {
  const shapes = [...(s.broadShapes ?? [])].sort(
    (a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] || LEVEL_RANK[b.level] - LEVEL_RANK[a.level],
  );
  if (!shapes.length) return null;
  const shown = shapes.slice(0, 2).map((x) => shapeText(s.service, x));
  const more = shapes.length - shown.length;
  const text = shown.join("; ") + (more > 0 ? `; and ${more} more` : "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "3", or "at least 3" when the read stopped at a page boundary. */
export function countWord(n: number, partial: boolean): string {
  return partial ? `at least ${n}` : String(n);
}
