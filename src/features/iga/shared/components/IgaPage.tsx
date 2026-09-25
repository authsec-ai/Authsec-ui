/**
 * The shell every identity-graph page renders through: `ConsolePage` plus the
 * pieces each graph view shares (SPEC-iga-phase2-graph.md §2.14.5, §2.14.14).
 *
 * - Breadcrumbs name the investigation, never the schema.
 * - `via=<ref>` keeps the originating object reachable across a detour:
 *   "← Back to ticket-tools". Its name travels in history state; a shared
 *   link without it still offers the way back, unnamed.
 * - `from=<published_at>` (added by Copy link) says, only when the graph has
 *   been rescanned since, that the page shows the graph as it is now.
 * - One revision banner, one live region, one evidence panel.
 */

import { Fragment, type ReactNode } from "react";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { objectPath, type GraphRef } from "@/app/api/igaGraphApi";
import type { ViaState } from "../links";
import { ConsolePage } from "@/components/console/ConsolePage";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { EvidencePanel } from "../../evidence/EvidencePanel";
import { useGraphRevision } from "../revision";
import { LiveRegion } from "./LiveRegion";
import { RevisionBanner } from "./RevisionBanner";

export interface Crumb {
  label: string;
  to?: string;
}

export function IgaPage({
  ws,
  title,
  description,
  actions,
  crumbs,
  publishedAt,
  children,
}: {
  ws: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  /** The publication the page shows, for the shared-link notice. */
  publishedAt?: string | null;
  children: ReactNode;
}) {
  const { stale, refresh } = useGraphRevision(ws);
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  const via = params.get("via") as GraphRef | null;
  const viaPath = via ? objectPath(via) : null;
  const viaName = (location.state as ViaState | null)?.viaName;
  const dropVia = () => {
    const next = new URLSearchParams(params);
    next.delete("via");
    setParams(next, { replace: true, state: location.state });
  };

  const from = params.get("from");
  const rescanned = from && publishedAt && new Date(publishedAt).getTime() > new Date(from).getTime();

  return (
    <div data-iga-page><ConsolePage title={title} description={description} actions={actions}>
      <LiveRegion />
      {crumbs?.length ? (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((c, i) => (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {c.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      {viaPath ? (
        <div className="flex items-center gap-3 text-sm">
          <Link to={viaPath} className="inline-flex items-center gap-1.5 font-medium text-(--color-primary-text) hover:underline">
            <ArrowLeft className="size-4" /> Back to {viaName ?? "the previous object"}
          </Link>
          <button type="button" onClick={dropVia} className="text-xs text-(--color-text-muted) hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}
      {rescanned ? (
        <p className="rounded-md bg-(--color-info-soft) px-3 py-2 text-xs text-(--color-info-text)">
          Shared {format(new Date(from), "d MMM HH:mm")}. The graph has been rescanned since, so this shows it as it
          is now.
        </p>
      ) : null}
      {stale ? <RevisionBanner currentPublishedAt={stale.currentPublishedAt} onRefresh={refresh} /> : null}
      <div className={params.has("evidence") ? "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]" : "min-w-0"}>
        <div className="min-w-0 space-y-4">{children}</div>
        <EvidencePanel ws={ws} />
      </div>
    </ConsolePage></div>
  );
}
