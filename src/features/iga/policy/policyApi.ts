/**
 * Runtime policy API — RTK Query endpoints for /api/iga/v2/runtime-policies.
 *
 * Fixes B01 (response envelope), B02 (Idempotency-Key / If-Match headers),
 * and the broken approve/simulate/publish bodies from the initial stub.
 *
 * Backend contract:
 *  - List:     GET  /                      → {data: PolicyHead[]}
 *  - Get:      GET  /:id                   → {etag, data: {policy, revisions}}
 *  - Create:   POST /                      → {etag, data: {policy_id, …}}   (Idempotency-Key)
 *  - Draft:    PUT  /:id/draft             → {etag, data: {policy_id, …}}   (Idempotency-Key + If-Match)
 *  - Validate: POST /:id/validate          → {etag, data: {…}}              (Idempotency-Key + If-Match)
 *  - Simulate: POST /:id/simulations       → {etag, data: {simulation_id, …}} (Idempotency-Key + If-Match)
 *  - GetSim:   GET  /simulations/:sid      → simulation row
 *  - Approve:  POST /:id/approvals         → {etag, data: {approval_id, …}} (Idempotency-Key + If-Match)
 *  - Publish:  POST /:id/publications      → {etag, data: {publication_id, …}} (enforce route)
 *  - Rollback: POST /:id/rollback          → {etag, data: {…}}              (enforce route)
 *  - Revoke:   POST /:id/revoke            → {etag, data: {…}}              (enforce route)
 *  - Rollout:  GET  /:id/rollouts          → {data: {…}}
 */

import { baseApi } from "@/app/api/baseApi";

// ── Types (match backend service structs) ────────────────────────────────────

export type PolicyLifecycle =
  | "draft"
  | "validated"
  | "simulated"
  | "approved"
  | "published"
  | "superseded"
  | "revoked";

/** Discovered agent whose adopted workload the current revision targets. */
export interface PolicyAgentLink {
  id: string;
  display_name: string;
  source: string;
}

/** List row — backend `policyHead`. */
export interface RuntimePolicy {
  id: string;
  name: string;
  owner_user_id: string;
  current_draft_revision: number;
  lifecycle: PolicyLifecycle;
  /** Present when the current revision targets a workload adopted from a sighting. */
  agents?: PolicyAgentLink[];
}

// ── V2 Policy Document Types ─────────────────────────────────────────────────

export type EnforcementBackend = "authsec" | "openshell";
export type EnforcementMode = "observe" | "shadow" | "enforce";
export type RuleEffect = "allow" | "deny" | "require_approval";

export interface PolicyV2Enforcement {
  backend: EnforcementBackend;
  mode: EnforcementMode;
  profile?: string;
}

export interface PolicyV2Selector {
  runtime_kind?: string;
  namespace?: string;
  labels?: Record<string, string>;
  archetype?: string;
}

export interface PolicyV2TargetSet {
  workload_ids: string[];
  include_future_incarnations: boolean;
  bounded_future_approval?: boolean;
  selectors?: PolicyV2Selector[];
}

export interface RuleProvenance {
  source: string;
  candidate_id?: string;
  evidence_window?: string;
  generator_version?: string;
}

export interface PolicyV2Rule {
  id: string;
  primitive: string;
  resource?: string;
  actions?: string[];
  constraints?: Record<string, unknown>;
  effect: RuleEffect;
  escalation_ref?: string;
  required: boolean;
  evidence_refs?: string[];
  explanation?: string;
  provenance?: RuleProvenance;
}

export interface PolicyEscalation {
  name: string;
  enabled: boolean;
  approver_group_ids: string[];
  min_approvals?: number;
  mfa_provider?: string;
  mfa_level?: string;
  max_uses?: number;
  max_ttl_seconds?: number;
  self_approval?: string;
  timeout_seconds?: number;
}

export interface PolicyDecisionModule {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  priority?: number;
}

export interface AuthoredModule {
  name: string;
  language: string;
  source: string;
  hash?: string;
}

