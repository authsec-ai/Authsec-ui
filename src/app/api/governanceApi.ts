/**
 * Governance + provisioning API — the IGA control plane's governance surface.
 *
 * Types are transcribed from the backend Go source (see the UI implementation
 * brief's appendix), not inferred. Two rules that bite if ignored:
 *
 *   - EVERY list endpoint is wrapped in an envelope ({provenance,total},
 *     {rules,total}, …). Single-object GETs and POST results are bare. We never
 *     assume a bare array — transformResponse unwraps each envelope.
 *   - Permissions are per-route and NOT all `governance:admin`. In particular
 *     `governance:certify` lets a reviewer work a campaign without policy rights.
 *     We do not gate buttons client-side (there is no permission helper); the API
 *     403s and the component surfaces it.
 */

import { baseApi } from "./baseApi";

// ── Provisioning ─────────────────────────────────────────────────────────────

export interface ProvisionRequest {
  resource_server_id: string; // REQUIRED
  role_id: string; // REQUIRED
  /** REQUIRED by the DB when is_standing. */
  justification?: string;
  purpose?: string;
  /** XOR duration — sending both is a 400. */
  expires_at?: string;
  /** Go duration, e.g. "720h". */
  duration?: string;
  is_standing?: boolean;
}

export interface ProvisionResult {
  discovered_agent_id: string;
  oauth_client_id: string;
  client_id: string;
  service_account_id: string;
  service_account_created: boolean;
  spiffe_id?: string;
  registration_id: string;
  role_binding_id: string;
  provenance_ids: string[];
  expires_at?: string;
  is_standing: boolean;
}

export interface DeprovisionRequest {
  reason: string; // REQUIRED
  via?: string;
}

export interface DeprovisionResult {
  oauth_client_id: string;
  bindings_removed: number;
  tokens_revoked: number;
  registrations_revoked: number;
  provenance_closed: number;
  service_accounts_disabled: number;
  already_deprovisioned: boolean;
  /** > 0 means something was NOT fully removed. Surface it. */
  residual_bindings: number;
}

// ── Provenance ───────────────────────────────────────────────────────────────

export interface EntitlementProvenance {
  id: string;
  workspace_id: string;
  entitlement_type: "role_binding" | "client_registration" | "secret_access";
  role_binding_id?: string;
  client_registration_id?: string;
  connector_assignment_id?: string;
  /** Survives deletion of the pointer above. */
  entitlement_snapshot: unknown;
  entitlement_label: string;
  subject_type: "user" | "service_account" | "oauth_client" | "group";
  subject_id: string;
  subject_label: string;
  /** e.g. birthright | request | provisioning | manual */
  origin: string;
  justification: string;
  purpose: string;
  access_request_id?: string;
  discovered_agent_id?: string;
  granted_by?: string;
  granted_by_label: string;
  granted_at: string;
  expires_at?: string;
  /** Never expires — the audited exception. */
  is_standing: boolean;
  revoked_at?: string;
  revoked_by?: string;
  revoked_reason: string;
  revoked_via: string;
  created_at: string;
  updated_at: string;
  /** Expired; the row survives as the audit record. */
  lapsed: boolean;
}

export interface ProvenanceFilters {
  subject_type?: string;
  subject_id?: string;
  entitlement_type?: string;
  origin?: string;
  standing?: boolean;
  lapsed?: boolean;
  discovered_agent_id?: string;
  limit?: number;
  offset?: number;
}

// ── Separation of duties ─────────────────────────────────────────────────────

