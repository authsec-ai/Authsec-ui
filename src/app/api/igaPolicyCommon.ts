/**
 * What every Phase 3 policy endpoint shares (SPEC-iga-phase3-policy.md §7):
 * the base path, the `{data, meta}` / `{error}` envelopes, the error codes the
 * console must handle (§7.12) and the query-string builder.
 *
 * Every route is under `/api/iga/v1/policy`, except the AWS enforcement binding
 * and IaC sources (under `/authsec/discovery/aws`) and Slack (under
 * `/authsec/integrations/slack`); those slices say so. The workspace is always
 * the token's: a workspace id is never sent in a body or query, and `ws` in a
 * query argument is a CLIENT-ONLY cache key that `policyQuery` drops.
 */

/** Base path of the policy routes. */
export const POLICY_BASE = "/api/iga/v1/policy";

/** `{ data, meta }`: the success envelope. `meta` is per endpoint. */
export interface PolicyEnvelope<T, M = PolicyMeta> {
  data: T;
  meta: M;
}

/** Meta common to paged reads. Endpoints extend it. */
export interface PolicyMeta {
  next_cursor?: string | null;
  [key: string]: unknown;
}

/** §7.12. Unknown codes are possible (a newer backend): treat `string` as open. */
export type PolicyErrorCode =
  | "policy_unavailable"
  | "target_not_supported"
  | "evidence_untrusted"
  | "evidence_gaps_not_accepted"
  | "enforcement_not_enabled"
  | "binding_not_verified"
  | "binding_partial"
  | "iac_source_missing"
  | "discovery_unavailable"
  | "target_ineligible"
  | "role_controlled_by_policy"
  | "policy_controls_roles"
  | "version_conflict"
  | "plan_changed"
  | "impact_changed"
  | "review_incomplete"
  | "owner_gate_unavailable"
  | "deploy_job_running"
  | "target_deployed"
  | "migration_evidence_unavailable"
  | "policy_not_enabled"
  | "slack_link_email_mismatch"
  | "slack_member_already_linked"
  | "user_has_audit_history"
  | "finding_not_exceptable"
  | "finding_not_excepted"
  | "age_unconfirmed"
  | "route_unconfirmed"
  | "residuals_not_accepted"
  | "self_approval"
  | "approval_expired"
  | "resource_policy_blocks_boundary"
  | "resource_policy_evidence_incomplete"
  | "evaluation_incomplete"
  | "revision_not_retained"
  | "session_not_unique"
  | "action_not_mappable"
  | "artifact_consumers_changed"
  | "artifact_owned_elsewhere"
  | "artifact_changed_outside_authsec"
  | "gates_not_passed"
  | "deployment_in_flight"
  | "not_latest_deployment"
  | "material_change"
  | "outcome_unknown_pending"
  | "slack_user_not_linked"
  | "slack_signature_invalid"
  | "invalid_intent"
  | "policy_archived"
  | "policy_name_taken"
  | "nothing_to_remove"
  | "finding_not_actionable"
  | "review_closed"
  | "not_review_owner"
  | "version_not_approved"
  | "approval_required"
  | "approval_invalid"
  | "revalidation_required"
  | "revalidation_blocked"
  | "cursor_invalid"
  | "iac_unavailable"
  | "iac_source_in_use"
  | "binding_exists"
  | "self_test_in_progress"
  | "rollout_not_started"
  | "owner_rule_exists"
  | "forbidden"
  | "not_found"
  | "invalid_parameter"
  | "unauthenticated"
  | "internal"
  | "internal_error";

/** `{ error: { code, message, detail } }`: the error envelope. */
export interface PolicyErrorBody {
  error: {
    code: PolicyErrorCode | (string & {});
    message: string;
    detail?: Record<string, unknown>;
  };
}

type ParamValue = string | number | boolean | null | undefined | readonly (string | number)[];

/**
 * `?a=1&b=x,y`. Arrays are comma-joined (the server splits on commas), empty
 * values are dropped, `ws` and `key` (client-only cache keys) never reach the
 * server, and anything in `omit` (path parameters) is skipped.
 */
export function policyQuery(args: object | undefined, omit: readonly string[] = []): string {
  if (!args) return "";
  const skip = new Set(["ws", "key", ...omit]);
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(args as Record<string, ParamValue>)) {
    if (skip.has(k) || v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length > 0) out.set(k, v.join(","));
      continue;
    }
    out.set(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** Client-only cache key carried by every query argument, as the graph API does. */
export interface WsArg {
  ws: string;
}

/** Cursor paging, as every list takes it (`limit` is 1..200). */
export interface PageArgs {
  cursor?: string;
  limit?: number;
}

export const enc = encodeURIComponent;