export interface RuntimePolicyV2Document {
  name: string;
  format: string;
  targets: PolicyV2TargetSet;
  default_effect: string;
  enforcement: PolicyV2Enforcement;
  rules: PolicyV2Rule[];
  escalations?: PolicyEscalation[];
  decision_modules?: PolicyDecisionModule[];
  required_controls: string[];
  optional_controls?: string[];
  evidence_graph_revision: number;
  mode?: string;
  authored_modules?: AuthoredModule[];
}

// ── Primitive Coverage Types ─────────────────────────────────────────────────

export type DiscoveryStatus = "discovered" | "undiscovered" | "partial";
export type EnforcementStatus = "enforceable" | "observe_only" | "not_supported" | "blocked";

export interface PrimitiveCoverage {
  primitive_id: string;
  discovery_status: DiscoveryStatus;
  enforcement_status: EnforcementStatus;
  backend?: string;
  profile?: string;
}

// ── Agent Instance & Binding Types ───────────────────────────────────────────

export interface AgentInstance {
  id: string;
  agent_id: string;
  workload_id: string;
  execution_id: string;
  principal: string;
  backend: string;
  binding_id?: string;
  policy_digest: string;
  status: string;
  last_seen_at?: string;
}

export interface EffectivePolicyRevision {
  policy_id: string;
  policy_name: string;
  revision: number;
  content_hash: string;
  format: string;
  state: string;
}

export interface EffectivePolicyData {
  contributing_revisions: EffectivePolicyRevision[];
  primitive_coverage: PrimitiveCoverage[];
}

export type BindingState = "draft" | "planned" | "approved" | "active" | "superseded";

export interface EnforcementBinding {
  id: string;
  workspace_id: string;
  agent_id: string;
  backend: EnforcementBackend;
  backend_profile: string;
  identity_mode: string;
  state: BindingState;
  capability_digest: string;
  plan_hash: string;
  binding_revision: number;
}

export interface UpdateBindingRequest {
  agentId: string;
  backend: EnforcementBackend;
  backend_profile?: string;
  identity_mode?: string;
  etag?: string;
}

// ── Test Policy Types ────────────────────────────────────────────────────────

export interface TestPolicyInput {
  principal: string;
  workload_id: string;
  execution_id?: string;
  primitive: string;
  resource: string;
  action: string;
}

export interface TestPolicyResult {
  decision: "allow" | "deny" | "require_approval";
  matched_rules: string[];
  reasons: string[];
  obligations?: Record<string, unknown>[];
}

/** Revision row — backend `revisionHead`. */
export interface PolicyRevision {
  revision: number;
  document: string;
  content_hash: string;
  author_user_id: string;
  state: PolicyLifecycle;
  graph_revision: number;
  compiler_version?: string;
  backend_profile?: string;
  capability_digest?: string;
  compiler_format?: string;
  generated_rego?: string;
}

/** GET /:id unwrapped result. */
export interface PolicyWithRevisions {
  policy: RuntimePolicy;
  revisions: PolicyRevision[];
  etag: string;
}

// ── Mutation response shapes ─────────────────────────────────────────────────

export interface PolicyCreateResult {
  policy_id: string;
  revision: number;
  lifecycle: string;
  content_hash: string;
  etag: string;
}

export interface DraftResult {
  policy_id: string;
  revision: number;
  lifecycle: string;
  content_hash: string;
  diff: {
    from_revision: number;
    to_revision: number;
    added_rules: string[];
    removed_rules: string[];
  };
  etag: string;
}

export interface ValidationResult {
  policy_id: string;
  revision: number;
  state: string;
  content_hash: string;
  target_digest: string;
  semantic_report: Record<string, unknown>;
  controls: unknown;
  etag: string;
}

export interface SimulationResult {
  simulation_id: string;
  policy_id: string;
  revision: number;
  state: string;
  revision_hash: string;
  target_digest: string;
  graph_revision: number;
  result_summary: Record<string, unknown>;
  etag: string;
}

