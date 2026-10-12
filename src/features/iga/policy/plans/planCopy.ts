/**
 * The words of a compiled plan and of its evidence (SPEC-iga-phase3-policy.md
 * §3.1-§3.4, §2.11, §9.7). Pure: every sentence is built from fields the plan,
 * bundle and proposal endpoints serve, and says only what those fields
 * establish. A service whose route remains is "excluded", never "can no longer
 * be called"; a plan that rests on unanalysed items says so.
 *
 * Exports
 *   R1A_SCOPE                  the scope sentence every change description carries
 *   refusalText(refusal)       why a plan is ineligible, in a sentence
 *   eligibilityView(e)         eligible / pull request or export only / not eligible
 *   planCaseText(case)         what the plan does to the role's boundary
 *   dispositionText(plan)      what happens to the boundary policy AuthSec writes
 *   opText(op)                 one operation of the plan, in words
 *   gapText(gap)               one evidence gap an approver must accept
 *   unanalysedText(item)       one unanalysed item an approver must accept
 *   trustReasonText(reason)    a bundle's trust reason
 *   routeEffectText(effect)    what the boundary does to a resource-policy route
 *   routeText(route)           one route, in words
 *   statementResultText(s)     kept / narrowed / deleted
 *   prettyJson(text)           canonical JSON text, indented for reading
 *   arnTail(arn)               the last segment of an ARN
 */

import type {
  GovArtifactDisposition,
  GovEligibility,
  GovGap,
  GovNarrowedStatement,
  GovOp,
  GovPlanCase,
  GovPlanView,
  GovRefusal,
  GovRoute,
  GovUnanalysedItem,
} from "@/app/api/igaPolicyAuthoringApi";

import { humanize, type StateView } from "../shared";

export const R1A_SCOPE =
  "R1a restricts whole AWS services for selected roles. It does not narrow actions or resources within the services a role keeps.";

/** The last segment of an ARN or a path: `arn:aws:iam::1:role/team/Name` becomes `Name`. */
export function arnTail(arn: string | null | undefined): string {
  if (!arn) return "";
  const i = Math.max(arn.lastIndexOf("/"), arn.lastIndexOf(":"));
  return i >= 0 ? arn.slice(i + 1) : arn;
}

export const ELIGIBILITY: Record<GovEligibility, StateView> = {
  eligible: { label: "Eligible", tone: "success", hint: "AuthSec can apply this plan itself, or deliver it by pull request or export." },
  iac_only: {
    label: "Pull request or export only",
    tone: "warning",
    hint: "The role has a boundary AuthSec does not own, or no verified enforcement access exists. AuthSec will not write to AWS for this plan.",
  },
  ineligible: { label: "Not eligible", tone: "danger", hint: "AuthSec cannot change this role with this plan. The reason is listed." },
};
export const eligibilityView = (e: string | null | undefined): StateView =>
  (e && ELIGIBILITY[e as GovEligibility]) || { label: e ? humanize(e) : "Not compiled yet", tone: "neutral" };

