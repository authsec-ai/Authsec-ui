/**
 * Cloud Discovery API — wired to the real backend on
 * `/authsec/discovery/{aws,gcp}/*`.
 *
 * Types mirror `models/cloud_discovery.go` exactly (verified against the
 * working backend, not the older planning docs — see the investigation
 * report for the specific discrepancies that were corrected).
 *
 * Live today: AWS onboarding + full discovery (scan, identities, secrets,
 * assume-edges, permissions, resources — verified directly against
 * `controllers/platform/cloud_aws_controller.go`). GCP onboarding only — GCP
 * has no scan/identities/secrets/permissions/resources endpoints yet. Do not
 * add GCP discovery endpoints here until the backend ships them; a page
 * reading from a GCP discovery endpoint that doesn't exist is exactly the
 * "invented API" mistake the investigation flagged.
 *
 * `DiscoverySourceKind` in discoveryApi.ts already has "aws"/"gcp" stub
 * values — those belong to the unrelated `discovery_sources` (agent
 * inventory channel) model and must not be reused here.
 */

import { baseApi } from "./baseApi";

// ── Shared types (mirror models/cloud_discovery.go) ─────────────────────────

export type CloudProvider = "aws" | "gcp" | "azure";

/** The connector's own lifecycle. Exactly these three values — no "partial",
 * no "pending", no "connecting". A scan's completeness is a separate concept
 * (`ScanCoverage.status` below), not a connector status. */
export type CloudConnectorStatus = "active" | "error" | "revoked";

export type CloudScopeKind = "account" | "project" | "folder" | "org" | "subscription";

/** `unknown` is the state every surface starts in, before anything has scanned
 * it — GCP onboarding pre-creates the full surface list rather than leaving
 * coverage empty. It must never render as zero or as "clean": a surface nobody
 * has looked at and a surface that was scanned and found empty are different
 * answers.
 *
 * `constrained` is a read refused BY DESIGN — a VPC Service Controls perimeter
 * or an organization policy. Distinct from `denied`, which is a missing grant:
 * the remedy for one is a role, for the other a policy change by whoever owns
 * it, so telling the customer the wrong one wastes their time. */
export type CloudCoverageState =
  | "reached"
  | "denied"
  | "throttled"
  | "not_configured"
  | "unknown"
  | "constrained"
  | "stale";

export interface CloudCoverageSurface {
  state: CloudCoverageState;
  /** A floor, not a total, whenever state !== "reached". */
  count: number;
  error?: string;
}

/** `cloud_connector.coverage` jsonb. Empty object `{}` means "never scanned" —
 * true for every GCP connector today (GCP has no scan endpoint at all), and
 * true for an AWS connector until its first `POST /connectors/:id/scan`. */
export interface ScanCoverage {
  generation?: number;
  status?: "running" | "complete" | "partial" | "failed";
  started_at?: string;
  finished_at?: string;
  surfaces?: Record<string, CloudCoverageSurface>;
  error?: string;
}

export interface AWSConnectorAttrs {
  display_name?: string;
  role_arn: string;
  partition?: string;
  regions: string[];
  caller_arn?: string;
  template_version?: string;
}

export interface GCPConnectorAttrs {
  display_name?: string;
  auth_method?: "wif" | "json_key";
  reader_project_id?: string;
  reader_sa_email?: string;
  wif_provider_resource?: string;
  wif_subject?: string;
  pool_id?: string;
  provider_id?: string;
  cai_quota_project?: string;
  /** e.g. "candidate_pending_GCP-01" — surface this honestly, never as "confirmed". */
  role_set_status?: string;
  setup_script_version?: string;
  /** Additive provenance only (models.GCPConnectorAttrs) — a connector with
   * provisioned_via: "google_oauth" is still an ordinary auth_method: "wif"
   * connector underneath; this never changes how it's displayed or used,
   * only where it explains itself came from. provisioned_by is the AuthSec
   * actor who triggered it, never a Google account identity. */
  provisioned_via?: "google_oauth";
  provisioned_by?: string;

  // ── What the live permission probe found (refreshed on every verify) ──────

