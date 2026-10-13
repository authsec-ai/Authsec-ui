/**
 * Access policies: an admin blocks or allows IAM roles on an AWS resource for a
 * time window, and AuthSec applies it as an AuthSec-owned IAM policy attached to
 * each role (AWS enforces it, the window included).
 *
 * Every route is under `/api/iga/v1/policy/access-policies`; the workspace is
 * the token's. Reads need `governance:read`, changes `governance:enforce`. The
 * admin applies directly: there is no review or approval step.
 *
 *   GET  /                 list (?status&effect&q&resource_id&identity_account_id&limit&cursor)
 *   POST /preview          what a draft would do; stores nothing
 *   POST /                 create and apply
 *   GET  /:id              one policy, with its per-role deployments and documents
 *   POST /:id/versions     edit (a new version replaces the old one in AWS)
 *   POST /:id/pause        take it out of AWS, keep the policy
 *   POST /:id/resume       put the current version back
 *   POST /:id/end          take it out of AWS for good; the record is kept
 *   GET  /:id/events       history, newest first
 *   GET  /readiness        whether AuthSec can change IAM in each AWS account
 *
 * Envelope `{ data, meta }`; errors `{ error: { code, message, field?, detail? } }`.
 */

import { baseApi } from "./baseApi";
import { POLICY_BASE, enc, policyQuery, type PageArgs, type PolicyEnvelope, type WsArg } from "./igaPolicyCommon";

const BASE = `${POLICY_BASE}/access-policies`;

export type AccessEffect = "block" | "allow";
/** `all` is offered for block only. */
export type AccessLevel = "read" | "write" | "delete" | "all";
export type AccessPolicyStatus = "scheduled" | "applying" | "active" | "paused" | "ended" | "failed" | "drift";
/** How a policy left AWS (or `""` while it has not). */
export type AccessEndReason = "" | "expired" | "ended" | "superseded" | "paused";

export interface AccessPolicyResource {
  resource_id: string;
  arn: string;
  bucket: string;
  /** "" means the whole bucket. */
  prefix: string;
  account_id: string;
}

export interface AccessPolicyWorkload {
  id: string;
  name: string;
  kind: string;
}

export interface AccessPolicyRole {
  identity_account_id: string;
  name: string;
  arn: string;
  account_id: string;
  /** Workloads that run as the role: who the policy really affects. */
  used_by: AccessPolicyWorkload[];
}

/**
 * One role's copy of the policy in AWS. `state` is the backend's deployment
 * state: approved · deploying · active · expiring · expired · revoked · failed ·
 * outcome_unknown (open: a newer backend may add one).
 */
export interface AccessPolicyDeployment {
  id: string;
  identity_account_id: string;
  role_name: string;
  /** Which version this row deployed. The detail shows the current version's
      rows and keeps older ones under a "Show earlier" toggle. */
  version_no: number;
  state: string;
  aws_policy_arn: string;
  document_hash: string;
  deployed_at: string | null;
  verified_at: string | null;
  last_readback_at: string | null;
  /** Empty when AWS's copy matches what AuthSec sent. */
  drift: string;
  error: string;
  /** Why this row left AWS: expired, paused, ended, superseded, expired_before_deploy. "" while live. */
  end_reason: string;
}

export interface AccessPolicyVersion {
  version_no: number;
  created_by: { id: string; name: string };
  created_at: string;
  intent_hash: string;
  status: "applied" | "superseded";
}

export interface AccessPolicy {
  id: string;
  name: string;
  reason: string;
  effect: AccessEffect;
  access: AccessLevel[];
  starts_at: string | null;
  ends_at: string | null;
  status: AccessPolicyStatus;
  status_reason: string;
  version_no: number;
  lifecycle: "active" | "paused" | "archived";
  created_by: { id: string; name: string };
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  end_reason: AccessEndReason;
  resource: AccessPolicyResource;
  roles: AccessPolicyRole[];
}

/** The exact IAM policy JSON attached to one role, with its AuthSec name. */
export interface AccessPolicyDocument {
  identity_account_id: string;
  role_name: string;
  policy_name: string;
  document: Record<string, unknown>;
}

export interface AccessPolicyDetail extends AccessPolicy {
  deployments: AccessPolicyDeployment[];
  documents: AccessPolicyDocument[];
  versions: AccessPolicyVersion[];
}

/** What the admin decides; the server resolves names, ARNs and accounts. */
export interface AccessPolicyIntent {
  effect: AccessEffect;
  resource: { resource_id: string; prefix: string };
  roles: { identity_account_id: string }[];
  access: AccessLevel[];
  starts_at: string | null;
  ends_at: string | null;
}

export interface AccessPolicyBody extends AccessPolicyIntent {
  name: string;
  reason: string;
}

export interface AccessPolicyNotice {
  code: string;
  message: string;
  field?: string;
}

