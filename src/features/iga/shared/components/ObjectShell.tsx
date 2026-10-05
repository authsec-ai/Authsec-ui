/**
 * One object's page: its compact header, its tabs, and the answers that
 * replace a tab when there is nothing to render (SPEC-iga-phase2-graph.md
 * §2.14.5).
 *
 * - The global breadcrumb is Discovery › <list> › <object>; the header is the
 *   detail header (SPEC-console-revamp.md *Summaries*): kind, name, context,
 *   lifecycle with since-when, classification with who decided, the
 *   publication it is read at, and the page's actions. No portrait. On a
 *   workspace tab (the graph) it is its one-row form so the canvas keeps
 *   its height.
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
import { format } from "date-fns";
import { Info, Network } from "lucide-react";
import { Link } from "react-router-dom";

import { DecisionBanner, StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { useEvidence } from "../../evidence/useEvidence";
import { DISCOVERY_PATH, TYPE_LABEL, discoveryListHref, type DiscoveryType } from "../../discovery/urlState";
import type { NodeCategory, NodeIcon } from "../../graph/nodeView";
import { useAnnounce } from "../announce";
import type { GraphFailure } from "../graphErrors";
import { dayText } from "../labels";
import type { LifecycleView } from "../lifecycle";
import type { ActiveTab, TabRoute } from "../links";
import { useGraphRevision } from "../revision";
import { CategoryChip } from "./CategoryChip";
import { CopyButton } from "./CopyButton";
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

/** What the detail header says about one object. Every field is optional but the name and kind. */
export interface ObjectHeaderData {
  name: string;
  kind: { label: string; category: NodeCategory; icon: NodeIcon };
  /** Account (its id once, or the id alone when it has no friendly name), region: as the object states them. */
  context: string[];
  lifecycle?: LifecycleView;
  /** Workloads only. `by` is who decided and when; absent for a provider-native agent or no decision. */
  classification?: { label: string; tone: ConsoleTone; by?: string };
  /** The publication this page is read at. */
  publishedAt?: string | null;
  /** The page's own actions (Classify), before the shared ones. */
  actions?: ReactNode;
  /** The identifier Copy puts on the clipboard: an ARN, a pattern, a principal. */
  copy?: { value: string; label: string; what: string } | null;
}

/**
 * The publication a page is read at, and — when the server has published a
 * newer one — the way to re-pin. Loaded content stays on screen, labelled
 * with this time; nothing newer is mixed in (SPEC-console-revamp.md
 * *Investigation-context contract*).
 */
function PublicationStamp({ ws, publishedAt, onRefresh }: { ws: string; publishedAt?: string | null; onRefresh: () => void }) {
  const { stale } = useGraphRevision(ws);
  useAnnounce(stale ? "A newer publication is current. Refresh to load it." : null);
  if (!publishedAt && !stale) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {publishedAt ? <span className="whitespace-nowrap text-(--color-text-muted)">As of {format(new Date(publishedAt), "d MMM HH:mm")}</span> : null}
      {stale ? (
        <span className="inline-flex items-center gap-2 rounded-md bg-(--color-info-soft) py-0.5 pl-2 pr-0.5 text-(--color-info-text)">
          A newer publication is current
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={onRefresh}>
            Refresh
          </Button>
        </span>
      ) : null}
    </span>
  );
}

