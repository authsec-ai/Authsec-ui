/**
 * Logs — a labelled preview on sample events (SPEC-console-revamp.md,
 * "Logs — preview"). No network call: everything comes from ./fixtures.
 *
 * Filters, search and time range live in the URL (q, kind, source, actor,
 * range), so a view can be shared and Back restores it.
 */

import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";

import { Search } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FacetCheckList } from "@/features/iga/shared/components/FacetSelect";
import { useListFilters, useSlashToSearch } from "@/features/iga/shared/useListFilters";
import type { GraphFacetValue } from "@/app/api/igaGraphApi";

import { IgaBadge } from "@/features/iga/shared/components/IgaBadge";

import { EventDrawer } from "./EventDrawer";
import { KindGlyph } from "./KindGlyph";
import { KIND_LABEL, LOG_EVENTS, LOG_KINDS, SAMPLE_NOW, type LogEvent, type LogKind } from "./fixtures";
import { linkRetries } from "./retries";

/** Which failures a later scan recovered: fixed for the sample set. */
const RETRIES = linkRetries(LOG_EVENTS);

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

/** The Kind dropdown's choices: each a set of kinds, "Failures" first after All. */
const KIND_GROUPS: { key: string; label: string; kinds: LogKind[] }[] = [
  { key: "all", label: "All events", kinds: [] },
  { key: "failed", label: "Failures", kinds: ["scan_failed"] },
  { key: "scan", label: "Scans", kinds: ["scan_queued", "scan_running", "scan_finished", "scan_failed"] },
  { key: "published", label: "Publications", kinds: ["publication_published"] },
  { key: "classified", label: "Classifications", kinds: ["classification_decided"] },
  { key: "connection", label: "Connections", kinds: ["connection_added", "connection_revoked"] },
  { key: "sighting", label: "Sightings", kinds: ["sighting_seen"] },
  { key: "signin", label: "Sign-ins", kinds: ["sign_in"] },
];

