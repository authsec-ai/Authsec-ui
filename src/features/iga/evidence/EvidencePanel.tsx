/**
 * The Evidence panel — "why does the product claim this?"
 * (SPEC-iga-phase2-graph.md §2.14.7 *The Evidence panel*, §5.3 *Evidence*).
 *
 * Always the same five parts, in this order: Claim, Status, Supporting facts,
 * Freshness, Limitations; then Show raw record. One panel, never nested
 * (§2.14.5): a link inside it navigates the page, which closes it.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { igaGraphApi, useGetGraphEvidenceQuery, type Evidence, type GraphRef } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { classifyGraphError } from "../shared/graphErrors";
import { REL_STATE_TONE, limitationText } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { useAnnounce } from "../shared/announce";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { restoreEvidenceFocus, useEvidence } from "./useEvidence";

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-(--color-text-muted)">{label}</h3>
      {children}
    </section>
  );
}

function when(iso: string | null) {
  return iso ? `${formatDistanceToNow(new Date(iso), { addSuffix: true })} (${format(new Date(iso), "d MMM yyyy, HH:mm")})` : "not known";
}

function ClaimEvidence({ ws, claim }: { ws: string; claim: GraphRef }) {
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const [raw, setRaw] = useState(false);
  const dispatch = useAppDispatch();
  const args = { ws, rev, key: String(epoch), claim, include: raw ? ("raw" as const) : undefined };
  const q = useGetGraphEvidenceQuery(args);
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphEvidence", { ...args, rev: r }, d)),
  );
  const e: Evidence | undefined = q.currentData?.data ?? (raw ? q.data?.data : undefined);

  if (!e) {
    if (failure?.kind === "not_found") {
      // Say what did not survive; never silently close (§2.14.5, step 4).
      return (
        <p className="rounded-md border border-(--color-border-subtle) px-3 py-2 text-sm">
          This claim is not in the graph at the revision you are viewing. It may have ended in a newer scan; the
          object's Changes tab records when.
        </p>
      );
    }
    if (failure) {
      return <GraphStatePanel failure={failure} subject="this evidence" onRetry={() => void q.refetch()} onRefresh={refresh} />;
    }
    return <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading evidence" />;
  }

  const ended = e.status.lifecycle === "ended";
  return (
    <article className="space-y-5">
      <Part label="Claim">
        <p className="text-sm text-(--color-text)">{e.claim.sentence}</p>
      </Part>

      <Part label="Status">
        {/* Four separate facts, never one tone (§2.14.9). */}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-(--color-text-muted)">Basis</dt>
            <dd>{e.status.basis}</dd>
          </div>
          <div>
            <dt className="text-xs text-(--color-text-muted)">Lifecycle</dt>
            <dd>
              <StatusBadge tone={REL_STATE_TONE[e.status.lifecycle]}>{e.status.lifecycle}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-(--color-text-muted)">Collection</dt>
            <dd>
              <StatusBadge tone={e.status.collection === "complete" ? "neutral" : "warning"}>
                {e.status.collection}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-(--color-text-muted)">Effective access</dt>
            <dd>Not evaluated</dd>
          </div>
        </dl>
      </Part>

      <Part label="Supporting facts">
        <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
          {e.facts.map((f, i) => (
            <li key={i} className="space-y-1 px-3 py-2 text-sm">
              <p>{f.fact}</p>
              <p className="font-mono text-xs text-(--color-text-muted)">
                {[f.source_api, f.account_id, f.region, f.policy_version].filter(Boolean).join(" · ")}
              </p>
              {f.last_confirmed_at ? (
                <p className="text-xs text-(--color-text-muted)">Collected {when(f.last_confirmed_at)}</p>
              ) : null}
              {f.statement_excerpt ? (
                <pre className="overflow-x-auto rounded bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
                  {JSON.stringify(f.statement_excerpt, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </Part>

      <Part label="Freshness">
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-(--color-text-muted)">First seen</dt>
            <dd>{when(e.freshness.first_seen_at)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-(--color-text-muted)">Last confirmed</dt>
            <dd>{when(e.freshness.last_confirmed_at)}</dd>
          </div>
          {e.freshness.stale_since ? (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-(--color-text-muted)">Stale since</dt>
              <dd className="text-(--color-warning-text)">{when(e.freshness.stale_since)}</dd>
            </div>
          ) : null}
          {ended ? (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-(--color-text-muted)">Ended</dt>
              <dd>
                {e.freshness.valid_to ? when(e.freshness.valid_to) : "Ended"}
                {e.freshness.ended_reason ? ` · ${e.freshness.ended_reason}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      </Part>

      <Part label="Limitations">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {e.limitations.map((l, i) => (
            <li key={`${l.code}-${i}`}>{limitationText(l)}</li>
          ))}
        </ul>
      </Part>

      <div>
        <Button variant="outline" size="sm" onClick={() => setRaw((r) => !r)} aria-expanded={raw}>
          {raw ? "Hide raw record" : "Show raw record"}
        </Button>
        {raw && e.raw != null ? (
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
            {JSON.stringify(e.raw, null, 2)}
          </pre>
        ) : raw && q.isFetching ? (
          <p className="mt-2 text-xs text-(--color-text-muted)">Loading the stored observation…</p>
        ) : raw && failure ? (
          <GraphStatePanel failure={failure} subject="the raw record" onRetry={() => void q.refetch()} onRefresh={refresh} />
        ) : raw ? <p className="mt-2 text-xs text-(--color-text-muted)">No raw record was returned for this claim.</p> : null}
      </div>
    </article>
  );
}

/** Mounted by every graph page; opens when the URL carries `evidence=`. */
export function EvidencePanel({ ws }: { ws: string }) {
  const { claims, isOpen, close } = useEvidence();
  const wide = useMediaQuery("(min-width: 1280px)");
  const narrow = useMediaQuery("(max-width: 767px)");
  useAnnounce(isOpen ? `Evidence opened for ${claims.length === 1 ? "one claim" : `${claims.length} claims`}` : null);

  const heading = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && wide) heading.current?.focus();
    if (!isOpen && wasOpen.current) restoreEvidenceFocus();
    wasOpen.current = isOpen;
  }, [isOpen, wide]);
  useEffect(() => {
    if (!isOpen || !wide) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [isOpen, wide, close]);
  const description = claims.length > 1
    ? `${claims.length} claims. Each is shown with its own supporting facts and status.`
    : "Why the product shows this, and what it does not establish.";
  const content = <div className="space-y-8 px-6 py-5">
    {claims.map((c) => <ClaimEvidence key={`${ws}|${c}`} ws={ws} claim={c} />)}
  </div>;

  if (wide) return isOpen ? <aside aria-labelledby="evidence-heading" className="sticky top-4 max-h-[calc(100vh-6rem)] self-start overflow-y-auto rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
    <header className="border-b px-6 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="evidence-heading" ref={heading} tabIndex={-1} className="font-semibold">Evidence</h2>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close evidence"><X className="size-4" /></Button>
      </div>
      <p className="text-sm text-(--color-text-muted)">{description}</p>
    </header>
    {content}
  </aside> : null;

  return <Sheet open={isOpen} modal={narrow} onOpenChange={(o) => { if (!o) close(); }}>
    <SheetContent side="right" hideClose={narrow}
      onCloseAutoFocus={(event) => { event.preventDefault(); restoreEvidenceFocus(); }}
      onInteractOutside={(event) => { if (!narrow) event.preventDefault(); }}
      className={cn("gap-0 overflow-y-auto", narrow ? "w-full max-w-none sm:max-w-none" : "w-[440px] sm:max-w-[440px]")}>
      <SheetHeader className="border-b px-6 py-4">
        {narrow ? <Button variant="ghost" size="sm" onClick={close} className="w-fit"><ArrowLeft className="size-4" /> Back</Button> : null}
        <SheetTitle>Evidence</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      {content}
    </SheetContent>
  </Sheet>;
}
