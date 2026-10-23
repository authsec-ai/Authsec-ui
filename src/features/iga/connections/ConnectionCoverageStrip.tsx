/**
 * The connection's own collection gaps, as a panel above the Overview tab —
 * the same neutral card as "Setup" and "Tenant" beside it (Panel, from
 * shared/components/Panel.tsx), not a colour-coded warning banner: one line
 * saying what is missing, and a "Review collection gaps" header action that
 * opens a sheet with the surfaces and why each one is short. Same idea as the
 * Discovery page's coverage summaries (iga/coverage/CoverageSummary.tsx for
 * AWS, discovery/cloud/azure/AzureCoverageSummary.tsx for Azure) — this is
 * the single-connection version, so every provider gets it from one
 * component instead of each connection page inventing its own.
 *
 * The Tracker's Coverage row (coverageText/coveragePill in connectionModel.ts)
 * keeps its short pill and its link to the Coverage tab; this panel is the
 * fuller version of the same fact, not a replacement for that row.
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { Connection } from "@/app/api/connectionsApi";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Panel } from "@/features/iga/shared/components/Panel";
import { surfaceLabel as azureSurfaceLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";
import { surfaceStateText } from "@/features/iga/shared/labels";

import { readableSurface } from "../coverage/surfaceNames";
import { K8S_SWEEP_SURFACE, detailHref, gapName } from "./connectionModel";

function surfaceName(c: Connection, surface: string): string {
  if (surface === K8S_SWEEP_SURFACE) return gapName({ surface, state: "" });
  return c.provider === "azure" ? azureSurfaceLabel(surface) : readableSurface(surface).service;
}

export function ConnectionCoverageStrip({ c }: { c: Connection }) {
  const [open, setOpen] = useState(false);
  if ((c.coverage.state !== "partial" && c.coverage.state !== "denied") || !c.coverage.gaps.length) return null;

  const unit = c.provider === "azure" ? (c.coverage.gaps.length === 1 ? "area" : "areas") : c.coverage.gaps.length === 1 ? "surface" : "surfaces";
  const names = c.coverage.gaps.slice(0, 2).map((g) => surfaceName(c, g.surface));
  const preview = names.length ? `${names.join(", ")}${c.coverage.gaps.length > names.length ? ", and more" : ""}` : "";

  const headline =
    (c.coverage.state === "denied" ? "Access was refused for: " : "Not fully read: ") + (preview || "some parts of this account");

  return (
    <>
      <Panel
        title="Items needing attention"
        count={`${c.coverage.gaps.length} ${unit}`}
        actions={
          <button type="button" onClick={() => setOpen(true)} className="font-medium text-(--color-primary-text) hover:underline">
            See what to do
          </button>
        }
      >
        <p className="text-xs leading-relaxed text-(--color-text-muted)">{headline}.</p>
      </Panel>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[440px]">
          <SheetHeader className="shrink-0 border-b px-5 py-4">
            <SheetTitle>Items needing attention</SheetTitle>
            <SheetDescription>What the latest read could not collect, and what that leaves unknown.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-0 overflow-y-auto">
            <ul className="divide-y divide-(--color-border-subtle)">
              {c.coverage.gaps.map((g) => (
                <li key={g.surface} className="space-y-1 px-5 py-3 text-sm">
                  <p className="font-medium text-(--color-text)">{surfaceName(c, g.surface)}</p>
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
          </div>
          <div className="shrink-0 border-t px-5 py-3">
            <Link to={detailHref(c.id, "coverage")} onClick={() => setOpen(false)} className="text-sm font-semibold text-(--color-primary-text) hover:underline">
              Open the full coverage report
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
