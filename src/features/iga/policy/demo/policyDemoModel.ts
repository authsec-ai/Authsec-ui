/**
 * What the policy demo says about a policy: where it stands in time, how its
 * window reads, the form's draft and its presets, and how an S3 reference from
 * the graph becomes a bucket and a prefix. Pure.
 */

import { differenceInMinutes, format, formatDistanceToNowStrict } from "date-fns";

import type { ConsoleTone } from "@/components/console/status";
import type { PolicyDemo, PolicyDemoAction, PolicyDemoInput, PolicyDemoPhase } from "@/app/api/policyDemoApi";

export const PHASE: Record<PolicyDemoPhase, { label: string; tone: ConsoleTone; hint: string }> = {
  active: { label: "Active", tone: "success", hint: "Inside its time window." },
  scheduled: { label: "Scheduled", tone: "info", hint: "Its window has not started." },
  expired: { label: "Expired", tone: "neutral", hint: "Its window has ended." },
  paused: { label: "Paused", tone: "warning", hint: "Switched off by hand." },
};

export const PHASE_ORDER: PolicyDemoPhase[] = ["active", "scheduled", "expired", "paused"];

export const ACTIONS: { key: PolicyDemoAction; label: string; blurb: string; risky?: boolean }[] = [
  { key: "read", label: "Read", blurb: "List the folder and read objects." },
  { key: "write", label: "Write", blurb: "Upload and overwrite objects." },
  { key: "delete", label: "Delete", blurb: "Remove objects. Use sparingly.", risky: true },
];

export const actionLabel = (a: string) => ACTIONS.find((x) => x.key === a)?.label ?? a;

/** "invoices/" in "finance-reports", or the whole bucket. */
export function resourceLabel(p: Pick<PolicyDemo, "resource" | "prefix">): string {
  return p.prefix ? `${p.resource}/${p.prefix}` : p.resource;
}

const stamp = (iso: string) => format(new Date(iso), "d MMM HH:mm");

/** "9 Oct 09:00 → 10 Oct 09:00", "until 10 Oct 09:00", "from 9 Oct 09:00" or "No time limit". */
export function windowText(p: Pick<PolicyDemo, "start_time" | "end_time">): string {
  if (p.start_time && p.end_time) return `${stamp(p.start_time)} → ${stamp(p.end_time)}`;
  if (p.end_time) return `Until ${stamp(p.end_time)}`;
  if (p.start_time) return `From ${stamp(p.start_time)}`;
  return "No time limit";
}

/** Where the policy stands in words: "Ends in 22 hours", "Starts in 2 days", "Ended 3 hours ago". */
export function whenText(p: Pick<PolicyDemo, "phase" | "start_time" | "end_time">): string {
  const rel = (iso: string, suffix: boolean) => formatDistanceToNowStrict(new Date(iso), { addSuffix: suffix });
  switch (p.phase) {
    case "scheduled":
      return p.start_time ? `Starts in ${rel(p.start_time, false)}` : "";
    case "expired":
      return p.end_time ? `Ended ${rel(p.end_time, true)}` : "";
    case "active":
      return p.end_time ? `Ends in ${rel(p.end_time, false)}` : "No end";
    default:
      return "Paused by hand";
  }
}

/** How far through its window an active policy is, 0..1; null when it has no two ends. */
export function windowProgress(p: Pick<PolicyDemo, "start_time" | "end_time">, now = new Date()): number | null {
  if (!p.start_time || !p.end_time) return null;
  const a = new Date(p.start_time).getTime();
  const b = new Date(p.end_time).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - a) / (b - a)));
}

export function windowLength(p: Pick<PolicyDemo, "start_time" | "end_time">): string | null {
  if (!p.start_time || !p.end_time) return null;
  const m = differenceInMinutes(new Date(p.end_time), new Date(p.start_time));
  if (m < 90) return `${m} minutes`;
  if (m < 60 * 48) return `${Math.round(m / 60)} hours`;
  return `${Math.round(m / 1440)} days`;
}

/* ---------------------------------- draft ---------------------------------- */

export type WindowPreset = "1h" | "8h" | "24h" | "7d" | "custom" | "none";