export interface AccessPolicyPreview {
  /** "RefundTaskRole will be blocked from reading refunds-ledger-prod until Wed 14 Oct 18:30." */
  sentence: string;
  documents: { identity_account_id: string; role_name: string; policy_name: string; document: Record<string, unknown> }[];
  also_affected: { identity_account_id: string; workloads: AccessPolicyWorkload[] }[];
  /** Worth knowing; Apply stays possible. */
  warnings: AccessPolicyNotice[];
  /** Apply would be refused; each says why. */
  blockers: AccessPolicyNotice[];
}

/**
 * One recorded history event, as the backend serves it. There is no `message`
 * or actor name on the wire: the label comes from `event` (see `eventLabel` in
 * model) and the actor from `actor_kind` (`system` is AuthSec; `user` carries
 * `actor_id`). `event` is one of `access_policy.created`, `.applied`,
 * `.confirmed`, `.edited`, `.paused`, `.resumed`, `.ended`, `.expired`,
 * `.removed`, `.drifted`, `.reapplied`, `.failed`, `.outcome_unknown`.
 */
export interface AccessPolicyEvent {
  id: number;
  occurred_at: string;
  event: string;
  actor_kind: "user" | "system";
  actor_id: string;
  payload: Record<string, unknown>;
}

export interface AccessReadinessAccount {
  account_id: string;
  connector_id: string;
  binding_state: string;
  template_version: string;
  ready: boolean;
  reason: string;
}

export interface AccessReadiness {
  available: boolean;
  reason: string;
  accounts: AccessReadinessAccount[];
}

export interface ListAccessPoliciesArgs extends WsArg, PageArgs {
  status?: AccessPolicyStatus;
  effect?: AccessEffect;
  q?: string;
  resource_id?: string;
  identity_account_id?: string;
}

type ById = WsArg & { id: string };
type Reason = { reason: string };

const LIST = { type: "IgaAccessPolicy" as const, id: "LIST" };
const one = (id: string) => ({ type: "IgaAccessPolicy" as const, id });

export const igaAccessPoliciesApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    listAccessPolicies: b.query<PolicyEnvelope<AccessPolicy[]>, ListAccessPoliciesArgs>({
      query: (args) => ({ url: `${BASE}${policyQuery(args)}` }),
      providesTags: [LIST],
    }),
    getAccessPolicy: b.query<PolicyEnvelope<AccessPolicyDetail>, ById>({
      query: ({ id }) => ({ url: `${BASE}/${enc(id)}` }),
      providesTags: (_r, _e, { id }) => [one(id)],
    }),
    listAccessPolicyEvents: b.query<PolicyEnvelope<AccessPolicyEvent[]>, ById & PageArgs>({
      query: (args) => ({ url: `${BASE}/${enc(args.id)}/events${policyQuery(args, ["id"])}` }),
      providesTags: (_r, _e, { id }) => [one(id)],
    }),
    getAccessReadiness: b.query<PolicyEnvelope<AccessReadiness>, WsArg>({
      query: () => ({ url: `${BASE}/readiness` }),
      providesTags: [{ type: "IgaAccessPolicy", id: "READINESS" }],
    }),
    previewAccessPolicy: b.mutation<PolicyEnvelope<AccessPolicyPreview>, AccessPolicyBody>({
      query: (body) => ({ url: `${BASE}/preview`, method: "POST", body }),
    }),
    createAccessPolicy: b.mutation<PolicyEnvelope<AccessPolicyDetail>, AccessPolicyBody>({
      query: (body) => ({ url: BASE, method: "POST", body }),
      invalidatesTags: [LIST],
    }),
    editAccessPolicy: b.mutation<PolicyEnvelope<AccessPolicyDetail>, { id: string; body: AccessPolicyBody & { base_version_no: number } }>({
      query: ({ id, body }) => ({ url: `${BASE}/${enc(id)}/versions`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => [LIST, one(id)],
    }),
    pauseAccessPolicy: b.mutation<PolicyEnvelope<AccessPolicyDetail>, { id: string } & Reason>({
      query: ({ id, reason }) => ({ url: `${BASE}/${enc(id)}/pause`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [LIST, one(id)],
    }),
    resumeAccessPolicy: b.mutation<PolicyEnvelope<AccessPolicyDetail>, { id: string } & Reason>({
      query: ({ id, reason }) => ({ url: `${BASE}/${enc(id)}/resume`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [LIST, one(id)],
    }),
    endAccessPolicy: b.mutation<PolicyEnvelope<AccessPolicyDetail>, { id: string } & Reason>({
      query: ({ id, reason }) => ({ url: `${BASE}/${enc(id)}/end`, method: "POST", body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [LIST, one(id)],
    }),
  }),
});

export const {
  useListAccessPoliciesQuery,
  useGetAccessPolicyQuery,
  useListAccessPolicyEventsQuery,
  useGetAccessReadinessQuery,
  usePreviewAccessPolicyMutation,
  useCreateAccessPolicyMutation,
  useEditAccessPolicyMutation,
  usePauseAccessPolicyMutation,
  useResumeAccessPolicyMutation,
  useEndAccessPolicyMutation,
} = igaAccessPoliciesApi;
