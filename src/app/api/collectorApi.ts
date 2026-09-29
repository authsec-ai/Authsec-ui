/**
 * Collector API — enrollment tokens and collector management.
 *
 * Endpoints map to the v2 collector routes in
 * `authsec/routes/collector_routes.go`. All routes sit behind the
 * `IGA_V2_INGEST` feature flag and require `discovery:admin` (writes)
 * or `discovery:read` (reads).
 */

import { baseApi } from "./baseApi";

// ── Types (mirror authsec/services/collector_enrollment_service.go) ──────────

export type CollectorKind = "linux_collector" | "k8s_collector" | "node_sensor";
export type CollectorStatus = "active" | "revoked";

export interface CollectorHealth {
  status: string;
  last_seen_at: string | null;
}

export interface CollectorCoverage {
  object_class: string;
  state: string;
  reason_code: string;
}

export interface CollectorView {
  id: string;
  kind: CollectorKind;
  status: CollectorStatus;
  row_version: number;
  agent_version: string;
  health: CollectorHealth;
  capabilities: Record<string, unknown>;
  coverage: CollectorCoverage[];
  desired_revision: number | null;
  applied_revision: number | null;
  discovery_source_id: string;
  integration_id: string;
  estate_id: string;
}

export interface IssuedEnrollment {
  enrollment_id: string;
  token: string;
  expires_at: string;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface CreateEnrollmentRequest {
  kind: CollectorKind;
  estate_scope?: {
    kind: string;
    id?: string;
    display_name?: string;
  };
  namespace_allowlist?: string[];
  capability_ceiling?: Record<string, unknown>;
  expires_in_seconds?: number;
}

export interface RevokeCollectorRequest {
  id: string;
  reason: string;
  expected_version: number;
}

export interface ListCollectorsParams {
  kind?: CollectorKind;
  status?: CollectorStatus;
  estate_id?: string;
  integration_id?: string;
  limit?: number;
  cursor?: string;
}

interface CollectorsEnvelope {
  data: CollectorView[];
  next_cursor: string;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const collectorApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createEnrollmentToken: builder.mutation<IssuedEnrollment, CreateEnrollmentRequest>({
      query: (body) => ({
        url: "/api/iga/v2/collector-enrollments",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Collector"],
    }),

    listCollectors: builder.query<CollectorsEnvelope, ListCollectorsParams | void>({
      query: (f) => ({
        url: "/api/iga/v2/collectors",
        method: "GET",
        params: {
          ...(f?.kind ? { kind: f.kind } : {}),
          ...(f?.status ? { status: f.status } : {}),
          ...(f?.estate_id ? { estate_id: f.estate_id } : {}),
          ...(f?.integration_id ? { integration_id: f.integration_id } : {}),
          ...(f?.limit ? { limit: f.limit } : {}),
          ...(f?.cursor ? { cursor: f.cursor } : {}),
        },
      }),
      transformResponse: (r: CollectorsEnvelope) => ({
        data: r.data ?? [],
        next_cursor: r.next_cursor ?? "",
      }),
      providesTags: ["Collector"],
    }),

    getCollector: builder.query<CollectorView, string>({
      query: (id) => ({ url: `/api/iga/v2/collectors/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "Collector" as const, id }],
    }),

    revokeCollector: builder.mutation<{ status: string }, RevokeCollectorRequest>({
      query: ({ id, ...body }) => ({
        url: `/api/iga/v2/collectors/${id}/revoke`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Collector"],
    }),
  }),
});

export const {
  useCreateEnrollmentTokenMutation,
  useListCollectorsQuery,
  useGetCollectorQuery,
  useRevokeCollectorMutation,
} = collectorApi;
