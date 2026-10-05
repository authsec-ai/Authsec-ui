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

import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";

import { useListConnectionsQuery } from "@/app/api/connectionsApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBanner } from "@/components/console/status";
import { loadFailureOf } from "@/components/console/load-failure";
import { Button } from "@/components/ui/button";
import { getWorkspaceId } from "@/utils/workspace";

import { usePipeline } from "../pipeline/usePipeline";
import { CountText } from "../shared/components/CountText";
import { COUNT_UNAVAILABLE } from "../shared/components/countValue";
import { LiveRegion } from "../shared/components/LiveRegion";
import { RevisionBanner } from "../shared/components/RevisionBanner";
import { useGraphRevision } from "../shared/revision";
import { useSlashToSearch } from "../shared/useListFilters";
import { FailurePanel, NotCollected } from "./ListStates";
import { effectiveView, hasViews, planSwitch, supportsType, TYPES_BY_PROVIDER, type Scope } from "./model";
import { ProviderControl } from "./ProviderControl";
import { heartbeatDiscrepancy, publicationText } from "./publicationLine";
import { Segmented } from "./Segmented";
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

const DESCRIPTION =
  "What has been found in your connected sources. Declared access — not evaluated: nothing here tests whether a request would succeed.";

export default function DiscoveryPage() {
  const ws = getWorkspaceId() ?? "";
  const url = useDiscoveryUrl();
  useSlashToSearch();

  const connQ = useListConnectionsQuery();
  const connections = useMemo(() => connQ.data ?? [], [connQ.data]);
  const connected = connectedProviders(connections);

  // The default rule: the URL, then what was last used in this browser, else the
  // most recently available result, else the only connected provider.
  const resolved: DiscoveryProvider | undefined = url.provider ?? defaultProvider(connections, url.type) ?? defaultProvider(connections);
  const provider = resolved;
  const type: DiscoveryType = url.type ?? (provider ? TYPES_BY_PROVIDER[provider][0] : "workloads");
  const view: DiscoveryView = provider ? effectiveView(provider, type, url.view) : "published";
  const ready = !connQ.isLoading && !connQ.error;

  const { normalise } = url;
  useEffect(() => {
    // Make the resolved provider and type explicit in the URL, once.
    if (ready && provider && (!url.provider || !url.type)) normalise({ provider, type });
  }, [ready, provider, type, url.provider, url.type, normalise]);
  useEffect(() => {
    if (url.type) rememberDiscoverySearch(url.type, url.search);
  }, [url.type, url.search]);
  useEffect(() => {
    if (url.provider && connected.includes(url.provider)) writeLastProvider(url.provider);
  }, [url.provider, connected]);

  // Nothing is read for a provider the workspace has no connection to.
  const active: DiscoveryProvider | undefined = provider && connected.includes(provider) ? provider : undefined;
  const sources = useMemo(() => (active ? sourcesOf(connections, active) : []), [connections, active]);
  const needsScopeId = (active === "aws" && view === "published") || active === "k8s";
  const scope = resolveSource(sources, url.source, needsScopeId);
  const scoped = scope.kind === "one" || scope.kind === "no_rows" ? [scope.source.connection] : scope.kind === "all" ? sources.map((s) => s.connection) : [];

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
  const switchType = (t: DiscoveryType) => provider && switchTo({ provider, type: t, view: viewFor(provider, t) });
  const switchView = (v: DiscoveryView) => provider && switchTo({ provider, type, view: v });
  const switchProvider = (p: DiscoveryProvider) => {
    writeLastProvider(p);
    const t = supportsType(p, type) ? type : TYPES_BY_PROVIDER[p][0];
    switchTo({ provider: p, type: t, view: effectiveView(p, t, undefined) });
  };

  const switcher = provider ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented<DiscoveryType>
        label="Object type"
        value={supportsType(provider, type) ? type : undefined}
        segments={TYPES_BY_PROVIDER[provider].map((t) => ({
          value: t,
          label: TYPE_LABEL[t],
          count: overview.counts[t] ?? COUNT_UNAVAILABLE,
          title: `${TYPE_LABEL[t]}, counted with the current search and source`,
        }))}
        onChange={switchType}
      />
      {hasViews(provider, type) ? (
        <Segmented<DiscoveryView>
          label="View"
          value={view}
          segments={[
            { value: "published", label: "Published", title: "What AuthSec concluded, at one publication" },
            { value: "latest", label: "Latest collected", title: "Normalised rows from the latest scan, including rows not yet published" },
          ]}
          onChange={switchView}
        />
      ) : null}
    </div>
  ) : null;

  /* ------------------------------ header state ------------------------------ */
  const cluster = scope.kind === "one" ? scope.source.scopeId : undefined;
  const line = provider ? publicationText({ provider, view, overview, connections: scoped, cluster }) : null;
  const discrepancy =
    provider === "k8s" && scope.kind === "one"
      ? heartbeatDiscrepancy(scope.source.connection, inScope(overview.sweeps ?? [], cluster).find((s) => s.observedAt)?.observedAt ?? undefined)
      : null;
  const notices = [
    ...connectionNotices(scoped, { publishedView: awsPublished }),
    ...(provider === "k8s" ? sweepNotices(inScope(overview.sweeps ?? [], cluster)) : []),
  ];

  /* ----------------------------------- body ---------------------------------- */
  let body;
  if (connQ.isLoading) {
    body = <div className="h-40 animate-pulse rounded-lg bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading connections" />;
  } else if (connQ.error) {
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
        body="Discovery lists what your connected AWS accounts, Kubernetes clusters, Google Cloud projects and GitHub organisations contain. Nothing is connected yet, so there is nothing to show."
        actionLabel="Open Connections"
        actionHref="/iga/connections"
      />
    );
  } else if (!provider || !connected.includes(provider)) {
    body = (
      <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-6 py-14 text-center" role="status">
        <p className="text-sm font-semibold text-(--color-text)">{provider ? `${PROVIDER_LABEL[provider]} is not connected` : "No provider chosen"}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">
          Discovery lists a provider only once it has a connection. Choose a connected provider above, or{" "}
          <Link to="/iga/connections" className="font-semibold text-(--color-primary-text) hover:underline">
            connect {provider ? PROVIDER_LABEL[provider] : "one"}
          </Link>
          .
        </p>
      </div>
    );
  } else if (!supportsType(provider, type)) {
    body = (
      <div className="space-y-3">
        {switcher}
        <NotCollected provider={provider} type={type} />
      </div>
    );
  } else {
    const props: ScreenProps = { ws, url, provider, type, view, sources, scope, switcher };
    body =
      view === "latest" ? (
        <LatestScreen {...props} />
      ) : provider === "aws" ? (
        <PublishedScreen {...props} />
      ) : type === "sightings" ? (
        <SightingsScreen {...props} />
      ) : (
        <InventoryScreen {...props} />
      );
  }

  return (
    <ConsolePage
      title="Discovery"
      description={DESCRIPTION}
      actions={connected.length ? <ProviderControl value={provider && connected.includes(provider) ? provider : undefined} providers={connected} onChange={switchProvider} /> : undefined}
    >
      <LiveRegion />
      {provider && connected.includes(provider) && ready ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {line ? (
            <p className="font-medium text-(--color-text)" role="status">
              {line}
            </p>
          ) : null}
          {discrepancy ? <p className="text-(--color-warning-text)">{discrepancy}</p> : null}
          {awsPublished && overview.publication?.publishedAt ? (
            <Button variant="outline" size="sm" onClick={refresh} title="Re-read the lists at the current publication. This does not request a scan.">
              Refresh
            </Button>
          ) : null}
          {provider === "k8s" && overview.counts.sightings ? (
            <span className="text-xs text-(--color-text-muted)">
              Cluster sightings: <CountText count={overview.counts.sightings} />
            </span>
          ) : null}
        </div>
      ) : null}
      {awsPublished && stale ? <RevisionBanner currentPublishedAt={stale.currentPublishedAt} onRefresh={refresh} /> : null}
      {ready ? <SourceNotices notices={notices} /> : null}
      {body}
    </ConsolePage>
  );
}

