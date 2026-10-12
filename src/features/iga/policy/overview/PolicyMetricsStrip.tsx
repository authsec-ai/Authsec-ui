/**
 * Policy › Overview: the hourly metrics (SPEC-iga-phase3-policy.md §8.12, §9.3)
 * from GET /policy/metrics, the last 24 hours (the server's default range).
 *
 * Posture counts are the latest row's, as of the time that row was computed.
 * Change counts are summed over the hours that have a row. An hour with no row
 * is "Not recorded for this hour", never a zero. "Removed" counts only a
 * service with no known route left: a service excluded from a role's IAM
 * permissions but still reachable through a resource policy is counted apart
 * (A43). `already_excluded` is not a change and is not shown.
 *
 * Contract: `{ ws }`, mounted by PolicyOverviewPage.
 */

import type { ReactNode } from "react";
import { format } from "date-fns";

import { useGetGovMetricsQuery, type GovMetricsRow } from "@/app/api/igaPolicyReadsApi";
import { MetricStrip, type MetricStripItemDef } from "@/components/console/MetricStrip";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import { classifyPolicyError, PolicyLoadFailure, plural, relTime } from "../shared";

/** 45 s → "45 s", 12 min → "12 min", 90 min → "1 h 30 min", 50 h → "2 d 2 h". */
function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

const hourLabel = (iso: string) => format(new Date(iso), "d MMM HH:mm");

/** The aligned UTC hours that start in [from, to), oldest first (the server's hour grid). */
function hoursBetween(from: string, to: string): number[] {
  const HOUR = 3_600_000;
  const start = Math.ceil(Date.parse(from) / HOUR) * HOUR;
  const end = Date.parse(to);
  const out: number[] = [];
  for (let t = start; t < end && out.length < 200; t += HOUR) out.push(t);
  return out;
}

/** The newest row that has this timing; percentiles are per hour and are not combined. */
function latestWith(rows: GovMetricsRow[], key: "approval_p50_seconds" | "approval_p95_seconds" | "apply_to_verified_p95_seconds") {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (v !== null && v !== undefined) return { seconds: v, hour: rows[i].hour };
  }
  return null;
}

