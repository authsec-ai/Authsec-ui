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
import { ChevronRight } from "lucide-react";

import { refId, type GraphCoverageGap, type GraphRef, type Pipeline, type SurfaceState } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { INCOMPLETE_STATES } from "../shared/labels";
import { CoverageSheet } from "./CoverageSheet";
import { readableSurface } from "./surfaceNames";

/** What happened to the collection, in words that cannot be read as access. */
const COLLECTION_STATE: Record<SurfaceState, string> = {
  reached: "Collected",
  partial: "Collected in part",
  denied: "Collection denied — AWS refused the discovery role's request",
  throttled: "Collection throttled by AWS",
  unknown: "Collection failed or was not checked",
  stale: "Not reconfirmed by the latest scan",
  constrained: "Collection blocked by an account policy",
  revoked: "Connection revoked",
  not_selected: "Outside the scan scope — region not selected",
  unsupported: "Not offered by AWS in this region",
  not_configured: "Not configured for collection",
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
  if (gaps.length === 0) return null;

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
            ? "flex flex-wrap items-center justify-between gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning-text)"
            : "flex flex-wrap items-center justify-between gap-2 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-sm text-(--color-text-muted)"
        }
      >
        <span>{headline}</span>
        <button type="button" onClick={() => setReview(true)} className="shrink-0 font-semibold text-(--color-primary-text) hover:underline">
          Review collection gaps
        </button>
      </div>

      <Sheet open={review} onOpenChange={setReview}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[440px]">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>Collection gaps</SheetTitle>
            <SheetDescription>
              What the latest publication could not collect, and what that leaves unknown. These describe discovery,
              not what any workload may access.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {groupByAccount(incomplete.length ? [...incomplete, ...scoped] : scoped).map(([accountId, list]) => (
              <section key={accountId} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-(--color-text)">{accountName(accountId)}</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReview(false);
                      setAccount(accountId);
                    }}
                  >
                    Full coverage
                  </Button>
                </div>
                <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                  {groupByService(list).map(([service, rows]) => (
                    <li key={service} className="space-y-1.5 px-3 py-2.5 text-sm">
                      <p className="font-medium text-(--color-text)">{service}</p>
                      {groupByState(rows).map(([state, items]) => (
                        <div key={state} className="space-y-0.5">
                          <p className={INCOMPLETE_STATES.has(state) ? "text-(--color-warning-text)" : "text-(--color-text-muted)"}>
                            {COLLECTION_STATE[state] ?? state}
                            {regionsText(items)}
                          </p>
                          <p className="text-xs text-(--color-text-muted)">{items[0].affects}</p>
                          <details className="text-xs text-(--color-text-muted)">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                              <ChevronRight className="size-3" aria-hidden="true" /> Technical details
                            </summary>
                            <ul className="mt-1 space-y-0.5 pl-4 font-mono text-[11px]">
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
