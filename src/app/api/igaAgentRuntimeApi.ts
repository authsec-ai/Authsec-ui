/**
 * Agent runtime visibility on AWS (SPEC-agent-runtime-visibility.md): AI
 * workloads and suggested agents, findings, alerts and their settings, SIEM
 * endpoints, containment, and the AWS event stream. Every shape below was
 * traced from the Go struct the handler serialises (`authsec`,
 * `authsec-staging`); a field the backend does not send is not declared.
 *
 * The workspace is always the token's: nothing here sends one. `ws` on a query
 * argument is a client-only cache key and never reaches the server.
 *
 * Endpoint                                                  Permission            Go handler (file:line)
 * --------------------------------------------------------  --------------------  -------------------------------------------
 * GET    /api/iga/v1/agent-runtime/ai-workloads             discovery:read        controllers/platform/agent_runtime_controller.go:152
 * GET    /api/iga/v1/agent-runtime/suggestions              discovery:read        agent_runtime_controller.go:174
 * POST   /api/iga/v1/agent-runtime/suggestions/:id/confirm  iga:review            agent_runtime_controller.go:298
 * POST   /api/iga/v1/agent-runtime/suggestions/:id/dismiss  iga:review            agent_runtime_controller.go:351
 * GET    /api/iga/v1/agent-runtime/findings                 discovery:read        agent_runtime_controller.go:196
 * GET    /api/iga/v1/agent-runtime/alerts                   governance|discovery read  agent_runtime_alerts_controller.go:120
 * GET    /api/iga/v1/agent-runtime/alerts/:id               same                  agent_runtime_alerts_controller.go:152
 * POST   /api/iga/v1/agent-runtime/alerts/:id/acknowledge   governance:enforce    agent_runtime_alerts_controller.go:215
 * POST   /api/iga/v1/agent-runtime/alerts/:id/resolve       governance:enforce    agent_runtime_alerts_controller.go:218
 * GET    /api/iga/v1/agent-runtime/alert-settings           governance|discovery read  agent_runtime_alerts_controller.go:221
 * PUT    /api/iga/v1/agent-runtime/alert-settings           governance:enforce    agent_runtime_alerts_controller.go:235
 * GET    /api/iga/v1/agent-runtime/siem-endpoints           governance|discovery read  agent_runtime_alerts_controller.go:259
 * POST   /api/iga/v1/agent-runtime/siem-endpoints           governance:enforce    agent_runtime_alerts_controller.go:279
 * DELETE /api/iga/v1/agent-runtime/siem-endpoints/:id       governance:enforce    agent_runtime_alerts_controller.go:305
 * POST   /api/iga/v1/agent-runtime/siem-endpoints/:id/test  governance:enforce    agent_runtime_alerts_controller.go:326
 * POST   /api/iga/v1/agent-runtime/containments/preview     governance:enforce    agent_runtime_contain_controller.go:78
 * POST   /api/iga/v1/agent-runtime/containments             governance:enforce (+emergency for identity)  agent_runtime_contain_controller.go:90
 * GET    /api/iga/v1/agent-runtime/containments             governance:read       agent_runtime_contain_controller.go:116
 * GET    /api/iga/v1/agent-runtime/containments/:id         governance:read       agent_runtime_contain_controller.go:132
 * POST   /api/iga/v1/agent-runtime/containments/:id/release governance:enforce    agent_runtime_contain_controller.go:144
 * POST   /authsec/discovery/aws/connectors/:id/event-stream          discovery:admin  agent_runtime_ingest_controller.go:183 (routes.go:1717)
 * GET    /authsec/discovery/aws/connectors/:id/event-stream          discovery:read   agent_runtime_ingest_controller.go:243 (routes.go:1718)
 * DELETE /authsec/discovery/aws/connectors/:id/event-stream          discovery:admin  agent_runtime_ingest_controller.go:258 (routes.go:1719)
 * GET    /authsec/discovery/aws/connectors/:id/event-stream/template discovery:read  agent_runtime_ingest_controller.go:276 (routes.go:1720)
 * GET    /authsec/discovery/aws/templates/model-access?mode=&form=   discovery:read  agent_runtime_ingest_controller.go:299 (routes.go:1721)
 *
 * Envelope `{ data, meta }`; the event-stream routes add `success`. Errors are
 * `{ error: { code, message, detail? } }` (classified by `classifyPolicyError`).
 */

