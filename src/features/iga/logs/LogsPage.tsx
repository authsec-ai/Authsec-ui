/**
 * Logs — a labelled preview on sample events (SPEC-console-revamp.md,
 * "Logs — preview"). No network call: everything comes from ./fixtures.
 *
 * Filters, search and time range live in the URL (q, kind, source, actor,
 * range), so a view can be shared and Back restores it.
 */

import { useState, type ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";

import { AppliedFilters, ConsoleFilterBar, type AppliedFilter } from "@/components/console/iam-console";
import { ConsolePage } from "@/components/console/ConsolePage";
import { toneClasses } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FacetCheckList } from "@/features/iga/shared/components/FacetSelect";
import { useListFilters, useSlashToSearch } from "@/features/iga/shared/useListFilters";
import { cn } from "@/lib/utils";
import type { GraphFacetValue } from "@/app/api/igaGraphApi";

import { EventDrawer } from "./EventDrawer";
import { KindGlyph } from "./KindGlyph";
import { KIND_LABEL, LOG_EVENTS, LOG_KINDS, SAMPLE_NOW, type LogEvent } from "./fixtures";

const RANGES = [
  { value: "1h", label: "Last hour", ms: 60 * 60_000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60_000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
] as const;

const SOURCES = [...new Map(LOG_EVENTS.map((e) => [e.source.id, e.source.label])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
const ACTORS = [...new Map(LOG_EVENTS.map((e) => [e.actor.id, e.actor.label])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

const FILTER_SPEC = {
  q: null,
  kind: LOG_KINDS,
  source: SOURCES.map(([id]) => id),
  actor: ACTORS.map(([id]) => id),
  range: RANGES.map((r) => r.value),
} as const;

const FILTER_KEYS = ["q", "kind", "source", "actor", "range"];

type Facet = "kind" | "source" | "actor";

function dayHeading(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE d MMMM");
}

export default function LogsPage() {
  const f = useListFilters(FILTER_SPEC);
  useSlashToSearch();

  const kinds = f.values("kind");
  const sources = f.values("source");
  const actors = f.values("actor");
  const range = f.value("range");
  const q = f.q?.toLowerCase();

  const [selected, setSelected] = useState<LogEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** The events passing every filter except `skip` — so a facet's counts show what choosing it would give. */
  const matching = (skip?: Facet) => {
    const cutoff = range ? SAMPLE_NOW - RANGES.find((r) => r.value === range)!.ms : null;
    return LOG_EVENTS.filter((e) => {
      if (skip !== "kind" && kinds.length && !kinds.includes(e.kind)) return false;
      if (skip !== "source" && sources.length && !sources.includes(e.source.id)) return false;
      if (skip !== "actor" && actors.length && !actors.includes(e.actor.id)) return false;
      if (cutoff !== null && Date.parse(e.at) < cutoff) return false;
      if (q && ![e.sentence, KIND_LABEL[e.kind], e.source.label, e.actor.label, e.object.name].some((t) => t.toLowerCase().includes(q))) return false;
      return true;
    });
  };

  const shown = matching();
  const facet = (skip: Facet, options: [string, string][], of: (e: LogEvent) => string): GraphFacetValue[] => {
    const rows = matching(skip);
    return options.map(([value, label]) => ({ value, label, count: rows.filter((e) => of(e) === value).length }));
  };
  const kindOptions = facet("kind", LOG_KINDS.map((k) => [k, KIND_LABEL[k]]), (e) => e.kind);
  const sourceOptions = facet("source", SOURCES, (e) => e.source.id);
  const actorOptions = facet("actor", ACTORS, (e) => e.actor.id);

  const days: { key: string; heading: string; events: LogEvent[] }[] = [];
  for (const e of shown) {
    const d = new Date(e.at);
    const key = format(d, "yyyy-MM-dd");
    const last = days[days.length - 1];
    if (last?.key === key) last.events.push(e);
    else days.push({ key, heading: dayHeading(d), events: [e] });
  }

  const applied: AppliedFilter[] = [
    ...kinds.map((k) => ({ key: `kind:${k}`, label: KIND_LABEL[k as keyof typeof KIND_LABEL], onRemove: () => f.setMany("kind", kinds.filter((v) => v !== k)) })),
    ...sources.map((s) => ({ key: `source:${s}`, label: SOURCES.find(([id]) => id === s)?.[1] ?? s, onRemove: () => f.setMany("source", sources.filter((v) => v !== s)) })),
    ...actors.map((a) => ({ key: `actor:${a}`, label: ACTORS.find(([id]) => id === a)?.[1] ?? a, onRemove: () => f.setMany("actor", actors.filter((v) => v !== a)) })),
    ...(range ? [{ key: "range", label: RANGES.find((r) => r.value === range)!.label, onRemove: () => f.set("range", null) }] : []),
    ...(f.q ? [{ key: "q", label: `Search: ${f.q}`, onRemove: () => { f.setSearchText(""); f.set("q", null); } }] : []),
  ];
  const clearAll = () => {
    f.setSearchText("");
    f.clearKeys(FILTER_KEYS);
  };

  const open = (e: LogEvent) => {
    setSelected(e);
    setDrawerOpen(true);
  };

  return (
    <ConsolePage title="Logs" description="Scans, publications, classifications, connections and sign-ins, newest first.">
      <div role="note" className={cn("rounded-lg border px-4 py-3", toneClasses.neutral.banner)}>
        <p className="text-sm font-semibold text-(--color-text)">Preview — sample events.</p>
        <p className="mt-0.5 text-sm text-(--color-text-muted)">
          These events are made up. No scan, connection or sign-in in your workspace produced them.
        </p>
      </div>

      <div data-graph-search>
        <ConsoleFilterBar
          search={f.searchText}
          onSearchChange={f.setSearchText}
          searchPlaceholder="Search events"
          trailing={
            <>
              <FacetPopover label="Kind" noun="kinds" value={kinds} options={kindOptions} onChange={(v) => f.setMany("kind", v)} />
              <FacetPopover label="Source" noun="sources" value={sources} options={sourceOptions} onChange={(v) => f.setMany("source", v)} />
              <FacetPopover label="Actor" noun="actors" value={actors} options={actorOptions} onChange={(v) => f.setMany("actor", v)} />
              <div role="group" aria-label="Time range" className="inline-flex overflow-hidden rounded-md border border-(--color-border-strong)">
                {[{ value: undefined, label: "All time" }, ...RANGES].map((r) => {
                  const active = range === r.value;
                  return (
                    <button
                      key={r.value ?? "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => f.set("range", r.value ?? null)}
                      className={cn(
                        "h-9 border-r border-(--color-border-strong) px-2.5 text-xs font-semibold last:border-r-0 focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary)",
                        active
                          ? "bg-(--color-primary-soft) text-(--color-primary-text)"
                          : "bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                      )}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </>
          }
          below={<AppliedFilters filters={applied} onClearAll={clearAll} />}
        />
      </div>

      <p role="status" className="text-sm tabular-nums text-(--color-text-muted)">
        {shown.length} of {LOG_EVENTS.length} events
      </p>

      {LOG_EVENTS.length === 0 ? (
        <EmptyState title="No events yet" body="Events appear here as scans run and connections change." />
      ) : shown.length === 0 ? (
        <EmptyState
          title="No events match these filters"
          body="Widen the time range or remove a filter to see more."
          action={
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.key} aria-labelledby={`logs-day-${day.key}`} className="space-y-2">
              <h2 id={`logs-day-${day.key}`} className="flex items-baseline gap-2 text-[13px] font-semibold text-(--color-text)">
                {day.heading}
                <span className="text-xs font-normal tabular-nums text-(--color-text-muted)">
                  {day.events.length} {day.events.length === 1 ? "event" : "events"}
                </span>
              </h2>
              <ol className="divide-y divide-(--color-border-subtle) overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
                {day.events.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      data-event-id={e.id}
                      aria-haspopup="dialog"
                      onClick={() => open(e)}
                      className="grid w-full gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-(--color-surface-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary) sm:grid-cols-[3rem_12.5rem_minmax(0,1fr)]"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:contents">
                        <time dateTime={e.at} className="text-xs tabular-nums leading-5 text-(--color-text-muted)">
                          {format(new Date(e.at), "HH:mm")}
                        </time>
                        <KindGlyph kind={e.kind} />
                      </div>
                      <span className="min-w-0">
                        <span className="block break-words text-[13px] leading-5 text-(--color-text)">{e.sentence}</span>
                        <span className="block break-words text-xs leading-5 text-(--color-text-muted)">
                          {e.source.label} · {e.actor.label}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <EventDrawer event={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </ConsolePage>
  );
}

function FacetPopover({ label, noun, value, options, onChange }: {
  label: string; noun: string; value: string[]; options: GraphFacetValue[]; onChange: (values: string[]) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9" aria-label={value.length ? `${label}, ${value.length} selected` : label}>
          {label}
          {value.length ? (
            <span className="rounded bg-(--color-primary-soft) px-1.5 text-[11px] font-semibold tabular-nums text-(--color-primary-text)">{value.length}</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-3">
        <p className="text-xs font-medium text-(--color-text-muted)">{label}</p>
        <FacetCheckList label={label} noun={noun} value={value} options={options} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-(--color-border-strong) px-6 py-10 text-center">
      <p className="text-sm font-semibold text-(--color-text)">{title}</p>
      <p className="mt-1 text-sm text-(--color-text-muted)">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
