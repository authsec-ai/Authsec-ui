/**
 * Logs with the policy product on (SPEC-iga-phase3-policy.md §9.6): an audit
 * feed of RECORDED events only, from GET /policy/events
 * (iga_gov_events_controller.go ListEvents), newest first, cursor-paged.
 *
 * No sample event is ever mixed in. Event kinds no writer feeds yet (scans,
 * publications, connection changes, legacy agent policies) are listed in the
 * kind filter as "Not recorded yet", disabled.
 *
 * Filters live in the URL: category, kind (an event name or `name.*` prefix),
 * range, actor_kind, actor, object_kind + object_id, and `policy=<id>` (the
 * link from a policy's own events), which is the object filter for a policy.
 * A changed filter drops the cursor stack (a cursor is bound to its filter).
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { Download, RefreshCw } from "lucide-react";

import {
  downloadGovEventsExport,
  EVENT_ACTOR_KINDS,
  useGetGovEventKindsQuery,
  useListGovEventsQuery,
  type GovEventExportFormat,
  type GovEventsFilter,
  type GovEventView,
} from "@/app/api/igaPolicyReadsApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  classifyPolicyError,
  humanize,
  PolicyActionError,
  PolicyLoadFailure,
  shortHash,
  type PolicyFailure,
} from "@/features/iga/policy/shared";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { Meta } from "@/features/iga/shared/components/Panel";

import { PolicyEventDrawer } from "./PolicyEventDrawer";
import { PolicyKindGlyph } from "./KindGlyph";
import { ACTOR_KIND_LABEL, actorLine, eventLinks, isUuid, reasonOf, requestIdOf } from "./policyEventFacts";
import { categoryLabel, eventLabel, NOT_RECORDED_ELSEWHERE } from "./policyEventKinds";

const PAGE = 50;

const RANGES = [
  { value: "1h", label: "Last hour", ms: 60 * 60_000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60_000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60_000 },
] as const;

const SELECT_CLASS =
  "h-9 max-w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

/** Event names and `name.*` prefixes only: what the server's kind filter accepts. */
const KIND_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*(\.\*)?$/;

function dayHeading(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE d MMMM");
}