import { baseApi } from "./baseApi";
import { enc, policyQuery } from "./igaPolicyCommon";

const BASE = "/api/iga/v1/agent-runtime";
const DISCOVERY = "/authsec/discovery/aws";

/* --------------------------------- labels --------------------------------- */

/**
 * services.AIWorkload.Label (agent_runtime_inference.go). possible_ai_workload
 * rests on configuration hints (or network traffic attributed only at scan
 * time): shown, never suggested.
 */
export type AgentLabel = "possible_ai_workload" | "ai_workload" | "suggested_agent" | "agent";

/* ------------------------------- AI workloads ------------------------------ */

export interface AIIdentityRef {
  id: string;
  connector_id: string;
  kind: string;
  arn: string;
  name: string;
}

export interface AIWorkloadRef {
  cloud_workload_id: string;
  /** iga_workload id; null until projected. */
  workload_id: string | null;
  name: string;
  runtime_kind: string;
  native_id: string;
  region: string;
  classification: string;
}

/** What the evidence covers. "No calls" is never claimed outside it. */
export interface AICoverage {
  from: string | null;
  to: string | null;
  partial: boolean;
}

export interface AISessionNames {
  values: string[];
  /** Always false today: session names are unverified weak evidence. */
  verified: boolean;
  matches: { session_name: string; cloud_workload_id: string; strength: string }[];
}

export interface AIWorkload {
  identity: AIIdentityRef;
  workloads: AIWorkloadRef[];
  k8s_service_accounts: string[];
  label: AgentLabel;
  shared_role: boolean;
  calls: number;
  errors: number;
  denied: number;
  tokens: number;
  models: Record<string, number>;
  endpoints: Record<string, number>;
  other_services: Record<string, number>;
  first_call_at: string | null;
  last_call_at: string | null;
  coverage: AICoverage;
  session_names: AISessionNames;
  suggestion: { id: string; state: string } | null;
  open_findings: number;
  usage_id: string;
  /** Model calls the event stream reported since the last scan (agent_runtime_inference.go:569). */
  live: { calls: number; denied: number; last_call_at: string | null; models: Record<string, number> };
  seen_live: boolean;
  /** Open ai_config_hint findings: names only, never decide a label above "possible". */
  config_hints: AIFindingRef[];
  /** Open ai_network_traffic findings: DNS lookups of model API hosts (spec §11). */
  network_traffic: AIFindingRef[];
}

/** services.AIFindingRef (agent_runtime_config_hints.go:222). */
export interface AIFindingRef {
  finding_id: string;
  kind: string;
  subject: Record<string, unknown>;
  evidence: Record<string, unknown>;
}

export interface ArListEnvelope<T> {
  data: T[];
  meta: { next_cursor?: string | null };
}

export interface AIWorkloadsArgs {
  ws: string;
  label?: AgentLabel;
  connector_id?: string;
  cursor?: string;
  limit?: number;
}

/* -------------------------------- suggestions ------------------------------- */

export type SuggestionState = "pending" | "confirmed" | "dismissed" | "superseded";