export interface SimulationView {
  id: string;
  policy_id: string;
  revision: number;
  state: string;
  revision_hash: string;
  target_digest: string;
  graph_revision: number;
  result_summary: Record<string, unknown>;
}

export interface ApprovalResult {
  policy_id: string;
  approval_id: string;
  revision: number;
  state: string;
  etag: string;
}

export interface PublicationResult {
  publication_id: string;
  delivery_revision: number;
  mode: string;
  rollout_phase: string;
  content_hash: string;
  target_digest: string;
  semantic_report: Record<string, unknown>;
  etag: string;
}

export interface RolloutTarget {
  workload_id: string;
  instance_id: string;
  collector_id: string;
  delivery_revision: number;
  mode: string;
  controls_verified: number;
  controls_total: number;
  state: string;
  last_receipt_at: string | null;
  error: string | null;
}

export interface RolloutStatus {
  policy_id: string;
  targets: RolloutTarget[];
  aggregate: {
    total: number;
    applied: number;
    verified: number;
    failed: number;
    pending: number;
  };
}

// ── Request types ────────────────────────────────────────────────────────────

export interface CreatePolicyRequest {
  name: string;
  document: unknown;
}

export interface PutDraftRequest {
  id: string;
  etag: string;
  document: unknown;
}

export interface ValidateRequest {
  id: string;
  etag: string;
}

export interface SimulateRequest {
  id: string;
  etag: string;
  graph_revision?: number;
  event_window?: string;
}

export interface ApproveRequest {
  id: string;
  etag: string;
  revision_hash: string;
  simulation_id: string;
  target_digest: string;
  reason: string;
}

export interface PublishRequest {
  id: string;
  etag: string;
  mode: "observe" | "enforce";
  reason: string;
  canary_workload_ids?: string[];
  window_seconds?: number;
  failure_threshold?: number;
}

export interface RollbackRequest {
  id: string;
  etag: string;
  reason: string;
}

export interface RevokeRequest {
  id: string;
  etag: string;
  reason: string;
}

// ── Policy Context Types (Batch 9 — context preparation) ─────────────────

/** A graph-selected object reference handed to context preparation. */
export interface PolicyContextRef {
  ref: string;
  kind: string;
  label?: string;
}

/** POST /api/iga/v2/runtime-policies/contexts request body. */
export interface PolicyContextRequest {
  /** Graph refs the user selected when invoking "Block/Deny access". */
  selected_refs: PolicyContextRef[];
  /** The graph root the investigation started from. */
  graph_root?: string;
  /** Evidence graph revision at the time of selection, for consistency. */
  graph_revision?: number;
}

/** The prepared context returned by the backend. */
export interface PolicyContextResponse {
  context_id: string;
  /** Whether this context can produce a publishable draft. */
  publishable: boolean;
  /** Explanation when `publishable` is false (e.g. no enforcement backend). */
  reason?: string;
  /** Suggested policy name derived from the selected refs. */
  suggested_name?: string;
  /** Existing policy id if one already targets this workload. */
  existing_policy_id?: string;
  /** Existing policy etag for If-Match on PutDraft. */
  existing_policy_etag?: string;
  /** The base revision number when extending an existing policy. */
  base_revision?: number;
  /** Pre-filled deny rule derived from the selection. */
  proposed_rules?: PolicyV2Rule[];
  /** Resolved enforcement backend for the target workload. */
  enforcement_backend?: EnforcementBackend;
  /** Workload ids the context targets. */
  target_workload_ids?: string[];
}

// ── Candidate Job Types ──────────────────────────────────────────────────

export interface CandidateJob {
  id: string;
  workspace_id: string;
  policy_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workload_ids: string[];
  warnings: string[];
  created_at: string;
  completed_at?: string;
}

// ── Compiled Artifacts Types ─────────────────────────────────────────────

export interface CompiledControl {
  kind: string;        // 'landlock' | 'seccomp' | 'network' | 'gateway_broker'
  name: string;
  rule_id: string;
  instruction_summary: string;
  sha256: string;
  status?: string;
}

