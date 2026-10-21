/**
 * The unified Logs model: sign-ins, machine tokens and admin changes from
 * their three backend sources, mapped into one event shape with a JSON body
 * built only from the fields each source returns. The query language below
 * runs client-side over the events that were loaded.
 */

import type { AuditLog, AuthLog, M2MLog } from "@/types/entities";
import type { LogResultTone } from "./LogTable";
import { downloadText, humanize, realmLabel } from "./logFormat";

export type LogKind = "sign-in" | "machine-token" | "admin-change";

export const KIND_LABEL: Record<LogKind, string> = {
  "sign-in": "Sign-in",
  "machine-token": "Machine token",
  "admin-change": "Admin change",
};

export interface LogEvent {
  /** Unique across sources. */
  key: string;
  kind: LogKind;
  time: string;
  /** Epoch ms; NaN when the source sent an unparseable time. */
  ts: number;
  who: string;
  whoDetail?: string;
  event: string;
  result: { tone: LogResultTone; label: string; reason?: string };
  /** The event as JSON: only fields the backend returned, no blanks. */
  raw: Record<string, unknown>;
}

/** Drop undefined / null / empty-string fields so the JSON shows only what is real. */
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

/** "missing_permission" → "missing permission", for the Result pill. */
function reasonWords(reason?: string): string | undefined {
  if (!reason) return undefined;
  const h = humanize(reason);
  return h.charAt(0).toLowerCase() + h.slice(1);
}

export function fromSignIn(log: AuthLog): LogEvent {
  const tone: LogResultTone =
    log.status === "success" ? "allowed" : log.status === "suspicious" ? "pending" : log.status === "denied" ? "denied" : "failed";
  const word = log.status === "success" ? "allowed" : log.status;
  const label = tone === "allowed" ? "Allowed" : tone === "pending" ? "Suspicious" : tone === "denied" ? "Denied" : "Failed";
  return {
    key: `sign-in:${log.id}`,
    kind: "sign-in",
    time: log.timestamp,
    ts: Date.parse(log.timestamp),
    who: log.userId || "Unknown",
    whoDetail: realmLabel(log.actorRealm),
    event: log.action ? humanize(log.action) : "Sign-in",
    result: { tone, label, reason: tone === "allowed" ? undefined : reasonWords(log.failureReason) },
    raw: clean({
      time: log.timestamp,
      type: "sign_in",
      user_id: log.userId,
      realm: log.actorRealm,
      action: log.action,
      result: word,
      reason: log.failureReason,
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      request_id: log.requestId,
    }),
  };
}

export function fromMachineToken(log: M2MLog, serverName: (id: string) => string | undefined): LogEvent {
  const allowed = log.gateEffect === "permit";
  // The policy's reason is shown only when the policy also denied, so the reason matches the result.
  const reason = !allowed && log.pdpEffect === "deny" ? log.pdpReason || undefined : undefined;
  const server = serverName(log.resourceServerId) ?? log.resourceServerId;
  return {
    key: `machine-token:${log.id}`,
    kind: "machine-token",
    time: log.createdAt,
    ts: Date.parse(log.createdAt),
    who: log.clientId || "Unknown",
    whoDetail: log.subjectType ? humanize(log.subjectType) : undefined,
    event: server ? `Token for ${server}` : "Token request",
    result: allowed
      ? { tone: "allowed", label: "Allowed" }
      : { tone: "denied", label: "Denied", reason: reasonWords(reason) },
    raw: clean({
      time: log.createdAt,
      type: "machine_token",
      client_id: log.clientId,
      subject_type: log.subjectType,
      subject_id: log.subjectId,
      mcp: serverName(log.resourceServerId),
      mcp_server_id: log.resourceServerId,
      scopes_requested: log.scopesRequested,
      scopes_granted: log.scopesGranted,
      gate_decision: log.gateEffect,
      policy_decision: log.pdpEffect,
      policy_agrees: log.pdpAgrees,
      result: allowed ? "allowed" : "denied",
      reason: log.pdpReason,
      token_family: log.tokenFamily,
    }),
  };
}

const ACTION_LABEL: Record<AuditLog["action"], string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  enabled: "Enabled",
  disabled: "Disabled",
};

const RESOURCE_LABEL: Record<AuditLog["resourceType"], string> = {
  user: "user",
  group: "group",
  role: "role",
  client: "client",
  resource: "resource",
  auth_method: "sign-in method",
  config: "setting",
};

export function fromAdminChange(log: AuditLog): LogEvent {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const ok = log.status === "success";
  const tone: LogResultTone = ok ? "recorded" : log.status === "pending" ? "pending" : "failed";
  const label = ok ? "Recorded" : log.status === "pending" ? "Pending" : "Failed";
  const request = [meta.method, meta.path].filter(Boolean).join(" ");
  return {
    key: `admin-change:${log.id}`,
    kind: "admin-change",
    time: log.timestamp,
    ts: Date.parse(log.timestamp),
    who: log.actor.email || log.actor.username || log.actor.userId || "Unknown",
    whoDetail: realmLabel(log.actor.role),
    event: `${ACTION_LABEL[log.action] ?? log.action} ${RESOURCE_LABEL[log.resourceType] ?? log.resourceType}${
      log.resourceId ? ` ${log.resourceId}` : ""
    }`,
    result: { tone, label, reason: ok ? undefined : reasonWords(log.reason) },
    raw: clean({
      time: log.timestamp,
      type: "admin_change",
      user_id: log.actor.userId,
      email: log.actor.email,
      username: log.actor.username,
      realm: log.actor.role,
      action: log.action,
      resource_type: log.resourceType,
      resource_id: log.resourceId,
      request,
      http_status: meta.statusCode,
      result: ok ? "recorded" : log.status,
      reason: log.reason,
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      request_id: meta.requestId,
    }),
  };
}

