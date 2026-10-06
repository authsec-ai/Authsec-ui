/**
 * History grouped by the scan that observed it.
 *
 * Every event a scan publishes carries ONE timestamp: the publication's own
 * (`valid_from`, `last_confirmed_at` and every lifecycle time of a pass are one
 * clock read — pinned by the backend's `p2_changes_d26` test). A list of
 * events therefore shows the same instant on every row of a scan, which reads
 * as a bug and says nothing. Grouped, the instant is said once, as what it
 * is: when AuthSec's scan DETECTED the changes — not when they happened in AWS.
 *
 * Pure: no React, no network.
 */

import type { ChangeEvent } from "@/app/api/igaGraphApi";

export interface ScanGroup {
  /** The scan's timestamp, as the API sent it. */
  at: string;
  events: ChangeEvent[];
}

/**
 * Consecutive events sharing one `at`. The feed arrives newest first, so
 * groups are runs, not a map: a page boundary can split a scan across two
 * pages and must not merge two runs that are not adjacent.
 */
export function groupByScan(events: ChangeEvent[]): ScanGroup[] {
  const out: ScanGroup[] = [];
  for (const e of events) {
    const last = out[out.length - 1];
    if (last && last.at === e.at) last.events.push(e);
    else out.push({ at: e.at, events: [e] });
  }
  return out;
}

/** A valid Date, or null: `format(new Date(x))` throws on an invalid one. */
export function parseAt(at: string | null | undefined): Date | null {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "No change since": true when the newest recorded change was detected no later
 * than the last confirmation, i.e. the object has been re-checked since and
 * nothing new was recorded. Null when either time is missing or unreadable.
 */
export function unchangedSinceNewest(newestChangeAt: string | undefined, lastConfirmedAt: string | null | undefined): boolean | null {
  const a = parseAt(newestChangeAt);
  const b = parseAt(lastConfirmedAt);
  if (!a || !b) return null;
  return a.getTime() <= b.getTime();
}
