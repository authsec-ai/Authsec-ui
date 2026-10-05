/**
 * What the page header and the type switcher need from the data, read once for
 * the whole screen: the count of each object type and the state of what is
 * shown (publication, sweep, scan).
 *
 * Counts (SPEC-console-revamp.md *Count semantics*) are never derived from rows
 * in hand and a cursor is never turned into a number:
 *   AWS Published      each graph list's `total` / `total_known`, at the pinned publication
 *   AWS Latest         each discovery route's `total`
 *   Kubernetes         the inventory summary (B2); each list's own total if it is absent
 *   sightings          the discovered-agents list's exact `total`
 * Segment counts keep the search and the source, which survive a switch of type;
 * the list's own footer carries the count under every filter.
 */

import {
  useListAwsIdentityPageQuery,
  useListAwsResourcesQuery,
  useListAwsWorkloadsQuery,
} from "@/app/api/cloudDiscoveryApi";
import { useListDiscoveredAgentsQuery } from "@/app/api/discoveryApi";
import { useListGraphIdentitiesQuery, useListGraphResourcesQuery, useListGraphWorkloadsQuery } from "@/app/api/igaGraphApi";
import { useGetInventorySummaryQuery, useListInventoryQuery } from "@/app/api/igaInventoryApi";
import { useListK8sClustersQuery } from "@/app/api/k8sGraphApi";

import { COUNT_LOADING, COUNT_UNAVAILABLE, countOfExact, countOfMeta, type CountValue } from "../shared/components/countValue";
import { clusterSweeps, type ClusterSweep } from "./k8s";
import { SIGHTING_SOURCE } from "./model";
import type { SourceScope } from "./sources";
import type { DiscoveryProvider, DiscoveryType, DiscoveryView } from "./urlState";

export interface Overview {
  counts: Partial<Record<DiscoveryType, CountValue>>;
  /** AWS Published: the publication the counts were read at. */
  publication?: { publishedAt: string | null; rev: number | null; state: "published" | "not_published" | undefined };
  /** Kubernetes: the sweep behind each cluster's rows. */
  sweeps?: ClusterSweep[];
  /** Kubernetes: the clusters read answered (so "no sweep" can be told from "not asked yet"). */
  sweepsKnown?: boolean;
}

interface Args {
  ws: string;
  provider: DiscoveryProvider | undefined;
  view: DiscoveryView;
  scope: SourceScope;
  q: string | undefined;
  rev: number | null;
  epoch: number;
}

function pageCount(p: { total: number; totalKnown: boolean } | undefined, failed: boolean): CountValue {
  if (failed) return COUNT_UNAVAILABLE;
  if (!p) return COUNT_LOADING;
  return p.totalKnown ? { kind: "exact", value: p.total } : COUNT_UNAVAILABLE;
}

function sum(a: CountValue, b: CountValue): CountValue {
  if (a.kind === "loading" || b.kind === "loading") return COUNT_LOADING;
  if (a.kind === "unavailable" || b.kind === "unavailable") return COUNT_UNAVAILABLE;
  const exact = a.kind === "exact" && b.kind === "exact";
  return { kind: exact ? "exact" : "at_least", value: a.value + b.value };
}

