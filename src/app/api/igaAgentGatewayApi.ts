/**
 * Agent runtime gateway admin (SPEC-agent-runtime-gateway.md §8): gateways and
 * their credentials, workspace settings, tool policies, the dry-run evaluator
 * and the decision log. Every shape below was traced from the Go struct the
 * handler serialises (`authsec`, branch authsec-staging); a field the backend
 * does not send is not declared.
 *
 * The workspace is always the token's: nothing here sends one. `ws` on a query
 * argument is a client-only cache key and never reaches the server.
 *
 * Endpoint (all under /api/iga/v1/agent-runtime)  Permission          Go handler (controllers/platform/agent_gateway_controller.go)
 * ----------------------------------------------  ------------------  ------------------------------------------------------------
 * GET    /gateways                                governance:read     ListGateways        :144  (routes :70)
 * POST   /gateways {name}                         governance:enforce  CreateGateway       :196  -> 201 {gateway, credential, pdp}
 * GET    /gateways/:id                            governance:read     GetGateway          :158
 * PATCH  /gateways/:id {name, version}            governance:enforce  RenameGateway       :216  (version required)
 * POST   /gateways/:id/rotate                     governance:enforce  RotateGateway       :236  -> {gateway, credential, pdp}
 * DELETE /gateways/:id                            governance:enforce  RevokeGateway       :252  -> 200 {data: gateway}
 * GET    /gateway-settings                        governance:read     GetSettings         :269
 * PUT    /gateway-settings                        governance:enforce  PutSettings         :283  (omitted fields keep their value)
 * GET    /tool-policies                           governance:read     ListPolicies        :305
 * POST   /tool-policies                           governance:enforce  CreatePolicy        :346  -> 201
 * POST   /tool-policies/evaluate                  governance:read     EvaluatePolicies    :406  (dry run: records nothing)
 * GET    /tool-policies/:id                       governance:read     GetPolicy           :319
 * PUT    /tool-policies/:id                       governance:enforce  UpdatePolicy        :365  (version required)
 * DELETE /tool-policies/:id                       governance:enforce  DeletePolicy        :384  -> 204
 * GET    /gateway-decisions                       governance:read     ListDecisions       :445
 *
 * Writes also need a verified workspace member session (humanActor, :94): a
 * 403 `forbidden` whose message says so is a session problem, not a role.
 *
 * Envelope `{ data, meta }`; the decision list's meta is `{ next_cursor }`.
 * Errors are `{ error: { code, message, detail, field? } }` (govErrorOut,
 * iga_gov_reviews_controller.go:40). Codes this slice can see:
 *   validation_failed 422 (detail.field, detail.errors[]), invalid_parameter 400,
 *   version_conflict 409 (detail.version = current), name_taken 409,
 *   gateway_revoked 409 (rotate), policy_limit 409, not_found 404,
 *   forbidden 403, unauthenticated 401.
 * There is NO capabilities entry for this part: a 503 (or a router 404) on a
 * read is the screen's "not available" state.
 */

import { baseApi } from "./baseApi";
import { enc, policyQuery } from "./igaPolicyCommon";

const BASE = "/api/iga/v1/agent-runtime";

/* --------------------------------- gateways -------------------------------- */

export type GatewayState = "active" | "revoked";

/** services.AgentGatewayView (services/agent_gateway.go:82). Never the credential or its hash. */
export interface AgentGateway {
  id: string;
  name: string;
  state: GatewayState;
  /** First 12 characters of the credential ("agw_" + 8). */
  credential_prefix: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  rotated_at?: string;
  revoked_at?: string;
  last_seen_at?: string;
  software_version?: string;
  /** Optimistic-concurrency token; PATCH sends it back. */
  version: number;
}

/** The `pdp` object of a credential response (controller :175-190). */
export interface GatewayPdpInfo {
  evaluation_path: string;
  evaluations_path: string;
  decisions_path: string;
  hints_path: string;
  header: string;
}

/** POST /gateways and POST /gateways/:id/rotate. `credential` is in this response only (Cache-Control: no-store). */
export interface GatewayCredentialResult {
  data: { gateway: AgentGateway; credential: string; pdp: GatewayPdpInfo };
  meta: { note: string };
}

/* --------------------------------- settings -------------------------------- */

export type GatewayMode = "observe" | "enforce";

/** services.AgentGatewaySettings (agent_gateway.go:121). Defaults (version 0) when nothing is saved. */
export interface GatewaySettings {
  mode: GatewayMode;
  /** 0..300. */
  cache_ttl_seconds: number;
  /** 7..3650. */
  decision_retention_days: number;
  updated_by?: string;
  updated_at?: string;
  /** 0 = defaults, no row yet. */
  version: number;
}

/** services.AgentGatewaySettingsUpdate (agent_gateway.go:136): every field optional, `version` when set must match. */
export interface GatewaySettingsUpdate {
  mode?: GatewayMode;
  cache_ttl_seconds?: number;
  decision_retention_days?: number;
  version?: number;
}

/* ----------------------------- tool policies ------------------------------ */

