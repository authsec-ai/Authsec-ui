/**
 * Changes — "what changed, and when" (SPEC-iga-phase2-graph.md §2.15, §5.3
 * *Changes*). Two feeds: configuration (lifecycle, relationships, policies,
 * grants, statements) and coverage (what each scan could read).
 *
 * Grants are independent: when one policy's grant ends and another still
 * declares the same access, the entry says the path remains through it —
 * otherwise detaching one of two policies would look like losing the access.
 */

import { format } from "date-fns";
import { useLocation, useSearchParams } from "react-router-dom";

import {
  igaGraphApi,
  useListGraphChangesQuery,
  type ChangeEvent,
  type ChangeFeed,
  type ChangesArgs,
  type ChangesMeta,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { CardContent } from "@/components/ui/card";
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
import { GraphStatePanel } from "../shared/components/GraphStatePanel";

const ENDED_REASON: Record<string, string> = {
  not_seen: "not seen in the latest complete scan",
  statement_retired: "its statement changed",
  subject_retired: "the object it belongs to is no longer in the scan",
  unsupported: "not seen in a complete scan",
  recreated: "recreated under the same name — the new one is a separate object",
  policy_recreated: "its policy was deleted and recreated",
};

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

function EventRow({ e }: { e: ChangeEvent }) {
  const { open } = useEvidence();
  const rest = remainingText(e);
  const paths = pathsText(e);
  const after = (e.after as { state?: string } | null | undefined)?.state;
  const visibility =
    e.event === "coverage_changed" && after && after !== "reached"
      ? "This is a visibility change, not a removal. Earlier results are kept and marked stale."
      : null;
  return (
    <li className="space-y-1.5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <time dateTime={e.at} className="shrink-0 tabular-nums text-xs text-(--color-text-muted)">
          {format(new Date(e.at), "d MMM yyyy, HH:mm")}
        </time>
        <span className="min-w-0 flex-1">{sentence(e)}</span>
        {e.claims.length ? (
          <button
            type="button"
            onClick={() => open(e.claims)}
            className="shrink-0 text-xs font-semibold text-(--color-primary-text) hover:underline"
          >
            Evidence
          </button>
        ) : null}
      </div>
      {rest ? <p className="text-xs text-(--color-text-muted)">{rest}</p> : null}
      {paths ? <p className="text-xs text-(--color-text-muted)">{paths}</p> : null}
      {visibility ? <p className="text-xs text-(--color-text-muted)">{visibility}</p> : null}
      {e.event === "statement_revised" && (e.before || e.after) ? (
        <div className="grid gap-2 md:grid-cols-2">
          {(["before", "after"] as const).map((k) => (
            <div key={k}>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-(--color-text-muted)">{k}</p>
              <pre className="overflow-x-auto rounded bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
                {JSON.stringify(e[k], null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function ChangesTab({
  ws,
  object,
  id,
}: {
  ws: string;
  object: ChangesArgs["object"];
  id: string;
}) {
  const dispatch = useAppDispatch();
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

  return (
    <TableCard>
      <CardContent variant="flush">
        <div className="flex gap-1 border-b border-(--color-border-subtle) px-4 py-2" role="group" aria-label="Changes feed">
          {(["configuration", "coverage"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={feed === f}
              onClick={() => setFeed(f)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-semibold capitalize",
                feed === f
                  ? "bg-(--color-primary-soft) text-(--color-primary-text)"
                  : "text-(--color-text-muted) hover:text-(--color-text)",
              )}
            >
              {f}
            </button>
          ))}
        </div>
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
            <ol className={cn("divide-y divide-(--color-border-subtle)", view.dim && "opacity-60")}>
              {view.rows.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ol>
            {view.meta.history_begins && !view.meta.next_cursor && !view.previousPage ? (
              <p className="border-t border-(--color-border-subtle) px-4 py-2 text-xs text-(--color-text-muted)">
                History begins {dayText(view.meta.history_begins)} — earlier changes predate collection.
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
