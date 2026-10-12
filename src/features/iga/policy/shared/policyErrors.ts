/**
 * One classification of Phase 3 policy API failures (SPEC-iga-phase3-policy.md
 * §7.12), so every screen words the same failure the same way.
 *
 * The distinctions matter: "the policy product is not enabled", "your role
 * cannot do this", "this changed since you looked, review the new state" and
 * "the request failed" are different answers, and none of them is ever shown
 * as an empty list. A failed read is never rendered as "none".
 */

import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

import type { PolicyErrorBody } from "@/app/api/igaPolicyCommon";

export type PolicyFailureKind =
  /** 503 policy_unavailable, or a route the backend does not have (404 without an error body). */
  | "unavailable"
  /** 403: the role lacks the permission. */
  | "forbidden"
  /** 401. */
  | "unauthenticated"
  /** 404 not_found: absent, or another workspace's. */
  | "not_found"
  /** 409: the state moved under the request; `code` says how. */
  | "conflict"
  /** 400/422: the request is wrong or a precondition for the change is unmet; `code` says which. */
  | "rejected"
  | "timeout"
  | "failed";

export interface PolicyFailure {
  kind: PolicyFailureKind;
  status?: number | string;
  /** The backend's code: `plan_changed`, `self_approval`, … Empty when there is none. */
  code: string;
  /** The backend's own message, shown when the UI has no better words. */
  message: string;
  detail: Record<string, unknown>;
}

function isFetchError(e: unknown): e is FetchBaseQueryError {
  return typeof e === "object" && e !== null && "status" in e;
}

function bodyOf(e: FetchBaseQueryError): PolicyErrorBody["error"] | undefined {
  const d = e.data as Partial<PolicyErrorBody> | undefined;
  return d && typeof d === "object" && d.error && typeof d.error === "object" ? d.error : undefined;
}

export function classifyPolicyError(error: FetchBaseQueryError | SerializedError | undefined | unknown): PolicyFailure | null {
  if (!error) return null;
  if (!isFetchError(error)) {
    const message = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
    return { kind: "failed", code: "", message, detail: {} };
  }
  const b = bodyOf(error);
  const code = b?.code ?? "";
  const base = { status: error.status, code, message: b?.message ?? "", detail: (b?.detail ?? {}) as Record<string, unknown> };
  switch (error.status) {
    case 401:
      return { ...base, kind: "unauthenticated" };
    case 403:
      return { ...base, kind: "forbidden" };
    case 404:
      // A policy 404 always carries `{error: {code: "not_found"}}`. A 404
      // WITHOUT that body is the router answering: the backend in front of us
      // does not have this route. That is "unavailable", not "not found" —
      // the UI and backend deploy separately.
      return b?.code === "not_found" ? { ...base, kind: "not_found" } : { ...base, kind: "unavailable" };
    case 409:
      return { ...base, kind: "conflict" };
    case 400:
    case 410:
    case 422:
      return { ...base, kind: "rejected" };
    case 503:
      return code === "policy_unavailable" || code === "discovery_unavailable" || !code
        ? { ...base, kind: "unavailable" }
        : { ...base, kind: "failed" };
    case 504:
    case "TIMEOUT_ERROR":
      return { ...base, kind: "timeout" };
    default:
      return { ...base, kind: "failed" };
  }
}

/** `detail.reason` of a 503 policy_unavailable: why the gate is off. */
export function unavailableReason(f: PolicyFailure | null): string | undefined {
  const r = f?.detail?.reason;
  return typeof r === "string" ? r : undefined;
}

/**
 * Plain-language copy per §7.12 code. `title` is the one-line answer; `fix`
 * says what to do next. A code without an entry falls back to the backend's
 * own message, never to a bare "error".
 */
