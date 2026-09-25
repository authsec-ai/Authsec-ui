/**
 * The workspace's scan pipeline, as the graph lists use it (§2.14.7).
 *
 * - Polled only while a scan is queued, running or being built into the graph.
 * - A publication newer than the pinned revision marks the investigation
 *   stale before any read reports it, so the banner appears without the
 *   customer having to act first.
 */

import { useEffect, useState } from "react";

import { useGetGraphPipelineQuery } from "@/app/api/igaGraphApi";

import { useGraphRevision } from "../shared/revision";

const PIPELINE_POLL_MS = 15_000;

export function usePipeline(ws: string, skip: boolean) {
  const { rev, markStale } = useGraphRevision(ws);
  const [poll, setPoll] = useState(0);
  const q = useGetGraphPipelineQuery({ ws }, { skip, pollingInterval: poll });
  const p = q.data;

  const inFlight =
    (p != null && p.barrier.state !== "idle") ||
    (p?.accounts.some((a) => a.state === "queued" || a.state === "collecting" || a.state === "projecting") ?? false);
  useEffect(() => setPoll(inFlight ? PIPELINE_POLL_MS : 0), [inFlight]);

  const currentRev = p?.current_rev;
  const currentAt = p?.current_published_at;
  useEffect(() => {
    if (currentRev != null && rev != null && currentRev > rev) {
      markStale({ currentRev, currentPublishedAt: currentAt ?? undefined });
    }
  }, [currentRev, currentAt, rev, markStale]);

  return p;
}

/**
 * Nothing pinned yet and the list answered "not published": when the first
 * publication lands, load it. With a pin, a new publication waits for Refresh.
 */
export function useLoadFirstPublication(
  ws: string,
  pipelineRev: number | null | undefined,
  answeredUnpublished: boolean,
  refetch: () => unknown,
) {
  const { rev } = useGraphRevision(ws);
  useEffect(() => {
    if (rev == null && pipelineRev != null && answeredUnpublished) void refetch();
  }, [rev, pipelineRev, answeredUnpublished, refetch]);
}