  /** Which of the three onboarding routes created this connector. Derived and
   * stored at onboarding, not inferred here: they differ in what they could
   * configure, and therefore in what a shortfall means. */
  onboarding_path?: "oauth_default" | "manual_wif" | "manual_key";

  /** Per-surface result of the last probe. Absent means never probed — which
   * is NOT the same as "reaches nothing". */
  capability_profile?: Record<string, GCPSurfaceCapability>;

  /** Every permission the reader was proved to hold, across all surfaces. */
  probed_permissions?: string[];

  /** Must be empty. Anything here means the reader holds a permission that can
   * change customer state — a finding, not a configuration detail. */
  write_permissions_held?: string[];

  /** Per-API enablement, keyed by API host name. "unknown" is a real value:
   * a reader without serviceusage.services.list cannot tell, and showing that
   * as "off" would be inventing a fact. */
  api_enablement?: Record<string, "enabled" | "not_enabled" | "unknown">;

  /** Whether this onboarding route could ENABLE a missing API or only report
   * it. Manual federation holds no credential that can write. */
  api_enablement_repaired?: boolean;

  /** Whether the reader can walk the tree below the top scope, and by which
   * route. Load-bearing for an org or folder connector. */
  scope_enumeration?: GCPScopeEnumeration;

  /** Permanent boundaries on this connector, not transient failures. */
  capability_limits?: GCPCapabilityLimit[];

  /** A stable hand-bumped label for the granted role set, e.g.
   * "gcp-reader-p1-v2". Distinct from role_set_status (confidence) and
   * setup_script_version (the script): this is the one that answers "which
   * roles does this connector actually hold". */
  role_set_version?: string;

  probed_at?: string;

  /** Whether discovery can scan this connector, derived from everything above.
   * Read this rather than re-deriving it, or the console and the scheduler
   * will eventually disagree about the same connector. */
  discovery_readiness?: "ready" | "partial" | "blocked";

  /** What pushed readiness below "ready". Empty when ready. Without these the
   * verdict is an assertion with no argument, and nobody can act on it. */
  discovery_readiness_reasons?: string[];

  /** Customer-declared context no GCP API reports, captured at onboarding. */
  hints?: GCPOnboardingHints;
}

/** One surface's probe result.
 *
 * `can` and `unknown` are separate on purpose. `can: false` means the probe ran
 * and the reader provably lacks a permission; `unknown: true` means the probe
 * could not answer at all. Rendering the second as the first would turn "we
 * could not check" into "there is nothing there". */
export interface GCPSurfaceCapability {
  can: boolean;
  missing?: string[];
  unknown?: boolean;
  /** Short sanitized code, e.g. "permission_check_denied",
   * "vpc_service_controls". Never a provider message. */
  reason?: string;
}

export interface GCPScopeEnumeration {
  via: "none" | "rm_list" | "cai_search" | "both";
  rm_list: boolean;
  cai_search: boolean;
  /** Neither route could be CHECKED. `via` reads "none", but that means "we do
   * not know", not "there is no way in". */
  unknown?: boolean;
}

export type GCPCapabilityLimit =
  | "oauth_project_scope_only"
  | "keyed_credential"
  | "quota_project_unusable";

export interface GCPOnboardingHints {
  environment?: string;
  environment_labels?: string[];
  naming_convention?: string;
  owning_team?: string;
  owner_contact?: string;
}

