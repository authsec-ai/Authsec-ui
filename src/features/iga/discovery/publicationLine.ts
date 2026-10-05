/**
 * The one line under the title that says what the list is AS OF — per provider,
 * by that provider's own rule (SPEC-console-revamp.md *Kubernetes in Discovery*):
 *
 *   AWS Published   the publication the lists are pinned to
 *   AWS Latest      the most recent scan
 *   Kubernetes      the SWEEP behind the rows — never the agent heartbeat
 *   GitHub, Google  the most recent scan
 *
 * Refresh (AWS Published only) re-pins the lists to the current publication. It
 * never requests a scan: scanning is on Connections.
 */

import { format } from "date-fns";

import type { Connection } from "@/app/api/connectionsApi";

import { inScope } from "./k8s";
import type { Overview } from "./useDiscoveryOverview";
import type { DiscoveryProvider, DiscoveryView } from "./urlState";

const fmt = (iso: string) => format(new Date(iso), "d MMM HH:mm");

function latestScan(connections: Connection[]): string | null {
  let best: string | null = null;
  for (const c of connections) if (c.scan.at && (!best || c.scan.at > best)) best = c.scan.at;
  return best;
}

export function publicationText({
  provider,
  view,
  overview,
  connections,
  cluster,
}: {
  provider: DiscoveryProvider;
  view: DiscoveryView;
  overview: Overview;
  /** The connections in scope: the chosen source, or every one of the provider. */
  connections: Connection[];
  /** The chosen cluster's scope id, for Kubernetes. */
  cluster: string | undefined;
}): string | null {
  if (provider === "aws" && view === "published") {
    const p = overview.publication;
    if (!p) return null;
    if (p.state === "not_published" || (!p.publishedAt && p.rev == null)) return "Not published yet";
    return p.publishedAt ? `Published ${fmt(p.publishedAt)}` : "Published";
  }
  if (provider === "k8s") {
    if (!overview.sweepsKnown) return null;
    const known = inScope(overview.sweeps ?? [], cluster).filter((s) => s.observedAt);
    if (!known.length) return "No inventory received yet";
    const times = known.map((s) => s.observedAt as string).sort();
    const oldest = times[0];
    const newest = times[times.length - 1];
    const text = oldest === newest ? `Inventory from sweep at ${fmt(oldest)}` : `Inventory from sweeps between ${fmt(oldest)} and ${fmt(newest)}`;
    const unswept = inScope(overview.sweeps ?? [], cluster).length - known.length;
    return unswept > 0 ? `${text} · ${unswept} ${unswept === 1 ? "cluster" : "clusters"} not yet swept` : text;
  }
  const scan = latestScan(connections);
  return scan ? `Latest scan ${fmt(scan)}` : "No scan has finished yet";
}

/** Kubernetes: the agent is reporting but its inventory is old — said, not smoothed over. */
export function heartbeatDiscrepancy(connection: Connection | undefined, sweepAt: string | undefined, now = Date.now()): string | null {
  if (!connection || !sweepAt) return null;
  const hb = connection.scan.heartbeat_at;
  if (!hb) return null;
  const interval = (connection.scan.reports_every_seconds ?? 300) * 1000;
  const online = now - Date.parse(hb) < 2 * interval;
  const old = now - Date.parse(sweepAt) > Math.max(60 * 60 * 1000, 12 * interval);
  return online && old ? `Agent online; its last inventory is from ${fmt(sweepAt)}.` : null;
}
