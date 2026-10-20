/**
 * The pure parts of the Auto-scan panel: the time and zone choices, how a
 * change becomes a PUT body, and how times are shown. No React, so they are
 * unit-tested on their own (autoScanModel.test.ts).
 */

import type { AWSScanSchedule, CloudScanRunHistoryItem } from "@/app/api/cloudDiscoveryApi";

export const DAILY_MINUTES = 1440;
export const WEEKLY_MINUTES = 10080;

/** The scheduler adds up to this much after the chosen time, so accounts that
 *  chose the same time do not all reach AWS in the same second. */
export const START_WINDOW_MINUTES = 30;

const pad = (n: number) => String(n).padStart(2, "0");

/** 00:00, 00:15 ... 23:45. The API accepts quarter hours only. */
export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => {
  const m = i * 15;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
});

/** Sunday is 0, as the API and JavaScript's Date both number it. */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const COMMON_ZONES = [
  "UTC",
  "Asia/Kolkata", "Asia/Dubai", "Asia/Karachi", "Asia/Dhaka", "Asia/Singapore", "Asia/Jakarta",
  "Asia/Hong_Kong", "Asia/Shanghai", "Asia/Tokyo",
  "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
  "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Amsterdam",
  "Europe/Istanbul", "Europe/Moscow",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg",
  "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/New_York", "America/Toronto",
  "America/Chicago", "America/Mexico_City", "America/Denver", "America/Los_Angeles", "America/Anchorage",
  "Pacific/Honolulu",
];

/** The zone this browser is in, or UTC when it cannot say. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The zones to offer: this browser's first, then common ones, then the one
 *  already saved if it is none of those. */
export function zoneOptions(current?: string, browser: string = browserZone()): string[] {
  const out: string[] = [];
  for (const z of [browser, ...COMMON_ZONES, current ?? ""]) {
    if (z && !out.includes(z)) out.push(z);
  }
  return out;
}

export const zoneLabel = (z: string) => z.replace(/_/g, " ");

