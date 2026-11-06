/**
 * Agent runtime activity timeline (SPEC-agent-runtime-activity.md §4.3, §7).
 * Every shape below was traced from the Go struct the handler serialises
 * (`authsec`, branch authsec-staging); a field the backend does not send is not
 * declared. The backend never stores prompts or completions, so none is typed.
 *
 * The workspace is always the token's: nothing here sends one. `ws` on a query
 * argument is a client-only cache key and never reaches the server.
 *
 * Endpoint (under /api/iga/v1/agent-runtime)  Permission       Go (file:line)
 * ------------------------------------------  ---------------  -----------------------------------------------------
 * GET    /activity                            discovery:read   controllers/platform/agent_runtime_activity_controller.go:141 (ListActivity)
 * GET    /activity/traces/:trace_id           discovery:read   agent_runtime_activity_controller.go:177 (GetTrace)
 * GET    /activity/coverage                   discovery:read   agent_runtime_activity_controller.go:191 (GetCoverage)
 * GET    /activity/settings                   discovery:read   agent_runtime_activity_controller.go:205 (GetSettings)
 * PUT    /activity/settings                   discovery:admin  agent_runtime_activity_controller.go:223 (PutSettings) {retention_days: 1..400}
 * POST   /otlp-tokens                         discovery:admin  agent_runtime_activity_controller.go:253 (CreateOTLPToken) {label?<=200, expires_in_days?: 1..365}
 * GET    /otlp-tokens                         discovery:read   agent_runtime_activity_controller.go:298 (ListOTLPTokens)
 * DELETE /otlp-tokens/:id                     discovery:admin  agent_runtime_activity_controller.go:312 (RevokeOTLPToken) -> the revoked token
 * POST   /authsec/ingest/otlp/v1/traces       OTLP token       routes/routes.go:1524 (what the customer's collector posts to; not called here)
 *
 * Shapes: AgentActivity services/agent_runtime_activity.go:440; AgentActivityNode/Trace :573-584;
 * Coverage :643-663; Settings :699; AgentOTLPToken services/agent_runtime_activity_otlp.go:87.
 *
 * Envelope `{ data, meta }`; the list's meta is `{ next_cursor }` ("" when there is no more). Errors are
 * `{ error: { code, message } }` (classified by `classifyAr`): 400 invalid_parameter (bad uuid / time /
 * kind / outcome / source / cursor / limit / retention), 403 forbidden (also "needs a verified member
 * session" on writes), 404 not_found (unknown trace, token), 409 token_limit (25 live tokens), 503 when the
 * schema is absent. There is no /capabilities entry for this part.
 */

import { baseApi } from "./baseApi";
import { enc, policyQuery } from "./igaPolicyCommon";

const BASE = "/api/iga/v1/agent-runtime";

/** internal/agentactivity/activity.go:22-26. */
export type ActivitySource = "cloudtrail" | "cloudtrail_data" | "agentcore_span" | "otlp" | "authsec_decision";
/** activity.go:31-37. */
export type ActivityKind = "model_call" | "tool_call" | "agent_step" | "cloud_action" | "data_access" | "sign_in" | "decision";
/** activity.go:42-44. */
export type ActivityOutcome = "success" | "denied" | "error";

/** services.AgentActivity (agent_runtime_activity.go:440). */
export interface AgentActivity {
  id: string;
  connector_id: string | null;
  identity_id: string | null;
  workload_id: string | null;
  source: ActivitySource | (string & {});
  kind: ActivityKind | (string & {});
  occurred_at: string;
  received_at: string;
  action: string;
  resource_ref: string;
  outcome: ActivityOutcome | (string & {});
  /** An asserted end user (OTLP: unverified), when the span named one. */
  on_behalf_of: string | null;
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  provider_event_id: string;
  /** Bounded, redacted attributes; `attribution.how` says how identity/workload was matched (":162"). */
  attrs: Record<string, unknown> | null;
}

/** services.AgentActivityNode: a span with its children (:573). */
export interface AgentActivityNode extends AgentActivity {
  children: AgentActivityNode[];
}

/** services.AgentActivityTrace (:579). `truncated` when the trace has more than 2000 spans. */
export interface AgentActivityTrace {
  trace_id: string;
  count: number;
  truncated: boolean;
  spans: AgentActivityNode[];
}

/** services.AgentActivityCursorView (:642): one AgentCore span reader cursor. */
export interface ActivityCursor {
  connector_id: string;
  region: string;
  stream: string;
  cursor_at: string | null;
  state: string;
  last_error: string;
  error_code: string;
  last_scan_at: string;
  rows_written: number;
}

