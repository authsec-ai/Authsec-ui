/**
 * One claim's evidence — "why does the product show this, and what does it
 * not establish?" (SPEC-iga-phase2-graph.md §2.14.7 *The Evidence panel*,
 * §5.3 *Evidence*). Shared by the graph inspector and the page evidence
 * panel, so a claim reads the same wherever it is opened.
 *
 * Order: the claim itself and what it does not establish; the labelled
 * facts (relationship, source and target, policy and statement, actions,
 * resource, conditions, evidence source, last confirmed); the limitations
 * that qualify THIS claim, each expandable; the supporting records; the raw
 * record behind an explicit disclosure. The one limitation true of every
 * claim — effective access not evaluated — is stated once by the container,
 * not repeated here.
 *
 * Missing is never "none", stale is never ended, and a declared grant is
 * never presented as access that works.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";

import { igaGraphApi, useGetGraphEvidenceQuery, type Evidence, type EvidenceFact, type EvidenceLimitation, type GraphRef } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { StatusBadge } from "@/components/console/status";
import { cn } from "@/lib/utils";

import { classifyGraphError } from "../shared/graphErrors";
import { REL_STATE_TONE, limitationText } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { Timestamp } from "../shared/components/Timestamp";
import { ActionList } from "../shared/components/ActionList";
import { Fact, Facts } from "../shared/components/Panel";

/** The graph's own view of the claim, when it was opened from the canvas. */
export interface ClaimContext {
  relationship?: string;
  source?: string;
  target?: string;
}

/** Short names for limitation chips; the long text is `limitationText`. */
const LIMITATION_SHORT: Record<EvidenceLimitation["code"], string> = {
  effective_access_not_evaluated: "Effective access not evaluated",
  conditions_not_evaluated: "Conditions not evaluated",
  negated_statement: "Negated statement",
  deny_statements_present: "Deny statements recorded",
  permissions_boundary_present: "Permissions boundary recorded; not evaluated",
  organizations_not_collected: "Organizations policies not collected",
  resource_policy_not_projected: "Resource policy not combined",
  resource_existence_not_verified: "Resource existence not confirmed",
  selector_may_match_nothing: "Selector may match nothing",
  account_not_connected: "Account not connected",
  caller_permission_not_evaluated: "Caller's own permission not checked",
  not_principal_unresolved: "NotPrincipal not resolved",
  surface_stale: "Evidence stale",
  surface_partial: "Relevant coverage partial",
  surface_denied: "Relevant coverage missing",
  activity_attempts_not_outcomes: "Activity shows attempts, not outcomes",
};

const WARN: ReadonlySet<EvidenceLimitation["code"]> = new Set<EvidenceLimitation["code"]>([
  "conditions_not_evaluated",
  "negated_statement",
  "deny_statements_present",
  "permissions_boundary_present",
  "not_principal_unresolved",
  "surface_stale",
  "surface_partial",
  "surface_denied",
  "account_not_connected",
]);