export interface CloudConnector {
  id: string;
  workspace_id: string;
  provider: CloudProvider;
  scope_kind: CloudScopeKind;
  scope_id: string;
  parent_scope_id?: string | null;
  status: CloudConnectorStatus;
  scan_generation: number;
  coverage: ScanCoverage;
  attrs: AWSConnectorAttrs | GCPConnectorAttrs | Record<string, unknown>;
  verified_at?: string | null;
  last_error?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ConnectorListEnvelope {
  data: CloudConnector[];
  meta?: { as_of?: string; count?: number };
}

interface ConnectorEnvelope {
  success: boolean;
  message: string;
  data: CloudConnector;
  meta?: { as_of?: string; verified?: string | null; note?: string };
}

// ── AWS onboarding + IAM discovery ───────────────────────────────────────────

/** One additional read granted beyond the SecurityAudit baseline, or one hard
 * deny — `internal/awsdiscovery.Permission`'s wire shape. `surface` is the
 * discovery surface it serves (e.g. "iam", "bedrock-agentcore"), not a cloud
 * region. */
export interface AWSPermission {
  actions: string[];
  surface: string;
  why: string;
  /** MAY already be covered by the baseline SecurityAudit policy — surfaced,
   * not hidden, per the plan: "an over-grant a customer cannot see is worse
   * than one they can question." Never render this as an error. */
  possibly_redundant_with_baseline?: boolean;
}

/** GET /aws/onboarding's `data`, present only when `configured: true`. The
 * `external_id` here is MINTED PER CALL and never re-derivable — the caller
 * must hold onto the exact value shown and post it back unchanged. Re-fetching
 * this endpoint mid-flow silently mints a different one. */
export interface AWSOnboardingPackage {
  external_id: string;
  authsec_principal_arn: string;
  template_format: string;
  template_version: string;
  /** The CloudFormation template body (YAML), embedded verbatim. */
  template: string;
  stack_parameters: { AuthSecPrincipalArn: string; ExternalId: string };
  baseline_managed_policy: string;
  additional_permissions: AWSPermission[];
  hard_denies: AWSPermission[];
}

interface AWSOnboardingEnvelope {
  configured: boolean;
  /** Set only when `configured: false` — this AuthSec deployment has no AWS
   * discovery principal configured. An AuthSec deployment problem, never the
   * customer's — see mapAWSOnboardingError's `fault: "authsec"` sibling case. */
  error?: string;
  data?: AWSOnboardingPackage;
  meta?: { as_of?: string; next?: string; note?: string; read_only?: string };
}

export interface AWSCreateConnectorRequest {
  role_arn: string;
  external_id: string;
  regions: string[];
  display_name?: string;
}

interface ScanTriggerEnvelope {
  success: boolean;
  message: string;
  meta?: { as_of?: string; poll?: string; note?: string; writes?: string[] };
}

// ── AWS IAM identity discovery (ticket [1]/[2] evidence) ────────────────────

export type CloudIdentityKind = "iam_role" | "iam_user";

/** `models.AWSIdentityAttrs`'s wire shape — `CloudIdentity.attrs` for AWS. */
export interface AWSIdentityAttrs {
  unique_id?: string;
  path?: string;
  description?: string;
  max_session_duration?: number;
  tags?: Record<string, string>;
  has_trust_policy?: boolean;
}

/** A candidate identity — an IAM role or user. NOT an agent: nothing here
 * asserts that anything is an AI agent, that is a separate, later
 * classification step the AWS plan calls out explicitly. */
export interface CloudIdentity {
  id: string;
  workspace_id: string;
  connector_id: string;
  kind: CloudIdentityKind;
  native_id: string;
  name: string;
  /** The PROVIDER's creation time, not when this row was written. */
  created_at?: string;
  /** Nil means UNKNOWN, never "never used". */
  last_used_at?: string | null;
  enabled: boolean;
  attrs: AWSIdentityAttrs | Record<string, unknown>;
  last_seen_generation: number;
  first_seen_at: string;
  last_seen_at: string;
  row_updated_at: string;
}

interface CloudIdentityListEnvelope {
  data: CloudIdentity[];
  meta?: { as_of?: string; total?: number; limit?: number; offset?: number; note?: string };
}

export type CloudSecretStatus = "active" | "inactive";

/** An access key's METADATA only — key id, dates, status. There is no field
 * anywhere in this shape that could hold a key value. */
export interface CloudSecret {
  id: string;
  workspace_id: string;
  connector_id: string;
  identity_id: string;
  kind: string;
  native_id: string;
  created_at?: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  status: CloudSecretStatus;
  attrs: Record<string, unknown>;
}

interface CloudSecretListEnvelope {
  data: CloudSecret[];
  meta?: { as_of?: string; count?: number; ordering?: string; note?: string };
}

// ── GCP onboarding (the only GCP surface that exists) ───────────────────────

export type GCPScopeKind = "org" | "folder" | "project";

/** GET /gcp/onboarding's `data`. Renders BOTH auth methods' instructions
 * unconditionally — switching the WIF/JSON-key toggle client-side needs no
 * re-fetch, unlike AWS's ExternalId (which mints a new value every call). */
export interface GCPOnboardingPackage {
  reader_project_id: string;
  scope_kind: string;
  scope_id: string;
  pool_id: string;
  provider_id: string;
  wif_subject: string;
  issuer_url: string;
  role_set: string[];
  /** "candidate_pending_GCP-01" today — never render this as "confirmed". */
  role_set_status: string;
  setup_script: string;
  setup_script_version: string;
  wif_instructions: string;
  /** A stable label for the granted role set, e.g. "gcp-reader-p1-v2". */
  role_set_version?: string;
}

interface GCPOnboardingEnvelope {
  configured: boolean;
  data: GCPOnboardingPackage;
}

export type GCPAuthInput =
  | { method: "wif"; reader_sa_email: string; provider_resource: string }
  | { method: "json_key"; key_json: string };

export interface GCPCreateConnectorRequest {
  scope_kind: GCPScopeKind;
  scope_id: string;
  reader_project_id: string;
  display_name?: string;
  auth: GCPAuthInput;
}

/** The `{error, hint?, fault?}` envelope every GCP onboarding failure uses.
 * Three fault values exist for GCP: "customer_account" | "gcp" | "authsec"
 * (e.g. a WIF issuer that isn't HTTPS or isn't reachable is this deployment's
 * own configuration problem, never the customer's) — the same three-way
 * split AWS uses. */
export interface CloudOnboardingApiError {
  error: string;
  hint?: string;
  fault?: "customer_account" | "constrained" | "gcp" | "aws" | "authsec";
  /** Client-side only: the request timed out before any backend verdict
   * arrived (RTK Query TIMEOUT_ERROR carries no response body). Never sent
   * by the backend — set by the caller so error copy can say so honestly. */
  timeout?: boolean;
}

// ── Google Authentication (additive GCP onboarding option) ─────────────────
//
// A one-time Google OAuth sign-in used ONLY to auto-provision the same
// Workload Identity Federation resources the WIF card's setup command
// creates by hand — see controllers/platform/cloud_gcp_oauth_controller.go
// and services/gcp_oauth_provision_service.go. The OAuth access token itself
// never reaches this frontend at any point: `startGoogleOAuth` returns only
// an `authorize_url` to open in a popup, and the popup's landing page
// (GoogleOAuthCallbackPage) receives only an opaque `session_id` from the
// backend redirect — never a token. Every call below is a plain, ordinary
// authenticated AuthSec request; the Google identity never touches this
// client beyond having signed into a Google-hosted popup window.
//
// This does NOT modify GCPAuthInput/GCPCreateConnectorRequest above — the
// existing WIF/JSON-key create-connector request shape is untouched.
// Provisioning via Google Authentication is a wholly separate request
// (`provisionGoogleOAuth`) that needs only a session_id, since the backend
// already knows the scope from the OAuth session it started.

/**
 * Per-request timeout overrides for the two Google Authentication calls that
 * talk to Google synchronously. Everything else in this file is a fast local
 * read and keeps baseApi's 30s default.
 *
 * These are passed per-endpoint rather than raising the global timeout in
 * baseApi.ts, so no other screen's failure behaviour changes.
 */
const GOOGLE_PROVISION_TIMEOUT_MS = 120_000;
const GOOGLE_PREFLIGHT_TIMEOUT_MS = 60_000;

export interface GoogleOAuthStatus {
  available: boolean;
}

export interface StartGoogleOAuthResponse {
  authorize_url: string;
  state: string;
}

export interface GoogleProjectSummary {
  project_id: string;
  display_name?: string;
  state?: string;
}

interface GoogleProjectsEnvelope {
  data: GoogleProjectSummary[];
  meta?: { as_of?: string; count?: number };
}

export interface GooglePreflightResponse {
  sufficient: boolean;
  missing_permissions: string[] | null;
}

/** Only "project" scope is offered via Google Authentication in this phase
 * — Google's project-search API returns projects, not orgs/folders. Org/
 * folder scope remains available, unchanged, via the Workload Identity
 * Federation option. */
export interface PreflightGoogleOAuthRequest {
  session_id: string;
  scope_kind: "project";
  scope_id: string;
  reader_project_id: string;
}

export interface ProvisionGoogleOAuthRequest {
  session_id: string;
  scope_kind: "project";
  scope_id: string;
  reader_project_id: string;
  display_name?: string;
}

export const cloudDiscoveryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAwsConnectors: builder.query<CloudConnector[], void>({
      query: () => ({ url: "/authsec/discovery/aws/connectors", method: "GET" }),
      transformResponse: (r: ConnectorListEnvelope) => r.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map((c) => ({ type: "CloudConnector" as const, id: c.id })),
              { type: "CloudConnector" as const, id: "AWS_LIST" },
            ]
          : [{ type: "CloudConnector" as const, id: "AWS_LIST" }],
    }),

    listGcpConnectors: builder.query<CloudConnector[], void>({
      query: () => ({ url: "/authsec/discovery/gcp/connectors", method: "GET" }),
      transformResponse: (r: ConnectorListEnvelope) => r.data ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map((c) => ({ type: "CloudConnector" as const, id: c.id })),
              { type: "CloudConnector" as const, id: "GCP_LIST" },
            ]
          : [{ type: "CloudConnector" as const, id: "GCP_LIST" }],
    }),

    // `reader_project_id`/`scope_id` required, `scope_kind` optional
    // (defaults server-side to "project"). Skip this query until both
    // required fields are non-empty — see the wizard's `skip` usage.
    // Not a `builder.query<AWSOnboardingPackage, void>` with `transformResponse`
    // — `configured: false` is a 200, not an error, and the caller needs to
    // branch on it, so the whole envelope (not just `.data`) is the query's
    // return type.
    getAwsOnboardingPackage: builder.query<AWSOnboardingEnvelope, void>({
      query: () => ({ url: "/authsec/discovery/aws/onboarding", method: "GET" }),
    }),

    getAwsConnector: builder.query<CloudConnector, string>({
      query: (id) => ({ url: `/authsec/discovery/aws/connectors/${id}`, method: "GET" }),
      transformResponse: (r: { data: CloudConnector }) => r.data,
      providesTags: (_result, _error, id) => [{ type: "CloudConnector", id }],
    }),

    createAwsConnector: builder.mutation<CloudConnector, AWSCreateConnectorRequest>({
      // Timeout deliberately above the backend's 45s assume-role probe budget
      // (awsOnboardingTimeout, services/cloud_aws_onboarding.go): the shared
      // baseApi 30s timeout used to abort this exact call client-side, and the
      // backend logged the resulting context cancellation as a 400 that was
      // never an AWS verdict. 60s leaves headroom for the probe plus Vault/DB
      // writes without changing the timeout of any other endpoint.
      query: (body) => ({ url: "/authsec/discovery/aws/connectors", method: "POST", body, timeout: 60000 }),
      transformResponse: (r: ConnectorEnvelope) => r.data,
      invalidatesTags: [{ type: "CloudConnector", id: "AWS_LIST" }],
    }),

    // Re-proves an existing connection. Never removes anything the connector
    // previously discovered on failure — see VerifyConnector's own comment.
    verifyAwsConnector: builder.mutation<CloudConnector, string>({
      // Same 45s probe budget as connect (VerifyConnector), same reasoning.
      query: (id) => ({ url: `/authsec/discovery/aws/connectors/${id}/verify`, method: "POST", timeout: 60000 }),
      transformResponse: (r: ConnectorEnvelope) => r.data,
      invalidatesTags: (_result, _error, id) => [
        { type: "CloudConnector", id },
        { type: "CloudConnector", id: "AWS_LIST" },
      ],
    }),

    // Named for what it does, not the HTTP verb: revokes the connection and
    // purges its stored ExternalId. The connector row and everything it
    // discovered stay, for audit — this never deletes cloud_identity/
    // cloud_secret/cloud_permission rows.
    revokeAwsConnector: builder.mutation<void, string>({
      query: (id) => ({ url: `/authsec/discovery/aws/connectors/${id}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, id) => [
        { type: "CloudConnector", id },
        { type: "CloudConnector", id: "AWS_LIST" },
      ],
    }),

    // Starts the IAM identity + permission scan. 202 — runs in the
    // background; the connector's own `coverage` is the durable, pollable
    // report of what it found, not this response.
    scanAwsConnector: builder.mutation<ScanTriggerEnvelope, string>({
      query: (id) => ({ url: `/authsec/discovery/aws/connectors/${id}/scan`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [
        { type: "CloudConnector", id },
        { type: "CloudConnector", id: "AWS_LIST" },
        { type: "CloudIdentity", id },
        { type: "CloudSecret", id: "ALL" },
      ],
    }),

    // Candidate identities, not agents — see CloudIdentity's own comment.
    listAwsIdentities: builder.query<
      CloudIdentity[],
      { connector_id?: string; kind?: CloudIdentityKind } | void
    >({
      query: (params) => ({
        url: "/authsec/discovery/aws/identities",
        method: "GET",
        params: params ?? undefined,
      }),
      transformResponse: (r: CloudIdentityListEnvelope) => r.data ?? [],
      providesTags: (result, _error, arg) => [
        ...(result ?? []).map((i) => ({ type: "CloudIdentity" as const, id: i.id })),
        { type: "CloudIdentity" as const, id: arg?.connector_id ?? "ALL" },
      ],
    }),

    // Metadata only — key id, dates, status, never a value. The backend has
    // no connector_id filter on this endpoint (only identity_id), so a
    // connector's secrets are the ones whose identity_id is one of that
    // connector's own identities — the drawer does that join client-side.
    listAwsSecrets: builder.query<CloudSecret[], { identity_id?: string } | void>({
      query: (params) => ({
        url: "/authsec/discovery/aws/secrets",
        method: "GET",
        params: params ?? undefined,
      }),
      transformResponse: (r: CloudSecretListEnvelope) => r.data ?? [],
      providesTags: [{ type: "CloudSecret" as const, id: "ALL" }],
    }),

    getGcpOnboardingPackage: builder.query<
      GCPOnboardingPackage,
      { reader_project_id: string; scope_id: string; scope_kind: GCPScopeKind }
    >({
      query: (params) => ({
        url: "/authsec/discovery/gcp/onboarding",
        method: "GET",
        params,
      }),
      transformResponse: (r: GCPOnboardingEnvelope) => r.data,
    }),

    createGcpConnector: builder.mutation<CloudConnector, GCPCreateConnectorRequest>({
      query: (body) => ({ url: "/authsec/discovery/gcp/connectors", method: "POST", body }),
      transformResponse: (r: ConnectorEnvelope) => r.data,
      invalidatesTags: [{ type: "CloudConnector", id: "GCP_LIST" }],
    }),

    getGcpConnector: builder.query<CloudConnector, string>({
      query: (id) => ({ url: `/authsec/discovery/gcp/connectors/${id}`, method: "GET" }),
      transformResponse: (r: { data: CloudConnector }) => r.data,
      providesTags: (_r, _e, id) => [{ type: "CloudConnector", id }],
    }),

    /** Re-prove the connection AND refresh what the reader can reach.
     *
     * This is not only a health check. The backend re-runs the full per-surface
     * permission probe here, so verifying is how a role granted out of band
     * gets picked up — there is no separate probe endpoint and nothing for the
     * customer to re-run. The returned connector carries the refreshed
     * capability profile, readiness and role-set version.
     *
     * A failure records the reason on the row and leaves the last known-good
     * verified_at alone, so the response is still worth rendering. */
    verifyGcpConnector: builder.mutation<CloudConnector, string>({
      query: (id) => ({ url: `/authsec/discovery/gcp/connectors/${id}/verify`, method: "POST" }),
      transformResponse: (r: ConnectorEnvelope) => r.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "CloudConnector", id },
        { type: "CloudConnector", id: "GCP_LIST" },
      ],
    }),

    /** Disconnect a GCP connector.
     *
     * DELETE by URL, but a SOFT revoke underneath: the row is marked revoked
     * and kept for audit, and **nothing in the customer's Google Cloud is
     * deleted**. The reader service account, the pool and the provider all
     * remain until the customer removes them, which is the step that actually
     * ends AuthSec's access. Any confirmation shown before calling this has to
     * say so, or the customer will believe access is gone when it is not.
     *
     * Deliberately different from the AWS equivalent, which hard-deletes. */
    revokeGcpConnector: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({ url: `/authsec/discovery/gcp/connectors/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "CloudConnector", id },
        { type: "CloudConnector", id: "GCP_LIST" },
      ],
    }),

    // Lets the wizard hide/disable the "Google Authentication" card cleanly
    // when this deployment has no Redis/OAuth client configured, instead of
    // starting a flow that would fail at the callback.
    getGoogleOAuthStatus: builder.query<GoogleOAuthStatus, void>({
      query: () => ({ url: "/authsec/discovery/gcp/google-oauth/status", method: "GET" }),
    }),

    // Returns the Google consent URL to open in a popup — never a token.
    //
    // Takes NO argument, matching the backend: the human signs in with Google
    // before any project is known, so there is no scope to send yet. The
    // project arrives later, from listGoogleProjects, once the session exists.
    startGoogleOAuth: builder.mutation<StartGoogleOAuthResponse, void>({
      query: () => ({ url: "/authsec/discovery/gcp/google-oauth/start", method: "POST" }),
    }),

    // The project picker's data source, scoped to the session's Google
    // identity — never a raw GCP call from this client.
    listGoogleProjects: builder.query<GoogleProjectSummary[], { session_id: string }>({
      query: (params) => ({ url: "/authsec/discovery/gcp/google-oauth/projects", method: "GET", params }),
      transformResponse: (r: GoogleProjectsEnvelope) => r.data ?? [],
    }),

    // Checked before showing "Allow AuthSec to configure access" as if it
    // will succeed. Never provisions anything itself.
    preflightGoogleOAuth: builder.mutation<GooglePreflightResponse, PreflightGoogleOAuthRequest>({
      query: (body) => ({
        url: "/authsec/discovery/gcp/google-oauth/preflight",
        method: "POST",
        body,
        timeout: GOOGLE_PREFLIGHT_TIMEOUT_MS,
      }),
    }),

    // The terminal call: auto-provisions Workload Identity Federation, then
    // creates the connector — same response shape as createGcpConnector, and
    // the resulting connector is an ordinary auth_method:"wif" connector.
    //
    // Overrides baseApi's 30s default. This is the one endpoint in the app that
    // is genuinely long-running: it performs ~8 sequential write calls against
    // the customer's GCP project (~20s), then waits out Google's IAM propagation
    // before the federated credential can impersonate the reader service account
    // (up to ~75s of backoff). At 30s the browser aborted mid-provision, and
    // because an RTK Query timeout carries no `data` field the wizard could not
    // show the real backend error — every failure surfaced as a generic
    // "Could not connect to Google Cloud."
    //
    // Kept at 120s to match the server-side request timeout, so the browser never
    // gives up before the backend itself would.
    provisionGoogleOAuth: builder.mutation<CloudConnector, ProvisionGoogleOAuthRequest>({
      query: (body) => ({
        url: "/authsec/discovery/gcp/google-oauth/connectors",
        method: "POST",
        body,
        timeout: GOOGLE_PROVISION_TIMEOUT_MS,
      }),
      transformResponse: (r: ConnectorEnvelope) => r.data,
      invalidatesTags: [{ type: "CloudConnector", id: "GCP_LIST" }],
    }),
  }),
});

export const {
  useListAwsConnectorsQuery,
  useListGcpConnectorsQuery,
  useLazyGetAwsOnboardingPackageQuery,
  useGetAwsConnectorQuery,
  useCreateAwsConnectorMutation,
  useVerifyAwsConnectorMutation,
  useRevokeAwsConnectorMutation,
  useScanAwsConnectorMutation,
  useListAwsIdentitiesQuery,
  useListAwsSecretsQuery,
  useLazyGetGcpOnboardingPackageQuery,
  useCreateGcpConnectorMutation,
  useGetGcpConnectorQuery,
  useVerifyGcpConnectorMutation,
  useRevokeGcpConnectorMutation,
  useGetGoogleOAuthStatusQuery,
  useStartGoogleOAuthMutation,
  useLazyListGoogleProjectsQuery,
  usePreflightGoogleOAuthMutation,
  useProvisionGoogleOAuthMutation,
} = cloudDiscoveryApi;