export type PolicyEffect = "allow" | "deny";
/** agentgateway.KindMCPTool / KindModel (authzen.go:155). */
export type PolicyKind = "mcp_tool" | "model";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** agentgateway.TimeWindow (policy.go:55). Start and End are "HH:MM", both or neither; Start > End spans midnight. */
export interface TimeWindow {
  days?: Weekday[];
  start?: string;
  end?: string;
  /** IANA zone; empty = UTC. */
  timezone?: string;
}

/** agentgateway.Conditions (policy.go:64). `max_calls_per_minute` is for allow policies only. */
export interface PolicyConditions {
  time_window?: TimeWindow;
  max_calls_per_minute?: number;
}

/** agentgateway.Selector (policy.go:94). Empty fields are omitted; a policy with none selects every agent. */
export interface PolicySubject {
  identity_id?: string;
  workload_id?: string;
  agent_label?: string;
  /** Glob on subject.id (gateway client id or SPIFFE id). */
  client_id?: string;
  gateway_id?: string;
}

/** agentgateway.Target (policy.go:105). Globs with `*`; empty = any. */
export interface PolicyTarget {
  kind?: PolicyKind;
  server?: string;
  server_url?: string;
  tool?: string;
  provider?: string;
  model?: string;
}

/** services.AgentToolPolicyView (agent_gateway_policy.go:28): agentgateway.Policy flattened, plus audit fields. */
export interface ToolPolicy {
  id: string;
  name: string;
  description?: string;
  effect: PolicyEffect;
  kind: PolicyKind;
  subject: PolicySubject;
  target: PolicyTarget;
  conditions: PolicyConditions;
  /** Allow policies only: the agents it selects may use only what some allow policy allows them. */
  deny_unlisted: boolean;
  /** Higher is read first. -1000000..1000000. */
  priority: number;
  enabled: boolean;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * services.AgentToolPolicyInput (agent_gateway_policy.go:42). The body is
 * decoded strictly: an unknown member is a 400, so nothing else is sent.
 * `version` is required on PUT and not sent on POST. The server sets
 * target.kind from `kind`.
 */
export interface ToolPolicyInput {
  name: string;
  description?: string;
  effect: PolicyEffect;
  kind: PolicyKind;
  subject: PolicySubject;
  target: Omit<PolicyTarget, "kind">;
  conditions?: PolicyConditions;
  deny_unlisted?: boolean;
  priority?: number;
  enabled?: boolean;
}

/* ------------------------------- evaluate --------------------------------- */

/**
 * POST /tool-policies/evaluate body (agentgateway.EvaluationRequest + gateway_id,
 * authzen.go:39 and controller :395). subject.type must be "agent"; an mcp_tool
 * uses action "tools/call", a model "model/invoke" (operation optional:
 * chat.completions, responses, embeddings, messages).
 */
export interface EvaluateRequest {
  subject: { type: "agent"; id: string; properties?: { identity_id?: string; workload_id?: string; labels?: string[] } };
  action: { name: "tools/call" | "model/invoke"; properties?: { operation?: string } };
  resource: {
    type: PolicyKind;
    /** `<server>/<tool>` or `<provider>/<model>`. */
    id: string;
    properties: { server?: string; tool?: string; server_url?: string; provider?: string; model?: string };
  };
  /** Simulate this gateway asking (must be the workspace's own). */
  gateway_id?: string;
}

/** agentgateway.Trace (policy.go:350): one policy's part in a decision. */
export interface PolicyTrace {
  policy_id: string;
  name: string;
  effect: PolicyEffect;
  enabled: boolean;
  subject_match: boolean;
  target_match: boolean;
  window_active: boolean;
  /** decided, rate_limited, not_applicable, superseded. */
  outcome: string;
}

/** services.AgentGatewayDryRun (agent_gateway_policy.go:407). */
export interface EvaluateResult {
  decision: boolean;
  /** policy_deny, policy_allow, rate_limited, not_allowlisted, default_allow, default_deny. */
  reason: string;
  policy_id?: string;
  policy_name?: string;
  mode: GatewayMode;
  ttl_seconds: number;
  request: { subject_id: string; subject: Record<string, unknown>; kind: PolicyKind; resource_id: string; resource: Record<string, unknown>; gateway_id: string };
  /** Every policy, in evaluation order. */
  policies: PolicyTrace[] | null;
  evaluated_at: string;
}

/* -------------------------------- decisions -------------------------------- */

/** services.AgentGatewayUsage as stored (token counts only; the backend never stores prompts, completions or argument values). */
export type DecisionUsage = Record<string, unknown>;

/** services.AgentGatewayDecisionView (agent_gateway_decisions.go:459). */
export interface GatewayDecision {
  id: string;
  gateway_id: string;
  /** decision | outcome. */
  record_type: string;
  /** pdp | cache | gateway | fail_open | fail_closed. */
  source: string;
  decided_at: string;
  received_at: string;
  subject_type: string;
  subject_id: string;
  /** SubjectProps: identity_id, workload_id, labels. */
  subject: Record<string, unknown> | null;
  /** tools/call | model/invoke. */
  action: string;
  kind: PolicyKind;
  resource_id: string;
  /** ResourceProps: server, tool, server_url, definition_hash | provider, model, operation. */
  resource: Record<string, unknown> | null;
  /** allow | deny. */
  decision: "allow" | "deny";
  reason: string;
  policy_id?: string;
  decision_ref?: string;
  latency_ms?: number;
  /** sha256:<hex> of the arguments: a digest, never the values. */
  args_digest?: string;
  usage?: DecisionUsage;
  upstream_status?: number;
  request_id?: string;
}

/** Filters of GET /gateway-decisions (controller :445-490). `since` is inclusive, `until` exclusive, RFC 3339. `limit` is 1..200 (default 50). */
export interface GatewayDecisionsArgs {
  ws: string;
  gateway_id?: string;
  decision?: "allow" | "deny";
  kind?: PolicyKind;
  subject_id?: string;
  source?: string;
  record_type?: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

export interface GatewayDecisionsEnvelope {
  data: GatewayDecision[];
  meta: { next_cursor?: string | null };
}

/* -------------------------------- endpoints -------------------------------- */

const LIST = { type: "AgentGateway" as const, id: "GATEWAYS" };
const POLICIES = { type: "AgentGateway" as const, id: "POLICIES" };
const SETTINGS = { type: "AgentGateway" as const, id: "SETTINGS" };

export const igaAgentGatewayApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAgentGateways: builder.query<{ data: AgentGateway[] }, { ws: string }>({
      query: () => ({ url: `${BASE}/gateways` }),
      providesTags: [LIST],
    }),
    createAgentGateway: builder.mutation<GatewayCredentialResult, { name: string }>({
      query: (body) => ({ url: `${BASE}/gateways`, method: "POST", body }),
      invalidatesTags: [LIST],
    }),
    renameAgentGateway: builder.mutation<{ data: AgentGateway }, { id: string; name: string; version: number }>({
      query: ({ id, ...body }) => ({ url: `${BASE}/gateways/${enc(id)}`, method: "PATCH", body }),
      invalidatesTags: [LIST],
    }),
    rotateAgentGateway: builder.mutation<GatewayCredentialResult, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/gateways/${enc(id)}/rotate`, method: "POST" }),
      invalidatesTags: [LIST],
    }),
    revokeAgentGateway: builder.mutation<{ data: AgentGateway }, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/gateways/${enc(id)}`, method: "DELETE" }),
      invalidatesTags: [LIST],
    }),

    getGatewaySettings: builder.query<{ data: GatewaySettings }, { ws: string }>({
      query: () => ({ url: `${BASE}/gateway-settings` }),
      providesTags: [SETTINGS],
    }),
    putGatewaySettings: builder.mutation<{ data: GatewaySettings }, GatewaySettingsUpdate>({
      query: (body) => ({ url: `${BASE}/gateway-settings`, method: "PUT", body }),
      invalidatesTags: [SETTINGS],
    }),

    listToolPolicies: builder.query<{ data: ToolPolicy[] }, { ws: string }>({
      query: () => ({ url: `${BASE}/tool-policies` }),
      providesTags: [POLICIES],
    }),
    createToolPolicy: builder.mutation<{ data: ToolPolicy }, ToolPolicyInput>({
      query: (body) => ({ url: `${BASE}/tool-policies`, method: "POST", body }),
      invalidatesTags: [POLICIES],
    }),
    updateToolPolicy: builder.mutation<{ data: ToolPolicy }, { id: string; version: number; policy: ToolPolicyInput }>({
      query: ({ id, version, policy }) => ({ url: `${BASE}/tool-policies/${enc(id)}`, method: "PUT", body: { ...policy, version } }),
      invalidatesTags: [POLICIES],
    }),
    deleteToolPolicy: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/tool-policies/${enc(id)}`, method: "DELETE" }),
      invalidatesTags: [POLICIES],
    }),
    /** A POST that only reads (governance:read): it is a mutation so it never caches, and records nothing server-side. */
    evaluateToolPolicies: builder.mutation<{ data: EvaluateResult }, EvaluateRequest>({
      query: (body) => ({ url: `${BASE}/tool-policies/evaluate`, method: "POST", body }),
    }),

    listGatewayDecisions: builder.query<GatewayDecisionsEnvelope, GatewayDecisionsArgs>({
      query: (a) => ({ url: `${BASE}/gateway-decisions${policyQuery(a)}` }),
      providesTags: [{ type: "AgentGateway", id: "DECISIONS" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAgentGatewaysQuery,
  useCreateAgentGatewayMutation,
  useRenameAgentGatewayMutation,
  useRotateAgentGatewayMutation,
  useRevokeAgentGatewayMutation,
  useGetGatewaySettingsQuery,
  usePutGatewaySettingsMutation,
  useListToolPoliciesQuery,
  useCreateToolPolicyMutation,
  useUpdateToolPolicyMutation,
  useDeleteToolPolicyMutation,
  useEvaluateToolPoliciesMutation,
  useListGatewayDecisionsQuery,
} = igaAgentGatewayApi;
