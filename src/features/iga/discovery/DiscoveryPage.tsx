/**
 * Discovery — what has been found, and what each thing can do
 * (SPEC-console-revamp.md *Discovery*).
 *
 * Provider-scoped until the read contracts are equal: a Provider control, a
 * type switcher with honest counts, a search box, a row of popover facets, a
 * list and a list preview. A combination the provider does not collect is an
 * explicit *Not collected* state, never an empty list. Everything the reader
 * can change is in the URL (`urlState.ts`), so a view can be shared and Back
 * restores it.
 */

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { useListDiscoveryConnectionsQuery } from "@/app/api/connectionsApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBanner } from "@/components/console/status";
import { loadFailureOf } from "@/components/console/load-failure";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { usePipeline } from "../pipeline/usePipeline";
import { CountText } from "../shared/components/CountText";
import { COUNT_UNAVAILABLE } from "../shared/components/countValue";
import { LiveRegion } from "../shared/components/LiveRegion";
import { useAnnounce } from "../shared/announce";
import { RevisionBanner } from "../shared/components/RevisionBanner";
import { useGraphRevision } from "../shared/revision";
import { useSlashToSearch } from "../shared/useListFilters";
import { FailurePanel, NotCollected } from "./ListStates";
import { countBasis, effectiveView, hasViews, planSwitch, supportsType, TYPES_BY_PROVIDER, type Scope } from "./model";
import { ProviderControl } from "./ProviderControl";
import { heartbeatDiscrepancy, publicationText } from "./publicationLine";
import { connectionNotices, sweepNotices } from "./connectionNotices";
import { SourceNotices } from "./SourceNotices";
import { connectedProviders, defaultProvider, resolveSource, sourcesOf, writeLastProvider } from "./sources";
import type { ScreenProps } from "./screenTypes";
import { useDiscoveryOverview } from "./useDiscoveryOverview";
import { useDiscoveryUrl } from "./useDiscoveryUrl";
import { inScope } from "./k8s";
import { PROVIDER_LABEL, TYPE_LABEL, rememberDiscoverySearch, type DiscoveryProvider, type DiscoveryType, type DiscoveryView } from "./urlState";
import LatestScreen from "./LatestScreen";
import InventoryScreen from "./InventoryScreen";
import PublishedScreen from "./PublishedScreen";
import SightingsScreen from "./SightingsScreen";
import { InfoTip } from "../shared/components/InfoTip";

const DESCRIPTION = (
  <span className="inline-flex items-center gap-1">
    Workloads, identities and resources found in your connected sources.
    <InfoTip label="About access shown here">Access is declared, not evaluated: nothing here tests whether a request would succeed.</InfoTip>
  </span>
);

