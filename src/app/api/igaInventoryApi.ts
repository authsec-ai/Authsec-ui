/**
 * The unified inventory (SPEC-console-revamp.md B1, B2): one provider-neutral
 * row per workload, identity and resource that AWS, Kubernetes and GitHub put
 * in the shared `iga_*` tables.
 *
 *   GET /api/iga/v1/inventory/{workloads,identities,resources}
 *   GET /api/iga/v1/inventory/summary
 *
 * It is NOT pinned to a publication (the graph lists are). What it reports
 * instead is the publication state: `meta.rev`/`published_at` are the AWS
 * publication current when the page was read, `meta.graph_state` says whether
 * every row is at it, and each row says its own `graph_state` and `as_of` — an
 * AWS row is `published`; a Kubernetes or GitHub row is `unrevisioned` (written
 * straight from a sweep or a scan, no publication number) and `as_of` is the
 * sweep or scan that last confirmed it. The fields are optional here so the UI
 * keeps working against a backend that predates them.
 */

import { baseApi } from "./baseApi";
import type { ExactCount, GraphCoverageGap, GraphFacetValue, GraphRef } from "./igaGraphApi";

export type InventoryProvider = "aws" | "k8s" | "github";
export type InventoryClass = "workloads" | "identities" | "resources";

/** What the page of rows is, as a whole, relative to a numbered publication. */
export type InventoryGraphState = "published" | "unrevisioned" | "mixed" | "not_published";

export interface InventoryScope {
  /** `aws_account`, `k8s_cluster`, `github_org` … */
  kind: string;
  /** The value the `scope` filter takes. */
  id: string;
  label: string;
}

export interface InventoryRow {
  ref: GraphRef;
  provider: InventoryProvider;
  /** `lambda_function`, `iam_role`, `exact`, `k8s_service_account` … */
  kind: string;
  name: string;
  native_id: string;
  scope: InventoryScope | null;
  sub_scope: string | null;
  lifecycle: "active" | "retired";
  retired_reason: string | null;
  /** `current` when any supporting reading is current, else `stale`. */
  state: "current" | "stale";
  first_seen_at: string | null;
  last_seen_at: string | null;
  attrs: Record<string, unknown>;
  /** B1. `published` for an AWS row, `unrevisioned` for a Kubernetes or GitHub row. */
  graph_state?: "published" | "unrevisioned";
  /** B1. The publication, sweep or scan time behind this row. */
  as_of?: string | null;
}

export interface InventoryMeta {
  limit: number;
  next_cursor: string | null;
  total_known: boolean;
  total?: number;
  total_at_least?: number;
  facets?: Record<string, GraphFacetValue[] | null>;
  /** B1. The AWS publication current at the snapshot; null when none. Reported, not enforced. */
  rev?: number | null;
  published_at?: string | null;
  graph_state?: InventoryGraphState;
  /** B1. AWS coverage gaps for the accounts in scope, and one note per Kubernetes cluster from its latest sweep. */
  coverage?: (GraphCoverageGap | KubernetesCoverageNote)[];
}

/** A Kubernetes cluster's sweep coverage, as a coverage note (B1). */
export interface KubernetesCoverageNote {
  /** The cluster. */
  account_id: string;
  surface: "k8s_sweep";
  state: "complete" | "namespaced_only" | "incomplete" | "not_swept";
  affects: string;
  observed_at?: string | null;
}

export interface InventoryList {
  data: InventoryRow[];
  meta: InventoryMeta;
}

export interface InventorySummary {
  data: Record<InventoryClass, ExactCount>;
  meta: Pick<InventoryMeta, "rev" | "published_at" | "graph_state" | "coverage">;
}

export interface InventoryArgs {
  ws: string;
  /** Cache segregation only (the graph epoch); never sent. */
  key?: string;
  provider?: InventoryProvider;
  kind?: string;
  /** A connection's `scope_id`. */
  scope?: string;
  q?: string;
  lifecycle?: "active" | "retired" | "all";
  sort?: "name" | "-last_seen";
  limit?: number;
  cursor?: string;
  facets?: string;
}

export type InventorySummaryArgs = Pick<InventoryArgs, "ws" | "key" | "provider" | "scope" | "q" | "lifecycle">;

function qs(args: object): string {
  const skip = new Set(["ws", "key"]);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (skip.has(k) || v === undefined || v === null || v === "") continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

const BASE = "/api/iga/v1/inventory";

export const igaInventoryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listInventory: builder.query<InventoryList, InventoryArgs & { class: InventoryClass }>({
      query: ({ class: cls, ...args }) => ({ url: `${BASE}/${cls}${qs({ facets: "provider,kind,scope", ...args })}` }),
      providesTags: [{ type: "IgaGraph", id: "INVENTORY" }],
    }),
    getInventorySummary: builder.query<InventorySummary, InventorySummaryArgs>({
      query: (args) => ({ url: `${BASE}/summary${qs(args)}` }),
      providesTags: [{ type: "IgaGraph", id: "INVENTORY" }],
    }),
  }),
});

export const { useListInventoryQuery, useGetInventorySummaryQuery } = igaInventoryApi;