export interface SoDRule {
  id: string;
  workspace_id?: string;
  name: string;
  description: string;
  kind: "conflict" | "prohibition";
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  /** Built in — no delete. */
  is_system: boolean;
  subject_scope: "any" | "agents" | "humans";
  left_label: string;
  left_roles: string[];
  left_permissions: string[];
  right_label: string;
  right_roles: string[];
  right_permissions: string[];
  enforcement: "preventive" | "detective";
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SoDViolation {
  id: string;
  workspace_id: string;
  rule_id: string;
  rule_name: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  left_evidence: unknown;
  right_evidence: unknown;
  status: "open" | "accepted" | "remediated";
  resolution_note: string;
  resolved_by?: string;
  resolved_at?: string;
  detected_at: string;
  last_seen_at: string;
  detected_via: string;
}

export interface SoDHit {
  rule_id: string;
  rule_name: string;
  kind: string;
  severity: string;
  left_hits: string[];
  right_hits?: string[];
  /** Written for a human deciding what to do — render it, don't truncate. */
  explanation: string;
}

export interface SoDDecision {
  allowed: boolean;
  blocking?: SoDHit[];
  warnings?: SoDHit[];
}

export interface SoDSimulateRequest {
  subject_type?: string;
  subject_id?: string;
  add_roles?: string[];
  add_permissions?: string[];
}

export interface SoDScanResult {
  subjects_scanned: number;
  rules_evaluated: number;
  violations_open: number;
  violations_new: number;
  violations_cleared: number;
}

// ── Certification ────────────────────────────────────────────────────────────

export interface CampaignScope {
  /** nullable on the wire: explicit false ≠ absent. */
  standing_only?: boolean;
  entitlement_types?: string[];
  subject_types?: string[];
  origins?: string[];
  resource_server_ids?: string[];
  /** subject issued no token in N days */
  dormant_days?: number;
  agents_only?: boolean;
}

export interface CreateCampaignRequest {
  name: string; // REQUIRED
  description?: string;
  scope?: CampaignScope;
  due_at?: string;
  due_in?: string;
}

export interface CertificationCampaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  scope: unknown;
  status: "draft" | "active" | "closed";
  due_at?: string;
  /** Frozen at close, for the auditor. */
  export?: unknown;
  generated_at?: string;
  closed_at?: string;
  closed_by?: string;
  items_total: number;
  items_decided: number;
  items_kept: number;
  items_revoked: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** computed */
  overdue: boolean;
}

export interface CertificationItem {
  id: string;
  campaign_id: string;
  workspace_id: string;
  entitlement_provenance_id?: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  entitlement_label: string;
  entitlement_type: string;
  /** ← the review evidence. Render it. */
  snapshot: unknown;
  evidence: unknown;
  reviewer_user_id?: string;
  reviewer_label: string;
  reviewer_source: string;
  decision: "pending" | "keep" | "revoke" | "delegate";
  decision_note: string;
  decided_by?: string;
  decided_at?: string;
  revocation_executed_at?: string;
  created_at: string;
}

export interface DecideItemRequest {
  /** REQUIRED; "pending" is not a choice. */
  decision: "keep" | "revoke" | "delegate";
  note?: string;
  /** required when decision=delegate */
  delegate_to?: string;
}

export interface CloseCampaignRequest {
  /** close with items still pending */
  force?: boolean;
}

export interface ItemFilters {
  pending?: boolean;
  mine?: boolean;
  limit?: number;
  offset?: number;
}

// ── Actuation ────────────────────────────────────────────────────────────────

export interface ActuationTokenResult {
  /** SHOWN ONCE, stored hashed. */
  actuation_token: string;
  note: string;
}