export function PolicyMetricsStrip({ ws }: { ws: string }) {
  const q = useGetGovMetricsQuery({ ws }, { refetchOnMountOrArgChange: true });
  const failure = q.isError ? classifyPolicyError(q.error) : null;

  let body: ReactNode;
  if (q.isLoading) {
    body = (
      <div role="status" aria-live="polite" className="space-y-2">
        <span className="sr-only">Loading metrics…</span>
        <div className="h-16 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-hidden="true" />
      </div>
    );
  } else if (failure) {
    body = <PolicyLoadFailure failure={failure} subject="the metrics" onRetry={() => void q.refetch()} />;
  } else if (q.data) {
    const rows = q.data.data;
    const s = q.data.meta.summary;
    if (rows.length === 0 || s.latest_hour === null) {
      body = (
        <div className="rounded-lg border border-dashed border-(--color-border-strong) px-6 py-6 text-center">
          <p className="text-sm font-semibold text-(--color-text)">Metrics appear after the first hourly rollup</p>
          <p className="mt-1 text-xs text-(--color-text-muted)">
            Nothing is counted as zero while no hour has been recorded. Counts of removed, excluded and pending services start with the first rollup.
          </p>
        </div>
      );
    } else {
      const posture: MetricStripItemDef[] = [
        { key: "removed", label: "Removed (no known route left)", value: s.removed, tone: "success" },
        { key: "remain", label: "Excluded, routes remain", value: s.excluded_routes_remain, tone: s.excluded_routes_remain > 0 ? "warning" : "neutral" },
        { key: "unknown", label: "Excluded, routes unknown", value: s.excluded_routes_unknown, tone: s.excluded_routes_unknown > 0 ? "warning" : "neutral" },
        { key: "pending", label: "Still applying", value: s.pending, tone: s.pending > 0 ? "primary" : "neutral" },
      ];
      const changes: MetricStripItemDef[] = [
        { key: "newly-excluded", label: "Newly excluded", value: s.newly_excluded, tone: "neutral" },
        { key: "newly-unexcluded", label: "Newly unexcluded", value: s.newly_unexcluded, tone: s.newly_unexcluded > 0 ? "warning" : "neutral" },
      ];
      const approvalP50 = latestWith(rows, "approval_p50_seconds");
      const approvalP95 = latestWith(rows, "approval_p95_seconds");
      const applyP95 = latestWith(rows, "apply_to_verified_p95_seconds");

      const byHour = new Map(rows.map((r) => [Date.parse(r.hour), r]));
      const hours = hoursBetween(s.from, s.to);

      body = (
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-(--color-text-muted)">
              Now{s.posture_as_of ? `, as of ${relTime(s.posture_as_of)}` : ""}
            </p>
            <MetricStrip items={posture} aria-label="Policy posture now" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-(--color-text-muted)">
              Changes in the last 24 hours{s.hours_missing > 0 ? `, ${plural(s.hours_with_row, "recorded hour")} only` : ""}
            </p>
            <MetricStrip items={changes} aria-label="Policy changes in the last 24 hours" />
          </div>

          {approvalP50 || approvalP95 || applyP95 ? (
            <Facts>
              {approvalP50 || approvalP95 ? (
                <Fact label="Approval time">
                  {[
                    approvalP50 ? `median ${duration(approvalP50.seconds)}` : null,
                    approvalP95 ? `95th percentile ${duration(approvalP95.seconds)}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  <span className="text-xs text-(--color-text-muted)">(latest hour with approvals: {hourLabel((approvalP95 ?? approvalP50)!.hour)})</span>
                </Fact>
              ) : null}
              {applyP95 ? (
                <Fact label="Apply to verified">
                  95th percentile {duration(applyP95.seconds)}{" "}
                  <span className="text-xs text-(--color-text-muted)">(latest hour with verifications: {hourLabel(applyP95.hour)})</span>
                </Fact>
              ) : null}
            </Facts>
          ) : null}

          {s.hours_missing > 0 ? (
            <Meta>
              {plural(s.hours_missing, "hour")} of the last {s.hours_in_range} {s.hours_missing === 1 ? "has" : "have"} no row. They are shown as not recorded, not as zero.
            </Meta>
          ) : null}

          <Meta>
            Removed counts only services with no known route left. A service excluded from a role&apos;s IAM permissions that is still reachable through a resource
            policy is counted under "Excluded, routes remain", never as removed.
          </Meta>

          {s.current_routes_remaining.length > 0 ? (
            <details className="rounded-md border border-(--color-border-subtle)">
              <summary className="cursor-pointer rounded-md px-3 py-2 text-[13px] font-medium text-(--color-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)">
                Still reachable now ({s.current_routes_remaining_total})
              </summary>
              <ul className="space-y-1.5 border-t border-(--color-border-subtle) px-3 py-2.5 text-xs text-(--color-text)">
                {s.current_routes_remaining.map((r) => (
                  <li key={`${r.role_id}:${r.service}`} className="break-words">
                    {r.text}
                  </li>
                ))}
                {s.current_routes_remaining_total > s.current_routes_remaining.length ? (
                  <li className="text-(--color-text-muted)">
                    Showing {s.current_routes_remaining.length} of {s.current_routes_remaining_total}.
                  </li>
                ) : null}
              </ul>
            </details>
          ) : null}

          <details className="rounded-md border border-(--color-border-subtle)">
            <summary className="cursor-pointer rounded-md px-3 py-2 text-[13px] font-medium text-(--color-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)">
              Hour by hour
            </summary>
            <div className="overflow-x-auto border-t border-(--color-border-subtle)">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <caption className="sr-only">Hourly policy metrics for the last 24 hours</caption>
                <thead>
                  <tr className="text-left text-(--color-text-muted)">
                    <th scope="col" className="px-3 py-2 font-medium">Hour</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Removed</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Routes remain</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Routes unknown</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Applying</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Newly excluded</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Newly unexcluded</th>
                  </tr>
                </thead>
                <tbody>
                  {[...hours].reverse().map((t) => {
                    const r = byHour.get(t);
                    return (
                      <tr key={t} className="border-t border-(--color-border-subtle)">
                        <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-normal tabular-nums text-(--color-text)">
                          {format(new Date(t), "d MMM HH:mm")}
                        </th>
                        {r ? (
                          <>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.posture_removed}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.posture_excluded_routes_remain}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.posture_excluded_routes_unknown}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.posture_pending}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.changes_newly_excluded}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.changes_newly_unexcluded}</td>
                          </>
                        ) : (
                          <td colSpan={6} className="px-3 py-1.5 text-(--color-text-muted)">
                            Not recorded for this hour
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      );
    }
  }

  return (
    <Panel title="Outcomes and metrics" description="Hourly rows from the server. The posture is the latest row's; an hour without a row is shown as not recorded.">
      {body}
    </Panel>
  );
}
