/**
 * EventTimeline — one bar per time bucket across the chosen range; the red
 * part of a bar is the events that were denied or failed in that bucket.
 */

import { useMemo } from "react";
import { format } from "date-fns";

import { HOUR, isDenied, type LogEvent, type TimeRange } from "./unifiedLog";

function stampLabel(ts: number, range: TimeRange) {
  return range.ms <= 24 * HOUR ? format(ts, "HH:mm") : format(ts, "d MMM");
}

export function EventTimeline({
  events,
  range,
  end,
}: {
  events: LogEvent[];
  range: TimeRange;
  /** Epoch ms of the right edge ("Now" when the search ran). */
  end: number;
}) {
  const start = end - range.ms;
  const size = range.ms / range.buckets;

  const buckets = useMemo(() => {
    const b = Array.from({ length: range.buckets }, () => ({ total: 0, denied: 0 }));
    for (const e of events) {
      // Anything after `end` counts in the last ("Now") bucket, as the table lists it.
      if (!Number.isFinite(e.ts) || e.ts < start) continue;
      const i = Math.min(range.buckets - 1, Math.floor((e.ts - start) / size));
      b[i].total += 1;
      if (isDenied(e)) b[i].denied += 1;
    }
    return b;
  }, [events, range.buckets, start, size]);

  const max = Math.max(1, ...buckets.map((b) => b.total));
  const total = buckets.reduce((n, b) => n + b.total, 0);
  const denied = buckets.reduce((n, b) => n + b.denied, 0);
  const ticks = [0.25, 0.5, 0.75].map((f) => start + f * range.ms);

  return (
    <figure className="m-0" aria-label={`Event timeline, ${range.label.toLowerCase()}`}>
      <div className="flex h-20 items-end gap-[3px]" role="img" aria-label={`${total} events, ${denied} denied`}>
        {buckets.map((b, i) => {
          const from = start + i * size;
          const h = b.total ? Math.max(4, (b.total / max) * 100) : 0;
          return (
            <div
              key={i}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${stampLabel(from, range)}–${stampLabel(from + size, range)} · ${b.total} events · ${b.denied} denied`}
            >
              {b.total ? (
                <div className="flex w-full flex-col overflow-hidden rounded-t-[2px]" style={{ height: `${h}%` }}>
                  {b.denied ? (
                    <div className="w-full bg-(--color-danger)" style={{ height: `${(b.denied / b.total) * 100}%` }} />
                  ) : null}
                  <div className="w-full flex-1 bg-(--color-primary)" />
                </div>
              ) : (
                <div className="h-px w-full bg-(--color-border-subtle)" />
              )}
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2.5 flex items-center justify-between gap-3 text-[length:12.5px] tabular-nums text-(--color-text-muted)">
        <span className="whitespace-nowrap">
          Events: {total.toLocaleString()} · Denied: {denied.toLocaleString()}
        </span>
        {ticks.map((t) => (
          <span key={t} className="hidden sm:inline">
            {stampLabel(t, range)}
          </span>
        ))}
        <span>Now</span>
      </figcaption>
    </figure>
  );
}
