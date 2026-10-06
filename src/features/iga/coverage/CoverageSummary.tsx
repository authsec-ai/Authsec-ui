/**
 * Collection gaps above an inventory (SPEC-iga-phase2-graph.md §2.14.13):
 * ONE line that says what the gaps mean for the list below — "Discovery is
 * incomplete in 2 accounts. Some workloads may be missing." — and a sheet,
 * opened on request, that lists them by account, then service and region,
 * in readable words. The inventory stays in view underneath.
 *
 * "Denied" here is always the collector's own call being refused — never
 * anything about what a workload may access — and it is kept apart from a
 * collection that failed, a region outside the scan scope, and a service AWS
 * does not offer there. Surface keys and collector diagnostics are one
 * disclosure deeper; the account's full coverage is its own sheet.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";

import { refId, type GraphCoverageGap, type GraphRef, type Pipeline, type SurfaceState } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { INCOMPLETE_STATES } from "../shared/labels";
import { CoverageSheet } from "./CoverageSheet";
import { readableSurface } from "./surfaceNames";

/** What happened to the collection, in words that cannot be read as access.
 *
 * Split from the explanation below rather than one sentence: gaps are grouped
 * account → service → state, so the same state repeats once per service and a
 * full sentence in warning colour each time turned the panel into a block of
 * orange that buried the service names. The short half stays coloured; the
 * reason is rendered muted beside it. Same words, less shouting. */
const COLLECTION_STATE: Record<SurfaceState, string> = {
  reached: "Collected",
  partial: "Collected in part",
  denied: "Collection denied",
  throttled: "Collection throttled by AWS",
  unknown: "Collection failed or was not checked",
  stale: "Not reconfirmed by the latest scan",
  constrained: "Collection blocked by an account policy",
  revoked: "Connection revoked",
  not_selected: "Outside the scan scope",
  unsupported: "Not offered by AWS in this region",
  not_configured: "Not configured for collection",
};

/** The clause that used to sit after an em-dash in the label above. Only the
 * two states that had one carry it; the rest say everything in the headline. */
const COLLECTION_STATE_WHY: Partial<Record<SurfaceState, string>> = {
  denied: "AWS refused the discovery role's request",
  not_selected: "region not selected",
};

const OUT_OF_SCOPE: ReadonlySet<SurfaceState> = new Set<SurfaceState>(["not_selected", "unsupported", "not_configured"]);