export interface CompiledArtifacts {
  canonical_hash: string;
  compiler_build: string;
  controls: CompiledControl[];
  rego_source?: string;
  /** Profile named by the compiled artifact, when the publication carries one. */
  profile?: string;
  /** Controls schema, such as authsec.controls.v1. */
  schema?: string;
  controls_sha256?: string;
  /** False when this revision has no publication, so nothing was compiled for collectors. */
  published: boolean;
}

interface ArtifactBlob {
  sha256?: string;
  body?: string;
}

interface ControlsDocument {
  schema?: string;
  profile?: string;
  filesystem?: { paths?: { rule_id?: string; path?: string; effect?: string }[] };
  egress?: { rule_id?: string; address?: string; port?: number; protocol?: string; effect?: string }[];
  exec?: { rule_id?: string; effect?: string }[];
  admission?: { rule_id?: string; effect?: string }[];
  broker?: { rule_id?: string; adapter?: string; resource_id?: string; effect?: string }[];
}

function effectSentence(effect: string | undefined, subject: string): string {
  if (effect === "allow") return `Allow ${subject}`;
  if (effect === "deny") return `Deny ${subject}`;
  return effect ? `${effect} ${subject}` : subject;
}

function decodeArtifactJson(body: string): unknown {
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The artifacts route returns the publication blob, not the flat control list this screen used to assume. */
export function normalizeCompiledArtifacts(raw: unknown): CompiledArtifacts {
  const data = (raw as { data?: Record<string, unknown> } | null)?.data ?? {};
  if (Array.isArray(data.controls)) {
    return {
      canonical_hash: String(data.canonical_hash ?? ""),
      compiler_build: String(data.compiler_build ?? ""),
      controls: data.controls as CompiledControl[],
      rego_source: typeof data.rego_source === "string" ? data.rego_source : undefined,
      profile: typeof data.profile === "string" ? data.profile : undefined,
      schema: typeof data.schema === "string" ? data.schema : undefined,
      controls_sha256: typeof data.controls_sha256 === "string" ? data.controls_sha256 : undefined,
      published: data.published !== false,
    };
  }

  const blobs = (data.artifacts ?? {}) as { controls?: ArtifactBlob };
  const blob = blobs.controls;
  const controls: CompiledControl[] = [];
  let profile: string | undefined;
  let schema: string | undefined;
  const sha = blob?.sha256 ?? "";
  if (blob?.body) {
    try {
      const doc = decodeArtifactJson(blob.body) as ControlsDocument;
      profile = doc.profile;
      schema = doc.schema;
      for (const path of doc.filesystem?.paths ?? []) {
        controls.push({
          kind: "filesystem",
          name: path.path ?? "",
          rule_id: path.rule_id ?? "",
          instruction_summary: effectSentence(path.effect, "this path"),
          sha256: sha,
          status: path.effect,
        });
      }
      for (const rule of doc.egress ?? []) {
        const endpoint = [rule.address, rule.port].filter((part) => part !== undefined && part !== "").join(":");
        const name = rule.protocol ? `${endpoint}/${rule.protocol}` : endpoint;
        controls.push({
          kind: "egress",
          name,
          rule_id: rule.rule_id ?? "",
          instruction_summary: effectSentence(rule.effect, "this connection"),
          sha256: sha,
          status: rule.effect,
        });
      }
      for (const rule of doc.exec ?? []) {
        controls.push({
          kind: "exec",
          name: "exec",
          rule_id: rule.rule_id ?? "",
          instruction_summary: effectSentence(rule.effect, "execution"),
          sha256: sha,
          status: rule.effect,
        });
      }
      for (const rule of doc.admission ?? []) {
        controls.push({
          kind: "admission",
          name: "admission",
          rule_id: rule.rule_id ?? "",
          instruction_summary: effectSentence(rule.effect, "admission"),
          sha256: sha,
          status: rule.effect,
        });
      }
      for (const rule of doc.broker ?? []) {
        controls.push({
          kind: "broker",
          name: rule.adapter || rule.resource_id || "broker",
          rule_id: rule.rule_id ?? "",
          instruction_summary: effectSentence(rule.effect, "broker access"),
          sha256: sha,
          status: rule.effect,
        });
      }
    } catch {
      // A damaged artifact should leave the page up with an empty list.
    }
  }

  return {
    canonical_hash: String(data.content_hash ?? data.canonical_hash ?? ""),
    compiler_build: String(data.compiler_build ?? schema ?? ""),
    controls,
    rego_source: typeof data.rego_source === "string" ? data.rego_source : undefined,
    profile,
    schema,
    controls_sha256: sha || undefined,
    published: typeof data.publication_id === "string" && data.publication_id !== "",
  };
}

// ── Workload Policy Binding Types ────────────────────────────────────────

export interface WorkloadPolicyBinding {
  id: string;
  workspace_id: string;
  workload_id: string;
  policy_id: string;
  revision: number;
  state: string;
  delivery_cursor: number;
  created_at: string;
  updated_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a fresh Idempotency-Key for each mutation intent. */
function idempotencyKey(): string {
  return crypto.randomUUID();
}

/** Unwrap the backend's {etag, data: {...}} envelope. */
function unwrapEtag<T>(raw: { etag?: string; data: T }): T & { etag: string } {
  return { ...raw.data, etag: raw.etag ?? "" };
}

// ── RTK Query endpoints ──────────────────────────────────────────────────────

const BASE = "/api/iga/v2/runtime-policies";

export const runtimePolicyApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Reads ────────────────────────────────────────────────────────────

    listPolicies: builder.query<RuntimePolicy[], void>({
      query: () => ({ url: BASE, method: "GET" }),
      transformResponse: (raw: { data: RuntimePolicy[] }) => raw.data ?? [],
      providesTags: ["RuntimePolicy"],
    }),

    getPolicy: builder.query<PolicyWithRevisions, string>({
      query: (id) => ({ url: `${BASE}/${id}`, method: "GET" }),
      transformResponse: (raw: {
        etag: string;
        data: { policy: RuntimePolicy; revisions: PolicyRevision[] };
      }) => ({
        policy: raw.data.policy,
        revisions: raw.data.revisions ?? [],
        etag: raw.etag ?? "",
      }),
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id }],
    }),

    getSimulation: builder.query<SimulationView, string>({
      query: (sid) => ({ url: `${BASE}/simulations/${sid}`, method: "GET" }),
      providesTags: (_r, _e, sid) => [{ type: "RuntimePolicy" as const, id: `sim-${sid}` }],
    }),

    getRollout: builder.query<RolloutStatus, string>({
      query: (id) => ({ url: `${BASE}/${id}/rollouts`, method: "GET" }),
      transformResponse: (raw: { data: RolloutStatus }) => raw.data,
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `rollout-${id}` }],
    }),

    // ── Mutations ────────────────────────────────────────────────────────

    createPolicy: builder.mutation<PolicyCreateResult, CreatePolicyRequest>({
      query: (body) => ({
        url: BASE,
        method: "POST",
        body: { name: body.name, document: body.document },
        headers: { "Idempotency-Key": idempotencyKey() },
      }),
      transformResponse: (raw: { etag: string; data: Omit<PolicyCreateResult, "etag"> }) =>
        unwrapEtag(raw),
      invalidatesTags: ["RuntimePolicy"],
    }),

    putDraft: builder.mutation<DraftResult, PutDraftRequest>({
      query: ({ id, etag, document }) => ({
        url: `${BASE}/${id}/draft`,
        method: "PUT",
        body: document,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: Omit<DraftResult, "etag"> }) =>
        unwrapEtag(raw),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }, "RuntimePolicy"],
    }),

    validatePolicy: builder.mutation<ValidationResult, ValidateRequest>({
      query: ({ id, etag }) => ({
        url: `${BASE}/${id}/validate`,
        method: "POST",
        body: {},
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: Omit<ValidationResult, "etag"> }) =>
        unwrapEtag(raw),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }],
    }),

    simulatePolicy: builder.mutation<SimulationResult, SimulateRequest>({
      query: ({ id, etag, ...body }) => ({
        url: `${BASE}/${id}/simulations`,
        method: "POST",
        body,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: Omit<SimulationResult, "etag"> }) =>
        unwrapEtag(raw),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }],
    }),

    approvePolicy: builder.mutation<ApprovalResult, ApproveRequest>({
      query: ({ id, etag, ...body }) => ({
        url: `${BASE}/${id}/approvals`,
        method: "POST",
        body,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: Omit<ApprovalResult, "etag"> }) =>
        unwrapEtag(raw),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }],
    }),

    publishPolicy: builder.mutation<PublicationResult, PublishRequest>({
      query: ({ id, etag, ...body }) => ({
        url: `${BASE}/${id}/publications`,
        method: "POST",
        body,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: Omit<PublicationResult, "etag"> }) =>
        unwrapEtag(raw),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }],
    }),

    rollbackPolicy: builder.mutation<{ etag: string }, RollbackRequest>({
      query: ({ id, etag, ...body }) => ({
        url: `${BASE}/${id}/rollback`,
        method: "POST",
        body,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: unknown }) => ({ etag: raw.etag ?? "" }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }],
    }),

    revokePolicy: builder.mutation<{ etag: string }, RevokeRequest>({
      query: ({ id, etag, ...body }) => ({
        url: `${BASE}/${id}/revoke`,
        method: "POST",
        body,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          "If-Match": `"${etag}"`,
        },
      }),
      transformResponse: (raw: { etag: string; data: unknown }) => ({ etag: raw.etag ?? "" }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "RuntimePolicy", id }],
    }),

    // ── Agent & Binding Reads ──────────────────────────────────────────

    getAgentInstances: builder.query<AgentInstance[], string>({
      query: (agentId) => ({
        url: `/api/iga/v2/discovery/agents/${agentId}/instances`,
        method: "GET",
      }),
      transformResponse: (raw: { data: AgentInstance[] }) => raw.data ?? [],
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `instances-${id}` }],
    }),

    getAgentEffectivePolicy: builder.query<EffectivePolicyData, string>({
      query: (agentId) => ({
        url: `/api/iga/v2/discovery/agents/${agentId}/effective-policy`,
        method: "GET",
      }),
      transformResponse: (raw: { data: EffectivePolicyData }) => raw.data,
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `effective-${id}` }],
    }),

    getEnforcementBinding: builder.query<EnforcementBinding | null, string>({
      query: (agentId) => ({
        url: `/api/iga/v2/discovery/agents/${agentId}/enforcement-binding`,
        method: "GET",
      }),
      transformResponse: (raw: { data: EnforcementBinding | null }) => raw.data ?? null,
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `binding-${id}` }],
    }),

    updateEnforcementBinding: builder.mutation<EnforcementBinding, UpdateBindingRequest>({
      query: ({ agentId, ...body }) => ({
        url: `/api/iga/v2/discovery/agents/${agentId}/enforcement-binding/draft`,
        method: "PUT",
        body,
        headers: {
          "Idempotency-Key": idempotencyKey(),
          ...(body.etag ? { "If-Match": `"${body.etag}"` } : {}),
        },
      }),
      transformResponse: (raw: { data: EnforcementBinding }) => raw.data,
      invalidatesTags: (_r, _e, { agentId }) => [
        { type: "RuntimePolicy", id: `binding-${agentId}` },
      ],
    }),

    // ── Test Policy ────────────────────────────────────────────────────

    testPolicy: builder.mutation<TestPolicyResult, { policyId: string; input: TestPolicyInput }>({
      query: ({ policyId, input }) => ({
        url: `${BASE}/${policyId}/test`,
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": idempotencyKey() },
      }),
      transformResponse: (raw: { data: TestPolicyResult }) => raw.data,
    }),

    // ── Candidate Generation ────────────────────────────────────────────

    getCandidateJob: builder.query<CandidateJob, string>({
      query: (candidateId) => ({
        url: `${BASE}/candidates/${candidateId}`,
        method: "GET",
      }),
      transformResponse: (raw: { data: CandidateJob }) => raw.data,
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `candidate-${id}` }],
    }),

    triggerCandidateGeneration: builder.mutation<CandidateJob, { workload_ids: string[] }>({
      query: (body) => ({
        url: `${BASE}/candidates`,
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey() },
      }),
      transformResponse: (raw: { data: CandidateJob }) => raw.data,
      invalidatesTags: ["RuntimePolicy"],
    }),

    // ── Compiled Artifacts ──────────────────────────────────────────────

    getCompiledArtifacts: builder.query<CompiledArtifacts, { policyId: string; revision: number }>({
      query: ({ policyId, revision }) => ({
        url: `${BASE}/${policyId}/revisions/${revision}/artifacts`,
        method: "GET",
      }),
      transformResponse: (raw: unknown) => normalizeCompiledArtifacts(raw),
      providesTags: (_r, _e, { policyId, revision }) => [
        { type: "RuntimePolicy" as const, id: `artifacts-${policyId}-${revision}` },
      ],
    }),

    // ── Workload Policy Binding ─────────────────────────────────────────

    getWorkloadBinding: builder.query<WorkloadPolicyBinding[], string>({
      query: (workloadId) => ({
        url: `/api/iga/v2/workloads/${workloadId}/runtime-policy-binding`,
        method: "GET",
      }),
      transformResponse: (raw: { data: WorkloadPolicyBinding[] }) => raw.data ?? [],
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `wl-binding-${id}` }],
    }),

    updateWorkloadBinding: builder.mutation<
      WorkloadPolicyBinding,
      { workloadId: string; policy_id: string; revision: number }
    >({
      query: ({ workloadId, ...body }) => ({
        url: `/api/iga/v2/workloads/${workloadId}/runtime-policy-binding`,
        method: "PUT",
        body,
        headers: { "Idempotency-Key": idempotencyKey() },
      }),
      transformResponse: (raw: { data: WorkloadPolicyBinding }) => raw.data,
      invalidatesTags: (_r, _e, { workloadId }) => [
        { type: "RuntimePolicy", id: `wl-binding-${workloadId}` },
      ],
    }),

    // ── Policy Context (Batch 9 — graph → policy bridge) ──────────────

    prepareContext: builder.mutation<PolicyContextResponse, PolicyContextRequest>({
      query: (body) => ({
        url: `${BASE}/contexts`,
        method: "POST",
        body,
        headers: { "Idempotency-Key": idempotencyKey() },
      }),
      transformResponse: (raw: { data: PolicyContextResponse }) => raw.data,
    }),

    getContext: builder.query<PolicyContextResponse, string>({
      query: (contextId) => ({
        url: `${BASE}/contexts/${contextId}`,
        method: "GET",
      }),
      transformResponse: (raw: { data: PolicyContextResponse }) => raw.data,
      providesTags: (_r, _e, id) => [{ type: "RuntimePolicy" as const, id: `context-${id}` }],
    }),
  }),
});

export const {
  useListPoliciesQuery,
  useGetPolicyQuery,
  useLazyGetPolicyQuery,
  useGetSimulationQuery,
  useGetRolloutQuery,
  useCreatePolicyMutation,
  usePutDraftMutation,
  useValidatePolicyMutation,
  useSimulatePolicyMutation,
  useApprovePolicyMutation,
  usePublishPolicyMutation,
  useRollbackPolicyMutation,
  useRevokePolicyMutation,
  useGetAgentInstancesQuery,
  useGetAgentEffectivePolicyQuery,
  useGetEnforcementBindingQuery,
  useUpdateEnforcementBindingMutation,
  useTestPolicyMutation,
  useGetCandidateJobQuery,
  useTriggerCandidateGenerationMutation,
  useGetCompiledArtifactsQuery,
  useGetWorkloadBindingQuery,
  useUpdateWorkloadBindingMutation,
  usePrepareContextMutation,
  useGetContextQuery,
} = runtimePolicyApi;