export function PolicyLogsPage({ ws }: { ws: string }) {
  const [params, setParams] = useSearchParams();

  const category = params.get("category") ?? "";
  const rawKind = params.get("kind") ?? "";
  const kind = KIND_PATTERN.test(rawKind) ? rawKind : "";
  const range = RANGES.find((r) => r.value === params.get("range"))?.value ?? "";
  const actorKindParam = params.get("actor_kind") ?? "";
  const actorKind = (EVENT_ACTOR_KINDS as readonly string[]).includes(actorKindParam) ? (actorKindParam as GovEventsFilter["actor_kind"]) : undefined;
  const actor = params.get("actor") ?? "";
  const policyParam = params.get("policy");
  const objectKindParam = params.get("object_kind") ?? "";
  const objectIdParam = params.get("object_id") ?? "";
  // `?policy=<id>` is the object filter for a policy; an explicit object filter wins.
  let objectKind = "";
  let objectId = "";
  if (objectKindParam && isUuid(objectIdParam)) {
    objectKind = objectKindParam;
    objectId = objectIdParam;
  } else if (isUuid(policyParam)) {
    objectKind = "policy";
    objectId = policyParam;
  }

  // The time range is anchored when it is chosen, so its `from` stays the same
  // across renders (a moving `from` would change the filter, and with it the cursor).
  const [anchor, setAnchor] = useState(() => Date.now());
  const from = useMemo(() => {
    const r = RANGES.find((x) => x.value === range);
    return r ? new Date(anchor - r.ms).toISOString() : undefined;
  }, [anchor, range]);

  const filter = useMemo<GovEventsFilter>(
    () => ({
      kind: kind ? [kind] : undefined,
      category: category || undefined,
      object_kind: objectKind || undefined,
      object_id: objectId || undefined,
      actor: actor.trim() || undefined,
      actor_kind: actorKind,
      from,
    }),
    [kind, category, objectKind, objectId, actor, actorKind, from],
  );
  const filterKey = JSON.stringify(filter);
  const filtered = !!(kind || category || objectKind || actor.trim() || actorKind || from);

  // Cursor stack for Prev; a different filter starts again at the first page.
  const [pager, setPager] = useState<{ key: string; cursors: string[] }>({ key: filterKey, cursors: [] });
  const cursors = pager.key === filterKey ? pager.cursors : [];
  const cursor = cursors[cursors.length - 1];

  const events = useListGovEventsQuery({ ws, ...filter, cursor, limit: PAGE }, { refetchOnMountOrArgChange: true });
  const kinds = useGetGovEventKindsQuery({ ws });

  const rows: GovEventView[] = events.currentData?.data ?? [];
  const nextCursor = events.currentData?.meta.next_cursor ?? null;
  const failure = events.isError ? classifyPolicyError(events.error) : null;
  const kindsFailure = kinds.isError ? classifyPolicyError(kinds.error) : null;

  const meaningOf = useMemo(() => new Map((kinds.data?.events ?? []).map((k) => [k.name, k.description])), [kinds.data]);
  const eventsInCategory = (kinds.data?.events ?? []).filter((k) => k.category === category);
  const unrecorded = [
    ...(kinds.data?.categories ?? []).filter((c) => !c.recorded).map((c) => ({ category: c.category, label: categoryLabel(c.category) })),
    ...NOT_RECORDED_ELSEWHERE.map((c) => ({ category: c.category, label: c.label })),
  ];

  const setParam = (key: string, value: string | null, alsoClear: string[] = []) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of alsoClear) next.delete(k);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  // The object filter is a kind and an id together: clearing the kind clears the id.
  const setObjectParam = (key: "object_kind" | "object_id", value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        // Editing either half of the filter turns `?policy=` into its explicit form first.
        if (objectKind && !next.get("object_kind")) next.set("object_kind", objectKind);
        if (objectId && !next.get("object_id")) next.set("object_id", objectId);
        next.delete("policy");
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === "object_kind" && !value) next.delete("object_id");
        return next;
      },
      { replace: true },
    );
  const clearAll = () => {
    setParams(new URLSearchParams(), { replace: true });
    setAnchor(Date.now());
  };

  const [selected, setSelected] = useState<GovEventView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Export: the same filter, no cursor. A point-in-time file, not a proof of completeness.
  const [exporting, setExporting] = useState<GovEventExportFormat | null>(null);
  const [exportFailure, setExportFailure] = useState<PolicyFailure | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const exportBlocked = events.isLoading ? "Export is available once the events have loaded." : exporting ? "Preparing the export…" : null;
  const runExport = async (fmt: GovEventExportFormat) => {
    setExporting(fmt);
    setExportFailure(null);
    setExported(null);
    try {
      setExported(await downloadGovEventsExport(filter, fmt));
    } catch (e) {
      setExportFailure(classifyPolicyError(e) ?? { kind: "failed", code: "", message: "The export failed.", detail: {} });
    } finally {
      setExporting(null);
    }
  };

  const days: { key: string; heading: string; events: GovEventView[] }[] = [];
  for (const e of rows) {
    const d = new Date(e.occurred_at);
    const key = format(d, "yyyy-MM-dd");
    const last = days[days.length - 1];
    if (last?.key === key) last.events.push(e);
    else days.push({ key, heading: dayHeading(d), events: [e] });
  }

  const openEvent = (e: GovEventView) => {
    setSelected(e);
    setDrawerOpen(true);
  };

  return (
    <ConsolePage
      title="Logs"
      description="What policy did and who did it: proposals, reviews, approvals, rollouts, deployments and settings, newest first."
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!!exportBlocked}
            aria-describedby="logs-export-note"
            onClick={() => void runExport("csv")}
          >
            <Download className="size-4" aria-hidden="true" />
            {exporting === "csv" ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!exportBlocked}
            aria-describedby="logs-export-note"
            onClick={() => void runExport("json")}
            title="One event per line (NDJSON)"
          >
            <Download className="size-4" aria-hidden="true" />
            {exporting === "json" ? "Exporting…" : "Export JSON"}
          </Button>
        </div>
      }
    >
      <p id="logs-export-note" className="text-xs leading-relaxed text-(--color-text-muted)">
        {exportBlocked ?? "An export is a point-in-time file of the recorded events that match these filters, oldest first. If the connection fails partway it can end short, so do not treat it as proof that every event is in it."}
      </p>
      {exportFailure ? <PolicyActionError failure={exportFailure} /> : null}
      {exported && !exportFailure ? (
        <p role="status" className="text-xs text-(--color-text-muted)">
          Saved {exported}.
        </p>
      ) : null}

      <section className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
        <div className="space-y-2 border-b border-(--color-border-subtle) px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Event category"
              value={category}
              onChange={(e) => setParam("category", e.target.value || null, ["kind"])}
              className={SELECT_CLASS}
            >
              <option value="">All recorded events</option>
              {(kinds.data?.categories ?? [])
                .filter((c) => c.recorded)
                .map((c) => (
                  <option key={c.category} value={c.category}>
                    {categoryLabel(c.category)}
                  </option>
                ))}
              {unrecorded.map((c) => (
                <option key={c.category} value="" disabled>
                  {c.label} (Not recorded yet)
                </option>
              ))}
            </select>
            {category ? (
              <select aria-label="Event" value={kind} onChange={(e) => setParam("kind", e.target.value || null)} className={SELECT_CLASS}>
                <option value="">Any event in this category</option>
                {kind && !eventsInCategory.some((k) => k.name === kind) ? <option value={kind}>{eventLabel(kind)}</option> : null}
                {eventsInCategory.map((k) => (
                  <option key={k.name} value={k.name}>
                    {eventLabel(k.name)}
                  </option>
                ))}
              </select>
            ) : kind ? (
              <span className="inline-flex h-9 items-center rounded-md bg-(--color-surface-subtle) px-2.5 font-mono text-xs text-(--color-text)">{kind}</span>
            ) : null}
            <select
              aria-label="Time range"
              value={range}
              onChange={(e) => {
                setAnchor(Date.now());
                setParam("range", e.target.value || null);
              }}
              className={SELECT_CLASS}
            >
              <option value="">All time</option>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select aria-label="Actor type" value={actorKind ?? ""} onChange={(e) => setParam("actor_kind", e.target.value || null)} className={SELECT_CLASS}>
              <option value="">Any actor</option>
              {EVENT_ACTOR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACTOR_KIND_LABEL[k] ?? humanize(k)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <CommitInput
              key={`actor:${actor}`}
              label="Actor id"
              placeholder="Actor id (exact)"
              initial={actor}
              onCommit={(v) => setParam("actor", v.trim() || null)}
            />
            <select
              aria-label="Object kind"
              value={objectKind || objectKindParam}
              onChange={(e) => setObjectParam("object_kind", e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Any object</option>
              {(kinds.data?.object_kinds ?? []).map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
              {/* A kind from a hand-edited link the vocabulary has not loaded for yet. */}
              {objectKindParam && !(kinds.data?.object_kinds ?? []).includes(objectKindParam) ? (
                <option value={objectKindParam}>{humanize(objectKindParam)}</option>
              ) : null}
              {objectKind === "policy" && policyParam && !(kinds.data?.object_kinds ?? []).includes("policy") ? <option value="policy">Policy</option> : null}
            </select>
            <CommitInput
              key={`object:${objectId || objectIdParam}`}
              label="Object id"
              placeholder="Object id (uuid)"
              initial={objectId || objectIdParam}
              invalid={!!objectIdParam && !isUuid(objectIdParam)}
              onCommit={(v) => setObjectParam("object_id", v.trim())}
            />
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setPager({ key: filterKey, cursors: [] }); setAnchor(Date.now()); void events.refetch(); }}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
            {filtered || params.size ? (
              <button type="button" onClick={clearAll} className="h-9 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)">
                Clear filters
              </button>
            ) : null}
            {!events.isLoading && !failure ? (
              <span role="status" className="ml-auto text-[13px] tabular-nums text-(--color-text-muted)">
                {rows.length} on this page
              </span>
            ) : null}
          </div>
          {objectIdParam && !isUuid(objectIdParam) ? <Meta className="text-(--color-danger-text)">The object id must be a uuid, so it is not applied.</Meta> : null}
          {objectKindParam && !objectKind && !objectIdParam ? <Meta>Enter the {humanize(objectKindParam).toLowerCase()} id to filter by it.</Meta> : null}
          {objectKind === "policy" && policyParam && !objectKindParam ? (
            <Meta>
              Showing the events of one policy (
              <Link to={`/iga/policy/${objectId}`} className="font-medium text-(--color-primary-text) underline-offset-2 hover:underline">
                open policy {shortHash(objectId, 8)}
              </Link>
              ).
            </Meta>
          ) : null}
          <Meta>
            Not recorded yet, so not selectable and never shown as samples: {unrecorded.map((c) => c.label.toLowerCase()).join(", ")}. Nothing writes these events in this build.
          </Meta>
        </div>

        {kindsFailure ? (
          <div className="space-y-2 border-b border-(--color-border-subtle) p-4">
            <PolicyLoadFailure failure={kindsFailure} subject="the event kinds" onRetry={() => void kinds.refetch()} />
            <Meta>Events are still listed. The category filter and the one-line descriptions are unavailable until the kinds load.</Meta>
          </div>
        ) : null}

        {events.isLoading || (events.isFetching && !events.currentData && !failure) ? (
          <div role="status" aria-live="polite" className="space-y-2 p-4">
            <span className="sr-only">Loading events…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-hidden="true" />
            ))}
          </div>
        ) : failure ? (
          <div className="space-y-3 p-4">
            <PolicyLoadFailure failure={failure} subject="events" onRetry={() => void events.refetch()} />
            {cursors.length > 0 ? (
              <CursorPager
                meta={{ next_cursor: null, limit: PAGE }}
                pageIndex={cursors.length}
                rowsOnPage={0}
                onPrev={() => setPager({ key: filterKey, cursors: cursors.slice(0, -1) })}
                onNext={() => undefined}
              />
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              title="No recorded events match"
              body="Widen the time range or remove a filter. Events that are not recorded yet cannot match."
              action={
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState title="No events recorded yet" body="Events appear here as policies are proposed, reviewed, approved, rolled out and verified." />
          )
        ) : (
          <>
            {days.map((day) => (
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
                    <EventRow key={e.id} e={e} meaning={meaningOf.get(e.event)} onOpen={openEvent} />
                  ))}
                </ol>
              </section>
            ))}
            <CursorPager
              meta={{ next_cursor: nextCursor, limit: PAGE }}
              pageIndex={cursors.length}
              rowsOnPage={rows.length}
              onPrev={() => setPager({ key: filterKey, cursors: cursors.slice(0, -1) })}
              onNext={(c) => setPager({ key: filterKey, cursors: [...cursors, c] })}
            />
          </>
        )}
      </section>

      <PolicyEventDrawer event={selected} meaning={selected ? meaningOf.get(selected.event) : undefined} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </ConsolePage>
  );
}