export default function DiscoveryPage() {
  const ws = getWorkspaceId() ?? "";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const url = useDiscoveryUrl();
  useSlashToSearch();

  const connQ = useListDiscoveryConnectionsQuery();
  const connections = useMemo(() => connQ.data ?? [], [connQ.data]);
  const connected = useMemo(() => connectedProviders(connections), [connections]);

  // The default rule: the URL, then what was last used in this browser, else the
  // most recently available result, else the only connected provider.
  const resolved: DiscoveryProvider | undefined = url.provider ?? defaultProvider(connections, url.type) ?? defaultProvider(connections);
  const provider = resolved;
  const type: DiscoveryType = url.type ?? (provider ? TYPES_BY_PROVIDER[provider][0] : "workloads");
  const view: DiscoveryView = provider ? effectiveView(provider, type, url.view) : "published";
  // A failed refetch keeps the connections already read: only a read that has never
  // succeeded replaces the page.
  // The announcer keeps its last words until something replaces them. Screens that
  // announce their own counts do so when their data arrives; one that does not
  // (Latest collected) must not leave the previous list's sentence in its place.
  useAnnounce(provider ? `Discovery: ${PROVIDER_LABEL[provider]}, ${TYPE_LABEL[type]}${hasViews(provider, type) ? (view === "latest" ? ", latest collected" : ", published") : ""}` : null);
  const connectionsFailed = connQ.isError && !connQ.data;
  const ready = !connQ.isLoading && !connectionsFailed;

  const { normalise } = url;
  useEffect(() => {
    // Make the resolved provider and type explicit in the URL, once.
    if (ready && provider && (!url.provider || !url.type)) normalise({ provider, type });
  }, [ready, provider, type, url.provider, url.type, normalise]);
  useEffect(() => {
    if (url.provider && url.type) rememberDiscoverySearch(url.provider, url.type, url.search);
  }, [url.provider, url.type, url.search]);
  useEffect(() => {
    if (url.provider && connected.includes(url.provider)) writeLastProvider(url.provider);
  }, [url.provider, connected]);

  // Nothing is read for a provider the workspace has no connection to.
  const active: DiscoveryProvider | undefined = provider && connected.includes(provider) ? provider : undefined;
  const sources = useMemo(() => (active ? sourcesOf(connections, active) : []), [connections, active]);
  const needsScopeId = (active === "aws" && view === "published") || active === "k8s";
  const scope = resolveSource(sources, url.source, needsScopeId);
  const scoped = scope.kind === "one" || scope.kind === "no_rows" ? [scope.source.connection] : scope.kind === "all" ? sources.map((s) => s.connection) : [];

  // A link that named the source by its account id is rewritten to the connection.
  const canonicalSource = scope.kind === "one" && url.source !== scope.source.id ? scope.source.id : undefined;
  useEffect(() => {
    if (canonicalSource) normalise({ source: canonicalSource });
  }, [canonicalSource, normalise]);

  const awsPublished = active === "aws" && view === "published";
  const { rev, epoch, stale, refresh } = useGraphRevision(ws);
  usePipeline(ws, !awsPublished);
  const overview = useDiscoveryOverview({ ws, provider: active, view, scope, q: url.q, rev, epoch });

  const current: Scope | undefined = provider ? { provider, type, view } : undefined;
  const switchTo = (to: Scope) => {
    if (!current) return;
    const { params, removed } = planSwitch(url.params, current, to);
    url.go(params, removed);
  };
  const viewFor = (p: DiscoveryProvider, t: DiscoveryType): DiscoveryView => effectiveView(p, t, p === provider && hasViews(p, t) ? view : undefined);
  // With no Published | Latest switch on the page, a tab change always lands on
  // the default view: once on Latest (from a connection's link) the reader
  // would otherwise have no way back to Published.
  const switchType = (t: DiscoveryType) => provider && switchTo({ provider, type: t, view: effectiveView(provider, t, undefined) });
  const switchProvider = (p: DiscoveryProvider) => {
    writeLastProvider(p);
    const t = supportsType(p, type) ? type : TYPES_BY_PROVIDER[p][0];
    switchTo({ provider: p, type: t, view: effectiveView(p, t, undefined) });
  };

  // The object types as tabs along the top of the one card (2026-10-06 design).
  // The Published | Latest collected switch is gone from here by decision; a
  // link that names view=latest (a connection's "Open in Discovery") still works.
  const tabTypes = provider ? TYPES_BY_PROVIDER[provider] : [];
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    // Arrows, Home and End move between tabs and choose, as a tablist does.
    const last = tabTypes.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    tabRefs.current[next]?.focus();
    switchType(tabTypes[next]);
  };
  const switcher = provider ? (
    <div
      role="tablist"
      aria-label="Object type"
      // The rule is an inset shadow, not a border the tabs overlap with -1px:
      // that overlap made the strip 1px taller than its box, so it scrolled.
      className="flex gap-1 overflow-x-auto overflow-y-hidden px-3 shadow-[inset_0_-1px_0_var(--color-border-subtle)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabTypes.map((t, i) => {
        const on = supportsType(provider, type) && type === t;
        return (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`discovery-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="discovery-tabpanel"
            tabIndex={on || (!supportsType(provider, type) && i === 0) ? 0 : -1}
            onKeyDown={(e) => onTabKey(e, i)}
            title={`${TYPE_LABEL[t]}, ${countBasis(viewFor(provider, t), t)}`}
            onClick={() => switchType(t)}
            className={cn(
              "inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--color-focus-ring)",
              on ? "border-(--color-primary) font-semibold text-(--color-text)" : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {TYPE_LABEL[t]}
            <CountText
              count={overview.counts[t] ?? COUNT_UNAVAILABLE}
              className={cn(
                "rounded-full px-2 py-px text-xs font-medium",
                on ? "bg-(--color-primary-soft) text-(--color-primary-text)" : "bg-(--color-surface-subtle) text-(--color-text-muted)",
              )}
            />
          </button>
        );
      })}
    </div>
  ) : null;

  /* ------------------------------ header state ------------------------------ */
  const cluster = scope.kind === "one" ? scope.source.scopeId : undefined;
  // Reached on Latest collected only by a link (no switch on the page): say so,
  // and offer the way back to Published.
  const onLatest = !!provider && hasViews(provider, type) && view === "latest";
  const published = provider ? publicationText({ provider, view, overview, connections: scoped, cluster }) : null;
  const line = onLatest ? ["Latest collected", published].filter(Boolean).join(" · ") : published;
  const discrepancy =
    provider === "k8s" && scope.kind === "one"
      ? heartbeatDiscrepancy(scope.source.connection, inScope(overview.sweeps ?? [], cluster).find((s) => s.observedAt)?.observedAt ?? undefined)
      : null;
  const notices = [
    ...connectionNotices(scoped, { publishedView: awsPublished, skipCoverage: active === "k8s" }),
    ...(provider === "k8s" ? sweepNotices(inScope(overview.sweeps ?? [], cluster)) : []),
  ];

  /* ----------------------------------- body ---------------------------------- */
  let body;
  if (connQ.isLoading) {
    body = <div className="h-40 animate-pulse rounded-lg bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading connections" />;
  } else if (connectionsFailed) {
    const f = loadFailureOf(connQ.error);
    body = (
      <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
        <FailurePanel failure={f === "forbidden" ? { kind: "unauthorized" } : { kind: "failed" }} subject="connections" permission="discovery:read" onRetry={() => void connQ.refetch()} />
      </div>
    );
  } else if (!connected.length) {
    body = (
      <DecisionBanner
        tone="info"
        title="Connect a source to start"
        body="Connect an AWS account, Google Cloud project, Kubernetes cluster or GitHub organization to see what it contains."
        actionLabel="Open Connections"
        actionHref="/iga/connections"
      />
    );
  } else if (!provider || !connected.includes(provider)) {
    body = (
      <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-6 py-14 text-center" role="status">
        <p className="text-sm font-semibold text-(--color-text)">{provider ? `${PROVIDER_LABEL[provider]} is not connected` : "No provider chosen"}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">
          Choose a connected provider above, or{" "}
          <Link to="/iga/connections" className="font-semibold text-(--color-primary-text) hover:underline">
            connect {provider ? PROVIDER_LABEL[provider] : "one"}
          </Link>
          .
        </p>
      </div>
    );
  } else {
    // The switcher lives here, above whichever screen the type and view choose, so
    // it is not remounted by a change of either and keeps the keyboard focus.
    const props: ScreenProps = { ws, url, provider, type, view, sources, scope };
    body = (
      <div data-discovery-card className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
        {switcher}
        <div id="discovery-tabpanel" role="tabpanel" aria-labelledby={`discovery-tab-${type}`}>
        {!supportsType(provider, type) ? (
          <NotCollected provider={provider} type={type} />
        ) : view === "latest" ? (
          <LatestScreen {...props} />
        ) : provider === "aws" ? (
          <PublishedScreen {...props} />
        ) : type === "sightings" ? (
          <SightingsScreen {...props} />
        ) : (
          <InventoryScreen {...props} />
        )}
        </div>
      </div>
    );
  }

  return (
    <ConsolePage
      title="Discovery"
      description={DESCRIPTION}
      actions={
        connected.length ? (
          // One summary card: the provider, and what its lists are read at.
          <ProviderControl
            value={provider && connected.includes(provider) ? provider : undefined}
            providers={connected}
            onChange={switchProvider}
            // No "Published …" line (removed by request); only on Latest
            // collected, so "Back to Published" has its context.
            status={provider && connected.includes(provider) && ready && onLatest ? line : null}
            actions={
              provider && connected.includes(provider) && ready ? (
                <>
                  {onLatest ? (
                    <Button variant="outline" size="sm" className="h-9 px-3" onClick={() => switchTo({ provider, type, view: "published" })}>
                      Back to Published
                    </Button>
                  ) : null}
                  {awsPublished && overview.publication?.publishedAt ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      onClick={refresh}
                      aria-label="Refresh"
                      title="Re-read the lists at the current publication. This does not request a scan."
                    >
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          />
        ) : undefined
      }
    >
      <LiveRegion />
      {provider && connected.includes(provider) && ready && (discrepancy || (provider === "k8s" && overview.counts.sightings)) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {discrepancy ? <p className="text-(--color-warning-text)">{discrepancy}</p> : null}
          {provider === "k8s" && overview.counts.sightings ? (
            <span className="text-xs text-(--color-text-muted)">
              Cluster sightings: <CountText count={overview.counts.sightings} />
            </span>
          ) : null}
        </div>
      ) : null}
      {connQ.isError && connQ.data ? (
        <p role="status" className="text-xs text-(--color-warning-text)">
          Connections could not be refreshed, so the last read is shown.
        </p>
      ) : null}
      {awsPublished && stale ? <RevisionBanner currentPublishedAt={stale.currentPublishedAt} onRefresh={refresh} /> : null}
      {ready ? <SourceNotices notices={notices} /> : null}
      {body}
    </ConsolePage>
  );
}

