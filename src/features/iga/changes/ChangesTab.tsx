/**
 * History — "what changed?" (SPEC-iga-phase2-graph.md §2.15, §5.3 *Changes*).
 * Two feeds: changes (lifecycle, relationships, policies, grants, statements)
 * and scan coverage (what each scan could read). Changes are grouped by the
 * scan that detected them, and every time is a DETECTION time — the API has no
 * AWS-side time to show.
 *
 * Grants are independent: when one policy's grant ends and another still
 * declares the same access, the entry says the path remains through it —
 * otherwise detaching one of two policies would look like losing the access.
 */

import { useState } from "react";
import { format } from "date-fns";
import { useLocation, useSearchParams } from "react-router-dom";

import {
  igaGraphApi,
  useListGraphChangesQuery,
  type ChangeEvent,
  type ChangeFeed,
  type ChangesArgs,
  type ChangesMeta,
  type GraphRef,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/console/status";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";

import { classifyGraphError } from "../shared/graphErrors";
import { resolvePagedView } from "../shared/listView";
import { usePaging } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { RELATIONSHIP_LABEL, dayText, surfaceStateText } from "../shared/labels";
import { useAnnounce } from "../shared/announce";
import { useEvidence } from "../evidence/useEvidence";
import { CursorPager } from "../shared/components/CursorPager";
import { Timestamp } from "../shared/components/Timestamp";
import { EVENT_GROUP_LABEL, eventGroupOf, eventTypeOf, type EventGroup } from "./eventTypes";
import { groupByScan, parseAt, unchangedSinceNewest } from "./groupEvents";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";

const ENDED_REASON: Record<string, string> = {
  not_seen: "not seen in the latest complete scan",
  statement_retired: "its statement changed",
  subject_retired: "the object it belongs to is no longer in the scan",
  unsupported: "not seen in a complete scan",
  recreated: "recreated under the same name — the new one is a separate object",
  policy_recreated: "its policy was deleted and recreated",
};


/** The claim types `/evidence` answers for (§5.3 *Evidence*); a change also
 * names its integration, which has no evidence of its own. */
const EVIDENCE_TYPES = new Set([
  "grant", "assignment", "relationship", "target", "presence", "coverage",
  "workload", "identity", "resource", "external_principal", "policy", "statement",
]);
function evidenceClaims(claims: GraphRef[]): GraphRef[] {
  return claims.filter((c) => EVIDENCE_TYPES.has(c.slice(0, c.indexOf(":"))));
}

function reason(r?: string | null): string {
  return r ? ` — ${ENDED_REASON[r] ?? r.replace(/_/g, " ")}` : "";
}

/** A ref's display name, from the event's own labels. */
function nameOf(e: ChangeEvent, ref: string | null | undefined, fallback: string): string {
  return (ref && e.labels[ref]) || fallback;
}

/** What still declares the same access after a grant or assignment ended. */
function remainingText(e: ChangeEvent): string | null {
  if (!e.remaining) return null;
  if (!e.remaining.length) return "No other policy declares the same access.";
  const policies = [...new Set(e.remaining.map((r) => nameOf(e, r.policy, "another policy")))];
  const stale = e.remaining.some((r) => r.state === "stale") ? " (not reconfirmed by the latest scan)" : "";
  return `The path remains through ${policies.join(", ")}${stale}.`;
}

/** Per target: whether declared access to it remains. */
function pathsText(e: ChangeEvent): string | null {
  const gone = (e.paths ?? []).filter((p) => p.remains === "none").map((p) => nameOf(e, p.target, "a resource"));
  return gone.length ? `No declared access to ${gone.join(", ")} remains.` : null;
}

function coverageState(side: unknown): string | null {
  const st = (side as { state?: string } | null | undefined)?.state;
  return st ? surfaceStateText(st) : null;
}

/** One event in words. Configuration is not activity: nothing here says "used" or "removed". */
function sentence(e: ChangeEvent): string {
  const d = e.detail;
  const subj = nameOf(e, d.object ?? e.subject, "This object");
  switch (e.event) {
    case "first_seen":
      return `${subj} first seen.`;
    case "retired":
      return e.reason === "recreated"
        ? `${subj} was recreated under the same name with a different provider id; the new one is a separate object.`
        : `${subj} is no longer in the scan${reason(e.reason)}.`;
    case "restored":
      return `${subj} seen again, with the same provider id.`;
    case "relationship_started":
    case "relationship_ended": {
      const rel = (RELATIONSHIP_LABEL[d.type ?? ""] ?? d.type ?? "related to").toLowerCase();
      const src = nameOf(e, d.source, "An object");
      const dst = nameOf(e, d.target, "another object");
      return e.event === "relationship_started"
        ? `${src} ${rel} ${dst}.`
        : `${src} no longer ${rel} ${dst}${reason(e.reason)}.`;
    }
    case "policy_attached":
      return `${nameOf(e, d.policy, "A policy")} ${d.assignment_kind === "boundary" ? "set as the permissions boundary of" : "attached to"} ${nameOf(e, d.holder, "an identity")}.`;
    case "policy_detached":
      return `${nameOf(e, d.policy, "A policy")} ${d.assignment_kind === "boundary" ? "no longer the permissions boundary of" : "detached from"} ${nameOf(e, d.holder, "an identity")}${reason(e.reason)}.`;
    case "grant_started":
    case "grant_ended": {
      const what = [...(d.actions ?? []), ...(d.not_actions ?? []).map((a) => `every action except ${a}`)].join(", ") || "access";
      const on = (d.targets ?? []).map((t) => nameOf(e, t, "a resource")).join(", ") || "a resource";
      const by = `${nameOf(e, d.policy, "a policy")} (${nameOf(e, d.statement, "a statement")})`;
      return e.event === "grant_started"
        ? `${nameOf(e, d.holder, "An identity")} is granted ${what} on ${on} by ${by}.`
        : `Grant ended: ${what} on ${on} by ${by}${reason(e.reason)}.`;
    }
    case "statement_revised":
      return `${nameOf(e, d.policy, "A policy")}: ${nameOf(e, d.statement, "a statement")} was revised.`;
    case "statement_replaced":
      return `${nameOf(e, d.policy, "A policy")}: a statement without a Sid changed, so it is shown as one ending and another beginning.`;
    case "coverage_changed":
      return `${nameOf(e, e.subject, d.surface ?? "A surface")}: ${coverageState(e.before) ?? "not read before"} → ${coverageState(e.after) ?? "unknown"}.`;
    default:
      return nameOf(e, e.subject, "A change was recorded.");
  }
}

/**
 * One row of History: what KIND of change, and what happened in words, with its
 * evidence. When it was detected is said once, by the scan's group header above
 * the row — every event of a scan shares one timestamp, so repeating it per row
 * said the same thing seven times.
 *
 * A `<tr>` rather than the prose timeline this used to be. The sentence is
 * unchanged — `sentence()` is the same function and still the authority on
 * wording — but the type has a column of its own, so events can be scanned
 * instead of read. Everything the timeline showed underneath a row (what
 * access remains, visibility notes, before/after JSON) still renders, in a
 * second row spanning the table so it keeps full width.
 */
function EventRow({ e }: { e: ChangeEvent }) {
  const { open } = useEvidence();
  const [expanded, setExpanded] = useState(false);
  const rest = remainingText(e);
  const paths = pathsText(e);
  // `sentence()` flattens every action and target into one string, so a broad
  // managed policy becomes a paragraph and one event can fill the viewport.
  // Clamped to four lines with a way out — the full text stays in the DOM, so
  // find-in-page and screen readers still reach it.
  const text = sentence(e);
  const long = text.length > 220;
  const claims = evidenceClaims(e.claims);
  const after = (e.after as { state?: string } | null | undefined)?.state;
  const visibility =
    e.event === "coverage_changed" && after && after !== "reached"
      ? "This is a visibility change, not a removal. Earlier results are kept and marked stale."
      : null;
  const type = eventTypeOf(e);
  const extras = [rest, paths, visibility].filter(Boolean) as string[];
  const diff = e.event === "statement_revised" && Boolean(e.before || e.after);

  return (
    <>
      <tr className="border-t border-(--color-border-subtle) align-top">
        <td className="px-4 py-3">
          <StatusBadge tone={type.tone}>{type.label}</StatusBadge>
        </td>
        <td className="px-4 py-3 text-sm text-(--color-text)">
          <span className={cn("block", long && !expanded && "line-clamp-4")}>{text}</span>
          {long ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-xs font-medium text-(--color-primary-text) hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          {/* font-medium, matching ClaimFacts' Evidence button on the Identities
              and Resources tabs. It was font-semibold here, which made the one
              affordance that repeats on every single row the boldest thing in
              the feed. */}
          {claims.length ? (
            <button
              type="button"
              onClick={() => open(claims)}
              className="text-xs font-medium text-(--color-primary-text) underline-offset-2 hover:underline"
            >
              Evidence
            </button>
          ) : null}
        </td>
      </tr>
      {extras.length || diff ? (
        <tr className="align-top">
          <td />
          <td colSpan={2} className="space-y-1.5 px-4 pb-3">
            {extras.map((x, i) => (
              <p key={i} className="text-xs text-(--color-text-muted)">
                {x}
              </p>
            ))}
            {diff ? (
              <div className="grid gap-2 md:grid-cols-2">
                {(["before", "after"] as const).map((k) => (
                  <div key={k}>
                    <p className="mb-1 text-xs font-medium capitalize text-(--color-text-muted)">{k}</p>
                    <pre className="overflow-x-auto rounded bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
                      {JSON.stringify(e[k], null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

const FEED_LABEL: Record<ChangeFeed, string> = { configuration: "Changes", coverage: "Scan coverage" };

type Show = "all" | Exclude<EventGroup, "coverage">;

export function ChangesTab({
  ws,
  object,
  id,
  lastConfirmedAt,
}: {
  ws: string;
  object: ChangesArgs["object"];
  id: string;
  /** The object's own last confirmation, to say whether anything changed since its newest change. */
  lastConfirmedAt?: string | null;
}) {
  const dispatch = useAppDispatch();
  const [show, setShow] = useState<Show>("all");
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const feed: ChangeFeed = params.get("feed") === "coverage" ? "coverage" : "configuration";
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const paging = usePaging(`changes-${feed}`, epoch);
  const args: ChangesArgs = { ws, rev, key: paging.cacheKey, object, id, kind: feed, cursor: paging.cursor };
  const q = useListGraphChangesQuery(args);
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("listGraphChanges", { ...args, rev: r }, d)),
  );
  const view = resolvePagedView<ChangeEvent, ChangesMeta>(q, paging.pageIndex);
  useAnnounce(view.kind === "failed" ? "Could not load changes." : null);

  const setFeed = (f: ChangeFeed) => {
    const next = new URLSearchParams(params);
    if (f === "configuration") next.delete("feed");
    else next.set("feed", f);
    // Replace, keeping history state: the back-link name and an open evidence
    // panel's history mark belong to this entry.
    setParams(next, { replace: true, state: location.state });
  };

  // Filters apply to the page in view, like every other client-side facet on
  // these lists: the API pages by event, not by kind.
  const rows = view.kind === "rows" ? view.rows : [];
  const visible = feed === "configuration" && show !== "all" ? rows.filter((e) => eventGroupOf(e) === show) : rows;
  const showCounts = (g: Show) => (g === "all" ? rows.length : rows.filter((e) => eventGroupOf(e) === g).length);
  const groups = groupByScan(visible);
  const lastGroup = groups.length - 1;
  const newest = rows[0]?.at;
  const unchanged = feed === "configuration" && paging.pageIndex === 0 ? unchangedSinceNewest(newest, lastConfirmedAt) : null;
  const newestAt = parseAt(newest);

  return (
    <TableCard>
      <CardContent variant="flush">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--color-border-subtle) px-4 py-2">
          <div className="flex gap-1" role="group" aria-label="History feed">
            {(["configuration", "coverage"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={feed === f}
                onClick={() => setFeed(f)}
                className={cn(
                  "h-8 rounded-md px-2.5 text-xs font-semibold",
                  feed === f
                    ? "bg-(--color-primary-soft) text-(--color-primary-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {FEED_LABEL[f]}
              </button>
            ))}
          </div>
          {feed === "configuration" && view.kind === "rows" && rows.length ? (
            <div className="flex gap-1" role="group" aria-label="Filter changes" title={view.meta.next_cursor || paging.pageIndex > 0 ? "Counts are for the page in view; other pages may have more." : undefined}>
              {(["all", "access", "identity", "lifecycle"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={show === g}
                  onClick={() => setShow(g)}
                  className={cn(
                    "h-7 rounded-md px-2 text-xs font-medium",
                    show === g ? "bg-(--color-surface-subtle) text-(--color-text)" : "text-(--color-text-muted) hover:text-(--color-text)",
                  )}
                >
                  {g === "all" ? "All" : EVENT_GROUP_LABEL[g]}
                  <span className="ml-1 tabular-nums opacity-70">
                    {showCounts(g)}
                    {view.meta.next_cursor || paging.pageIndex > 0 ? "+" : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {/* The count is only called a total when this page is demonstrably the
              whole history — first page, no next cursor. Otherwise it says what
              it really is, a count of the rows in view, because `ChangesMeta`
              carries no total and claiming one would be a guess. */}
          {view.kind === "rows" ? (
            <p className="ml-auto text-xs text-(--color-text-muted)">
              {/* Only when the footer below does not already say it (single-page history). */}
              {view.meta.history_begins && (view.meta.next_cursor || view.previousPage) ? `History starts ${dayText(view.meta.history_begins)} · ` : ""}
              {!view.meta.next_cursor && paging.pageIndex === 0
                ? `${view.rows.length} ${view.rows.length === 1 ? "change" : "changes"}`
                : `${view.rows.length} changes on this page`}
            </p>
          ) : null}
        </div>
        {unchanged != null && newestAt && rows.length ? (
          <p className="border-b border-(--color-border-subtle) px-4 py-2 text-xs text-(--color-text-muted)">
            Last confirmed <Timestamp iso={lastConfirmedAt ?? null} />
            {unchanged ? ` · No changes detected since ${format(newestAt, "d MMM yyyy")}.` : "."}
          </p>
        ) : null}
        {view.kind === "loading" ? (
          <div className="p-4">
            <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />
          </div>
        ) : view.kind === "failed" ? (
          <GraphStatePanel failure={view.failure} subject="changes" onRetry={() => void q.refetch()} onRefresh={refresh} />
        ) : !view.rows.length && !view.footerFailure ? (
          <p className="px-6 py-14 text-center text-sm text-(--color-text-muted)">
            {feed === "configuration"
              ? "No changes recorded since first seen."
              : "The coverage of this object's account has not changed since it was first seen."}
          </p>
        ) : (
          <>
            <div className={cn("overflow-x-auto", view.dim && "opacity-60")}>
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-(--color-border-subtle) bg-(--component-table-header-bg)">
                    <th scope="col" className="w-[190px] px-4 py-2.5 text-xs font-semibold text-(--color-text)">
                      Event type
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-xs font-semibold text-(--color-text)">
                      Description
                    </th>
                    <th scope="col" className="w-[90px] px-4 py-2.5 text-right text-xs font-semibold text-(--color-text)">
                      <span className="sr-only">Evidence</span>
                    </th>
                  </tr>
                </thead>
                {groups.length ? (
                  groups.map((g, i) => {
                    const at = parseAt(g.at);
                    // The last group of a page may continue on the next one, so
                    // its count is a minimum, not a total.
                    const open = i === lastGroup && !!view.meta.next_cursor;
                    return (
                      <tbody key={`${g.at}:${i}`}>
                        <tr className="border-t border-(--color-border-subtle) bg-(--color-surface-subtle)/50">
                          <th
                            scope="colgroup"
                            colSpan={3}
                            className="px-4 py-2 text-left text-xs font-semibold text-(--color-text)"
                            title="When an AuthSec scan detected these changes, not when they happened in AWS."
                          >
                            {feed === "configuration" ? "Detected in the scan of " : "Scan of "}
                            {at ? <time dateTime={g.at}>{format(at, "d MMM yyyy, HH:mm")}</time> : "an unknown time"}
                            <span className="ml-2 font-normal text-(--color-text-muted)">
                              {g.events.length}
                              {open ? "+" : ""} {g.events.length === 1 && !open ? "change" : "changes"}
                            </span>
                          </th>
                        </tr>
                        {g.events.map((e) => (
                          <EventRow key={e.id} e={e} />
                        ))}
                      </tbody>
                    );
                  })
                ) : (
                  <tbody>
                    <tr>
                      <td colSpan={3} className="px-6 py-10 text-center text-sm text-(--color-text-muted)">
                        No {show === "all" ? "" : `${EVENT_GROUP_LABEL[show as Exclude<Show, "all">].toLowerCase()} `}changes on this page.{" "}
                        <button type="button" onClick={() => setShow("all")} className="font-medium text-(--color-primary-text) hover:underline">
                          Show all
                        </button>
                      </td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
            {view.meta.history_begins && !view.meta.next_cursor && !view.previousPage ? (
              <p className="border-t border-(--color-border-subtle) px-4 py-2 text-xs text-(--color-text-muted)">
                History starts {dayText(view.meta.history_begins)}. Earlier changes may exist but were not captured by AuthSec.
              </p>
            ) : null}
            <CursorPager
              meta={view.meta}
              pageIndex={paging.pageIndex}
              rowsOnPage={view.rows.length}
              onPrev={paging.prev}
              onNext={paging.next}
              failure={view.footerFailure}
              onRetry={() => void q.refetch()}
              onRefresh={refresh}
              previousPage={view.previousPage}
            />
          </>
        )}
      </CardContent>
    </TableCard>
  );
}