export interface ProvisioningInstruction {
  id: string;
  workspace_id: string;
  discovery_source_id: string;
  kind: "quarantine" | "unquarantine" | "verify_uptake";
  payload: unknown;
  discovered_agent_id?: string;
  fingerprint: string;
  idempotency_key: string;
  /**
   * 'superseded' = overtaken by a newer contradicting decision before it applied
   * (a quarantine released before the cluster agent polled). Render it as
   * history, not a failure — nothing went wrong.
   */
  status: "pending" | "leased" | "applied" | "failed" | "superseded";
  attempts: number;
  lease_expires_at?: string;
  leased_by: string;
  applied_at?: string;
  result?: unknown;
  /** non-empty + failed = a decision did NOT take effect. */
  error: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Birthrights + lifecycle (JML) ────────────────────────────────────────────

export interface CreateBirthrightRequest {
  name: string; // REQUIRED
  description?: string;
  /** "all" = the ENTIRE workspace. Confirm it. */
  match_kind?: "group" | "all";
  /** required iff match_kind="group" */
  match_group_id?: string;
  resource_server_id: string; // REQUIRED
  role_id: string; // REQUIRED
  /** empty = STANDING → justification required */
  duration?: string;
  justification?: string;
  /** default "flag". revoke is opt-in. */
  on_unmatch?: "flag" | "revoke";
}

export interface BirthrightPolicy {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  match_kind: string;
  match_group_id?: string;
  resource_server_id: string;
  role_id: string;
  /** Postgres interval, serialised. */
  duration?: string;
  justification: string;
  on_unmatch: "flag" | "revoke";
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReconcileResult {
  dry_run: boolean;
  users_scanned: number;
  policies_active: number;
  grants_created: number;
  stale_flagged: number;
  stale_revoked: number;
  leavers_processed: number;
  bindings_revoked: number;
  tokens_revoked: number;
  orphaned_agents: number;
  errors?: string[];
}

export interface StaleBirthright {
  provenance_id: string;
  user_id: string;
  user_label: string;
  entitlement_label: string;
  granted_at: string;
  reason: string;
}

export interface OrphanedAgent {
  discovered_agent_id?: string;
  oauth_client_id: string;
  client_id: string;
  display_name: string;
  owner_user_id: string;
  owner_email: string;
  runtime_status?: string;
  governance_status: "ungoverned" | "active" | "suspended" | "deprovisioned";
}

// ── Envelope helpers ─────────────────────────────────────────────────────────

function unwrap<T>(key: string) {
  return (r: Record<string, unknown>): { items: T[]; total: number } => ({
    items: (r?.[key] as T[]) ?? [],
    total: (r?.total as number) ?? 0,
  });
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

// ── Agent policies + enforcement ─────────────────────────────────────────────
//
// A policy is a STANDING instruction, not a button: a reconciler runs every five
// minutes, compares what every policy implies against what is true, and closes
// the gap. So the UI authors intent and reads consequences; it never triggers an
// action directly.

export interface AgentPolicySelector {
  cluster?: string;
  namespace?: string;
  labels?: Record<string, string>;
  archetype?: string;
  deployment_origin?: string;
  framework?: string;
}

export interface AgentPolicy {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  /** XOR selector — exactly one is set. */
  discovered_agent_id?: string;
  selector?: AgentPolicySelector;
  /** Entitlement arm: a CEILING, never a grant. Can only ever narrow. */
  scope_ceiling?: string[];
  role_ceiling_id?: string;
  /** Cluster arm. */
  desired_state: "active" | "quarantined";
  /** XOR expires_at. Go duration, e.g. "720h". */
  duration?: string;
  expires_at?: string;
  on_expiry: "revoke" | "quarantine" | "evict";
  reason: string;
  confirmed_by?: string;
  confirmed_at?: string;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Computed: duration resolved against created_at, or expires_at. */
  effective_expiry?: string;
  destructive: boolean;
  matched_agents?: number;
}

export interface CreateAgentPolicyRequest {
  name: string;
  description?: string;
  /** Exactly one of these two. */
  discovered_agent_id?: string;
  selector?: AgentPolicySelector;
  scope_ceiling?: string[];
  role_ceiling_id?: string;
  desired_state?: "active" | "quarantined";
  /** XOR expires_at. */
  duration?: string;
  expires_at?: string;
  on_expiry?: "revoke" | "quarantine" | "evict";
  /** Both REQUIRED when on_expiry is "evict". */
  reason?: string;
  /**
   * The expansion the operator actually saw. A destructive expiry is authorised
   * against THESE agents, so an agent that starts matching the selector later is
   * refused rather than deleted under an older confirmation.
   */
  confirm_agent_ids?: string[];
}

/** What all matching policies add up to for one agent. */
export interface EffectivePolicy {
  agent_id: string;
  desired_state: "active" | "quarantined";
  scope_ceiling?: string[];
  role_ceiling_id?: string;
  /** Set when two policies name incomparable role ceilings; NOTHING is applied. */
  ambiguous?: string;
  policy_ids: string[];
}

/** One scheduled action, from the lookahead. */
export interface UpcomingAction {
  policy_id: string;
  policy_name: string;
  discovered_agent_id: string;
  agent_label: string;
  action: "revoke" | "quarantine" | "evict";
  destructive: boolean;
  at: string;
  reason: string;
  /** false ⇒ this will be REFUSED, not carried out. */
  confirmed: boolean;
  /** true ⇒ deletion will not stick; a reconciler recreates the workload. */
  gitops_managed: boolean;
  author_active: boolean;
  created_by: string;
}

export interface PolicyWarning {
  id: string;
  workspace_id: string;
  policy_id: string;
  discovered_agent_id: string;
  deadline: string;
  on_expiry: string;
  channel: "email" | "webhook";
  recipient: string;
  recipient_role: string;
  available_at: string;
  state: "pending" | "sent" | "failed" | "dead";
  attempt_count: number;
  last_error: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EnforcementPlanRow {
  id: string;
  workspace_id: string;
  discovery_source_id: string;
  version: number;
  plan: unknown;
  content_hash: string;
  generated_at: string;
  created_at: string;
}

/**
 * The enforcement gap, stated rather than left for the UI to subtract:
 * "decided at v43, enforcing v42".
 */
export interface EnforcementPlansResult {
  plans: EnforcementPlanRow[];
  published_version: number;
  enforcement_mode: string;
  enforced_plan_version?: number | null;
  enforced_plan_at?: string | null;
  enforcement_denials_total: number;
  behind: boolean;
}

export interface NotificationSettings {
  workspace_id: string;
  warning_lead_seconds: number;
  webhook_url: string;
  /** Never the secret itself — only whether one is set. */
  webhook_secret_set: boolean;
  email_enabled: boolean;
}

export interface PolicyReconcileResult {
  dry_run: boolean;
  policies_active: number;
  agents_covered: number;
  would_narrow: number;
  would_quarantine: number;
  would_release: number;
  would_revoke: number;
  would_evict: number;
  refused: number;
  bindings_narrowed: number;
  grants_lapsed: number;
  errors?: string[];
}

export interface ForceEvictResult {
  instruction_id: string;
  blocked_pods: string[];
  queued: boolean;
}

// ── The slice ────────────────────────────────────────────────────────────────

export const governanceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Provisioning ────────────────────────────────────────────────────────
    provisionAgent: builder.mutation<ProvisionResult, { id: string; body: ProvisionRequest }>({
      query: ({ id, body }) => ({
        url: `/authsec/provisioning/agents/${id}/provision`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "DiscoveredAgent", id },
        "DiscoveredAgent",
        "Provenance",
        "AgentCoverage",
      ],
    }),
    deprovisionAgent: builder.mutation<
      DeprovisionResult,
      { id: string; body: DeprovisionRequest }
    >({
      query: ({ id, body }) => ({
        url: `/authsec/provisioning/agents/${id}/deprovision`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "DiscoveredAgent", id },
        "DiscoveredAgent",
        "Provenance",
        "AgentCoverage",
        "OrphanedAgent",
      ],
    }),

    // ── Provenance ──────────────────────────────────────────────────────────
    listProvenance: builder.query<ListResult<EntitlementProvenance>, ProvenanceFilters | void>({
      query: (f) => ({
        url: "/authsec/governance/provenance",
        method: "GET",
        params: {
          ...(f?.subject_type ? { subject_type: f.subject_type } : {}),
          ...(f?.subject_id ? { subject_id: f.subject_id } : {}),
          ...(f?.entitlement_type ? { entitlement_type: f.entitlement_type } : {}),
          ...(f?.origin ? { origin: f.origin } : {}),
          ...(f?.standing != null ? { standing: String(f.standing) } : {}),
          ...(f?.lapsed != null ? { lapsed: String(f.lapsed) } : {}),
          ...(f?.discovered_agent_id ? { discovered_agent_id: f.discovered_agent_id } : {}),
          ...(f?.limit ? { limit: f.limit } : {}),
          ...(f?.offset ? { offset: f.offset } : {}),
        },
      }),
      transformResponse: unwrap<EntitlementProvenance>("provenance"),
      providesTags: ["Provenance"],
    }),
    getProvenance: builder.query<EntitlementProvenance, string>({
      query: (id) => ({ url: `/authsec/governance/provenance/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "Provenance", id }],
    }),

    // ── Separation of duties ──────────────────────────────────────────────────
    listSoDRules: builder.query<ListResult<SoDRule>, void>({
      query: () => ({ url: "/authsec/governance/sod/rules", method: "GET" }),
      transformResponse: unwrap<SoDRule>("rules"),
      providesTags: ["SoDRule"],
    }),
    listSoDViolations: builder.query<ListResult<SoDViolation>, { open?: boolean } | void>({
      query: (f) => ({
        url: "/authsec/governance/sod/violations",
        method: "GET",
        params: f?.open ? { open: "true" } : undefined,
      }),
      transformResponse: unwrap<SoDViolation>("violations"),
      providesTags: ["SoDViolation"],
    }),
    simulateSoD: builder.mutation<SoDDecision, SoDSimulateRequest>({
      query: (body) => ({ url: "/authsec/governance/sod/simulate", method: "POST", body }),
    }),
    resolveSoDViolation: builder.mutation<
      SoDViolation,
      { id: string; resolution: "accepted" | "remediated"; note: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/authsec/governance/sod/violations/${id}/resolve`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["SoDViolation"],
    }),
    scanSoD: builder.mutation<SoDScanResult, void>({
      query: () => ({ url: "/authsec/governance/sod/scan", method: "POST" }),
      invalidatesTags: ["SoDViolation"],
    }),

    // ── Certification ─────────────────────────────────────────────────────────
    createCampaign: builder.mutation<CertificationCampaign, CreateCampaignRequest>({
      query: (body) => ({ url: "/authsec/governance/campaigns", method: "POST", body }),
      invalidatesTags: ["CertificationCampaign"],
    }),
    listCampaigns: builder.query<ListResult<CertificationCampaign>, void>({
      query: () => ({ url: "/authsec/governance/campaigns", method: "GET" }),
      transformResponse: unwrap<CertificationCampaign>("campaigns"),
      providesTags: ["CertificationCampaign"],
    }),
    getCampaign: builder.query<CertificationCampaign, string>({
      query: (id) => ({ url: `/authsec/governance/campaigns/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "CertificationCampaign", id }],
    }),
    generateCampaign: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/authsec/governance/campaigns/${id}/generate`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "CertificationCampaign", id },
        "CertificationCampaign",
        "CertificationItem",
      ],
    }),
    listCampaignItems: builder.query<
      ListResult<CertificationItem>,
      { id: string; filters?: ItemFilters }
    >({
      query: ({ id, filters }) => ({
        url: `/authsec/governance/campaigns/${id}/items`,
        method: "GET",
        params: {
          ...(filters?.pending ? { pending: "true" } : {}),
          ...(filters?.mine ? { mine: "true" } : {}),
          ...(filters?.limit ? { limit: filters.limit } : {}),
          ...(filters?.offset ? { offset: filters.offset } : {}),
        },
      }),
      transformResponse: unwrap<CertificationItem>("items"),
      providesTags: ["CertificationItem"],
    }),
    decideItem: builder.mutation<
      CertificationItem,
      { campaignId: string; itemId: string; body: DecideItemRequest }
    >({
      query: ({ campaignId, itemId, body }) => ({
        url: `/authsec/governance/campaigns/${campaignId}/items/${itemId}/decide`,
        method: "POST",
        body,
      }),
      // The progress counters live on the campaign, so invalidate both.
      invalidatesTags: (_r, _e, { campaignId }) => [
        "CertificationItem",
        { type: "CertificationCampaign", id: campaignId },
        "CertificationCampaign",
      ],
    }),
    closeCampaign: builder.mutation<
      CertificationCampaign,
      { id: string; body: CloseCampaignRequest }
    >({
      query: ({ id, body }) => ({
        url: `/authsec/governance/campaigns/${id}/close`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "CertificationCampaign", id },
        "CertificationCampaign",
      ],
    }),

    // ── Actuation ─────────────────────────────────────────────────────────────
    mintActuationToken: builder.mutation<ActuationTokenResult, { connectorId: string; note?: string }>({
      query: ({ connectorId, note }) => ({
        url: `/authsec/governance/connectors/${connectorId}/actuation`,
        method: "POST",
        body: note ? { note } : {},
      }),
      invalidatesTags: ["DiscoverySource"],
    }),
    listInstructions: builder.query<ListResult<ProvisioningInstruction>, { open?: boolean } | void>({
      query: (f) => ({
        url: "/authsec/governance/instructions",
        method: "GET",
        params: f?.open ? { open: "true" } : undefined,
      }),
      transformResponse: unwrap<ProvisioningInstruction>("instructions"),
      providesTags: ["ProvisioningInstruction"],
    }),

    // ── Agent policies + enforcement ──────────────────────────────────────────
    listAgentPolicies: builder.query<ListResult<AgentPolicy>, { enabled?: boolean } | void>({
      query: (f) => ({
        url: "/authsec/governance/agent-policies",
        method: "GET",
        params: f?.enabled ? { enabled: "true" } : undefined,
      }),
      transformResponse: unwrap<AgentPolicy>("policies"),
      providesTags: ["AgentPolicy"],
    }),
    getAgentPolicy: builder.query<
      { policy: AgentPolicy; expands_to: unknown[] },
      string
    >({
      query: (id) => ({ url: `/authsec/governance/agent-policies/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "AgentPolicy", id }],
    }),
    createAgentPolicy: builder.mutation<AgentPolicy, CreateAgentPolicyRequest>({
      query: (body) => ({ url: "/authsec/governance/agent-policies", method: "POST", body }),
      // A policy changes what the next sweep will do, so the lookahead and the
      // warning schedule are both stale the moment it lands. Invalidating only
      // the list would leave the console showing a future that no longer exists.
      invalidatesTags: ["AgentPolicy", "UpcomingAction", "PolicyWarning"],
    }),
    deleteAgentPolicy: builder.mutation<{ deleted: boolean; note: string }, string>({
      query: (id) => ({ url: `/authsec/governance/agent-policies/${id}`, method: "DELETE" }),
      // Deleting a policy does NOT undo what it already did — those stay in
      // agent_policy_actions. It only stops future sweeps acting on it.
      invalidatesTags: ["AgentPolicy", "UpcomingAction", "PolicyWarning"],
    }),
    reconcileAgentPolicies: builder.mutation<PolicyReconcileResult, { dryRun: boolean }>({
      query: ({ dryRun }) => ({
        url: "/authsec/governance/agent-policies/reconcile",
        method: "POST",
        params: dryRun ? undefined : { dry_run: "false" },
      }),
      // A live run contains agents and queues cluster work; a dry run changes
      // nothing, but both are cheap to refetch and getting this wrong would show
      // a stale inventory next to a fresh result.
      invalidatesTags: (_r, _e, { dryRun }) =>
        dryRun
          ? []
          : [
              "AgentPolicy",
              "UpcomingAction",
              "DiscoveredAgent",
              "ProvisioningInstruction",
              "Provenance",
            ],
    }),
    listUpcomingActions: builder.query<
      { items: UpcomingAction[]; total: number; destructive: number },
      { days?: number } | void
    >({
      query: (f) => ({
        url: "/authsec/governance/policies/upcoming",
        method: "GET",
        params: f?.days ? { days: String(f.days) } : undefined,
      }),
      transformResponse: (r: Record<string, unknown>) => ({
        items: (r?.upcoming as UpcomingAction[]) ?? [],
        total: (r?.total as number) ?? 0,
        destructive: (r?.destructive as number) ?? 0,
      }),
      providesTags: ["UpcomingAction"],
    }),
    listPolicyWarnings: builder.query<
      { items: PolicyWarning[]; undelivered: number },
      { policyId?: string; limit?: number } | void
    >({
      query: (f) => ({
        url: "/authsec/governance/policy-warnings",
        method: "GET",
        params: {
          ...(f?.policyId ? { policy_id: f.policyId } : {}),
          ...(f?.limit ? { limit: String(f.limit) } : {}),
        },
      }),
      transformResponse: (r: Record<string, unknown>) => ({
        items: (r?.warnings as PolicyWarning[]) ?? [],
        undelivered: (r?.undelivered as number) ?? 0,
      }),
      providesTags: ["PolicyWarning"],
    }),
    runPolicyWarnings: builder.mutation<
      { scheduled: number; attempted: number; sent: number; failed: number; dead: number; errors?: string[] },
      void
    >({
      query: () => ({ url: "/authsec/governance/policy-warnings/run", method: "POST" }),
      invalidatesTags: ["PolicyWarning"],
    }),
    getNotificationSettings: builder.query<NotificationSettings, void>({
      query: () => ({ url: "/authsec/governance/notification-settings", method: "GET" }),
      providesTags: ["NotificationSettings"],
    }),
    updateNotificationSettings: builder.mutation<
      NotificationSettings,
      { warning_lead?: string; webhook_url?: string; webhook_secret?: string; email_enabled?: boolean }
    >({
      query: (body) => ({
        url: "/authsec/governance/notification-settings",
        method: "PUT",
        body,
      }),
      // The lead time decides WHEN warnings are scheduled, so changing it
      // reschedules them.
      invalidatesTags: ["NotificationSettings", "PolicyWarning"],
    }),
    listEnforcementPlans: builder.query<EnforcementPlansResult, { connectorId: string; limit?: number }>({
      query: ({ connectorId, limit }) => ({
        url: `/authsec/governance/connectors/${connectorId}/enforcement-plans`,
        method: "GET",
        params: limit ? { limit: String(limit) } : undefined,
      }),
      providesTags: (_r, _e, { connectorId }) => [{ type: "EnforcementPlan", id: connectorId }],
    }),
    forceEvictAgent: builder.mutation<ForceEvictResult, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/authsec/governance/agents/${id}/force-evict`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "DiscoveredAgent", id },
        "ProvisioningInstruction",
      ],
    }),

    // ── Birthrights + JML ─────────────────────────────────────────────────────
    createBirthright: builder.mutation<BirthrightPolicy, CreateBirthrightRequest>({
      query: (body) => ({ url: "/authsec/governance/birthrights", method: "POST", body }),
      invalidatesTags: ["BirthrightPolicy"],
    }),
    listBirthrights: builder.query<ListResult<BirthrightPolicy>, void>({
      query: () => ({ url: "/authsec/governance/birthrights", method: "GET" }),
      transformResponse: unwrap<BirthrightPolicy>("birthrights"),
      providesTags: ["BirthrightPolicy"],
    }),
    deleteBirthright: builder.mutation<{ deleted: boolean; note: string }, string>({
      query: (id) => ({ url: `/authsec/governance/birthrights/${id}`, method: "DELETE" }),
      // Delete does NOT revoke existing grants — they surface in /jml/stale.
      invalidatesTags: ["BirthrightPolicy", "StaleBirthright"],
    }),
    reconcileJml: builder.mutation<ReconcileResult, { dryRun: boolean }>({
      query: ({ dryRun }) => ({
        url: "/authsec/governance/jml/reconcile",
        method: "POST",
        params: { dry_run: String(dryRun) },
      }),
      // A real (non-dry) run moves a lot of state.
      invalidatesTags: (_r, _e, { dryRun }) =>
        dryRun
          ? []
          : ["StaleBirthright", "OrphanedAgent", "Provenance", "AgentCoverage", "DiscoveredAgent"],
    }),
    listStaleBirthrights: builder.query<ListResult<StaleBirthright>, void>({
      query: () => ({ url: "/authsec/governance/jml/stale", method: "GET" }),
      transformResponse: unwrap<StaleBirthright>("stale"),
      providesTags: ["StaleBirthright"],
    }),
    listOrphanedAgents: builder.query<ListResult<OrphanedAgent>, void>({
      query: () => ({ url: "/authsec/governance/jml/orphans", method: "GET" }),
      transformResponse: unwrap<OrphanedAgent>("orphaned_agents"),
      providesTags: ["OrphanedAgent"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useProvisionAgentMutation,
  useDeprovisionAgentMutation,
  useListProvenanceQuery,
  useGetProvenanceQuery,
  useListSoDRulesQuery,
  useListSoDViolationsQuery,
  useSimulateSoDMutation,
  useResolveSoDViolationMutation,
  useScanSoDMutation,
  useCreateCampaignMutation,
  useListCampaignsQuery,
  useGetCampaignQuery,
  useGenerateCampaignMutation,
  useListCampaignItemsQuery,
  useDecideItemMutation,
  useCloseCampaignMutation,
  useMintActuationTokenMutation,
  useListInstructionsQuery,
  useCreateBirthrightMutation,
  useListBirthrightsQuery,
  useDeleteBirthrightMutation,
  useReconcileJmlMutation,
  useListStaleBirthrightsQuery,
  useListOrphanedAgentsQuery,
  useListAgentPoliciesQuery,
  useGetAgentPolicyQuery,
  useCreateAgentPolicyMutation,
  useDeleteAgentPolicyMutation,
  useReconcileAgentPoliciesMutation,
  useListUpcomingActionsQuery,
  useListPolicyWarningsQuery,
  useRunPolicyWarningsMutation,
  useGetNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
  useListEnforcementPlansQuery,
  useForceEvictAgentMutation,
} = governanceApi;

// Shared 403/409-aware error helper for governance mutations.
export function governanceError(err: unknown, fallback: string): string {
  const status = (err as { status?: number })?.status;
  if (status === 403) return "Your role is missing the permission this action requires.";
  if (status === 409) return "This changed since you loaded it. Reload and try again.";
  const data = (err as { data?: { error?: string } })?.data;
  return data?.error ?? fallback;
}
