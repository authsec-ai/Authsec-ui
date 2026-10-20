import { describe, expect, it } from "vitest";

import type { AWSScanSchedule } from "@/app/api/cloudDiscoveryApi";
import {
  TIME_OPTIONS,
  WEEKDAYS,
  buildChange,
  buildSet,
  classifyScheduleError,
  draftFrom,
  draftProblem,
  failureHint,
  isDirty,
  newOutcome,
  outcomeStrip,
  runKey,
  summaryLine,
  formatInZone,
  settingsLocked,
  windowEnd,
  windowText,
  zoneOptions,
} from "./autoScanModel";

const base: AWSScanSchedule = {
  enabled: true,
  interval_minutes: 1440,
  next_due_at: "2026-10-21T02:30:00Z",
  last_enqueued_at: null,
  paused_reason: "",
  scheduler_active: true,
  time_of_day: null,
  timezone: "UTC",
  day_of_week: null,
};

describe("TIME_OPTIONS", () => {
  it("is every quarter hour of the day, and nothing else", () => {
    expect(TIME_OPTIONS).toHaveLength(96);
    expect(TIME_OPTIONS[0]).toBe("00:00");
    expect(TIME_OPTIONS[1]).toBe("00:15");
    expect(TIME_OPTIONS[95]).toBe("23:45");
    for (const t of TIME_OPTIONS) expect(t).toMatch(/^([01]\d|2[0-3]):(00|15|30|45)$/);
  });
});