export function useDiscoveryOverview({ ws, provider, view, scope, q, rev, epoch }: Args): Overview {
  const blocked = scope.kind === "unknown" || scope.kind === "no_rows";
  const sourceId = scope.kind === "one" ? scope.source.id : undefined;
  const scopeId = scope.kind === "one" ? scope.source.scopeId : undefined;

  /* ---- AWS Published: the graph lists, limit 1, at the pinned publication ---- */
  const graphOn = provider === "aws" && view === "published" && !blocked;
  const graphArgs = { ws, rev, key: `counts.${epoch}`, q, account: scopeId ? [scopeId] : undefined, limit: 1 };
  const gw = useListGraphWorkloadsQuery(graphArgs, { skip: !graphOn });
  const gi = useListGraphIdentitiesQuery(graphArgs, { skip: !graphOn });
  const gr = useListGraphResourcesQuery(graphArgs, { skip: !graphOn });

  /* ---- AWS Latest / Google Cloud: the discovery routes ---- */
  const latestOn = (provider === "aws" || provider === "gcp") && view === "latest" && !blocked;
  const aws = provider === "aws";
  const lw = useListAwsWorkloadsQuery({ limit: 1, connector_id: sourceId }, { skip: !latestOn || !aws });
  const lr = useListAwsResourcesQuery({ limit: 1, connector_id: sourceId }, { skip: !latestOn || !aws });
  // The identity table is shared across providers: AWS identities are roles plus users, Google Cloud's are service accounts.
  const lrole = useListAwsIdentityPageQuery({ limit: 1, kind: "iam_role", connector_id: sourceId }, { skip: !latestOn || !aws });
  const luser = useListAwsIdentityPageQuery({ limit: 1, kind: "iam_user", connector_id: sourceId }, { skip: !latestOn || !aws });
  const lgcp = useListAwsIdentityPageQuery({ limit: 1, kind: "gcp_service_account", connector_id: sourceId }, { skip: !latestOn || aws });

  /* ---- Kubernetes: the inventory summary, then each list's own total ---- */
  const k8sOn = provider === "k8s" && !blocked;
  const summary = useGetInventorySummaryQuery({ ws, provider: "k8s", scope: scopeId, q }, { skip: !k8sOn });
  const fallback = k8sOn && summary.isError;
  const kw = useListInventoryQuery({ ws, class: "workloads", provider: "k8s", scope: scopeId, q, limit: 1 }, { skip: !fallback });
  const ki = useListInventoryQuery({ ws, class: "identities", provider: "k8s", scope: scopeId, q, limit: 1 }, { skip: !fallback });
  const clusters = useListK8sClustersQuery(undefined, { skip: !k8sOn });

  /* ---- Sightings ---- */
  const sightingsOn = (provider === "k8s" || provider === "github") && !blocked;
  const sightings = useListDiscoveredAgentsQuery(
    { source: SIGHTING_SOURCE[provider === "github" ? "github" : "k8s"], limit: 1, ...(sourceId ? { discovery_source_id: sourceId } : {}) },
    { skip: !sightingsOn },
  );
  const sightingsCount: CountValue = sightings.isError ? COUNT_UNAVAILABLE : sightings.data ? { kind: "exact", value: sightings.data.total } : COUNT_LOADING;

  if (graphOn) {
    const meta = gw.currentData?.meta ?? gi.currentData?.meta ?? gr.currentData?.meta;
    return {
      counts: {
        workloads: gw.error ? COUNT_UNAVAILABLE : gw.currentData ? countOfMeta(gw.currentData.meta) : COUNT_LOADING,
        identities: gi.error ? COUNT_UNAVAILABLE : gi.currentData ? countOfMeta(gi.currentData.meta) : COUNT_LOADING,
        resources: gr.error ? COUNT_UNAVAILABLE : gr.currentData ? countOfMeta(gr.currentData.meta) : COUNT_LOADING,
      },
      publication: meta ? { publishedAt: meta.published_at, rev: meta.rev, state: meta.graph_state } : undefined,
    };
  }
  if (latestOn && aws) {
    return {
      counts: {
        workloads: pageCount(lw.data, lw.isError),
        identities: sum(pageCount(lrole.data, lrole.isError), pageCount(luser.data, luser.isError)),
        resources: pageCount(lr.data, lr.isError),
      },
    };
  }
  if (latestOn) return { counts: { identities: pageCount(lgcp.data, lgcp.isError) } };
  if (k8sOn) {
    const notes = summary.data?.meta.coverage ?? kw.currentData?.meta.coverage ?? ki.currentData?.meta.coverage;
    const sweeps = clusterSweeps(notes, clusters.data?.clusters);
    return {
      counts: {
        workloads: summary.data ? countOfExact(summary.data.data.workloads) : fallback ? (kw.error ? COUNT_UNAVAILABLE : kw.currentData ? countOfMeta(kw.currentData.meta) : COUNT_LOADING) : COUNT_LOADING,
        identities: summary.data ? countOfExact(summary.data.data.identities) : fallback ? (ki.error ? COUNT_UNAVAILABLE : ki.currentData ? countOfMeta(ki.currentData.meta) : COUNT_LOADING) : COUNT_LOADING,
        sightings: sightingsCount,
      },
      sweeps,
      sweepsKnown: !!clusters.data || !!notes,
    };
  }
  if (sightingsOn) return { counts: { sightings: sightingsCount } };
  return { counts: {} };
}