function EventRow({ e, meaning, onOpen }: { e: GovEventView; meaning?: string; onOpen: (e: GovEventView) => void }) {
  const links = eventLinks(e);
  const requestId = requestIdOf(e);
  const reason = reasonOf(e);
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 border-b border-(--color-border-subtle) px-4 py-3 last:border-b-0">
      <time dateTime={e.occurred_at} className="pt-0.5 font-mono text-xs tabular-nums text-(--color-text-muted)">
        {format(new Date(e.occurred_at), "HH:mm")}
      </time>
      <div className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          data-event-id={e.id}
          aria-haspopup="dialog"
          onClick={() => onOpen(e)}
          className="-mx-1.5 -my-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 rounded px-1.5 py-0.5 text-left hover:bg-(--color-surface-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
        >
          <PolicyKindGlyph name={e.event} category={e.category} payload={e.payload} className="font-semibold" />
          {meaning ? <span className="break-words text-sm leading-snug text-(--color-text)">{meaning}</span> : null}
        </button>
        {reason ? <span className="break-words text-xs text-(--color-text-muted)">Reason: {reason}</span> : null}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 break-words text-xs text-(--color-text-muted)">
          <span>{actorLine(e)}</span>
          {requestId ? <span className="font-mono">AWS request {requestId}</span> : null}
          {links.map((l) => (
            <Link key={l.key} to={l.to} className="font-medium text-(--color-primary-text) underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </span>
      </div>
    </li>
  );
}

/** A text filter applied on Enter or when it loses focus. Remounted (by `key`) when the URL value changes. */
function CommitInput({
  label,
  placeholder,
  initial,
  invalid,
  onCommit,
}: {
  label: string;
  placeholder: string;
  initial: string;
  invalid?: boolean;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(initial);
  const commit = () => {
    if (text !== initial) onCommit(text);
  };
  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      aria-label={label}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      className="h-9 w-56 max-w-full"
    />
  );
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