describe("WEEKDAYS", () => {
  it("covers all seven days with Sunday as 0, listed from Monday", () => {
    expect(WEEKDAYS.map((d) => d.value).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(WEEKDAYS[0]).toEqual({ value: 1, label: "Monday" });
    expect(WEEKDAYS.find((d) => d.value === 0)?.label).toBe("Sunday");
  });
});

describe("zoneOptions", () => {
  it("offers the browser's zone first and never repeats a zone", () => {
    const z = zoneOptions("Asia/Kolkata", "Asia/Kolkata");
    expect(z[0]).toBe("Asia/Kolkata");
    expect(new Set(z).size).toBe(z.length);
  });
  it("keeps a saved zone that is not in the common list", () => {
    expect(zoneOptions("Atlantic/Reykjavik", "UTC")).toContain("Atlantic/Reykjavik");
  });
});

describe("formatInZone", () => {
  it("reads the moment in the schedule's own zone, and names the zone", () => {
    // 21:00 UTC is 02:30 the next morning in Kolkata (+05:30).
    const text = formatInZone("2026-10-20T21:00:00Z", "Asia/Kolkata");
    expect(text).toMatch(/21 Oct/);
    expect(text).toMatch(/02:30/);
    expect(text).toMatch(/GMT\+5:30|IST/);
  });
  it("does not throw on an unknown zone or a bad date", () => {
    expect(() => formatInZone("2026-10-20T21:00:00Z", "Mars/Base")).not.toThrow();
    expect(formatInZone("not a date", "UTC")).toBe("—");
  });
});

describe("the start window", () => {
  it("ends 30 minutes after the chosen time, wrapping past midnight", () => {
    expect(windowEnd("02:30")).toBe("03:00");
    expect(windowEnd("23:45")).toBe("00:15");
  });
  it("says nothing when no time was chosen", () => {
    expect(windowText({ time_of_day: null, timezone: "UTC" })).toBeNull();
    expect(windowText({ time_of_day: "02:30", timezone: "Asia/Kolkata" })).toBe(
      "Scans start between 02:30 and 03:00 (Asia/Kolkata).",
    );
  });
});

describe("buildChange", () => {
  it("sends only what changed, plus enabled and the interval", () => {
    expect(buildChange({ ...base, time_of_day: "02:30", timezone: "Asia/Kolkata" }, { time_of_day: "04:00" })).toEqual({
      enabled: true,
      interval_minutes: 1440,
      time_of_day: "04:00",
    });
  });

  it("reads a first-chosen time in the browser's zone, not UTC", () => {
    expect(buildChange(base, { time_of_day: "02:30" }, "Asia/Kolkata")).toMatchObject({
      time_of_day: "02:30",
      timezone: "Asia/Kolkata",
    });
  });

  it("respects a zone the admin already picked", () => {
    const s = { ...base, timezone: "Europe/London" };
    expect(buildChange(s, { time_of_day: "02:30" }, "Asia/Kolkata").timezone).toBeUndefined();
    expect(buildChange(base, { time_of_day: "02:30", timezone: "America/New_York" }, "Asia/Kolkata").timezone).toBe(
      "America/New_York",
    );
  });

  it("gives a weekly schedule with a time a weekday, so the server never refuses it", () => {
    const withTime = { ...base, time_of_day: "02:30", timezone: "Asia/Kolkata" };
    expect(buildChange(withTime, { interval_minutes: 10080 }).day_of_week).toBe(1);
    expect(buildChange({ ...base, interval_minutes: 10080 }, { time_of_day: "06:00" }, "UTC").day_of_week).toBe(1);
  });

  it("keeps the weekday already chosen, and sends a new one", () => {
    const weekly = { ...base, interval_minutes: 10080, time_of_day: "06:00", day_of_week: 3 };
    expect(buildChange(weekly, { time_of_day: "07:00" }).day_of_week).toBeUndefined();
    expect(buildChange(weekly, { day_of_week: 5 }).day_of_week).toBe(5);
  });

  it("does not invent a weekday for a daily schedule or a weekly one with no time", () => {
    expect(buildChange(base, { time_of_day: "02:30" }, "UTC").day_of_week).toBeUndefined();
    expect(buildChange({ ...base, interval_minutes: 10080 }, { enabled: false }).day_of_week).toBeUndefined();
  });

  it("turns the schedule off or on without touching the time", () => {
    const s = { ...base, time_of_day: "02:30", timezone: "Asia/Kolkata" };
    expect(buildChange(s, { enabled: false })).toEqual({ enabled: false, interval_minutes: 1440 });
  });
});

describe("settingsLocked", () => {
  it("locks every setting while paused, so a change cannot quietly resume the schedule", () => {
    expect(settingsLocked({ paused_reason: "repeated_failures: no secret" }, true, false)).toBe(true);
  });
  it("locks for non-admins and while a save is running", () => {
    expect(settingsLocked({ paused_reason: "" }, false, false)).toBe(true);
    expect(settingsLocked({ paused_reason: "" }, true, true)).toBe(true);
  });
  it("is open for an admin on a running schedule", () => {
    expect(settingsLocked({ paused_reason: "" }, true, false)).toBe(false);
  });
});

describe("set / edit flow", () => {
  it("starts a draft from a first-time schedule with the browser zone", () => {
    const d = draftFrom(base, "Asia/Kolkata");
    expect(d).toEqual({ interval_minutes: 1440, time_of_day: "02:00", timezone: "Asia/Kolkata", day_of_week: 1 });
  });

  it("keeps the saved choice and canonicalizes legacy zone names", () => {
    const d = draftFrom({ ...base, time_of_day: "09:15", timezone: "Asia/Calcutta", day_of_week: 3 }, "UTC");
    expect(d.timezone).toBe("Asia/Kolkata");
    expect(d.time_of_day).toBe("09:15");
    expect(d.day_of_week).toBe(3);
  });

  it("is dirty only when something changed, ignoring weekday for daily", () => {
    const s = { ...base, time_of_day: "02:00", timezone: "UTC" };
    const d = draftFrom(s);
    expect(isDirty(s, d)).toBe(false);
    expect(isDirty(s, { ...d, day_of_week: 4 })).toBe(false);
    expect(isDirty(s, { ...d, time_of_day: "03:00" })).toBe(true);
    expect(isDirty(s, { ...d, interval_minutes: 10080 })).toBe(true);
  });

  it("flags a bad time, zone or weekday", () => {
    const d = draftFrom(base, "UTC");
    expect(draftProblem(d)).toBeNull();
    expect(draftProblem({ ...d, time_of_day: "02:10" })).toMatch(/quarter hour/);
    expect(draftProblem({ ...d, timezone: "Mars/Base" })).toMatch(/timezone/);
    expect(draftProblem({ ...d, interval_minutes: 10080, day_of_week: 9 })).toMatch(/day/);
  });

  it("builds the turn-on body, with a day only for weekly", () => {
    const d = draftFrom(base, "UTC");
    expect(buildSet(d)).toEqual({ enabled: true, interval_minutes: 1440, time_of_day: "02:00", timezone: "UTC" });
    expect(buildSet({ ...d, interval_minutes: 10080, day_of_week: 5 })).toMatchObject({ day_of_week: 5 });
  });

  it("says the schedule in a sentence", () => {
    expect(summaryLine({ ...base, time_of_day: "02:00", timezone: "Asia/Kolkata" })).toBe("Daily at 02:00 (Asia/Kolkata)");
    expect(summaryLine({ ...base, interval_minutes: 10080, day_of_week: 0, time_of_day: "21:45", timezone: "America/New_York" })).toBe(
      "Weekly on Sunday at 21:45 (America/New York)",
    );
    expect(summaryLine(base)).toMatch(/time auto-scan was turned on/);
  });
});

describe("classifyScheduleError", () => {
  it("separates the situations", () => {
    expect(classifyScheduleError({ status: "FETCH_ERROR" }, "save")).toMatchObject({ kind: "network", retryable: true });
    expect(classifyScheduleError({ status: 403 }, "save")).toMatchObject({ kind: "denied", retryable: false });
    expect(classifyScheduleError({ status: 401 }, "save").message).toMatch(/Sign in/);
    expect(classifyScheduleError({ status: 404 }, "load").kind).toBe("missing");
    expect(classifyScheduleError({ status: 409, data: { error: { code: "connector_revoked" } } }, "save").kind).toBe("revoked");
    expect(classifyScheduleError({ status: 500 }, "load")).toMatchObject({ kind: "server", retryable: true });
  });

  it("names the refused field and keeps the server's words", () => {
    const e = classifyScheduleError(
      { status: 422, data: { error: { code: "invalid_parameter", message: "time_of_day must be a quarter hour", parameter: "time_of_day" } } },
      "save",
    );
    expect(e).toMatchObject({ kind: "invalid", field: "time_of_day", message: "time_of_day must be a quarter hour" });
  });
});

describe("failureHint", () => {
  it("points at the fix when the cause is known", () => {
    expect(failureHint("AuthSec could not read the external ID for this role")).toMatch(/Reconnect/);
    expect(failureHint("AccessDenied: sts:AssumeRole")).toMatch(/role/);
    expect(failureHint("something odd")).toBeNull();
    expect(failureHint(null)).toBeNull();
  });
});

describe("result strip", () => {
  const r = (status: string, extra = {}) =>
    ({ id: "r", status, trigger: "manual", last_error: null, finished_at: "2026-10-20T02:05:00Z", published_at: null, updated_at: null, queued_at: null, coverage: null, ...extra }) as never;

  it("says nothing until a run is finished", () => {
    expect(outcomeStrip(r("running"), "UTC")).toBeNull();
    expect(outcomeStrip(r("queued"), "UTC")).toBeNull();
  });
  it("passes, warns on partial coverage, and fails", () => {
    expect(outcomeStrip(r("published"), "UTC")).toMatchObject({ tone: "pass" });
    expect(outcomeStrip(r("published", { coverage: { status: "partial", counts: {}, not_reached: [] } }), "UTC")).toMatchObject({ tone: "warn" });
    expect(outcomeStrip(r("failed"), "UTC")).toMatchObject({ tone: "fail" });
    expect(outcomeStrip(r("abandoned"), "UTC")?.text).toMatch(/stopped/);
  });
  it("failures stay longer than passes", () => {
    expect(outcomeStrip(r("failed"), "UTC")!.visibleMs).toBeGreaterThan(outcomeStrip(r("published"), "UTC")!.visibleMs);
  });
  it("announces only an unseen finished run", () => {
    const run = r("published");
    expect(newOutcome([run], new Set())).toBe(run);
    expect(newOutcome([run], new Set([runKey(run)]))).toBeNull();
    expect(newOutcome([r("running")], new Set())).toBeNull();
    expect(newOutcome([], new Set())).toBeNull();
  });
});
