/**
 * The shell every identity-graph page renders through: `ConsolePage` plus the
 * pieces each graph view shares (SPEC-iga-phase2-graph.md §2.14.5, §2.14.14).
 *
 * - One breadcrumb: the global one. An object page names itself in it
 *   (`objectCrumb`); the page body carries no second trail.
 * - `via=<ref>` keeps the originating object reachable across a detour:
 *   "← Back to ticket-tools". Its name travels in history state; a link
 *   without it still offers the way back, unnamed.
 * - `from=<published_at>` on a link shared before the graph was rescanned
 *   says that the page shows the graph as it is now.
 * - One revision banner, one live region, one evidence panel. A workspace tab
 *   (the graph) hosts evidence in its own inspector, so the page does not.
 */

import type { ReactNode } from "react";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { objectPath, type GraphRef } from "@/app/api/igaGraphApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";

import { EvidencePanel } from "../../evidence/EvidencePanel";
import type { ViaState } from "../links";
import { useGraphRevision } from "../revision";
import { LiveRegion } from "./LiveRegion";
import { RevisionBanner } from "./RevisionBanner";

export interface ObjectCrumb {
  /** The object's own URL. */
  path: string;
  label: string;
  list: { label: string; href: string };
}

/** Content with the page-level evidence panel beside it (wide) or over it (narrow). */
export function EvidenceLayout({ ws, children }: { ws: string; children: ReactNode }) {
  const [params] = useSearchParams();
  return (
    <div className={params.has("evidence") ? "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]" : "min-w-0"}>
      <div className="min-w-0 space-y-4">{children}</div>
      <EvidencePanel ws={ws} />
    </div>
  );
}

export function IgaPage({
  ws,
  title,
  description,
  actions,
  objectPage = false,
  objectCrumb,
  publishedAt,
  pageEvidence = true,
  children,
}: {
  ws: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** One object's page: the compact header, from the first render (no jump when it loads). */
  objectPage?: boolean;
  /** Names the object in the global breadcrumb, once it has loaded. */
  objectCrumb?: ObjectCrumb;
  /** The publication the page shows, for the shared-link notice. */
  publishedAt?: string | null;
  /** false: the children place the evidence panel themselves. */
  pageEvidence?: boolean;
  children: ReactNode;
}) {
  const { stale, refresh } = useGraphRevision(ws);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  useBreadcrumbTail(objectCrumb?.path ?? null, objectCrumb?.label ?? null, objectCrumb?.list);

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
    <div data-iga-page>
      <ConsolePage title={title} description={description} actions={actions} variant={objectPage ? "object" : "default"}>
        <LiveRegion />
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
        {pageEvidence ? <EvidenceLayout ws={ws}>{children}</EvidenceLayout> : children}
      </ConsolePage>
    </div>
  );
}
