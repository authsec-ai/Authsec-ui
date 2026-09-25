/**
 * One object's page: its compact header, its tabs, and the answers that
 * replace a tab when there is nothing to render (SPEC-iga-phase2-graph.md
 * §2.14.5).
 *
 * - The global breadcrumb names the object; the header is its name, one
 *   metadata line, and a status badge only when one applies.
 * - Tabs are routes; a tab whose backend is not deployed is not offered.
 *   The browser URL is the shareable link — investigation state and the
 *   revision rules live in it, so there is no separate Copy link control.
 * - A workspace tab (the graph) fills the page below the tabs and hosts
 *   evidence in its own inspector; other tabs get the page evidence panel
 *   beside their content, never beside the tab strip.
 * - A retired object still renders its Overview; its other tabs say they
 *   have no current data rather than rendering empty.
 */

import type { ReactNode } from "react";

import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import type { GraphFailure } from "../graphErrors";
import type { ActiveTab, TabRoute } from "../links";
import { listHrefWithFilters } from "../useListFilters";
import { dayText } from "../labels";
import { GraphStatePanel } from "./GraphStatePanel";
import { EvidenceLayout, IgaPage } from "./IgaPage";
import { ObjectTabs, type ObjectTab } from "./ObjectTabs";

export interface ObjectTabDef extends TabRoute {
  label: string;
  /** Path segment after the object's URL; "" for Overview. */
  path: string;
  /** Fills the page below the tabs and hosts evidence in its own inspector. */
  workspace?: boolean;
}

export function ObjectShell({
  ws,
  listCrumb,
  kindLabel,
  base,
  tabs,
  activeTab,
  failure,
  onRetry,
  onRefresh,
  object,
  children,
}: {
  ws: string;
  listCrumb: { label: string; to: string };
  /** What the object is, for headers before it has loaded: "Identity". */
  kindLabel: string;
  /** The object's URL, e.g. `/iga/estate/<id>`. */
  base: string;
  tabs: ObjectTabDef[];
  activeTab: ActiveTab;
  failure: GraphFailure | null;
  onRetry: () => void;
  onRefresh: () => void;
  object?: {
    name: string;
    /** Type, account, region: one line of secondary metadata. */
    description?: ReactNode;
    /** Classification or lifecycle, only when one applies. */
    status?: ReactNode;
    publishedAt?: string | null;
    actions?: ReactNode;
  };
  children: ReactNode;
}) {
  // A gated tab is offered only once the deployment is known to serve it.
  const shown = tabs.filter((t) => !t.gated || t.available === true);
  const key = activeTab.state === "unknown" ? null : activeTab.key;
  const tab = tabs.find((t) => t.key === key);

  const panel = (f: GraphFailure) => (
    <TableCard>
      <CardContent variant="flush">
        <GraphStatePanel failure={f} subject={`this ${kindLabel.toLowerCase()}`} onRetry={onRetry} onRefresh={onRefresh} />
      </CardContent>
    </TableCard>
  );

  const skeleton = (
    <TableCard>
      <CardContent>
        <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />
      </CardContent>
    </TableCard>
  );

  let body: ReactNode;
  if (activeTab.state === "unknown") body = panel({ kind: "not_found" });
  else if (!object && failure) body = panel(failure);
  else if (!object) body = skeleton;
  else
    body = (
      <>
        {failure && failure.kind !== "revision_stale" ? (
          <div role="alert" className="rounded-md border p-3 text-sm">
            Could not refresh this object. Showing the previous answer. <button className="underline" onClick={onRetry}>Retry</button>
          </div>
        ) : null}
        <ObjectTabs
          tabs={shown.map<ObjectTab>((t) => ({ key: t.key, label: t.label, to: `${base}${t.path}` }))}
          active={activeTab.key}
        />
        {activeTab.state === "ready"
          ? tab?.workspace
            ? children
            : <EvidenceLayout ws={ws}>{children}</EvidenceLayout>
          : activeTab.state === "pending"
            ? skeleton
            : (
              <TableCard>
                <CardContent variant="flush">
                  <GraphStatePanel failure={{ kind: "unavailable" }} subject={`this ${kindLabel.toLowerCase()}'s ${tab?.label.toLowerCase() ?? "view"}`} />
                </CardContent>
              </TableCard>
            )}
      </>
    );

  return (
    <IgaPage
      ws={ws}
      title={
        object?.status ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            {object.name}
            {object.status}
          </span>
        ) : (
          object?.name ?? kindLabel
        )
      }
      description={object?.description}
      actions={object?.actions}
      objectPage
      objectCrumb={object ? { path: base, label: object.name, list: { label: listCrumb.label, href: listHrefWithFilters(listCrumb.to) } } : undefined}
      publishedAt={object?.publishedAt}
      pageEvidence={false}
    >
      {body}
    </IgaPage>
  );
}

/** The body of a non-Overview tab on a retired object (§2.14.5). */
export function RetiredTab({ name, lastConfirmed }: { name: string; lastConfirmed: string | null }) {
  return (
    <TableCard>
      <CardContent>
        <p className="text-sm text-(--color-text-muted)">
          {name} is no longer in the latest scan{lastConfirmed ? `. It was last confirmed ${dayText(lastConfirmed)}` : ""},
          so this tab has no current data.
        </p>
      </CardContent>
    </TableCard>
  );
}

/** A tab's own loading, failure or content, inside the tab's card. */
export function TabBody({
  failure,
  ready,
  subject,
  onRetry,
  onRefresh,
  flush,
  children,
}: {
  failure: GraphFailure | null;
  /** The tab's data has arrived. */
  ready: boolean;
  subject: string;
  onRetry: () => void;
  onRefresh: () => void;
  flush?: boolean;
  children: ReactNode;
}) {
  if (!ready && !failure) {
    return (
      <TableCard>
        <CardContent>
          <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading" />
        </CardContent>
      </TableCard>
    );
  }
  if (!ready && failure) {
    return (
      <TableCard>
        <CardContent variant="flush">
          <GraphStatePanel failure={failure} subject={subject} onRetry={onRetry} onRefresh={onRefresh} />
        </CardContent>
      </TableCard>
    );
  }
  return (
    <TableCard>
      <CardContent variant={flush ? "flush" : "default"}>{children}</CardContent>
    </TableCard>
  );
}
