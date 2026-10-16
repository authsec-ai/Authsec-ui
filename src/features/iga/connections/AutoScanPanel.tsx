/**
 * Auto-scan: whether this AWS connection rescans itself, and how often.
 *
 * The scans are the same ones "Scan now" starts, queued by a scheduler in the
 * AuthSec backend; nothing is installed in the customer's account and the
 * read-only role is the same. The customer is always in control: it is off
 * until an administrator turns it on, and can be turned off at any time.
 *
 * Three things are said plainly rather than left to be discovered:
 *  - a failed scan does not change the connection's status, so the last
 *    scan's failure is shown here while auto-scan is on;
 *  - a schedule that failed three times in a row pauses itself, with the
 *    reason, and waits to be resumed;
 *  - when this deployment has the scheduler switched off, nothing will run,
 *    and the panel says so instead of showing a schedule that never fires.
 *
 * Spec: authsec/.claude/specs/SPEC-aws-scheduled-scans.md
 */

import { useState, type ReactNode } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, Info, Pause } from "lucide-react";

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

import { useCanAdminister } from "./permissions";

const DEFAULT_INTERVAL = 1440;

const INTERVALS: { minutes: number; label: string }[] = [
  { minutes: 1440, label: "Daily (recommended)" },
  { minutes: 10080, label: "Weekly" },
];

function intervalLabel(minutes: number): string {
  return INTERVALS.find((i) => i.minutes === minutes)?.label ?? `Every ${minutes} minutes`;
}

function when(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM, HH:mm") : "—";
}

/** The reason a PUT was refused, in the words the server gave. */
function saveError(err: unknown): string {
  const e = err as { data?: { error?: { message?: string } | string } } | undefined;
  const inner = e?.data?.error;
  const msg = typeof inner === "string" ? inner : inner?.message;
  return msg ? safeErrorProse(msg) : "The schedule could not be saved. Try again.";
}

function Note({ tone, children }: { tone: "warning" | "danger" | "info"; children: ReactNode }) {
  if (tone === "info") {
    // Quiet: plain muted text, no strip. For facts, not problems.
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

export function AutoScanPanel({ c }: { c: Connection }) {
  const canAdminister = useCanAdminister();
  const q = useGetAwsScanScheduleQuery(c.id);
  const runsQ = useListAwsScanRunsQuery({ connectorId: c.id });
  const [save, { isLoading: saving }] = useUpdateAwsScanScheduleMutation();
  const [error, setError] = useState<string | null>(null);

  const s = q.currentData;
  const interval = s?.interval_minutes ?? DEFAULT_INTERVAL;
  const options = INTERVALS.some((i) => i.minutes === interval)
    ? INTERVALS
    : [...INTERVALS, { minutes: interval, label: intervalLabel(interval) }].sort((a, b) => a.minutes - b.minutes);

  const change = async (body: { enabled: boolean; interval_minutes?: number }) => {
    setError(null);
    try {
      await save({ id: c.id, ...body }).unwrap();
    } catch (err) {
      setError(saveError(err));
    }
  };

  // The newest run, and the newest one that finished. A failed scan leaves the
  // connection "connected", so this is the only place its failure shows up
  // while auto-scan is on.
  const runs = runsQ.currentData?.data ?? [];
  const latest = runs[0];
  const lastFailed = latest && (latest.status === "failed" || latest.status === "abandoned") ? latest : undefined;
  const lastPublished = runs.find((r) => r.status === "published");
  const stale =
    !!s?.enabled && !s.paused_reason && !!lastPublished?.queued_at &&
    Date.now() - new Date(lastPublished.queued_at).getTime() > 2 * interval * 60_000;

  return (
    <Panel
      title="Auto-scan"
      description="AuthSec rescans this account on a schedule with the same read-only role, so the inventory stays current without anyone clicking Scan now."
    >
      {q.isLoading ? (
        <p className="text-xs text-(--color-text-muted)">Loading…</p>
      ) : q.isError && !s ? (
        <p className="text-xs text-(--color-danger-text)">
          Could not load the schedule.{" "}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
      ) : s ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-[13px] font-medium text-(--color-text)">
              <Switch
                checked={s.enabled}
                disabled={!canAdminister || saving}
                aria-label="Scan this account automatically"
                onCheckedChange={(on) => void change({ enabled: on, interval_minutes: interval })}
              />
              {s.enabled ? "On" : "Off"}
            </label>
            <Select
              value={String(interval)}
              disabled={!canAdminister || saving}
              onValueChange={(v) => void change({ enabled: s.enabled, interval_minutes: Number(v) })}
            >
              <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label="How often to scan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((i) => (
                  <SelectItem key={i.minutes} value={String(i.minutes)}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!canAdminister ? (
            <p className="text-xs text-(--color-text-muted)">Only an administrator can change this.</p>
          ) : null}

          {s.enabled && !s.paused_reason ? (
            <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-y-1 text-[13px]">
              <dt className="text-xs text-(--color-text-muted)">Next scan</dt>
              <dd>
                {s.next_due_at
                  ? `${when(s.next_due_at)} (${formatDistanceToNowStrict(new Date(s.next_due_at), { addSuffix: true })})`
                  : "—"}
              </dd>
              <dt className="text-xs text-(--color-text-muted)">Last one queued</dt>
              <dd>{s.last_enqueued_at ? when(s.last_enqueued_at) : "Not yet"}</dd>
            </dl>
          ) : null}

          {s.enabled && !s.scheduler_active ? (
            <Note tone="info">
              <Info className="mt-px size-3.5 flex-none" aria-hidden />
              <span>Scheduled scans are switched off on this deployment. Your setting is saved and will apply once they are on.</span>
            </Note>
          ) : null}

          {s.paused_reason ? (
            <Note tone="danger">
              <Pause className="mt-px size-3.5 flex-none" aria-hidden />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <strong className="font-medium">Auto-scan paused</strong> after 3 failed scheduled scans.{" "}
                  {safeErrorProse(s.paused_reason.replace(/^repeated_failures:?\s*/, "")) || null}
                </div>
                {canAdminister ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={saving}
                    onClick={() => void change({ enabled: true, interval_minutes: interval })}
                  >
                    Resume
                  </Button>
                ) : null}
              </div>
            </Note>
          ) : s.enabled && lastFailed ? (
            <Note tone="info">
              <Info className="mt-px size-3.5 flex-none" aria-hidden />
              <span>
                The last scan did not finish (details under Recent scans). It will try again at the next scheduled
                time, or use Scan now.
              </span>
            </Note>
          ) : stale ? (
            <Note tone="warning">
              <AlertTriangle className="mt-px size-3.5 flex-none" aria-hidden />
              <span>The last finished scan is older than two scan intervals, so the inventory may be out of date.</span>
            </Note>
          ) : null}

          {error ? (
            <p role="alert" className="text-xs text-(--color-danger-text)">
              {error}
            </p>
          ) : null}

          <p className="text-xs text-(--color-text-muted)">
            You will see AuthSec&rsquo;s sessions in this account&rsquo;s CloudTrail on each scan. Turn auto-scan off at any
            time; Scan now keeps working either way.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