const REFUSALS: Record<string, (detail?: string) => string> = {
  role_gone: () => "The role no longer exists in AWS.",
  role_recreated: () => "The role was deleted and created again since it was scanned, so it is not the role that was selected.",
  service_linked_role: () => "Service-linked roles belong to AWS and cannot be changed.",
  aws_reserved_role: () => "Roles under /aws-reserved/ belong to AWS and cannot be changed.",
  authsec_managed_role: () => "This is one of AuthSec's own roles.",
  protected_role: () => "The role is tagged authsec:protected=true.",
  recognition_only_identity: () => "AuthSec recognises this role but cannot follow it across changes, so it cannot be controlled.",
  service_not_in_activity_report: (d) => `AWS's activity report does not list ${d || "a removed service"}, so AuthSec cannot show it has had no attempts.`,
  removal_not_justified: (d) => `There is no qualified basis for removing ${d || "a service"}.`,
  removal_is_dependency: (d) => `${d || "A removed service"} is a dependency of what runs as this role.`,
  document_too_large: () => "The boundary document would be larger than IAM allows (6,144 characters).",
  resource_policy_evidence_incomplete: (d) => `Resource policies were not fully read, and a first boundary needs every one.${d ? ` ${d}` : ""}`,
  resource_policy_blocks_boundary: (d) =>
    `A resource policy uses Deny with NotPrincipal, so attaching any boundary could break access. AuthSec will not attach one.${d ? ` ${d}` : ""}`,
  customer_boundary_requires_iac: () =>
    "The role has a boundary AuthSec does not own. AuthSec never edits it in AWS: deliver by pull request or export.",
  customer_boundary_not_narrowable: () => "The role's own boundary uses NotAction, Action * or a namespace wildcard, so removing services from it cannot be proven safe.",
  customer_boundary_would_be_empty: () => "Removing these services would leave the role's boundary with nothing.",
  artifact_owned_elsewhere: () => "Another workspace controls this policy in AWS. AuthSec will not change it.",
  artifact_owned_by_other_control: () => "Another AuthSec control already owns this boundary.",
  artifact_consumers_changed: () => "Something else now uses AuthSec's boundary, so changing it would change that role too.",
  artifact_changed_outside_authsec: () => "The boundary was changed outside AuthSec.",
  boundary_policy_name_in_use: (d) => `A policy with the boundary's name already exists in the account.${d ? ` ${d}` : ""}`,
  policy_name_too_long: () => "The boundary's policy name would be longer than IAM allows.",
  role_only_recovery_not_needed: () => "A role-only recovery is not needed here.",
  role_only_recovery_unavailable: () => "A role-only recovery is not available here.",
  baseline_boundary_missing: () => "The boundary the role had before AuthSec is no longer there to restore.",
  direct_requires_authsec_boundary: () => "AuthSec applies a change itself only to a boundary it owns. Deliver this one by pull request or export.",
  migration_evidence_unavailable: () => "The evidence needed to move this workload to its own role is not available.",
  subject_binding_mismatch: () => "The workload is no longer bound to the role that was selected.",
  new_role_name_in_use: () => "A role with the new role's name already exists.",
  new_role_not_baseline_preserving: () => "The new role would not keep the access the workload has now.",
  split_requires_iac: () => "Moving a workload to its own role is delivered by pull request or export only.",
};

/** One sentence for a refusal; an unknown code is humanised with its detail, never hidden. */
export function refusalText(r: GovRefusal | string): string {
  const code = typeof r === "string" ? r.split(": ")[0] : r.code;
  const detail = typeof r === "string" ? (r.includes(": ") ? r.slice(r.indexOf(": ") + 2) : undefined) : r.detail;
  const f = REFUSALS[code];
  if (f) return f(detail);
  return `${humanize(code)}${detail ? `: ${detail}` : ""}.`;
}

const CASES: Record<GovPlanCase, string> = {
  none_to_authsec: "The role has no boundary. AuthSec creates one that excludes the removed services and attaches it.",
  authsec_version: "The role already has an AuthSec boundary. AuthSec writes a new default version of it.",
  customer_in_place: "The role has its own boundary, used by this role only. It is narrowed in place by removing the services' actions; AuthSec never edits it in AWS, so your pipeline or you apply it.",
  customer_split: "The role's boundary is shared with other entities and is not changed. A copy narrowed for this role only is created and set as this role's boundary.",
  undo_delete_new_boundary: "Undo: the role had no boundary before. AuthSec's boundary is detached and deleted.",
  undo_earlier_document: "Undo: the boundary returns to the document of the version before this one.",
  undo_customer_in_place: "Undo: the role's own boundary returns to the document it had before.",
  undo_split_copy: "Undo: the role is pointed back at the shared boundary and the copy is deleted.",
  role_only_detach: "Recovery for this role only: the boundary is detached from the role and the shared policy is left in place.",
  role_only_new_policy: "Recovery for this role only: the role gets a boundary of its own with the earlier document.",
  role_only_repoint_shared: "Recovery for this role only: the role is pointed back at the shared boundary.",
  remove_detach: "Removing AuthSec's control: the boundary is detached from the role.",
  remove_restore_in_place: "Removing AuthSec's control: the role's own boundary is restored to its earlier document.",
  remove_repoint_baseline: "Removing AuthSec's control: the role is pointed back at the boundary it had before.",
  split_isolate: "The workload moves to a role of its own with the same IAM policies and boundary.",
  split_revert: "The workload moves back to the role it came from.",
};
export const planCaseText = (c: string | null | undefined): string => (c ? CASES[c as GovPlanCase] ?? humanize(c) : "");

