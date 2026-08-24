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
} = governanceApi;

// Shared 403/409-aware error helper for governance mutations.
export function governanceError(err: unknown, fallback: string): string {
  const status = (err as { status?: number })?.status;
  if (status === 403) return "Your role is missing the permission this action requires.";
  if (status === 409) return "This changed since you loaded it. Reload and try again.";
  const data = (err as { data?: { error?: string } })?.data;
  return data?.error ?? fallback;
}
