/**
 * One object's page: its header, its tabs, and the answers that replace a
 * tab when there is nothing to render (SPEC-iga-phase2-graph.md §2.14.5).
 *
 * - Tabs are routes; a tab whose backend is not deployed is not offered.
 * - "Copy link" adds `from=<published_at>`, so a recipient is told when the
 *   graph has been rescanned since (the link never promises a revision).
 * - A retired object still renders its Overview; its other tabs say they
 *   have no current data rather than rendering empty.
 */

import type { ReactNode } from "react";
import { Link2 } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import type { GraphFailure } from "../graphErrors";
import type { ActiveTab, TabRoute } from "../links";
import { dayText } from "../labels";
import { GraphStatePanel } from "./GraphStatePanel";
import { IgaPage, type Crumb } from "./IgaPage";
import { ObjectTabs, type ObjectTab } from "./ObjectTabs";

export interface ObjectTabDef extends TabRoute {
  label: string;
  /** Path segment after the object's URL; "" for Overview. */
  path: string;
}

function CopyLink({ publishedAt }: { publishedAt?: string | null }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("via");
        if (publishedAt) url.searchParams.set("from", publishedAt);
        try {
          await navigator.clipboard.writeText(url.toString());
          toast.success("Link copied");
        } catch { toast.error("Could not copy the link. Copy the address from your browser."); }
      }}
    >
      <Link2 className="size-4" /> Copy link
    </Button>
  );
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
  listCrumb: Crumb;
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
    description?: ReactNode;
    publishedAt?: string | null;
    actions?: ReactNode;
  };
  children: ReactNode;
}) {
  // A gated tab is offered only once the deployment is known to serve it.
  const shown = tabs.filter((t) => !t.gated || t.available === true);
  const key = activeTab.state === "unknown" ? null : activeTab.key;
  const tab = tabs.find((t) => t.key === key);
  const crumbs: Crumb[] = object
    ? [listCrumb, ...(tab && tab.path ? [{ label: object.name, to: base }, { label: tab.label }] : [{ label: object.name }])]
    : [listCrumb];

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
          ? children
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
      title={object?.name ?? kindLabel}
      description={object?.description}
      actions={
        object ? (
          <>
            {object.actions}
            <CopyLink publishedAt={object.publishedAt} />
          </>
        ) : undefined
      }
      crumbs={crumbs}
      publishedAt={object?.publishedAt}
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
