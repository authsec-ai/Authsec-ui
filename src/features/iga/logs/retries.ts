/**
 * Which failed scan a later successful scan recovered.
 *
 * A failure is recovered by the first scan of the same source that finished
 * after it. Several failures in a row are all recovered by that one success,
 * and the success names the most recent of them. Inferred from the events'
 * source and time only: the events carry no retry link of their own.
 */

import type { LogEvent } from "./fixtures";

export interface RetryLinks {
  /** A failed scan's event id → the scan that finished after it. */
  recoveredBy: Map<string, LogEvent>;
  /** A finished scan's event id → the most recent failure it followed. */
  retryOf: Map<string, LogEvent>;
}

export function linkRetries(events: readonly LogEvent[]): RetryLinks {
  const recoveredBy = new Map<string, LogEvent>();
  const retryOf = new Map<string, LogEvent>();
  const oldestFirst = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  /** Per source: failures not yet followed by a success. */
  const open = new Map<string, LogEvent[]>();
  for (const e of oldestFirst) {
    if (e.kind === "scan_failed") {
      open.set(e.source.id, [...(open.get(e.source.id) ?? []), e]);
    } else if (e.kind === "scan_finished") {
      const failed = open.get(e.source.id);
      if (!failed?.length) continue;
      for (const f of failed) recoveredBy.set(f.id, e);
      retryOf.set(e.id, failed[failed.length - 1]);
      open.delete(e.source.id);
    }
  }
  return { recoveredBy, retryOf };
}