/** A moment as it reads in `zone`, with the zone named: "21 Oct, 02:30 GMT+5:30". */
export function formatInZone(iso: string, zone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** "02:30" -> "03:00": the end of the window a scan may start in. */
export function windowEnd(timeOfDay: string): string {
  const [h, m] = timeOfDay.split(":").map(Number);
  const total = (h * 60 + m + START_WINDOW_MINUTES) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** What the admin chose, in a sentence; null when no time was chosen. */
export function windowText(s: Pick<AWSScanSchedule, "time_of_day" | "timezone">): string | null {
  if (!s.time_of_day) return null;
  return `Scans start between ${s.time_of_day} and ${windowEnd(s.time_of_day)} (${zoneLabel(s.timezone)}).`;
}

export interface ScheduleEdit {
  enabled?: boolean;
  interval_minutes?: number;
  time_of_day?: string;
  timezone?: string;
  day_of_week?: number;
}

export interface ScheduleBody {
  enabled: boolean;
  interval_minutes: number;
  time_of_day?: string;
  timezone?: string;
  day_of_week?: number;
}

/**
 * The PUT body for one edit. The API keeps any field left out, so only what
 * changed is sent, plus `enabled` and the interval, which it always wants.
 *
 * Two things are filled in so the admin never meets a 422 for something they
 * did not choose:
 *  - the first time a time is chosen on a schedule still in the default zone,
 *    the zone is this browser's, since a time with no zone is read as UTC;
 *  - a weekly schedule with a time needs a weekday, so it starts on Monday.
 */
export function buildChange(
  s: AWSScanSchedule,
  edit: ScheduleEdit,
  browser: string = browserZone(),
): ScheduleBody {
  const interval = edit.interval_minutes ?? s.interval_minutes;
  const body: ScheduleBody = { enabled: edit.enabled ?? s.enabled, interval_minutes: interval };
  if (edit.time_of_day !== undefined) body.time_of_day = edit.time_of_day;
  if (edit.timezone !== undefined) body.timezone = edit.timezone;
  if (edit.day_of_week !== undefined) body.day_of_week = edit.day_of_week;

  if (edit.time_of_day !== undefined && s.time_of_day == null && s.timezone === "UTC" && body.timezone === undefined) {
    body.timezone = browser;
  }
  const hasTime = (edit.time_of_day ?? s.time_of_day) != null;
  if (interval === WEEKLY_MINUTES && hasTime && body.day_of_week === undefined && s.day_of_week == null) {
    body.day_of_week = 1;
  }
  return body;
}

/**
 * Whether the schedule's settings can be edited. A paused schedule is edited by
 * one thing only, Resume: the server resumes on any save, so letting a
 * frequency or time change through would un-pause it without the admin having
 * read why it stopped.
 */
export function settingsLocked(s: Pick<AWSScanSchedule, "paused_reason">, canAdminister: boolean, saving: boolean): boolean {
  return !canAdminister || saving || !!s.paused_reason;
}

/* ── Set / Edit flow ─────────────────────────────────────────────────────── */

/** Old names some browsers and saved schedules still carry, mapped to the
 *  current IANA name so the zone list never shows the same place twice. */
const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  GMT: "UTC",
};

export function canonicalZone(z: string): string {
  return ZONE_ALIASES[z] ?? z;
}

/** Whether this runtime knows the zone name. */
export function isKnownZone(z: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

/** What the editor holds while the admin is choosing. */
export interface ScheduleDraft {
  interval_minutes: number;
  time_of_day: string;
  timezone: string;
  day_of_week: number;
}

export const DEFAULT_TIME = "02:00";

/** The editor's starting point: the saved choice, or a sensible first one
 *  (daily, 02:00, this browser's zone, Monday). */
export function draftFrom(s: AWSScanSchedule, browser: string = browserZone()): ScheduleDraft {
  const chosen = s.time_of_day != null;
  return {
    interval_minutes: s.interval_minutes || DAILY_MINUTES,
    time_of_day: s.time_of_day ?? DEFAULT_TIME,
    timezone: canonicalZone(chosen || s.timezone !== "UTC" ? s.timezone : browser),
    day_of_week: s.day_of_week ?? 1,
  };
}

/** Whether the draft differs from what is saved (so Save can stay off). */
export function isDirty(s: AWSScanSchedule, d: ScheduleDraft): boolean {
  const weekly = d.interval_minutes === WEEKLY_MINUTES;
  return (
    d.interval_minutes !== s.interval_minutes ||
    d.time_of_day !== s.time_of_day ||
    canonicalZone(d.timezone) !== canonicalZone(s.timezone) ||
    (weekly && d.day_of_week !== s.day_of_week)
  );
}

/** The first thing wrong with a draft, in words, or null. */
export function draftProblem(d: ScheduleDraft): string | null {
  if (!TIME_OPTIONS.includes(d.time_of_day)) return "Choose a time on a quarter hour.";
  if (!d.timezone || !isKnownZone(d.timezone)) return "Choose a timezone from the list.";
  if (d.interval_minutes === WEEKLY_MINUTES && !WEEKDAYS.some((w) => w.value === d.day_of_week)) {
    return "Choose a day of the week.";
  }
  return null;
}

/** The PUT body that turns auto-scan on with this draft. */
export function buildSet(d: ScheduleDraft): ScheduleBody {
  const body: ScheduleBody = {
    enabled: true,
    interval_minutes: d.interval_minutes,
    time_of_day: d.time_of_day,
    timezone: canonicalZone(d.timezone),
  };
  if (d.interval_minutes === WEEKLY_MINUTES) body.day_of_week = d.day_of_week;
  return body;
}

export function intervalName(minutes: number): string {
  if (minutes === DAILY_MINUTES) return "Daily";
  if (minutes === WEEKLY_MINUTES) return "Weekly";
  return `Every ${minutes} minutes`;
}

/** "Daily at 02:00 (Asia/Kolkata)", "Weekly on Monday at 02:00 (UTC)". */
export function summaryLine(s: Pick<AWSScanSchedule, "interval_minutes" | "time_of_day" | "timezone" | "day_of_week">): string {
  const name = intervalName(s.interval_minutes);
  if (!s.time_of_day) return `${name}, at the time auto-scan was turned on`;
  const day =
    s.interval_minutes === WEEKLY_MINUTES && s.day_of_week != null
      ? ` on ${WEEKDAYS.find((w) => w.value === s.day_of_week)?.label ?? "the chosen day"}`
      : "";
  return `${name}${day} at ${s.time_of_day} (${zoneLabel(canonicalZone(s.timezone))})`;
}

export type ScheduleErrorKind =
  | "denied" // 401/403: this role cannot change it
  | "revoked" // 409: the connection was revoked
  | "missing" // 404: this backend has no schedule route
  | "invalid" // 400/422: a field was refused
  | "network" // never reached the server
  | "server"; // 5xx or anything else

export interface ScheduleError {
  kind: ScheduleErrorKind;
  message: string;
  /** The field the server named, when it named one. */
  field?: "interval_minutes" | "time_of_day" | "timezone" | "day_of_week";
  /** Trying the same thing again may work. */
  retryable: boolean;
}

const FIELDS = ["interval_minutes", "time_of_day", "timezone", "day_of_week"] as const;

/**
 * An RTK Query error, said for the situation it is. `action` says what the
 * admin was doing, so "could not save" and "could not load" read differently.
 */
export function classifyScheduleError(err: unknown, action: "load" | "save"): ScheduleError {
  const e = (err ?? {}) as {
    status?: number | string;
    data?: { error?: { code?: string; message?: string; parameter?: string } | string };
  };
  const inner = typeof e.data?.error === "object" ? e.data.error : undefined;
  const serverMsg = inner?.message ?? (typeof e.data?.error === "string" ? e.data.error : undefined);
  const verb = action === "load" ? "load" : "save";
  const status = e.status;

  if (status === "FETCH_ERROR" || status === "TIMEOUT_ERROR") {
    return {
      kind: "network",
      message: `Could not reach AuthSec to ${verb} the schedule. Check your connection and try again.`,
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: "denied",
      message:
        status === 401
          ? "Your session has expired. Sign in again to change auto-scan."
          : "Your role cannot change auto-scan. Ask an administrator.",
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      kind: "missing",
      message: "This AuthSec server does not support scheduled scans yet, so nothing was changed.",
      retryable: false,
    };
  }
  if (status === 409 || inner?.code === "connector_revoked") {
    return {
      kind: "revoked",
      message: "This connection has been revoked. Reconnect the account to use auto-scan.",
      retryable: false,
    };
  }
  if (status === 400 || status === 422) {
    const field = FIELDS.find((f) => f === inner?.parameter);
    return {
      kind: "invalid",
      message: serverMsg ? serverMsg : "AuthSec did not accept those settings. Check them and try again.",
      field,
      retryable: false,
    };
  }
  return {
    kind: "server",
    message: `AuthSec had a problem trying to ${verb} the schedule. Try again in a moment.`,
    retryable: true,
  };
}

/** The reason a scan failed, when the cause is something the admin can act on. */
export function failureHint(reason: string | null | undefined): string | null {
  const r = (reason ?? "").toLowerCase();
  if (!r) return null;
  if (/external id|secret|vault/.test(r)) {
    return "AuthSec could not read this role's saved credentials. Reconnect the account to fix it.";
  }
  if (/accessdenied|not authorized|assumerole|sts/.test(r)) {
    return "AWS refused the read-only role. Check that the role and its trust policy still exist.";
  }
  if (/throttl|rate exceeded/.test(r)) return "AWS was rate-limiting the scan. It will try again next time.";
  return null;
}

/* ── Result strip: what a scan that just finished says ───────────────────── */

export type RunLike = Pick<
  CloudScanRunHistoryItem,
  "id" | "status" | "trigger" | "last_error" | "finished_at" | "published_at" | "updated_at" | "queued_at" | "coverage"
>;

export const isTerminal = (status: string) => status === "published" || status === "failed" || status === "abandoned";

/** One key per (run, state), so a run that was running and is now finished is news. */
export const runKey = (r: Pick<RunLike, "id" | "status">) => `${r.id}:${r.status}`;

export interface OutcomeStrip {
  tone: "pass" | "warn" | "fail";
  text: string;
  /** What to do about it, when we know. */
  hint: string | null;
  /** How long it stays before it goes away on its own. */
  visibleMs: number;
}

export const PASS_VISIBLE_MS = 10_000;
export const WARN_VISIBLE_MS = 15_000;
export const FAIL_VISIBLE_MS = 25_000;

/** The strip for a finished run; null while it is still queued or running. */
export function outcomeStrip(r: RunLike, zone: string): OutcomeStrip | null {
  if (!isTerminal(r.status)) return null;
  const when = r.finished_at ?? r.published_at ?? r.updated_at ?? r.queued_at;
  const at = when ? ` · ${formatInZone(when, zone)}` : "";
  const kind = r.trigger === "scheduled" ? "Scheduled scan" : "Scan";
  if (r.status === "published") {
    if (r.coverage?.status === "partial") {
      return {
        tone: "warn",
        text: `${kind} finished, but some parts of the account could not be read${at}`,
        hint: "Details are under Recent scans.",
        visibleMs: WARN_VISIBLE_MS,
      };
    }
    return { tone: "pass", text: `${kind} passed${at}`, hint: null, visibleMs: PASS_VISIBLE_MS };
  }
  return {
    tone: "fail",
    text: `${kind} ${r.status === "abandoned" ? "was stopped" : "failed"}${at}`,
    hint: failureHint(r.last_error) ?? "Details are under Recent scans.",
    visibleMs: FAIL_VISIBLE_MS,
  };
}

/**
 * Which finished run, if any, to announce now. Runs already finished when the
 * panel opened are marked seen (`seen` starts holding them), so only a scan
 * that finishes while you are looking raises the strip. Newest first in `runs`.
 */
export function newOutcome(runs: RunLike[], seen: ReadonlySet<string>): RunLike | null {
  const latest = runs[0];
  if (!latest || !isTerminal(latest.status) || seen.has(runKey(latest))) return null;
  return latest;
}
