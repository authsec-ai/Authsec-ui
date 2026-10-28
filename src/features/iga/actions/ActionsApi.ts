/**
 * Actions API — RTK Query endpoints for the actions feed (UG05).
 *
 * Three reads:
 *  - list   GET /api/iga/v1/workloads/:id/actions  (snapshot + live cursor)
 *  - detail GET /api/iga/v2/actions/:id
 *  - changes GET /api/iga/v2/actions/changes        (forward catch-up)
 *
 * Uses `baseApi.injectEndpoints` so the slice sits beside the graph and
 * collector API slices without a second `createApi`.
 */

import { baseApi } from "@/app/api/baseApi";

/* ─────────────────────────── Types ──────────────────────────────────────── */

/** Outcome of an observed action. */
export type ActionOutcome =
  | "attempted"
  | "completed"
  | "failed"
  | "denied"
  | "contained"
  | "unknown";

/** Broad family an event belongs to — the first-level filter. */
export type EventFamily =
  | "api_call"
  | "file_access"
  | "network"
  | "process"
  | "auth"
  | "dns"
  | "other";

/** One row in the actions list. */
export interface ActionSummary {
  id: string;
  observed_at: string;
  event_family: EventFamily;
  operation: string;
  resource: string;
  execution_identity: string;
  outcome: ActionOutcome;
  policy_match: string | null;
  control_match: string | null;
  runtime_instance: string | null;
  workload_id: string | null;
  workload_name: string | null;
  count: number;
  source_sensor: string | null;
  enforcement_backend: string | null;
  host: string | null;
  collector_id: string | null;
  account: string | null;
}

/** Full detail of a single action. */
export interface ActionDetail extends ActionSummary {
  raw_event: Record<string, unknown> | null;
  policy_revision: string | null;
  policy_rule: string | null;
  enrichment: Record<string, unknown> | null;
  attribution_chain: string[];
  labels: Record<string, string>;
}

/** The filter bag sent as query parameters. */
export interface ActionFilter {
  from?: string;
  to?: string;
  workload_id?: string;
  runtime_instance?: string;
  host?: string;
  collector_id?: string;
  account?: string;
  resource?: string;
  operation?: string;
  source_sensor?: string;
  outcome?: ActionOutcome;
  enforcement_backend?: string;
  policy?: string;
  policy_revision?: string;
  policy_rule?: string;
  event_family?: EventFamily;
  coverage_gaps?: boolean;
  cursor?: string;
  limit?: number;
  sort?: "observed_at" | "-observed_at";
  live_cursor?: string;
}

/** Forward catch-up delta (new actions since `live_cursor`). */
export interface ActionChangesResponse {
  data: ActionSummary[];
  live_cursor: string;
  has_more: boolean;
}

/** Response envelope for the list endpoint. */
export interface ActionsListResponse {
  data: ActionSummary[];
  meta: {
    next_cursor: string | null;
    live_cursor: string;
    total?: number;
    total_known: boolean;
  };
}

/** Health / telemetry of the actions pipeline. */
export interface ActionsHealth {
  connected: boolean;
  last_event_at: string | null;
  processing_lag_ms: number | null;
  coverage_ratio: string | null;
  dropped_count: number;
  retention_boundary: string | null;
}

/* ─────────────────────────── Helpers ────────────────────────────────────── */

const V1 = "/api/iga/v1";
const V2 = "/api/iga/v2";
const enc = encodeURIComponent;

type ParamValue = string | number | boolean | null | undefined;

function toParams(obj: Record<string, ParamValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = String(v);
  }
  return out;
}

/* ─────────────────────────── Endpoints ──────────────────────────────────── */

export const actionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** Snapshot list + live cursor. Supports polling. */
    listActions: builder.query<
      ActionsListResponse,
      { workloadId: string; filters?: ActionFilter }
    >({
      query: ({ workloadId, filters = {} }) => ({
        url: `${V1}/workloads/${enc(workloadId)}/actions`,
        params: toParams(filters as Record<string, ParamValue>),
      }),
      providesTags: (_r, _e, { workloadId }) => [
        { type: "IgaGraph" as const, id: `actions:${workloadId}` },
      ],
    }),

    /** Single action detail. */
    getAction: builder.query<{ data: ActionDetail }, { actionId: string }>({
      query: ({ actionId }) => ({
        url: `${V2}/actions/${enc(actionId)}`,
      }),
      providesTags: (_r, _e, { actionId }) => [
        { type: "IgaGraph" as const, id: `action:${actionId}` },
      ],
    }),

    /** Forward catch-up: actions newer than `live_cursor`. */
    getActionChanges: builder.query<
      ActionChangesResponse,
      { liveCursor: string; workloadId?: string }
    >({
      query: ({ liveCursor, workloadId }) => ({
        url: `${V2}/actions/changes`,
        params: toParams({ live_cursor: liveCursor, workload_id: workloadId }),
      }),
    }),

    /** Health / telemetry for the actions pipeline. */
    getActionsHealth: builder.query<
      { data: ActionsHealth },
      { workloadId: string }
    >({
      query: ({ workloadId }) => ({
        url: `${V1}/workloads/${enc(workloadId)}/actions/health`,
      }),
      providesTags: (_r, _e, { workloadId }) => [
        { type: "IgaGraph" as const, id: `actions-health:${workloadId}` },
      ],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListActionsQuery,
  useGetActionQuery,
  useGetActionChangesQuery,
  useGetActionsHealthQuery,
} = actionsApi;