export function ObjectShell({
  ws,
  listType,
  kindLabel,
  base,
  tabs,
  activeTab,
  failure,
  onRetry,
  onRefresh,
  object,
  vanished = false,
  children,
}: {
  ws: string;
  /** The Discovery list this object belongs to: the breadcrumb returns to it as the reader left it. */
  listType: DiscoveryType;
  /** What the object is, for headers before it has loaded: "Identity". */
  kindLabel: string;
  /** The object's URL, e.g. `/iga/estate/<id>`. */
  base: string;
  tabs: ObjectTabDef[];
  activeTab: ActiveTab;
  failure: GraphFailure | null;
  onRetry: () => void;
  onRefresh: () => void;
  object?: ObjectHeaderData;
  /**
   * The object was shown and is not in the publication a Refresh just read.
   * The page shows its retired state: Overview and Changes remain, the other
   * tabs say they have no current data.
   */
  vanished?: boolean;
  children: ReactNode;
}) {
  // A gated tab is offered only once the deployment is known to serve it.
  const shown = tabs.filter((t) => !t.gated || t.available === true);
  const key = activeTab.state === "unknown" ? null : activeTab.key;
  const tab = tabs.find((t) => t.key === key);
  const compact = !!tab?.workspace && activeTab.state === "ready";
  const graphTab = shown.find((t) => t.key === "graph");

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
        {vanished ? (
          <DecisionBanner
            tone="neutral"
            title={`${object.name} is not in the current publication`}
            body={`Overview shows what was loaded${object.publishedAt ? ` as of ${format(new Date(object.publishedAt), "d MMM HH:mm")}` : ""}. Changes stays available. The other tabs have no current data.`}
          />
        ) : null}
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
          ? // A tab whose read cannot start yet (the publication is still being pinned) shows loading, never a blank page.
            children == null
            ? skeleton
            : tab?.workspace
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
        object ? (
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <CategoryChip category={object.kind.category} icon={object.kind.icon}>
              {object.kind.label}
            </CategoryChip>
            <span className="min-w-0">{object.name}</span>
          </span>
        ) : (
          kindLabel
        )
      }
      description={object ? <ObjectContext ws={ws} object={object} compact={compact} onRefresh={onRefresh} /> : undefined}
      actions={
        object ? (
          <>
            {object.actions}
            {graphTab && !compact ? (
              <Button asChild variant="outline" size="sm">
                <Link to={`${base}${graphTab.path}`}>
                  <Network className="size-3.5" aria-hidden="true" /> Open graph
                </Link>
              </Button>
            ) : null}
            {object.copy ? <CopyButton value={object.copy.value} label={object.copy.label} what={object.copy.what} /> : null}
          </>
        ) : undefined
      }
      objectPage
      objectCrumb={
        object
          ? {
              path: base,
              label: object.name,
              list: {
                label: TYPE_LABEL[listType],
                // The segment returns to the list as the reader left it: filters, sort, page.
                href: discoveryListHref(listType),
                parent: { label: "Discovery", href: DISCOVERY_PATH },
              },
            }
          : undefined
      }
      publishedAt={object?.publishedAt}
      pageEvidence={false}
    >
      {body}
    </IgaPage>
  );
}

/**
 * The header's second line: where it is, whether it is current and since when,
 * who classified it, the publication it is read at. One row on the graph tab.
 */
function ObjectContext({ ws, object, compact, onRefresh }: { ws: string; object: ObjectHeaderData; compact: boolean; onRefresh: () => void }) {
  const { isOpen: evidenceOpen } = useEvidence();
  const lc = object.lifecycle;
  const exception = lc && lc.state !== "current" ? lc : null;
  const cls = object.classification;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {object.context.length ? <span className={compact ? "max-w-[28ch] truncate" : undefined}>{object.context.join(" · ")}</span> : null}
      {exception ? (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge tone={exception.tone}>{exception.label}</StatusBadge>
          <span className="text-(--color-text-muted)">{exception.since}</span>
        </span>
      ) : lc && !compact ? (
        <span className="text-(--color-text-muted)">{lc.label}, {lc.since}</span>
      ) : null}
      {cls ? (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge tone={cls.tone}>{cls.label}</StatusBadge>
          {cls.by && !compact ? <span className="text-(--color-text-muted)">{cls.by}</span> : null}
        </span>
      ) : null}
      <PublicationStamp ws={ws} publishedAt={object.publishedAt} onRefresh={onRefresh} />
      {/* Said once per screen, here, never per row. The graph's status bar and an
          open inspector each say it for themselves, so the header yields to them. */}
      {!compact && !evidenceOpen ? (
        <span className="inline-flex items-center gap-1 text-(--color-text-muted)" title="What a policy declares is shown; whether a request would succeed is not evaluated.">
          <Info className="size-3.5" aria-hidden="true" /> Declared access — not evaluated
        </span>
      ) : null}
    </span>
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
