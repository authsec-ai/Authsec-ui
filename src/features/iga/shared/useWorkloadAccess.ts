/**
 * A workload's declared access, summarised — read once, shared by every place
 * that talks about it (Overview, Identity tab, Access tab).
 *
 * It reads the FIRST page of `/workloads/:id/resources` in the default order,
 * with exactly the arguments the Access tab uses for its first page, so the two
 * are one cache entry and opening Access after Overview costs no request. When
 * more pages exist the summary says so (`partial`) and every count it feeds is
 * worded "at least N" — a summary of one page is never presented as the total.
 */

import { useMemo } from "react";

import { igaGraphApi, refId, useListGraphWorkloadResourcesQuery, type GraphCoverageGap, type WorkloadDetail, type WorkloadResourceRow } from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";

import { summarizeAccess, type AccessSummary } from "./access";
import { classifyGraphError, type GraphFailure } from "./graphErrors";
import { useGraphRevision, useTrackRevision } from "./revision";

export interface WorkloadAccess {
  /** Null until the first answer arrives, and after a failure: nothing is claimed. */
  summary: AccessSummary | null;
  rows: WorkloadResourceRow[];
  coverage: GraphCoverageGap[];
  loading: boolean;
  failure: GraphFailure | null;
  retry: () => void;
}

export function useWorkloadAccess(
  ws: string,
  workload: Pick<WorkloadDetail, "ref" | "lifecycle">,
  /** Not in the current publication (vanished): nothing is fetched for it. */
  frozen = false,
): WorkloadAccess {
  const dispatch = useAppDispatch();
  const { rev, epoch } = useGraphRevision(ws);
  // Same shape as WorkloadResourcesTab's first page: `${epoch}.0` is its
  // paging.cacheKey at page one, `sort` is its default, `cursor` is absent.
  const args = { ws, rev, key: `${epoch}.0`, id: refId(workload.ref), sort: "kind" as const };
  const q = useListGraphWorkloadResourcesQuery(args, { skip: rev == null || frozen || workload.lifecycle === "retired" });
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("listGraphWorkloadResources", { ...args, rev: r }, d)),
  );

  const cur = q.currentData;
  const summary = useMemo(
    () => (cur ? summarizeAccess(cur.data, { partial: !!cur.meta.next_cursor }) : null),
    [cur],
  );

  return {
    summary,
    rows: cur?.data ?? [],
    coverage: cur?.meta.coverage ?? [],
    loading: !cur && !failure && !frozen && workload.lifecycle !== "retired",
    failure: cur ? null : failure,
    retry: () => void q.refetch(),
  };
}