/** The boundary policy AuthSec writes: what happens to it, the role's attachment and any boundary it replaces. */
export function dispositionText(plan: Pick<GovPlanView, "desired_attachment" | "artifact_disposition" | "desired_boundary_arn" | "replaced_boundary_arn" | "kind">): string[] {
  const out: string[] = [];
  const undo = plan.kind !== "apply" && plan.kind !== "split";
  switch (plan.desired_attachment) {
    case "present":
      out.push(
        plan.desired_boundary_arn
          ? `After the change the role's permissions boundary is ${arnTail(plan.desired_boundary_arn)}.`
          : "After the change the role has a permissions boundary.",
      );
      break;
    case "absent":
      out.push("After the change the role has no AuthSec permissions boundary.");
      break;
    default:
      out.push("The role's attachment does not change.");
  }
  if (plan.replaced_boundary_arn) out.push(`It replaces ${arnTail(plan.replaced_boundary_arn)} as the role's boundary.`);
  const d = plan.artifact_disposition as GovArtifactDisposition;
  if (d === "keep") out.push(undo ? "The boundary policy stays in the account." : "The boundary policy is kept in the account.");
  else if (d === "delete") out.push("The boundary policy is deleted from the account.");
  else if (d === "retain_shared") out.push("The policy is shared with other entities, so it is left in place for them.");
  return out;
}

/** One operation of a plan, in words. The plan lists them in execution order. */
export function opText(op: GovOp): string {
  const policy = op.policy_arn ? arnTail(op.policy_arn) : op.policy_name || "the policy";
  const role = op.role_name || arnTail(op.role_arn) || "the role";
  switch (op.op) {
    case "CreatePolicy":
      return `Create the policy ${op.policy_name || policy}${op.path ? ` under ${op.path}` : ""}.`;
    case "CreatePolicyVersion":
      return `Write a new ${op.set_as_default ? "default " : ""}version of ${policy}.`;
    case "DeletePolicyVersion":
      return `Delete ${op.select === "all_non_default" ? "every non-default" : "the oldest non-default"} version of ${policy}${op.if_versions_at_least ? `, when it has ${op.if_versions_at_least} or more` : ""}.`;
    case "TagPolicy":
      return `Tag ${policy} to record this change.`;
    case "DeletePolicy":
      return `Delete ${policy}${op.only_if_unused ? " if nothing else uses it" : ""}.`;
    case "PutRolePermissionsBoundary":
      return `Set ${policy} as the permissions boundary of ${role}.`;
    case "DeleteRolePermissionsBoundary":
      return `Remove the permissions boundary of ${role}.`;
    case "CreateRole":
      return `Create the role ${op.role_name || ""}.`.replace("  ", " ");
    case "AttachRolePolicy":
      return `Attach ${policy} to ${role}.`;
    case "PutRolePolicy":
      return `Copy the inline policy ${op.inline_name || ""} to ${role}.`.replace("  ", " ");
    case "BindSubject":
      return `Bind the workload to ${role}${op.binding ? ` (${humanize(op.binding).toLowerCase()})` : ""}.`;
    case "DeleteRole":
      return `Delete ${role}.`;
    case "AddResourcePolicyPrincipal":
      return `Add ${role} to the resource policy of ${arnTail(op.resource_arn)}.`;
    case "RemoveResourcePolicyPrincipal":
      return `Remove ${role} from the resource policy of ${arnTail(op.resource_arn)}.`;
    case "AddTrustPolicyPrincipal":
      return `Add ${role} to a trust policy.`;
    case "RemoveTrustPolicyPrincipal":
      return `Remove ${role} from a trust policy.`;
    default:
      return humanize(op.op.replace(/([a-z])([A-Z])/g, "$1 $2"));
  }
}

const FORM_WORDS: Record<string, string> = {
  s3_bucket: "S3 bucket policies",
  sqs_queue: "SQS queue policies",
  sns_topic: "SNS topic policies",
  kms_key: "KMS key policies",
  ecr_repository: "ECR repository policies",
  lambda_function: "Lambda function policies",
  secrets_manager_secret: "Secrets Manager secret policies",
  s3_access_point: "S3 access point policies",
};
const formWords = (form: string | undefined): string => (form ? FORM_WORDS[form] ?? `${humanize(form).toLowerCase()} policies` : "resource policies");