/** Evidence of a suggestion (suggestionEvidence, agent_runtime_suggest.go:170). */
export interface SuggestionEvidence {
  rule?: string;
  rule_version?: number;
  window?: AICoverage;
  model_calls?: {
    calls: number;
    denied: number;
    errors: number;
    tokens: number;
    models: Record<string, number>;
    endpoints: Record<string, number>;
    first_call_at: string | null;
    last_call_at: string | null;
  };
  other_services?: unknown;
  references?: { cloud_usage?: string[]; cloud_observation?: string[] };
  identity?: { id: string; arn: string; name: string };
  workload?: { cloud_workload_id: string; name: string; runtime_kind: string; native_id: string; region: string };
  supporting?: {
    env_var_names?: string[];
    env_vars_unread?: boolean;
    layer_names?: string[];
    readable_model_keys?: { arn: string; name: string }[];
    readable_basis?: string;
    supporting_only_note?: string;
  };
  session_names?: AISessionNames;
}

export interface AgentSuggestion {
  id: string;
  workload: {
    id: string;
    name: string;
    runtime_kind: string;
    region: string;
    classification: string;
    /** The version a confirm must send back. */
    classification_version: number;
    lifecycle: string;
  };
  connector_id: string;
  identity_id: string | null;
  rule: string;
  rule_version: number;
  evidence: SuggestionEvidence;
  state: SuggestionState;
  decided_by: string | null;
  decided_at: string | null;
  reason: string;
  decision_id: string | null;
  operation_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SuggestionsArgs {
  ws: string;
  state?: SuggestionState;
  connector_id?: string;
  cursor?: string;
  limit?: number;
}

export interface ConfirmSuggestionArgs {
  id: string;
  /** Client-generated UUID, stable across retries of the same decision. */
  operation_id: string;
  /** The workload's `classification_version` the person saw. */
  version: number;
  purpose?: string;
  reason?: string;
}

/* --------------------------------- findings --------------------------------- */

export type FindingKind =
  | "shared_role"
  | "human_credentials"
  | "long_lived_key"
  | "model_key_secret"
  | "ai_config_hint"
  | "ai_network_traffic"
  | "unaccounted_model_usage";

/** services.AgentFinding (agent_runtime_findings.go:381). Subject and evidence vary by kind. */
export interface AgentFinding {
  id: string;
  /** Null for unaccounted_model_usage: it names a model-provider connection, not an AWS connector. */
  connector_id: string | null;
  kind: FindingKind;
  subject_key: string;
  identity_id: string | null;
  subject: Record<string, unknown>;
  evidence: Record<string, unknown>;
  state: "open" | "resolved";
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
}

export interface FindingsArgs {
  ws: string;
  kind?: FindingKind;
  state?: "open" | "resolved";
  connector_id?: string;
  cursor?: string;
  limit?: number;
}

/* ---------------------------------- alerts ---------------------------------- */

export type AlertState = "open" | "acknowledged" | "resolved";
export type AlertSeverity = "high" | "medium";
export type DetectionId = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8";

/** services.AgentAlertEventRef (agent_runtime_alerts.go:127): never a body or a secret value. */
export interface AlertEventRef {
  event_id: string;
  time: string;
  source: string;
  name: string;
  ip?: string;
  region?: string;
  error?: string;
  detail?: string;
}

export interface AgentAlert {
  id: string;
  workspace_id: string;
  connector_id: string;
  identity_id: string;
  workload_ids: string[] | null;
  subject_label: string;
  subject_name: string;
  detection: DetectionId | string;
  severity: AlertSeverity | string;
  title: string;
  dedupe_key: string;
  first_seen: string;
  last_seen: string;
  event_count: number;
  evidence: AlertEventRef[] | null;
  state: AlertState;
  state_changed_by: string | null;
  state_changed_at: string | null;
  reason: string;
  created_at: string;
}

export interface AlertDelivery {
  id: string;
  alert_id: string;
  /** `slack` or `siem` (agent_runtime_alert_delivery.go). */
  channel: string;
  endpoint_id: string | null;
  attempt: number;
  status: string;
  next_attempt_at: string;
  last_error: string;
  sent_at: string | null;
  created_at: string;
}

export interface AgentAlertView extends AgentAlert {
  detection_name: string;
  deliveries?: AlertDelivery[];
}

export interface AlertsArgs {
  ws: string;
  state?: AlertState;
  severity?: AlertSeverity;
  detection?: string;
  identity_id?: string;
  cursor?: string;
  limit?: number;
}

export interface DetectionSetting {
  enabled: boolean;
  /** D5: denials in `minutes`. */
  n?: number;
  minutes?: number;
  /** D6: volume factor over the 7-day baseline. */
  k?: number;
}

export interface AlertSettings {
  detections: Record<string, DetectionSetting>;
  slack_enabled: boolean;
  dedupe_window_minutes: number;
  retention_days: number;
  saved: boolean;
  updated_at?: string;
}

export interface AlertSettingsUpdate {
  detections?: Record<string, { enabled?: boolean; n?: number; minutes?: number; k?: number }>;
  slack_enabled?: boolean;
  dedupe_window_minutes?: number;
  retention_days?: number;
}

export interface SiemEndpoint {
  id: string;
  /** As the backend returns it (redacted). */
  url: string;
  enabled: boolean;
  secret_set: boolean;
  created_by: string;
  created_at: string;
}

export interface CreatedSiemEndpoint {
  endpoint: SiemEndpoint;
  /** Shown once; the backend never returns it again. */
  secret: string;
  signature: string;
}

export interface SiemTestResult {
  delivered: boolean;
  http_status?: number;
  error?: string;
}

/* -------------------------------- containment ------------------------------- */

export type ContainLevel = "workload" | "model" | "identity";
export type ContainState = "previewed" | "containing" | "contained" | "partially_contained" | "failed" | "releasing" | "released";

export interface ContainRefusal {
  code: string;
  message: string;
  workload_id?: string;
}

export interface ContainWorkloadRef {
  id: string;
  kind: string;
  name: string;
}

export interface ContainPlannedStep {
  kind: string;
  target: string;
  region?: string;
  cluster?: string;
  detail: string;
}

export interface ContainLevelOption {
  level: ContainLevel;
  offered: boolean;
  refusals: ContainRefusal[];
  /** Null when none (Go nil slice). */
  stops: ContainWorkloadRef[] | null;
  also_stops: ContainWorkloadRef[] | null;
  summary: string;
  side_effects: { code: string; message: string }[] | null;
  steps: ContainPlannedStep[] | null;
}

export interface ContainPreviewWorkload {
  id: string;
  kind: string;
  native_id: string;
  name: string;
  region: string;
  via: string;
  ecs_services?: { cluster_arn: string; service_arn: string; task_definition: string; desired_count: number; running_count: number }[];
  ecs_services_read: boolean;
  /** -1: not read. */
  event_source_mappings: number;
}

export interface ContainPreview {
  subject: { identity_id: string; connector_id: string; kind: string; arn: string; name: string; unique_id: string; path: string; account_id: string; partition: string; label: string };
  workloads: ContainPreviewWorkload[] | null;
  selected: string[] | null;
  shared_role: boolean;
  recent_services: { service: string; source: string; last_used_at?: string; calls?: number }[] | null;
  levels: ContainLevelOption[] | null;
  /** Apply to every level. */
  refusals: ContainRefusal[] | null;
  warnings: string[] | null;
  binding: boolean;
  binding_reason?: string;
  workload: boolean;
  workload_reason?: string;
}

export interface ContainPreviewArgs {
  identity_id: string;
  workload_ids?: string[];
}

export interface ContainArgs extends ContainPreviewArgs {
  level: ContainLevel;
  reason: string;
}

export interface ContainStep {
  id: string;
  containment_id: string;
  seq: number;
  kind: string;
  target: string;
  region: string;
  state: string;
  error: string;
  applied_at: string | null;
  restored_at: string | null;
}

export interface LateEvent {
  event_id: string;
  event_time: string;
  event_source: string;
  event_name: string;
  session_name?: string;
  region?: string;
  weak?: boolean;
}

export interface Containment {
  id: string;
  connector_id: string;
  identity_id: string;
  identity_kind: string;
  identity_arn: string;
  unique_id: string;
  workload_ids: string[];
  level: ContainLevel;
  state: ContainState;
  state_reason: string;
  reason: string;
  release_reason: string;
  /** true: verified by behaviour; false: not effective; null: not (yet) verified. */
  effective: boolean | null;
  /** unverifiable: no CloudTrail evidence could confirm it (reason from the backend); evidence: what confirmed it. */
  verification: { late_events?: LateEvent[]; unverifiable?: { reason: string; at: string }; evidence?: string };
  created_by: string;
  contained_at: string | null;
  verified_at: string | null;
  release_requested_at: string | null;
  released_at: string | null;
  released_by: string | null;
  pending_restore_at: string | null;
  preview: ContainPreview | Record<string, never>;
  created_at: string;
  updated_at: string;
  /** Detail only. */
  steps?: ContainStep[];
}

/* ------------------------------- event stream ------------------------------- */

export type EventStreamState = "not_configured" | "active" | "revoked";

/** services.AgentEventStreamView (agent_runtime_ingest.go:172). */
export interface EventStream {
  connector_id: string;
  account_id: string;
  state: EventStreamState;
  secret_prefix?: string;
  created_by?: string;
  created_at?: string;
  rotated_at?: string;
  revoked_at?: string;
  last_received_at?: string;
  last_event_time?: string;
  received_count: number;
  rejected_count: number;
  silent_after_minutes: number;
  silent: boolean;
  silent_since?: string;
  endpoint_url: string;
  secret_header: string;
}

export interface CfnParameter {
  ParameterKey: string;
  ParameterValue: string;
}

export interface EnabledEventStream {
  stream: EventStream;
  /** Shown once. */
  secret: string;
  rotated: boolean;
  cloudformation: { template_url: string; parameters: CfnParameter[]; notes: string[] };
}

/** GET .../event-stream/template (services.EventStreamTemplateDoc): the secret is a placeholder. */
export interface EventStreamTemplateDoc {
  template_version: string;
  file_name: string;
  template: string;
  parameters: CfnParameter[];
  notes: string[];
}

/** scp: service control policy; rcp: resource control policy (stops tags set by the assumer); policy: deny policy on chosen roles (services/agent_runtime_templates.go). */
export type ModelAccessForm = "scp" | "rcp" | "policy";

export interface ModelAccessTemplate {
  template_version: string;
  mode: "audit" | "deny";
  form: ModelAccessForm;
  denies: boolean;
  file_name?: string;
  template?: string;
  parameters?: string[];
  /** Audit mode only. */
  audit?: unknown;
  notes: string[];
}

/* -------------------------------- endpoints -------------------------------- */

export const igaAgentRuntimeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAiWorkloads: builder.query<ArListEnvelope<AIWorkload>, AIWorkloadsArgs>({
      query: (a) => ({ url: `${BASE}/ai-workloads${policyQuery(a)}` }),
      providesTags: [{ type: "AgentRuntime", id: "AI" }],
    }),
    listAgentSuggestions: builder.query<ArListEnvelope<AgentSuggestion>, SuggestionsArgs>({
      query: (a) => ({ url: `${BASE}/suggestions${policyQuery(a)}` }),
      providesTags: [{ type: "AgentRuntime", id: "SUGGESTIONS" }],
    }),
    confirmAgentSuggestion: builder.mutation<unknown, ConfirmSuggestionArgs>({
      query: ({ id, ...body }) => ({ url: `${BASE}/suggestions/${enc(id)}/confirm`, method: "POST", body }),
      invalidatesTags: [{ type: "AgentRuntime", id: "AI" }, { type: "AgentRuntime", id: "SUGGESTIONS" }],
    }),
    dismissAgentSuggestion: builder.mutation<unknown, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `${BASE}/suggestions/${enc(id)}/dismiss`, method: "POST", body: { reason } }),
      invalidatesTags: [{ type: "AgentRuntime", id: "AI" }, { type: "AgentRuntime", id: "SUGGESTIONS" }],
    }),
    listAgentFindings: builder.query<ArListEnvelope<AgentFinding>, FindingsArgs>({
      query: (a) => ({ url: `${BASE}/findings${policyQuery(a)}` }),
      providesTags: [{ type: "AgentRuntime", id: "FINDINGS" }],
    }),

    listAgentAlerts: builder.query<ArListEnvelope<AgentAlert>, AlertsArgs>({
      query: (a) => ({ url: `${BASE}/alerts${policyQuery(a)}` }),
      providesTags: [{ type: "AgentAlert", id: "LIST" }],
    }),
    getAgentAlert: builder.query<{ data: AgentAlertView }, { ws: string; id: string }>({
      query: ({ id }) => ({ url: `${BASE}/alerts/${enc(id)}` }),
      providesTags: (_r, _e, { id }) => [{ type: "AgentAlert", id }],
    }),
    transitionAgentAlert: builder.mutation<{ data: AgentAlert }, { id: string; action: "acknowledge" | "resolve"; reason: string }>({
      query: ({ id, action, reason }) => ({ url: `${BASE}/alerts/${enc(id)}/${action}`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "AgentAlert", id }, { type: "AgentAlert", id: "LIST" }],
    }),
    getAgentAlertSettings: builder.query<{ data: AlertSettings }, { ws: string }>({
      query: () => ({ url: `${BASE}/alert-settings` }),
      providesTags: [{ type: "AgentAlert", id: "SETTINGS" }],
    }),
    putAgentAlertSettings: builder.mutation<{ data: AlertSettings }, AlertSettingsUpdate>({
      query: (body) => ({ url: `${BASE}/alert-settings`, method: "PUT", body }),
      invalidatesTags: [{ type: "AgentAlert", id: "SETTINGS" }],
    }),
    listSiemEndpoints: builder.query<{ data: SiemEndpoint[] }, { ws: string }>({
      query: () => ({ url: `${BASE}/siem-endpoints` }),
      providesTags: [{ type: "AgentAlert", id: "SIEM" }],
    }),
    createSiemEndpoint: builder.mutation<{ data: CreatedSiemEndpoint }, { url: string; secret?: string }>({
      query: (body) => ({ url: `${BASE}/siem-endpoints`, method: "POST", body }),
      invalidatesTags: [{ type: "AgentAlert", id: "SIEM" }],
    }),
    deleteSiemEndpoint: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/siem-endpoints/${enc(id)}`, method: "DELETE" }),
      invalidatesTags: [{ type: "AgentAlert", id: "SIEM" }],
    }),
    testSiemEndpoint: builder.mutation<{ data: SiemTestResult }, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/siem-endpoints/${enc(id)}/test`, method: "POST" }),
    }),

    previewContainment: builder.mutation<{ data: ContainPreview }, ContainPreviewArgs>({
      query: (body) => ({ url: `${BASE}/containments/preview`, method: "POST", body }),
    }),
    createContainment: builder.mutation<{ data: Containment }, ContainArgs>({
      query: (body) => ({ url: `${BASE}/containments`, method: "POST", body }),
      invalidatesTags: [{ type: "AgentContainment", id: "LIST" }],
    }),
    listContainments: builder.query<{ data: Containment[] }, { ws: string; state?: string; limit?: number }>({
      query: (a) => ({ url: `${BASE}/containments${policyQuery(a)}` }),
      providesTags: [{ type: "AgentContainment", id: "LIST" }],
    }),
    getContainment: builder.query<{ data: Containment }, { ws: string; id: string }>({
      query: ({ id }) => ({ url: `${BASE}/containments/${enc(id)}` }),
      providesTags: (_r, _e, { id }) => [{ type: "AgentContainment", id }],
    }),
    releaseContainment: builder.mutation<{ data: Containment }, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `${BASE}/containments/${enc(id)}/release`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "AgentContainment", id }, { type: "AgentContainment", id: "LIST" }],
    }),

    getEventStream: builder.query<{ data: EventStream }, { ws: string; connectorId: string }>({
      query: ({ connectorId }) => ({ url: `${DISCOVERY}/connectors/${enc(connectorId)}/event-stream` }),
      providesTags: (_r, _e, { connectorId }) => [{ type: "AgentEventStream", id: connectorId }],
    }),
    enableEventStream: builder.mutation<{ data: EnabledEventStream }, { connectorId: string; silent_after_minutes?: number }>({
      query: ({ connectorId, ...body }) => ({ url: `${DISCOVERY}/connectors/${enc(connectorId)}/event-stream`, method: "POST", body }),
      invalidatesTags: (_r, _e, { connectorId }) => [{ type: "AgentEventStream", id: connectorId }],
    }),
    revokeEventStream: builder.mutation<{ data: EventStream }, { connectorId: string }>({
      query: ({ connectorId }) => ({ url: `${DISCOVERY}/connectors/${enc(connectorId)}/event-stream`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { connectorId }) => [{ type: "AgentEventStream", id: connectorId }],
    }),
    /**
     * `?format=yaml` of a template route, as text. It goes through baseApi, so the bearer token and the
     * 401 handler are the ones every other request uses; an error body is parsed so it classifies as usual.
     */
    downloadAgentYaml: builder.mutation<string, { path: string }>({
      query: ({ path }) => ({
        url: `${path}${path.includes("?") ? "&" : "?"}format=yaml`,
        responseHandler: async (res: Response) => {
          const text = await res.text();
          if (res.ok) return text;
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        },
      }),
    }),
    getEventStreamTemplate: builder.query<{ data: EventStreamTemplateDoc }, { ws: string; connectorId: string }>({
      query: ({ connectorId }) => ({ url: eventStreamTemplatePath(connectorId) }),
    }),
    getModelAccessTemplate: builder.query<{ data: ModelAccessTemplate }, { mode: "audit" | "deny"; form: ModelAccessForm }>({
      query: ({ mode, form }) => ({ url: `${DISCOVERY}/templates/model-access?mode=${mode}&form=${form}` }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useListAiWorkloadsQuery,
  useListAgentSuggestionsQuery,
  useConfirmAgentSuggestionMutation,
  useDismissAgentSuggestionMutation,
  useListAgentFindingsQuery,
  useListAgentAlertsQuery,
  useGetAgentAlertQuery,
  useTransitionAgentAlertMutation,
  useGetAgentAlertSettingsQuery,
  usePutAgentAlertSettingsMutation,
  useListSiemEndpointsQuery,
  useCreateSiemEndpointMutation,
  useDeleteSiemEndpointMutation,
  useTestSiemEndpointMutation,
  usePreviewContainmentMutation,
  useCreateContainmentMutation,
  useListContainmentsQuery,
  useGetContainmentQuery,
  useReleaseContainmentMutation,
  useGetEventStreamQuery,
  useEnableEventStreamMutation,
  useRevokeEventStreamMutation,
  useDownloadAgentYamlMutation,
  useGetEventStreamTemplateQuery,
  useGetModelAccessTemplateQuery,
} = igaAgentRuntimeApi;

/* --------------------------------- downloads -------------------------------- */

/** Saves text the page already holds (a downloaded template, an audit document). */
export function saveText(text: string, filename: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export const eventStreamTemplatePath = (connectorId: string) => `${DISCOVERY}/connectors/${enc(connectorId)}/event-stream/template`;
export const modelAccessTemplatePath = (mode: "audit" | "deny", form: ModelAccessForm) => `${DISCOVERY}/templates/model-access?mode=${mode}&form=${form}`;
