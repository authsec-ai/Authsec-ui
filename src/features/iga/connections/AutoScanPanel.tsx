/**
 * Auto-scan: whether this AWS connection rescans itself, how often, and at what
 * time of day.
 *
 * The scans are the same ones "Scan now" starts, queued by a scheduler in the
 * AuthSec backend; nothing is installed in the customer's account and the
 * read-only role is the same. The customer is always in control: it is off
 * until an administrator turns it on, and can be turned off at any time.
 *
 * Set once, then out of the way: turning Auto-scan on opens the choices
 * (frequency, weekday for weekly, time, timezone); "Set auto-scan" saves them
 * and the panel collapses to a one-line summary. They come back only when the
 * administrator presses Edit.
 *
 * Things are said plainly rather than left to be discovered:
 *  - the administrator chooses the time of day and timezone (and the weekday,
 *    for weekly); a scan starts within 30 minutes after that time, so accounts
 *    that chose the same time do not all reach AWS together;
 *  - every failure is said for the situation it is (expired session, role not
 *    allowed, revoked connection, server too old, network, a refused field),
 *    with Retry only where retrying can help, and what the admin chose is kept
 *    when a save fails;
 *  - a failed scan does not change the connection's status, so the last
 *    scan's failure is shown here while auto-scan is on;
 *  - a schedule that failed three times in a row pauses itself, with the
 *    reason, and waits to be resumed. While it is paused its settings are
 *    locked: the server resumes on any save, so a changed setting would
 *    un-pause it without anyone having read why it stopped;
 *  - when the scan scheduler is not running on the server, nothing will run,
 *    and the panel says so instead of showing a schedule that never fires.
 *
 * The pure parts (choices, request bodies, time formatting) are in
 * autoScanModel.ts. Spec: authsec/.claude/specs/SPEC-aws-scheduled-scans.md
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, Check, CheckCircle2, Pause, Pencil, X, XCircle } from "lucide-react";

import {
  useGetAwsScanScheduleQuery,
  useListAwsScanRunsQuery,
  useUpdateAwsScanScheduleMutation,
} from "@/app/api/cloudDiscoveryApi";
import type { Connection } from "@/app/api/connectionsApi";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { safeErrorProse } from "@/features/discovery/cloud/cloudConnectorErrorCopy";
import { Panel } from "@/features/iga/shared/components/Panel";

import {
  DAILY_MINUTES,
  TIME_OPTIONS,
  WEEKDAYS,
  WEEKLY_MINUTES,
  browserZone,
  buildChange,
  buildSet,
  canonicalZone,
  classifyScheduleError,
  draftFrom,
  draftProblem,
  failureHint,
  formatInZone,
  intervalName,
  isDirty,
  isTerminal,
  newOutcome,
  outcomeStrip,
  runKey,
  summaryLine,
  windowEnd,
  zoneLabel,
  zoneOptions,
  type ScheduleDraft,
  type ScheduleEdit,
  type OutcomeStrip,
  type ScheduleError,
} from "./autoScanModel";
import { markAdminDenied, useCanAdminister } from "./permissions";

type Mode = "view" | "setup" | "edit";

const INTERVALS = [
  { minutes: DAILY_MINUTES, label: "Daily (recommended)" },
  { minutes: WEEKLY_MINUTES, label: "Weekly" },
];

function Note({ tone, children }: { tone: "warning" | "danger" | "info"; children: ReactNode }) {
  if (tone === "info") {
    return (
      <p role="status" className="flex items-start gap-1.5 text-xs text-(--color-text-muted)">
        {children}
      </p>
    );
  }
  const cls = {
    warning: "border-l-(--color-warning-text) bg-(--color-warning-soft)",
    danger: "border-l-(--color-danger-text) bg-(--color-danger-soft)",
  }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-md border-l-2 px-3 py-2.5 text-xs ${cls}`}
    >
      {children}
    </div>
  );
}

function Field({ label, invalid, children }: { label: string; invalid?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className={`block text-xs ${invalid ? "text-(--color-danger-text)" : "text-(--color-text-muted)"}`}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function AutoScanPanel({ c }: { c: Connection }) {
  // Keyed by connection so a draft or an error never carries to another one.
  return <AutoScanBody key={c.id} c={c} />;
}

function AutoScanBody({ c }: { c: Connection }) {
  const canAdminister = useCanAdminister();
  const q = useGetAwsScanScheduleQuery(c.id);
  // Polled so a scan that finishes while the page is open is noticed.
  const runsQ = useListAwsScanRunsQuery({ connectorId: c.id }, { pollingInterval: 20_000, skipPollingIfUnfocused: true });
  const [save, { isLoading: saving }] = useUpdateAwsScanScheduleMutation();

  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [err, setErr] = useState<ScheduleError | null>(null);
  const [saved, setSaved] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);

  const s = q.currentData;

  // The result strip: a scan that finishes while this page is open says how it
  // went for a while, then goes. Runs already finished on arrival are marked
  // seen first, so opening the page does not replay yesterday's result.
  const seen = useRef<Set<string> | null>(null);
  const [outcome, setOutcome] = useState<OutcomeStrip | null>(null);
  const zone = canonicalZone(s?.timezone ?? browserZone());
  const runData = runsQ.currentData?.data;
  useEffect(() => {
    if (!runData) return;
    if (seen.current === null) {
      seen.current = new Set(runData[0] && isTerminal(runData[0].status) ? [runKey(runData[0])] : []);
      return;
    }
    const fresh = newOutcome(runData, seen.current);
    if (!fresh) return;
    seen.current.add(runKey(fresh));
    const strip = outcomeStrip(fresh, zone);
    if (strip) setOutcome(strip);
  }, [runData, zone]);
  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(() => setOutcome(null), outcome.visibleMs);
    return () => window.clearTimeout(t);
  }, [outcome]);

  // "Saved" fades after a few seconds; focus returns to Edit so a keyboard
  // user is not left on a control that has just disappeared.
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 4000);
    return () => window.clearTimeout(t);
  }, [saved]);
  useEffect(() => {
    if (mode === "view" && wasEditing.current) editRef.current?.focus();
    wasEditing.current = mode !== "view";
  }, [mode]);

  const open = (m: Mode) => {
    if (!s) return;
    setErr(null);
    setSaved(false);
    setDraft(draftFrom(s));
    setMode(m);
  };
  const cancel = () => {
    setErr(null);
    setDraft(null);
    setMode("view");
  };

  const fail = (e: unknown) => {
    const ce = classifyScheduleError(e, "save");
    if ((e as { status?: number })?.status === 403) markAdminDenied();
    setErr(ce);
  };

  // Turn on with the chosen settings, or save edits.
  const commit = async () => {
    if (!s || !draft) return;
    const problem = draftProblem(draft);
    if (problem) {
      setErr({ kind: "invalid", message: problem, retryable: false });
      return;
    }
    setErr(null);
    try {
      await save({ id: c.id, ...buildSet(draft) }).unwrap();
      setDraft(null);
      setMode("view");
      setSaved(true);
    } catch (e) {
      fail(e); // the draft stays, so nothing the admin chose is lost
    }
  };

  // Off and Resume are one click: nothing to choose.
  const change = async (edit: ScheduleEdit) => {
    if (!s) return;
    setErr(null);
    retryRef.current = () => void change(edit);
    try {
      await save({ id: c.id, ...buildChange(s, edit) }).unwrap();
      setSaved(edit.enabled === true);
    } catch (e) {
      fail(e);
    }
  };

  const onSwitch = (on: boolean) => {
    if (!s) return;
    if (on) {
      if (s.enabled) return;
      open("setup");
    } else if (mode === "setup") {
      cancel();
    } else {
      setMode("view");
      setDraft(null);
      void change({ enabled: false });
    }
  };

  const runs = runsQ.currentData?.data ?? [];
  const latest = runs[0];
  const lastFailed = latest && (latest.status === "failed" || latest.status === "abandoned") ? latest : undefined;
  const lastPublished = runs.find((r) => r.status === "published");
  const interval = s?.interval_minutes ?? DAILY_MINUTES;
  const stale =
    !!s?.enabled && !s.paused_reason && !!lastPublished?.queued_at &&
    Date.now() - new Date(lastPublished.queued_at).getTime() > 2 * interval * 60_000;

  const loadErr = q.isError && !s ? classifyScheduleError(q.error, "load") : null;
  // These two cannot be fixed from here, so the controls give way to the reason.
  const blocked = loadErr?.kind === "missing" || loadErr?.kind === "revoked" || err?.kind === "missing" || err?.kind === "revoked";
  const editing = mode !== "view";
  const paused = !!s?.paused_reason;
  const switchOn = !!s && (s.enabled || mode === "setup");
  const problem = draft ? draftProblem(draft) : null;
  const dirty = s && draft ? isDirty(s, draft) : false;

  const status = !s
    ? null
    : paused
      ? { text: "Paused", cls: "text-(--color-danger-text)" }
      : s.enabled
        ? { text: "On", cls: "text-(--color-text)" }
        : { text: "Off", cls: "text-(--color-text-muted)" };

  const actions = s && !blocked ? (
    <>
      {saved ? (
        <span role="status" className="flex items-center gap-1 text-(--color-text-muted)">
          <Check className="size-3.5" aria-hidden /> Saved
        </span>
      ) : null}
      <label className="flex items-center gap-2 text-[13px] font-medium">
        <span className={status?.cls}>{status?.text}</span>
        <Switch
          checked={switchOn}
          disabled={!canAdminister || saving}
          aria-label="Scan this account automatically"
          onCheckedChange={onSwitch}
        />
      </label>
    </>
  ) : undefined;

  const field = err?.field;
  const weekly = !!draft && draft.interval_minutes === WEEKLY_MINUTES;

  return (
    <Panel
      title="Auto-scan"
      description={
        s?.enabled && !editing && !paused
          ? undefined
          : "AuthSec rescans this account on a schedule with the same read-only role, so the inventory stays current without anyone clicking Scan now."
      }
      actions={actions}
    >
      {q.isLoading ? (
        <p className="text-xs text-(--color-text-muted)">Loading…</p>
      ) : loadErr ? (
        <p role="alert" className="text-xs text-(--color-danger-text)">
          {loadErr.message}
          {loadErr.retryable ? (
            <>
              {" "}
              <button type="button" className="underline" onClick={() => void q.refetch()}>
                Try again
              </button>
            </>
          ) : null}
        </p>
      ) : s && blocked ? (
        <Note tone="warning">
          <AlertTriangle className="mt-px size-3.5 flex-none" aria-hidden />
          <span>{err?.message}</span>
        </Note>
      ) : s ? (
        <div className="space-y-3">
          {editing && draft ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void commit();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Frequency" invalid={field === "interval_minutes"}>
                  <Select
                    value={String(draft.interval_minutes)}
                    disabled={saving}
                    onValueChange={(v) => setDraft({ ...draft, interval_minutes: Number(v) })}
                  >
                    <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label="How often to scan" aria-invalid={field === "interval_minutes"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(INTERVALS.some((i) => i.minutes === draft.interval_minutes)
                        ? INTERVALS
                        : [...INTERVALS, { minutes: draft.interval_minutes, label: intervalName(draft.interval_minutes) }]
                      ).map((i) => (
                        <SelectItem key={i.minutes} value={String(i.minutes)}>
                          {i.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {weekly ? (
                  <Field label="Day" invalid={field === "day_of_week"}>
                    <Select
                      value={String(draft.day_of_week)}
                      disabled={saving}
                      onValueChange={(v) => setDraft({ ...draft, day_of_week: Number(v) })}
                    >
                      <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label="Day of the week" aria-invalid={field === "day_of_week"}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                <Field label="Time" invalid={field === "time_of_day"}>
                  <Select
                    value={draft.time_of_day}
                    disabled={saving}
                    onValueChange={(v) => setDraft({ ...draft, time_of_day: v })}
                  >
                    <SelectTrigger size="sm" className="h-8 w-full text-xs tabular-nums" aria-label="Time of day" aria-invalid={field === "time_of_day"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t} className="tabular-nums">
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Timezone" invalid={field === "timezone"}>
                  <Select
                    value={draft.timezone}
                    disabled={saving}
                    onValueChange={(v) => setDraft({ ...draft, timezone: v })}
                  >
                    <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label="Timezone" aria-invalid={field === "timezone"}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {zoneOptions(draft.timezone, canonicalZone(browserZone())).map((z) => (
                        <SelectItem key={z} value={z}>
                          {zoneLabel(z)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <p className="text-xs text-(--color-text-muted)">
                {problem ??
                  `${weekly ? `Every ${WEEKDAYS.find((d) => d.value === draft.day_of_week)?.label ?? ""}, scans` : "Every day, scans"} start between ${draft.time_of_day} and ${windowEnd(draft.time_of_day)} (${zoneLabel(draft.timezone)}). The spread keeps accounts from all reaching AWS at once.`}
              </p>

              {err ? (
                <p role="alert" className="text-xs text-(--color-danger-text)">
                  {err.message}
                  {err.retryable ? " Your choices are kept." : ""}
                </p>
              ) : null}

              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving || !!problem || (mode === "edit" && !dirty)}>
                  {saving ? "Saving…" : mode === "setup" ? "Set auto-scan" : "Save changes"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={saving} onClick={cancel}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : s.enabled && !paused ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-(--color-border-subtle) px-3 py-2 text-[13px]">
              <span className="size-1.5 flex-none rounded-full bg-(--color-success)" aria-hidden />
              <span className="font-medium text-(--color-text)">{summaryLine(s)}</span>
              <span className="text-(--color-text-muted)">
                {s.scheduler_active
                  ? s.next_due_at
                    ? `Next scan ${formatInZone(s.next_due_at, zone)} (${formatDistanceToNowStrict(new Date(s.next_due_at), { addSuffix: true })})`
                    : null
                  : "The scan scheduler is not running on the server, so nothing will run yet"}
              </span>
              {stale ? <span className="text-(--color-warning-text)">Inventory may be out of date</span> : null}
              {canAdminister ? (
                <Button ref={editRef} size="sm" variant="outline" className="ml-auto h-7 gap-1 text-xs" disabled={saving} onClick={() => open("edit")}>
                  <Pencil className="size-3" aria-hidden /> Edit
                </Button>
              ) : null}
            </div>
          ) : !s.enabled ? (
            <p className="text-xs text-(--color-text-muted)">
              {canAdminister
                ? "Off. AuthSec scans this account only when you click Scan now. Turn Auto-scan on to choose a schedule."
                : "Off. Only an administrator can turn this on."}
            </p>
          ) : null}

          {!editing && paused ? (
            <Note tone="danger">
              <Pause className="mt-px size-3.5 flex-none" aria-hidden />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <strong className="font-medium">Auto-scan paused</strong> after 3 failed scheduled scans.{" "}
                  {safeErrorProse(s.paused_reason.replace(/^repeated_failures:?\s*/, "")) || null}{" "}
                  {failureHint(s.paused_reason) ?? failureHint(lastFailed?.last_error) ?? ""} Settings are locked until you resume.
                </div>
                {canAdminister ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => void change({ enabled: true })}>
                    {saving ? "Resuming…" : "Resume"}
                  </Button>
                ) : null}
              </div>
            </Note>
          ) : null}

          {!editing && outcome ? (
            <div
              role={outcome.tone === "fail" ? "alert" : "status"}
              data-testid="scan-result"
              className={`flex items-start gap-2 rounded-md border-l-2 px-3 py-2 text-xs ${
                outcome.tone === "pass"
                  ? "border-l-(--color-success-text) bg-(--color-success-soft)"
                  : outcome.tone === "warn"
                    ? "border-l-(--color-warning-text) bg-(--color-warning-soft)"
                    : "border-l-(--color-danger-text) bg-(--color-danger-soft)"
              }`}
            >
              {outcome.tone === "pass" ? (
                <CheckCircle2 className="mt-px size-3.5 flex-none" aria-hidden />
              ) : outcome.tone === "warn" ? (
                <AlertTriangle className="mt-px size-3.5 flex-none" aria-hidden />
              ) : (
                <XCircle className="mt-px size-3.5 flex-none" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <strong className="font-medium">{outcome.text}.</strong> {outcome.hint}
              </span>
              <button type="button" aria-label="Dismiss" className="flex-none opacity-70 hover:opacity-100" onClick={() => setOutcome(null)}>
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}

          {!editing && !canAdminister ? (
            <p className="text-xs text-(--color-text-muted)">Only an administrator can change this.</p>
          ) : null}

          {!editing && err ? (
            <p role="alert" className="text-xs text-(--color-danger-text)">
              {err.message}
              {err.retryable && retryRef.current ? (
                <>
                  {" "}
                  <button type="button" className="underline" onClick={() => retryRef.current?.()}>
                    Try again
                  </button>
                </>
              ) : null}
            </p>
          ) : null}

          {editing || !s.enabled ? (
          <p className="text-xs text-(--color-text-muted)">
            You will see AuthSec&rsquo;s sessions in this account&rsquo;s CloudTrail on each scan. Turn auto-scan off at any
            time; Scan now keeps working either way.
          </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
