/**
 * Access policies: an admin blocks or allows identities on one cloud resource
 * for a time window (SPEC-access-policies.md). On AWS, IAM roles on an S3 bucket
 * or folder, or a DynamoDB table: AuthSec attaches its own IAM policy to each
 * role and AWS enforces it, the window included. On Azure, service principals, managed identities and
 * agent identities on one resource: AuthSec removes (block) or creates (allow)
 * role assignments and undoes it at the end.
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
 *   GET  /readiness        whether AuthSec can change each AWS account and Azure subscription
 *
 * Envelope `{ data, meta }`; errors `{ error: { code, message, field?, detail? } }`.
 */

import { baseApi } from "./baseApi";
import { POLICY_BASE, enc, policyQuery, type PageArgs, type PolicyEnvelope, type WsArg } from "./igaPolicyCommon";

const BASE = `${POLICY_BASE}/access-policies`;

export type AccessEffect = "block" | "allow";
/** `all` is offered for block only. */
export type AccessLevel = "read" | "write" | "delete" | "all";
export type AccessProvider = "aws" | "azure";
/** `ending`: ended (End, or its end time passed) while AuthSec is still undoing it in the cloud. */
export type AccessPolicyStatus = "scheduled" | "applying" | "active" | "paused" | "ending" | "ended" | "failed" | "drift";
/** How a policy left AWS (or `""` while it has not). */
export type AccessEndReason = "" | "expired" | "ended" | "superseded" | "paused";

/**
 * What a policy is on. `""` when the backend cannot tell (an ARN it no longer
 * parses); a backend that predates the field omits it.
 */
export type AccessResourceType = "s3_bucket" | "dynamodb_table" | "secretsmanager_secret" | "ssm_parameter" | "bedrock_model" | "bedrock_agent" | "agentcore_runtime" | "azure_resource" | "";

export interface AccessPolicyResource {
  resource_id: string;
  resource_type: AccessResourceType;
  /** The bucket's or table's ARN on AWS; the ARM id on Azure. */
  arn: string;
  /** S3 only; "" for a table and on Azure. */
  bucket: string;
  /** An S3 folder; "" means the whole bucket (always "" for a table and on Azure). */
  prefix: string;
  /** The AWS account (a table's own, from its ARN), or the Azure subscription id. */
  account_id: string;
  provider: AccessProvider;
  /** The bucket, the table, or the Azure resource's name. */
  name: string;
  /** A table's AWS region; absent for S3 and Azure. */
  region?: string;
  /**
   * The kind of the Discovery record the policy names: on Azure the resource
   * type (`microsoft.storage/storageaccounts`); on AWS the record's kind, which
   * is `selector` for a path such as `bucket/*` or `table/orders/index/*`. Not
   * the resource's type: read `resource_type` for that.
   */
  kind: string;
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
  /** `iam_role`, or `entra_service_principal` · `entra_managed_identity` · `entra_agent_identity`. */
  kind?: string;
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
  /** Azure: the ARM scope AuthSec changes role assignments on. */
  target_ref?: string;
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

/** One Azure subscription: whether AuthSec's app can manage role assignments there. */
export interface AccessReadinessSubscription {
  subscription_id: string;
  name: string;
  connector_id: string;
  ready: boolean;
  /** `azure_write_access_missing`, or why the check could not run. */
  reason: string;
}

export interface AccessReadiness {
  available: boolean;
  reason: string;
  accounts: AccessReadinessAccount[];
  azure_subscriptions: AccessReadinessSubscription[];
}

export interface ListAccessPoliciesArgs extends WsArg, PageArgs {
  status?: AccessPolicyStatus;
  provider?: AccessProvider;
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
      // The server omits deployments, documents and versions when empty (omitempty).
      transformResponse: (res: PolicyEnvelope<AccessPolicyDetail>) => ({
        ...res,
        data: { ...res.data, deployments: res.data.deployments ?? [], documents: res.data.documents ?? [], versions: res.data.versions ?? [], roles: res.data.roles ?? [] },
      }),
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
    /** DELETE /:id: hides an ended policy. Its history stays in the Logs. */
    deleteAccessPolicy: b.mutation<PolicyEnvelope<{ id: string; deleted: boolean }>, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/${enc(id)}`, method: "DELETE" }),
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
  useDeleteAccessPolicyMutation,
} = igaAccessPoliciesApi;