export const POLICY_ERROR_COPY: Record<string, { title: string; fix?: string }> = {
  policy_unavailable: { title: "Policy is not available here", fix: "The policy product is turned off or still starting on this server." },
  target_not_supported: { title: "This kind of object cannot be changed by policy yet", fix: "Only AWS IAM roles are supported in this release." },
  evidence_untrusted: { title: "AuthSec cannot propose a change from this evidence", fix: "Open the connection and fix the collection problem, then rescan." },
  evidence_gaps_not_accepted: { title: "Accept each evidence gap first", fix: "Every gap in the evidence must be accepted, with a reason, before approval." },
  enforcement_not_enabled: { title: "Enforcement is off for this workspace", fix: "Turn on enforcement in Policy › Setup, or deliver by pull request or export." },
  binding_not_verified: { title: "Enforcement access is not verified for this account", fix: "Run the self-test in Policy › Setup › Enforcement." },
  binding_partial: { title: "Enforcement access is only partly working", fix: "Re-run the self-test and update the stack; AuthSec will not apply changes until every check passes." },
  iac_source_missing: { title: "No infrastructure-as-code source covers this role", fix: "Map a repository in Policy › Setup › IaC sources, or deliver by export." },
  discovery_unavailable: { title: "AuthSec could not read AWS right now", fix: "Check the connection in Connections, then try again." },
  target_ineligible: { title: "This role cannot be changed by policy", fix: "See the reason listed for the role." },
  role_controlled_by_policy: { title: "Another policy already controls this role", fix: "Edit that policy instead of creating a second one." },
  policy_controls_roles: { title: "AuthSec's boundary is still on a role in AWS", fix: "Remove AuthSec control first, then archive." },
  version_conflict: { title: "This policy changed since you opened it", fix: "Reload to see the latest version, then re-apply your edit." },
  plan_changed: { title: "The plan changed since it was approved", fix: "Review the new plan; it needs a new approval." },
  impact_changed: { title: "Who is affected has changed", fix: "Review the new impact; owners who were not asked will be asked." },
  owner_gate_unavailable: { title: "Approval is not available yet", fix: "The owner-review check is not running on this server. Try again shortly; nothing was approved." },
  deploy_job_running: { title: "This deployment is still being worked on", fix: "Its job is running now. Wait for it to finish or fail, then try again." },
  target_deployed: { title: "This role already has the change", fix: "A role that AuthSec has changed is not re-planned. Use the deployment to undo or verify it." },
  migration_evidence_unavailable: { title: "AuthSec cannot see what runs as this role yet", fix: "Workload and alias evidence is missing or incomplete. Fix the collection gap in Connections and rescan." },
  policy_not_enabled: { title: "Policy is not enabled for this workspace", fix: "Turn Policy on before setting up enforcement." },
  slack_link_email_mismatch: { title: "That Slack account's email does not match yours", fix: "Link a Slack account whose confirmed email is the same as your AuthSec email." },
  slack_member_already_linked: { title: "You already have a Slack account linked", fix: "Unlink it first. A member can have one Slack account per team." },
  user_has_audit_history: { title: "This user is named in another workspace's records", fix: "The records must be archived by an administrator before the user can be removed." },
  finding_not_exceptable: { title: "This finding cannot be excepted now", fix: "Only an open, reopened or already excepted finding can be excepted. If a proposal targets it, withdraw the proposal first." },
  finding_not_excepted: { title: "This finding has no exception to clear", fix: "Reload to see its current status." },
  review_incomplete: { title: "Owner review is not complete", fix: "Every owner must respond, or an approver must record an exception." },
  age_unconfirmed: { title: "Owners have not confirmed when these grants were added", fix: "The grants predate AuthSec's first scan; owners must confirm they were not added recently." },
  route_unconfirmed: { title: "Owners have not confirmed the resource-policy routes", fix: "Each route must be confirmed unused, or excepted." },
  residuals_not_accepted: { title: "Accept each unanalysed item first", fix: "Items AuthSec could not analyse must be accepted one by one." },
  self_approval: { title: "You cannot approve your own change", fix: "Ask another approver." },
  approval_expired: { title: "The approval has expired", fix: "Approve again." },
  resource_policy_blocks_boundary: { title: "A resource policy would break access if a boundary is attached", fix: "AuthSec will not attach a boundary to this role." },
  resource_policy_evidence_incomplete: { title: "Resource policies were not fully collected", fix: "Fix the collection gap in Connections and rescan." },
  evaluation_incomplete: { title: "That revision has not finished evaluating", fix: "Use the latest evaluated revision." },
  revision_not_retained: { title: "That revision is no longer kept", fix: "Use a newer revision." },
  session_not_unique: { title: "That test session name is already used", fix: "Declare the test again." },
  action_not_mappable: { title: "AuthSec cannot map that action to a service", fix: "Use an IAM action such as sqs:ListQueues." },
  artifact_consumers_changed: { title: "Something else now uses AuthSec's boundary", fix: "Undoing would change that role too; use the role-only recovery plan." },
  artifact_owned_elsewhere: { title: "Another workspace controls this policy in AWS", fix: "AuthSec will not change it." },
  artifact_changed_outside_authsec: { title: "The boundary was changed outside AuthSec", fix: "Review the difference before continuing." },
  gates_not_passed: { title: "The canary gates have not passed", fix: "Fix the failing gates, or accept those that could not be evaluated." },
  deployment_in_flight: { title: "A change is already in progress on this role", fix: "Wait for it to finish." },
  not_latest_deployment: { title: "Only the latest change can be undone", fix: "Undo the later change first." },
  material_change: { title: "Something material changed since approval", fix: "Review what changed; the change needs a new approval." },
  outcome_unknown_pending: { title: "An earlier change on this role has an unknown outcome", fix: "AuthSec is confirming what happened. Nothing else changes this role until then." },
  slack_user_not_linked: { title: "Your Slack account is not linked", fix: "Link it from the Slack message, then confirm in AuthSec." },
  slack_signature_invalid: { title: "That Slack request could not be verified" },
  invalid_intent: { title: "That change cannot be expressed as a policy", fix: "Check the services selected for removal." },
  policy_archived: { title: "This policy is archived", fix: "Archived policies are read-only." },
  policy_name_taken: { title: "A policy with that name already exists", fix: "Choose another name." },
  nothing_to_remove: { title: "There is nothing left to remove", fix: "Every selected service is already excluded or kept." },
  finding_not_actionable: { title: "This finding cannot start a policy", fix: "Only findings that name services to remove can." },
  review_closed: { title: "This review is already closed", fix: "Reload to see its outcome." },
  not_review_owner: { title: "You are not an owner for this review", fix: "Only the owners AuthSec asked can respond." },
  version_not_approved: { title: "This version is not approved", fix: "Approve it first." },
  approval_required: { title: "This needs an approval first" },
  approval_invalid: { title: "The approval no longer applies", fix: "It was revoked, or the plan changed. Approve the current version." },
  revalidation_required: { title: "AuthSec must recheck the evidence first", fix: "A newer scan exists; it is being compared with what was approved." },
  revalidation_blocked: { title: "The new evidence blocks this change", fix: "Open the connection and fix the collection problem, then rescan." },
  cursor_invalid: { title: "The list changed under you", fix: "Reload the list." },
  iac_unavailable: { title: "Pull requests are not available here", fix: "GitHub access for pull requests is not configured; deliver by export." },
  iac_source_in_use: { title: "Pull requests were opened from this source", fix: "It cannot be removed while they exist." },
  binding_exists: { title: "Enforcement access already exists for this account", fix: "Revoke it first to set it up again." },
  self_test_in_progress: { title: "A self-test is already running", fix: "Wait for it to finish." },
  rollout_not_started: { title: "The rollout has not started" },
  owner_rule_exists: { title: "That owner rule already exists" },
  forbidden: { title: "Your role cannot do this", fix: "An administrator can grant the permission." },
};

/** The words for a failure: the code's copy, else the backend's message, else a plain fallback. */
export function describeFailure(f: PolicyFailure): { title: string; fix?: string } {
  const known = POLICY_ERROR_COPY[f.code];
  if (known) return known;
  switch (f.kind) {
    case "forbidden":
      return { title: "Your role cannot do this", fix: "An administrator can grant the permission." };
    case "unauthenticated":
      return { title: "Your session has ended", fix: "Sign in again to continue." };
    case "not_found":
      return { title: "Not found", fix: "It does not exist in this workspace, or it was deleted." };
    case "timeout":
      return { title: "The request timed out", fix: "It may still have completed. Reload and check before trying again." };
    case "unavailable":
      return { title: "Policy is not available on this server", fix: "The backend may not have this feature deployed yet." };
    default:
      return { title: f.message || "The request failed", fix: f.message ? undefined : "Try again; if it keeps failing the service may be unavailable." };
  }
}