/** One bundle gap: an item an approver must accept before approval. */
export function gapText(g: GovGap): string {
  switch (g.kind) {
    case "resource_policy_coverage":
      return `${humanize(formWords(g.form))} ${g.region ? `in ${g.region} ` : ""}were not fully read${g.reason ? ` (${humanize(g.reason).toLowerCase()})` : ""}. Use of ${g.service || "the service"} through them is unknown.`.replace("  ", " ");
    case "unanalysed_form":
      return `AuthSec does not analyse ${formWords(g.form)}${g.region ? ` in ${g.region}` : ""}; access through them is not covered.`;
    case "policy_unparseable":
      return `The policy of ${g.resource ? arnTail(g.resource) : "a resource"} could not be parsed${g.reason ? ` (${humanize(g.reason).toLowerCase()})` : ""}, so what it allows is unknown.`;
    case "consumers_unresolved":
      return `${g.count ?? "Some"} workload${g.count === 1 ? "" : "s"} that name this role could not be resolved, so the people who run on it may be missing.`;
    default:
      return humanize(g.kind);
  }
}

/** One unanalysed item of a first attachment: a policy-bearing form or resource AuthSec could not examine. */
export function unanalysedText(u: GovUnanalysedItem): string {
  if (u.key === "other_accounts") return "Resources in other accounts that name this role are not examined.";
  return `${humanize(formWords(u.form || u.key))} ${u.reason ? `(${humanize(u.reason).toLowerCase()}) ` : ""}are not analysed.`.replace("  ", " ");
}

const TRUST_REASONS: Record<string, string> = {
  stale: "the scan is out of date",
  unauthenticated: "the scan was not authenticated",
  unordered: "the scan's order could not be established",
  no_complete_evaluation: "no complete evaluation of this role exists yet",
  role_not_in_latest_evaluation: "the role is not in the latest evaluation",
  "provider_not_supported:K-1": "Kubernetes collection is not yet authenticated and ordered (K-1)",
};

export function trustReasonText(reason: string): string {
  if (TRUST_REASONS[reason]) return TRUST_REASONS[reason];
  const m = /^resource_policy_coverage_(.+)$/.exec(reason);
  if (m) return m[1] === "partial" ? "resource policies were only partly read" : m[1] === "not_collected" ? "resource policies were not collected" : `resource policy coverage is ${humanize(m[1]).toLowerCase()}`;
  return humanize(reason).toLowerCase();
}

const ROUTE_EFFECT: Record<string, string> = {
  limited: "Limited by the boundary: the removal takes effect on this route.",
  bypass_known: "Not limited by the boundary: access through this route remains.",
  effect_unknown: "AuthSec could not establish whether the boundary limits this route.",
  not_analysed: "AuthSec could not read or analyse this route.",
};
export const routeEffectText = (effect: string | null | undefined): string => (effect ? ROUTE_EFFECT[effect] ?? humanize(effect) : "");

const PRINCIPAL: Record<string, string> = {
  role_arn: "names this role",
  role_session: "names a session of this role",
  wildcard: "allows any principal",
};

/** One route: where it is, what it names, then what the boundary does to it. */
export function routeText(r: Pick<GovRoute, "service" | "form" | "region" | "resource" | "principal" | "effect" | "reason">): string {
  const where = r.resource ? `the resource policy of ${arnTail(r.resource)}` : r.form ? `${formWords(r.form)}${r.region ? ` in ${r.region}` : ""}` : `${r.service} resource policies`;
  const who = r.principal ? ` It ${PRINCIPAL[r.principal] ?? r.principal}.` : "";
  const why = r.reason && !r.resource ? ` (${humanize(r.reason).toLowerCase()})` : "";
  return `${r.service} through ${where}${why}.${who} ${routeEffectText(r.effect)}`.trim();
}

const STATEMENT_RESULT: Record<string, StateView> = {
  kept: { label: "Kept", tone: "neutral" },
  narrowed: { label: "Narrowed", tone: "warning" },
  deleted: { label: "Deleted", tone: "danger" },
};
export const statementResultView = (s: Pick<GovNarrowedStatement, "result">): StateView =>
  STATEMENT_RESULT[s.result] ?? { label: humanize(s.result), tone: "neutral" };

/** `Statement 2 (Sid) Allow: removes sqs:*, ec2:*`. */
export function statementResultText(s: GovNarrowedStatement): string {
  const label = `Statement ${s.index + 1}${s.sid ? ` (${s.sid})` : ""} · ${s.effect}`;
  if (s.result === "narrowed" && s.removed_actions?.length) return `${label}: removes ${s.removed_actions.join(", ")}`;
  if (s.result === "deleted") return `${label}: left with no action, so it is deleted`;
  return `${label}: unchanged`;
}

/** Canonical JSON text indented for reading; text that does not parse is shown as it is. */
export function prettyJson(text: string | null | undefined | Record<string, unknown>): string {
  if (text == null) return "";
  if (typeof text !== "string") return JSON.stringify(text, null, 2);
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