const SELECT_CLASS =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

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

  // "Collapse scan steps": a scan that finished or failed is said by that one
  // event; its queued and running steps are folded into it.
  const [collapsed, setCollapsed] = useState(true);
  const visible = matching();
  const settled = new Set(visible.filter((e) => e.object.kind === "scan" && (e.kind === "scan_finished" || e.kind === "scan_failed")).map((e) => e.object.id));
  const folded = (e: LogEvent) => collapsed && e.object.kind === "scan" && (e.kind === "scan_queued" || e.kind === "scan_running") && settled.has(e.object.id);
  // Newest first, always: a later success sits above the failure it recovered.
  const shown = visible.filter((e) => !folded(e)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  // Only failures nothing has recovered since are worth a callout.
  const failures = LOG_EVENTS.filter((e) => e.kind === "scan_failed" && !RETRIES.recoveredBy.has(e.id)).sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  const kindGroup = KIND_GROUPS.find((g) => g.kinds.length === kinds.length && g.kinds.every((k) => kinds.includes(k)))?.key ?? "custom";
  const facet = (skip: Facet, options: [string, string][], of: (e: LogEvent) => string): GraphFacetValue[] => {
    const rows = matching(skip);
    return options.map(([value, label]) => ({ value, label, count: rows.filter((e) => of(e) === value).length }));
  };
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

  const clearAll = () => {
    f.setSearchText("");
    f.clearKeys(FILTER_KEYS);
  };
  // One URL write: two in the same tick both start from the old URL, and the
  // second would bring back the filters the first cleared.
  const [, setParams] = useSearchParams();
  const showFailures = () => {
    f.setSearchText("");
    setParams(new URLSearchParams([["kind", "scan_failed"]]), { replace: true });
  };
  const filteredAny = !!(f.q || kinds.length || sources.length || actors.length || range);

  const open = (e: LogEvent) => {
    setSelected(e);
    setDrawerOpen(true);
  };

  return (
    <ConsolePage
      title={
        <span className="inline-flex flex-wrap items-center gap-2.5">
          Logs
          <span
            title="These events are made up. No scan, connection or sign-in in your workspace produced them."
            className="rounded-full bg-(--color-warning-soft) px-2.5 py-0.5 text-xs font-medium text-(--color-warning-text)"
          >
            Sample events
          </span>
        </span>
      }
      description="Scans, publications, classifications and sign-ins, newest first."
    >
      {failures.length && kindGroup !== "failed" ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-2">
          <IgaBadge tone="warning">
            {failures.length} sample {failures.length === 1 ? "scan" : "scans"} not recovered
          </IgaBadge>
          <span className="min-w-0 flex-[1_1_280px] truncate text-[13px] text-(--color-text-muted)" title={failures[0].reason ?? failures[0].sentence}>
            Failed and no later scan of the same source has succeeded. Latest: {failures[0].reason ?? failures[0].sentence}
          </span>
          {/* Lists every failure, recovered ones too (each says which). */}
          <Button variant="ghost" size="sm" className="h-8" onClick={showFailures}>
            Show all failures
          </Button>
        </div>
      ) : null}

      {/* overflow-clip, not hidden: hidden would stop the day headers sticking. */}
      <section className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
        <div data-graph-search data-compact-toolbar className="flex flex-wrap items-center gap-2.5 border-b border-(--color-border-subtle) px-4 py-3">
          <label className="relative flex min-w-[220px] max-w-[340px] flex-1 basis-[240px] items-center">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <Input
              type="search"
              value={f.searchText}
              onChange={(e) => f.setSearchText(e.target.value)}
              placeholder="Search events, accounts, people"
              aria-label="Search events"
              className="h-9 pl-9"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <select
            aria-label="Event kind"
            value={kindGroup}
            onChange={(e) => f.setMany("kind", KIND_GROUPS.find((g) => g.key === e.target.value)?.kinds ?? [])}
            className={SELECT_CLASS}
          >
            {kindGroup === "custom" ? <option value="custom">Custom selection</option> : null}
            {KIND_GROUPS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
          <select aria-label="Time range" value={range ?? "all"} onChange={(e) => f.set("range", e.target.value === "all" ? null : e.target.value)} className={SELECT_CLASS}>
            <option value="all">All time</option>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <FacetPopover label="Source" noun="sources" value={sources} options={sourceOptions} onChange={(v) => f.setMany("source", v)} />
          <FacetPopover label="Actor" noun="actors" value={actors} options={actorOptions} onChange={(v) => f.setMany("actor", v)} />
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-(--color-text)">
            <input type="checkbox" checked={collapsed} onChange={() => setCollapsed((c) => !c)} className="size-4 accent-(--color-primary)" />
            Collapse scan steps
          </label>
          <span className="flex-1" />
          {filteredAny ? (
            <button type="button" onClick={clearAll} className="h-9 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)">
              Clear filters
            </button>
          ) : null}
          <span role="status" className="text-[13px] tabular-nums text-(--color-text-muted)">
            {shown.length} shown{collapsed ? " (scan steps collapsed)" : ""}
          </span>
        </div>

        {LOG_EVENTS.length === 0 ? (
          <EmptyState title="No events yet" body="Events appear here as scans run and connections change." />
        ) : shown.length === 0 ? (
          <EmptyState
            title="No events match"
            body="Widen the time range or remove a filter to see more."
            action={
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear filters
              </Button>
            }
          />
        ) : (
          days.map((day) => (
            <section key={day.key} aria-labelledby={`logs-day-${day.key}`}>
              <h2
                id={`logs-day-${day.key}`}
                className="sticky top-0 z-[1] flex items-baseline gap-2 border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-4 py-2.5 text-[13px] font-semibold text-(--color-text)"
              >
                {day.heading}
                <span className="text-xs font-normal tabular-nums text-(--color-text-muted)">
                  {day.events.length} {day.events.length === 1 ? "event" : "events"}
                </span>
              </h2>
              <ol>
                {day.events.map((e) => (
                  <li key={e.id} className="border-b border-(--color-border-subtle) last:border-b-0">
                    <button
                      type="button"
                      data-event-id={e.id}
                      aria-haspopup="dialog"
                      onClick={() => open(e)}
                      className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-left hover:bg-(--color-surface-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary)"
                    >
                      <time dateTime={e.at} className="pt-0.5 font-mono text-xs tabular-nums text-(--color-text-muted)">
                        {format(new Date(e.at), "HH:mm")}
                      </time>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          {/* A failure a later scan recovered is history, not an alarm: amber, not red. */}
                          <KindGlyph kind={e.kind} className="font-semibold" tone={e.kind === "scan_failed" && RETRIES.recoveredBy.has(e.id) ? "warning" : undefined} />
                          <span className="break-words text-sm leading-snug text-(--color-text)">{e.sentence}</span>
                          {e.kind === "scan_failed" ? (
                            RETRIES.recoveredBy.has(e.id) ? <IgaBadge tone="success">Recovered</IgaBadge> : <IgaBadge tone="danger">Not recovered</IgaBadge>
                          ) : null}
                        </span>
                        <RetryNote e={e} />
                        <span className="break-words text-xs text-(--color-text-muted)">
                          {e.source.label} · {e.actor.label}
                          {collapsed && e.object.kind === "scan" && (e.kind === "scan_finished" || e.kind === "scan_failed") ? " · queued and ran before this" : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </section>

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

/** The other half of a failure and its retry, so the two read as one story. */
function RetryNote({ e }: { e: LogEvent }) {
  const time = (x: LogEvent) => `${isToday(new Date(x.at)) ? "" : `${format(new Date(x.at), "d MMM")} `}${format(new Date(x.at), "HH:mm")}`;
  if (e.kind === "scan_failed") {
    const ok = RETRIES.recoveredBy.get(e.id);
    return ok ? <span className="text-xs text-(--color-success-text)">Retried successfully at {time(ok)} ({ok.object.name})</span> : null;
  }
  if (e.kind === "scan_finished") {
    const failed = RETRIES.retryOf.get(e.id);
    return failed ? <span className="text-xs text-(--color-text-muted)">Recovered the failed scan at {time(failed)} ({failed.object.name})</span> : null;
  }
  return null;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="m-4 rounded-lg border border-dashed border-(--color-border-strong) px-6 py-10 text-center">
      <p className="text-sm font-semibold text-(--color-text)">{title}</p>
      <p className="mt-1 text-sm text-(--color-text-muted)">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