/** A titled part of the claim; parts after the first are set off by a hairline. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-(--color-border-subtle) pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold text-(--color-text)">{title}</h3>
      {children}
    </section>
  );
}

/** A quiet row that opens in place: supporting records, the raw record. */
function Disclosure({ summary, children, onOpen }: { summary: ReactNode; children: ReactNode; onOpen?: () => void }) {
  return (
    <details
      className="group"
      onToggle={(ev) => {
        if ((ev.currentTarget as HTMLDetailsElement).open) onOpen?.();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-(--color-text-muted) outline-none hover:text-(--color-text) focus-visible:ring-2 focus-visible:ring-(--color-primary) [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

function listOf(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

/** Actions, resources and conditions as the statement itself states them. */
function excerptFacts(facts: EvidenceFact[]) {
  const ex = facts.find((f) => f.statement_excerpt && typeof f.statement_excerpt === "object")?.statement_excerpt as
    | Record<string, unknown>
    | undefined;
  if (!ex) return null;
  const actions = listOf(ex.Action);
  const notActions = listOf(ex.NotAction);
  const resources = listOf(ex.Resource);
  const notResources = listOf(ex.NotResource);
  const effect = typeof ex.Effect === "string" ? ex.Effect : null;
  const condition = ex.Condition && typeof ex.Condition === "object" ? Object.keys(ex.Condition as object) : [];
  return { actions, notActions, resources, notResources, effect, condition };
}

function Codes({ items, max = 6 }: { items: string[]; max?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, max);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((a) => (
        <code key={a} className="max-w-full break-all rounded bg-(--color-surface-subtle) px-1.5 py-px font-mono text-[11.5px]">
          {a}
        </code>
      ))}
      {items.length > max ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-[11.5px] font-medium text-(--color-primary-text) hover:underline">
          {all ? "Show fewer" : `+${items.length - max} more`}
        </button>
      ) : null}
    </span>
  );
}

function Limitations({ limitations }: { limitations: EvidenceLimitation[] }) {
  const seen = new Set<string>();
  const specific = limitations.filter((l) => {
    if (l.code === "effective_access_not_evaluated" || seen.has(l.code)) return false;
    seen.add(l.code);
    return true;
  });
  if (!specific.length) return null;
  return (
    <ul aria-label="What qualifies this claim" className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
      {specific.map((l) => (
        <li key={l.code}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] text-(--color-text) outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary) [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className={cn("size-1.5 shrink-0 rounded-full", WARN.has(l.code) ? "bg-(--color-warning-text)" : "bg-(--color-text-subtle)")}
              />
              <span className="min-w-0 flex-1">{LIMITATION_SHORT[l.code] ?? l.code.replace(/_/g, " ")}</span>
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-(--color-text-muted) transition-transform group-open:rotate-90" />
            </summary>
            <p className="px-3 pb-2.5 pl-6.5 text-xs leading-relaxed text-(--color-text-muted)">{limitationText(l)}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceClaim({
  ws,
  claim,
  context,
  heading,
}: {
  ws: string;
  claim: GraphRef;
  context?: ClaimContext;
  /** "Grant 2 of 3", when several independent claims are shown together. */
  heading?: string;
}) {
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
    if (failure) return <GraphStatePanel failure={failure} subject="this evidence" onRetry={() => void q.refetch()} onRefresh={refresh} />;
    return <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading evidence" />;
  }

  const ex = excerptFacts(e.facts);
  const withPolicy = e.facts.find((f) => f.policy || f.statement);
  const sources = [...new Set(e.facts.map((f) => f.source_api).filter(Boolean))] as string[];
  const lifecycle = e.status.lifecycle;

  const policyLine = withPolicy
    ? [
        withPolicy.policy?.name ?? "Policy",
        withPolicy.statement
          ? withPolicy.statement.sid
            ? `Sid ${withPolicy.statement.sid}`
            : withPolicy.statement.index != null
              ? `statement ${withPolicy.statement.index + 1}`
              : null
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <article className="space-y-4">
      <Section title={heading ?? "Explanation"}>
        <p className="text-[13px] leading-relaxed text-(--color-text)">{e.claim.sentence}</p>
        {e.status.basis || lifecycle !== "current" || e.status.collection !== "complete" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {e.status.basis ? <StatusBadge tone="neutral">{e.status.basis}</StatusBadge> : null}
            {lifecycle !== "current" ? <StatusBadge tone={REL_STATE_TONE[lifecycle]}>{lifecycle}</StatusBadge> : null}
            {e.status.collection !== "complete" ? <StatusBadge tone="warning">collection {e.status.collection}</StatusBadge> : null}
          </div>
        ) : null}
        {context?.relationship || context?.source || context?.target ? (
          <Facts>
            {context?.relationship ? <Fact label="Relationship">{context.relationship}</Fact> : null}
            {context?.source || context?.target ? (
              <Fact label="From → to">
                {context.source ?? "—"} <span className="text-(--color-text-muted)">→</span> {context.target ?? "—"}
              </Fact>
            ) : null}
          </Facts>
        ) : null}
      </Section>

      {withPolicy || ex ? (
        <Section title="Policy and statement">
          <Facts>
            {policyLine ? (
              <Fact label="Policy">
                {policyLine}
                {withPolicy?.policy_version ? <span className="text-(--color-text-muted)"> · {withPolicy.policy_version}</span> : null}
              </Fact>
            ) : null}
            {ex?.effect ? (
              // The provider's own effect, as written — not a decision.
              <Fact label="Effect">
                {ex.effect} <span className="text-xs text-(--color-text-muted)">as written, not evaluated</span>
              </Fact>
            ) : null}
            {ex && (ex.actions.length || ex.notActions.length) ? (
              <Fact label={ex.notActions.length && !ex.actions.length ? "All actions except" : "Actions"}>
                <ActionList actions={ex.actions.length ? ex.actions : ex.notActions} />
              </Fact>
            ) : null}
            {ex && (ex.resources.length || ex.notResources.length) ? (
              <Fact label={ex.notResources.length && !ex.resources.length ? "All resources except" : "Resource"}>
                <Codes items={ex.resources.length ? ex.resources : ex.notResources} max={3} />
              </Fact>
            ) : null}
          </Facts>
        </Section>
      ) : null}

      {ex?.condition.length || e.limitations.some((l) => l.code !== "effective_access_not_evaluated") ? (
        <Section title="Conditions and constraints">
          {ex?.condition.length ? (
            <Facts>
              <Fact label="Conditions">
                <Codes items={ex.condition} />
                <span className="mt-1 block text-xs text-(--color-warning-text)">Recorded, not evaluated.</span>
              </Fact>
            </Facts>
          ) : null}
          <Limitations limitations={e.limitations} />
        </Section>
      ) : null}

      <Section title="Collection source and freshness">
        <Facts>
          <Fact label="Source">
            {sources.length ? (
              <span className="flex flex-col gap-0.5">
                {sources.map((src) => (
                  <span key={src} className="font-mono text-xs">
                    {src}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-(--color-text-muted)">not recorded</span>
            )}
          </Fact>
          <Fact label="Last confirmed">
            <Timestamp iso={e.freshness.last_confirmed_at} />
          </Fact>
          <Fact label="First seen">
            <Timestamp iso={e.freshness.first_seen_at} />
          </Fact>
          {e.freshness.stale_since ? (
            <Fact label="Stale since">
              <span className="text-(--color-warning-text)">
                <Timestamp iso={e.freshness.stale_since} />
              </span>
            </Fact>
          ) : null}
          {lifecycle === "ended" ? (
            <Fact label="Ended">
              {e.freshness.valid_to ? <Timestamp iso={e.freshness.valid_to} /> : "Ended"}
              {e.freshness.ended_reason ? ` · ${e.freshness.ended_reason.replace(/_/g, " ")}` : ""}
            </Fact>
          ) : null}
        </Facts>
      </Section>

      <div className="space-y-2.5 border-t border-(--color-border-subtle) pt-4">
        {e.facts.length ? (
          <Disclosure summary={`Supporting records · ${e.facts.length}`}>
            <p className="text-xs text-(--color-text-muted)">Each record is one collection of this fact — not a separate grant.</p>
            <ol className="space-y-2">
              {e.facts.map((f, i) => (
                <li key={i} className="space-y-1 rounded-md border border-(--color-border-subtle) px-3 py-2">
                  <p className="text-[13px] leading-5 text-(--color-text)">{f.fact}</p>
                  <p className="break-all font-mono text-[11px] text-(--color-text-muted)">
                    {[f.source_api, f.account_id, f.region, f.policy_version].filter(Boolean).join(" · ")}
                  </p>
                  {f.last_confirmed_at ? (
                    <p className="text-xs text-(--color-text-muted)">
                      Collected <Timestamp iso={f.last_confirmed_at} />
                    </p>
                  ) : null}
                  {f.statement_excerpt ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-(--color-primary-text)">Statement as written</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
                        {JSON.stringify(f.statement_excerpt, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          </Disclosure>
        ) : (
          <p className="text-xs text-(--color-text-muted)">No supporting record was returned for this claim.</p>
        )}
        <Disclosure summary="Raw record" onOpen={() => setRaw(true)}>
          {e.raw != null ? (
            <pre className="max-h-80 overflow-auto rounded-md bg-(--color-surface-subtle) p-2 font-mono text-[11px]">
              {JSON.stringify(e.raw, null, 2)}
            </pre>
          ) : raw && q.isFetching ? (
            <p className="text-xs text-(--color-text-muted)">Loading the stored observation…</p>
          ) : raw && failure ? (
            <GraphStatePanel failure={failure} subject="the raw record" onRetry={() => void q.refetch()} onRefresh={refresh} />
          ) : raw ? (
            <p className="text-xs text-(--color-text-muted)">No raw record was returned for this claim.</p>
          ) : null}
        </Disclosure>
      </div>
    </article>
  );
}

/**
 * Several claims behind one line. Independent grants (two policies declaring
 * the same thing) are each shown in full and said to be independent — never
 * folded into a count, and never confused with several collection records
 * of one grant.
 */
export function EvidenceClaims({
  ws,
  claims,
  contextOf,
  grants = false,
}: {
  ws: string;
  claims: GraphRef[];
  contextOf?: (claim: GraphRef) => ClaimContext | undefined;
  /** The claims are grants: say "independent grants". */
  grants?: boolean;
}) {
  const [one, many] = grants ? ["Grant", "independent grants"] : ["Relationship", "relationships"];
  return (
    <div className="space-y-6">
      {claims.length > 1 ? (
        <p className="text-[13px] text-(--color-text)">
          {grants
            ? `${claims.length} ${many} declare this relationship. Each has its own evidence below.`
            : `This line stands for ${claims.length} ${many}. Each has its own evidence below.`}
        </p>
      ) : null}
      {claims.map((c, i) => (
        <div key={`${ws}|${c}`} className={cn(i > 0 && "border-t border-(--color-border-subtle) pt-6")}>
          <EvidenceClaim ws={ws} claim={c} context={contextOf?.(c)} heading={claims.length > 1 ? `${one} ${i + 1} of ${claims.length}` : undefined} />
        </div>
      ))}
    </div>
  );
}

/** The one statement true of every claim, said once per panel. */
export function DeclaredAccessNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 rounded-md bg-(--color-surface-subtle) px-2.5 py-1.5 text-xs leading-relaxed text-(--color-text-muted)", className)}>
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      Declared access — whether a request would succeed has not been evaluated.
    </p>
  );
}