export function CoverageSummary({
  ws,
  gaps,
  accountName,
  pipeline,
  subject,
}: {
  ws: string;
  gaps: GraphCoverageGap[];
  accountName: (accountId: string) => string;
  pipeline?: Pipeline;
  /** What may be missing: "workloads". */
  subject: string;
}) {
  const [review, setReview] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const incomplete = useMemo(() => gaps.filter((g) => INCOMPLETE_STATES.has(g.state)), [gaps]);
  const scoped = useMemo(() => gaps.filter((g) => OUT_OF_SCOPE.has(g.state)), [gaps]);
  // Kept apart from both: a revoked account is neither a failed read nor a
  // region nobody selected. It is still listed in the panel below, muted, so
  // it is not hidden — but on its own it must not put a strip on the page.
  const revoked = useMemo(() => gaps.filter((g) => g.state === "revoked"), [gaps]);

  // Nothing to say when the only "gap" is an account the customer disconnected
  // themselves. PipelineNotice already reports that, once, in neutral tone.
  if (!incomplete.length && !scoped.length) return null;

  const accounts = [...new Set(incomplete.map((g) => g.account_id))];
  const connectorOf = (accountId: string) => {
    const a = pipeline?.accounts.find((x) => x.account_id === accountId);
    return a ? refId(a.integration as GraphRef) : undefined;
  };

  const headline = incomplete.length
    ? `Discovery is incomplete in ${accounts.length === 1 ? accountName(accounts[0]) : `${accounts.length} accounts`}. Some ${subject} may be missing.`
    : `Some regions or services are outside the scan scope, so nothing was collected there.`;

  return (
    <>
      <div
        role="status"
        className={
          incomplete.length
            ? "flex flex-wrap items-center justify-between gap-2 rounded-md border border-(--color-warning-text)/25 border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning-text)"
            : "flex flex-wrap items-center justify-between gap-2 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-sm text-(--color-text-muted)"
        }
      >
        {/* An icon and a left rule, so the warning does not depend on colour
            alone (colour-blind readers), and a hairline border instead of a
            flood of fill so it stops outshouting the list under it. */}
        <span className="flex items-center gap-2">
          {incomplete.length ? <AlertTriangle aria-hidden="true" className="size-4 shrink-0" /> : <Info aria-hidden="true" className="size-4 shrink-0" />}
          {headline}
        </span>
        <button type="button" onClick={() => setReview(true)} className="shrink-0 font-semibold text-(--color-primary-text) hover:underline">
          Review collection gaps
        </button>
      </div>

      <Sheet open={review} onOpenChange={setReview}>
        {/* 520 rather than 440: the state line, its reason and the region list
            share one row, and at 440 nearly every gap wrapped to three lines. */}
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[520px]">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>Collection gaps</SheetTitle>
            <SheetDescription>
              What the latest publication could not collect, and what that leaves unknown. These describe discovery,
              not what any workload may access.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {groupByAccount([...incomplete, ...scoped, ...revoked]).map(([accountId, list]) => (
              <section key={accountId} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-(--color-text)">
                    {accountName(accountId)}
                    {/* How much is under this heading, before it is scrolled.
                        Counts services, which is how the list below is grouped
                        — not surfaces, which would be a larger and less
                        meaningful number. */}
                    <span className="ml-2 font-normal tabular-nums text-(--color-text-muted)">
                      {groupByService(list).length}
                      {groupByService(list).length === 1 ? " service" : " services"}
                    </span>
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReview(false);
                      setAccount(accountId);
                    }}
                  >
                    {/* "Full coverage" read as a claim about this account's
                        state — the opposite of what the panel is showing. It
                        is a link to the account's whole coverage report. */}
                    Account coverage
                  </Button>
                </div>
                <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                  {groupByService(list).map(([service, rows]) => (
                    <li key={service} className="space-y-1.5 px-3 py-2.5 text-sm">
                      <p className="font-medium text-(--color-text)">{service}</p>
                      {groupByState(rows).map(([state, items]) => (
                        <div key={state} className="space-y-0.5">
                          <p className="text-(--color-text-muted)">
                            <span
                              className={
                                INCOMPLETE_STATES.has(state)
                                  ? "font-medium text-(--color-warning-text)"
                                  : "text-(--color-text-muted)"
                              }
                            >
                              {COLLECTION_STATE[state] ?? state}
                            </span>
                            {COLLECTION_STATE_WHY[state] ? ` — ${COLLECTION_STATE_WHY[state]}` : ""}
                            {regionsText(items)}
                          </p>
                          <p className="text-xs text-(--color-text-muted)">{items[0].affects}</p>
                          <details className="group text-xs">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-(--color-primary-text) hover:underline [&::-webkit-details-marker]:hidden">
                              <ChevronRight
                                className="size-3 transition-transform group-open:rotate-90"
                                aria-hidden="true"
                              />
                              View technical details
                            </summary>
                            <ul className="mt-1 space-y-0.5 pl-4 font-mono text-[11px] font-normal text-(--color-text-muted)">
                              {items.map((g) => (
                                <li key={g.surface}>
                                  {g.surface} · {g.state}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <CoverageSheet
        ws={ws}
        accountId={account}
        accountName={account ? accountName(account) : ""}
        connectorId={account ? connectorOf(account) : undefined}
        onClose={() => setAccount(null)}
      />
    </>
  );
}

function groupByAccount(gaps: GraphCoverageGap[]): [string, GraphCoverageGap[]][] {
  const m = new Map<string, GraphCoverageGap[]>();
  for (const g of gaps) m.set(g.account_id, [...(m.get(g.account_id) ?? []), g]);
  return [...m];
}

function groupByService(gaps: GraphCoverageGap[]): [string, GraphCoverageGap[]][] {
  const m = new Map<string, GraphCoverageGap[]>();
  for (const g of gaps) {
    const { service } = readableSurface(g.surface);
    m.set(service, [...(m.get(service) ?? []), g]);
  }
  return [...m];
}

function groupByState(gaps: GraphCoverageGap[]): [SurfaceState, GraphCoverageGap[]][] {
  const m = new Map<SurfaceState, GraphCoverageGap[]>();
  for (const g of gaps) m.set(g.state, [...(m.get(g.state) ?? []), g]);
  return [...m];
}

function regionsText(items: GraphCoverageGap[]): string {
  const regions = items.map((g) => readableSurface(g.surface).region).filter(Boolean) as string[];
  if (!regions.length) return "";
  return regions.length <= 3 ? ` · ${regions.join(", ")}` : ` · ${regions.slice(0, 3).join(", ")} and ${regions.length - 3} more regions`;
}