/** True for results the timeline paints red. */
export function isDenied(e: LogEvent): boolean {
  return e.result.tone === "denied" || e.result.tone === "failed";
}

// ---------------------------------------------------------------------------
// Time ranges
// ---------------------------------------------------------------------------

export interface TimeRange {
  key: string;
  label: string;
  ms: number;
  buckets: number;
}

export const HOUR = 3_600_000;
export const TIME_RANGES: TimeRange[] = [
  { key: "1h", label: "Last hour", ms: HOUR, buckets: 12 },
  { key: "24h", label: "Last 24 hours", ms: 24 * HOUR, buckets: 48 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * HOUR, buckets: 42 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * HOUR, buckets: 30 },
];

export function findRange(key: string | null): TimeRange {
  return TIME_RANGES.find((r) => r.key === key) ?? TIME_RANGES[1];
}

// ---------------------------------------------------------------------------
// Query language
// ---------------------------------------------------------------------------

/** Short names accepted for JSON fields. */
const KEY_ALIAS: Record<string, string[]> = {
  user: ["user_id"],
  client: ["client_id"],
  ip: ["ip_address"],
  status: ["result"],
  who: ["user_id", "client_id", "email", "username"],
  scope: ["scopes_requested", "scopes_granted"],
};

/** Type words people type, matched against the JSON `type`. */
const TYPE_ALIAS: Record<string, string> = {
  "sign-in": "sign_in",
  signin: "sign_in",
  "machine-token": "machine_token",
  token: "machine_token",
  "admin-change": "admin_change",
  admin: "admin_change",
};

interface Term {
  negate: boolean;
  key?: string;
  value: string;
}

export interface ParsedQuery {
  terms: Term[];
  /** Words the parser does not support (e.g. OR), reported back to the user. */
  unsupported: string[];
}

/** Split on spaces, keeping "quoted values" together. */
function tokenize(q: string): string[] {
  const out: string[] = [];
  const re = /(-?[\w.-]+:"[^"]*"|"[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) out.push(m[1]);
  return out;
}

export function parseQuery(q: string): ParsedQuery {
  const terms: Term[] = [];
  const unsupported: string[] = [];
  let negateNext = false;
  for (const tok of tokenize(q.trim())) {
    const upper = tok.toUpperCase();
    if (upper === "AND") continue;
    if (upper === "NOT") {
      negateNext = true;
      continue;
    }
    if (upper === "OR") {
      unsupported.push("OR");
      continue;
    }
    let t = tok;
    let negate = negateNext;
    negateNext = false;
    if (t.startsWith("-") && t.length > 1) {
      negate = !negate;
      t = t.slice(1);
    }
    const m = /^([a-z_][\w]*):(.*)$/i.exec(t);
    if (m) {
      terms.push({ negate, key: m[1].toLowerCase(), value: m[2].replace(/^"|"$/g, "").toLowerCase() });
    } else {
      terms.push({ negate, value: t.replace(/^"|"$/g, "").toLowerCase() });
    }
  }
  return { terms, unsupported };
}

function fieldText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(" ").toLowerCase();
  return String(v).toLowerCase();
}

function termMatches(term: Term, e: LogEvent): boolean {
  if (!term.key) {
    if (!term.value) return true;
    return JSON.stringify(e.raw).toLowerCase().includes(term.value);
  }
  const keys = KEY_ALIAS[term.key] ?? [term.key];
  let value = term.value;
  if (term.key === "type") value = TYPE_ALIAS[value] ?? value.replace(/-/g, "_");
  return keys.some((k) => {
    if (!(k in e.raw)) return false;
    if (value === "*" || value === "") return true;
    return fieldText(e.raw[k]).includes(value);
  });
}

export function matchesQuery(parsed: ParsedQuery, e: LogEvent): boolean {
  return parsed.terms.every((t) => termMatches(t, e) !== t.negate);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

export function exportJson(events: LogEvent[]) {
  downloadText(JSON.stringify(events.map((e) => e.raw), null, 2), "application/json", `logs-${stamp()}.json`);
}

export function exportCsv(events: LogEvent[]) {
  const cols: string[] = [];
  for (const e of events) for (const k of Object.keys(e.raw)) if (!cols.includes(k)) cols.push(k);
  const cell = (v: unknown) => {
    if (v === undefined || v === null) return "";
    const text = Array.isArray(v) ? v.join(" ") : String(v);
    // Log fields (user agent, reason, names) are caller-controlled: a leading
    // = + - @ would run as a formula when the CSV is opened in a spreadsheet.
    const s = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(","), ...events.map((e) => cols.map((c) => cell(e.raw[c])).join(","))];
  downloadText(lines.join("\r\n"), "text/csv", `logs-${stamp()}.csv`);
}