/** services.AgentActivityCoverage (:654). */
export interface ActivityCoverage {
  retention_days: number;
  agentcore_spans: ActivityCursor[];
  otlp: { live_tokens: number; last_used_at: string | null };
  semantic_conventions: string;
}

/** services.AgentActivitySettings (:699). `updated_at` is omitted until first saved. */
export interface ActivitySettings {
  retention_days: number;
  updated_at?: string | null;
}

/** services.AgentOTLPToken (agent_runtime_activity_otlp.go:87): never the token or its hash. */
export interface OtlpToken {
  id: string;
  label: string;
  token_prefix: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  state: "active" | "revoked" | "expired" | (string & {});
}

/** POST /otlp-tokens data (controller :277-282). `token` is in this response only. */
export interface CreatedOtlpToken {
  token_info: OtlpToken;
  token: string;
  /** Public receiver URL (OAuth base URL + ingest path); the bare path when the base is unset. */
  endpoint: string;
  headers: { Authorization: string };
}

export interface ActivityListArgs {
  ws: string;
  identity_id?: string;
  workload_id?: string;
  kind?: string;
  outcome?: string;
  source?: string;
  /** RFC 3339; `from` inclusive, `to` exclusive. */
  from?: string;
  to?: string;
  /** Opaque, from the previous page's meta.next_cursor. */
  cursor?: string;
  /** 1..200, default 50. */
  limit?: number;
}

export interface ActivityListEnvelope {
  data: AgentActivity[];
  meta: { next_cursor?: string | null };
}

export const igaAgentActivityApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAgentActivity: builder.query<ActivityListEnvelope, ActivityListArgs>({
      query: (a) => ({ url: `${BASE}/activity${policyQuery(a)}` }),
      providesTags: [{ type: "AgentActivity", id: "LIST" }],
    }),
    getAgentActivityTrace: builder.query<{ data: AgentActivityTrace }, { ws: string; traceId: string }>({
      query: ({ traceId }) => ({ url: `${BASE}/activity/traces/${enc(traceId)}` }),
      providesTags: (_r, _e, { traceId }) => [{ type: "AgentActivity", id: `TRACE-${traceId}` }],
    }),
    getAgentActivityCoverage: builder.query<{ data: ActivityCoverage }, { ws: string }>({
      query: () => ({ url: `${BASE}/activity/coverage` }),
      providesTags: [{ type: "AgentActivity", id: "COVERAGE" }],
    }),
    getAgentActivitySettings: builder.query<{ data: ActivitySettings }, { ws: string }>({
      query: () => ({ url: `${BASE}/activity/settings` }),
      providesTags: [{ type: "AgentActivity", id: "SETTINGS" }],
    }),
    putAgentActivitySettings: builder.mutation<{ data: ActivitySettings }, { retention_days: number }>({
      query: (body) => ({ url: `${BASE}/activity/settings`, method: "PUT", body }),
      invalidatesTags: [{ type: "AgentActivity", id: "SETTINGS" }, { type: "AgentActivity", id: "COVERAGE" }],
    }),
    listOtlpTokens: builder.query<{ data: OtlpToken[] }, { ws: string }>({
      query: () => ({ url: `${BASE}/otlp-tokens` }),
      providesTags: [{ type: "AgentActivity", id: "TOKENS" }],
    }),
    createOtlpToken: builder.mutation<{ data: CreatedOtlpToken; meta?: { note?: string } }, { label?: string; expires_in_days?: number }>({
      query: (body) => ({ url: `${BASE}/otlp-tokens`, method: "POST", body }),
      invalidatesTags: [{ type: "AgentActivity", id: "TOKENS" }, { type: "AgentActivity", id: "COVERAGE" }],
    }),
    revokeOtlpToken: builder.mutation<{ data: OtlpToken }, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/otlp-tokens/${enc(id)}`, method: "DELETE" }),
      invalidatesTags: [{ type: "AgentActivity", id: "TOKENS" }, { type: "AgentActivity", id: "COVERAGE" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAgentActivityQuery,
  useGetAgentActivityTraceQuery,
  useGetAgentActivityCoverageQuery,
  useGetAgentActivitySettingsQuery,
  usePutAgentActivitySettingsMutation,
  useListOtlpTokensQuery,
  useCreateOtlpTokenMutation,
  useRevokeOtlpTokenMutation,
} = igaAgentActivityApi;

/** The ingest path a collector posts to (services.AgentOTLPIngestPath, agent_runtime_activity_otlp.go:47). */
export const OTLP_INGEST_PATH = "/authsec/ingest/otlp/v1/traces";
