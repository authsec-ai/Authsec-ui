/**
 * Collection gaps across Azure tenants, shown the way AWS's CoverageSummary
 * shows them (iga/coverage/CoverageSummary.tsx): one short headline above the
 * Discovery body, a "Review collection gaps" link opening a sheet with the
 * full breakdown. `connectionNotices` used to spell this out as a run-on
 * sentence per tenant ("Contoso Ltd: X not configured, Y denied, and 6
 * more..."); that sentence is skipped for Azure now that this exists.
 *
 * Azure's coverage model is per-connector (surface + state pairs already
 * filtered to the ones that matter, see azureTenantConnection), not the IGA
 * graph's per-account GraphCoverageGap, so this is its own small component
 * rather than a reuse of CoverageSummary.
 *
 * Closeable (useDismissedNotices, session-scoped): the key covers which
 * tenants have a gap, so resolving one tenant's gap or a new tenant
 * developing one is a different situation and shows again, rather than
 * staying hidden because *some* gap was once dismissed.
 */

import { useState } from "react";
import { AlertTriangle, ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { Connection } from "@/app/api/connectionsApi";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { surfaceStateText } from "@/features/iga/shared/labels";
import { useDismissedNotices } from "@/features/iga/discovery/useDismissedNotices";

import { surfaceLabel } from "./azureDiscoveryLabels";

export function AzureCoverageSummary({ connections }: { connections: Connection[] }) {
  const [open, setOpen] = useState(false);
  const { isDismissed, dismiss } = useDismissedNotices();
  const withGaps = connections.filter(
    (c) => c.provider === "azure" && (c.coverage.state === "partial" || c.coverage.state === "denied") && c.coverage.gaps.length,
  );
  if (!withGaps.length) return null;

  const key = `azure-coverage:${withGaps
    .map((c) => c.id)
    .sort()
    .join(",")}`;
  if (isDismissed(key)) return null;

  const headline =
    withGaps.length === 1
      ? `Discovery is incomplete in ${withGaps[0].name || withGaps[0].native_id}. Some results may be missing.`
      : `Discovery is incomplete in ${withGaps.length} Azure tenants. Some results may be missing.`;

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-(--color-warning-text)/25 border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning-text)"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          {headline}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="font-semibold text-(--color-primary-text) hover:underline">
            Review collection gaps
          </button>
          <button type="button" onClick={() => dismiss(key)} aria-label="Dismiss this notice" className="rounded p-0.5 hover:bg-(--color-warning-text)/10">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[480px]">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>Collection gaps</SheetTitle>
            <SheetDescription>What the latest read could not collect, and what that leaves unknown.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {withGaps.map((c) => (
              <section key={c.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-(--color-text)">
                    {c.name || c.native_id}
                    <span className="ml-2 font-normal tabular-nums text-(--color-text-muted)">
                      {c.coverage.gaps.length} {c.coverage.gaps.length === 1 ? "gap" : "gaps"}
                    </span>
                  </h3>
                  <Link
                    to={`/iga/connections/${encodeURIComponent(c.id)}/coverage`}
                    onClick={() => setOpen(false)}
                    className="text-sm font-semibold text-(--color-primary-text) hover:underline"
                  >
                    Tenant coverage
                  </Link>
                </div>
                <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                  {c.coverage.gaps.map((g) => (
                    <li key={g.surface} className="space-y-1 px-3 py-2.5 text-sm">
                      <p className="font-medium text-(--color-text)">{surfaceLabel(g.surface)}</p>
                      <p className="text-(--color-text-muted)">{surfaceStateText(g.state)}</p>
                      <details className="group text-xs">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-(--color-primary-text) hover:underline [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden="true" />
                          View technical details
                        </summary>
                        <p className="mt-1 pl-4 font-mono text-[11px] font-normal text-(--color-text-muted)">
                          {g.surface} · {g.state}
                        </p>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