export const PRESETS: { key: WindowPreset; label: string; hours?: number }[] = [
  { key: "1h", label: "1 hour", hours: 1 },
  { key: "8h", label: "8 hours", hours: 8 },
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 168 },
  { key: "custom", label: "Pick dates" },
  { key: "none", label: "No limit" },
];

/** The form's state: what the person typed, before it becomes a request. */
export interface PolicyDraft {
  name: string;
  description: string;
  agent: string;
  identity: string;
  resource: string;
  prefix: string;
  actions: PolicyDemoAction[];
  protect_bucket: boolean;
  require_tls: boolean;
  preset: WindowPreset;
  /** `datetime-local` values (local time), used by "Pick dates". */
  start: string;
  end: string;
}

/** A `datetime-local` value for a date, in local time. */
export const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

const minute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export function emptyDraft(initial?: Partial<Pick<PolicyDraft, "resource" | "prefix" | "agent" | "identity">>): PolicyDraft {
  const now = minute(new Date());
  return {
    name: "",
    description: "",
    agent: initial?.agent ?? "",
    identity: initial?.identity ?? "",
    resource: initial?.resource ?? "",
    prefix: initial?.prefix ?? "",
    actions: ["read"],
    protect_bucket: true,
    require_tls: true,
    preset: "24h",
    start: toLocalInput(now),
    end: toLocalInput(new Date(now.getTime() + 24 * 3_600_000)),
  };
}

export function draftOf(p: PolicyDemo): PolicyDraft {
  const has = !!(p.start_time || p.end_time);
  const now = minute(new Date());
  return {
    name: p.name,
    description: p.description,
    agent: p.agent,
    identity: p.identity,
    resource: p.resource,
    prefix: p.prefix,
    actions: p.actions,
    protect_bucket: p.protect_bucket,
    require_tls: p.require_tls,
    preset: has ? "custom" : "none",
    start: toLocalInput(p.start_time ? new Date(p.start_time) : now),
    end: toLocalInput(p.end_time ? new Date(p.end_time) : new Date(now.getTime() + 24 * 3_600_000)),
  };
}

/** Choosing a preset starts the window now. */
export function applyPreset(d: PolicyDraft, preset: WindowPreset): PolicyDraft {
  const hours = PRESETS.find((p) => p.key === preset)?.hours;
  if (!hours) return { ...d, preset };
  const now = minute(new Date());
  return { ...d, preset, start: toLocalInput(now), end: toLocalInput(new Date(now.getTime() + hours * 3_600_000)) };
}

/** The request a draft makes. A window whose date cannot be read is sent as none and refused by the server's end-after-start rule only when both exist. */
export function inputOf(d: PolicyDraft): PolicyDemoInput {
  const iso = (v: string) => {
    const t = new Date(v);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  };
  const windowed = d.preset !== "none";
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    agent: d.agent.trim(),
    identity: d.identity.trim(),
    resource_type: "s3",
    resource: d.resource.trim(),
    prefix: d.prefix.trim(),
    actions: d.actions,
    protect_bucket: d.protect_bucket,
    require_tls: d.require_tls,
    start_time: windowed ? iso(d.start) : null,
    end_time: windowed ? iso(d.end) : null,
  };
}

/* ------------------------------ graph reference ----------------------------- */

const S3_ARN = /^arn:aws[a-z-]*:s3:::([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/;

/**
 * An S3 bucket named by a graph card: an exact reference or a pattern whose text
 * (or ARN) is `arn:aws:s3:::bucket` or `arn:aws:s3:::bucket/folder/*`.
 */
export function s3OfReference(...candidates: (string | undefined | null)[]): { bucket: string; prefix: string } | null {
  for (const c of candidates) {
    const m = c ? S3_ARN.exec(c.trim()) : null;
    if (!m) continue;
    const rest = (m[2] ?? "").replace(/\*+$/, "");
    const slash = rest.lastIndexOf("/");
    // "invoices/*" is the folder invoices/; "invoices/2026-*" is the folder invoices/ too.
    const prefix = slash >= 0 ? rest.slice(0, slash + 1) : "";
    return { bucket: m[1], prefix };
  }
  return null;
}
