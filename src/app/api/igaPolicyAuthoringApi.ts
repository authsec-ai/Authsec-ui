/**
 * Policies, versions, plans, approvals and owner review of the policy product
 * (SPEC-iga-phase3-policy.md §7.3 policies/versions/plans, §7.4 owner review,
 * §7.5 approval). Every route is under `POLICY_BASE`; the workspace is the
 * token's and is never sent. Shapes are traced to the Go structs that are
 * serialised (json tags), not to the spec: where they differ the code wins.
 *
 * Endpoint -> Go handler (authsec/controllers/platform) and response struct:
 *
 *   GET  /policies                                iga_gov_authoring_controller.go:130  GovPolicyView[]            services/iga_gov_authoring_service.go:346
 *   POST /proposals                               iga_gov_authoring_controller.go:228  ProposalResult             iga_gov_authoring_service.go:1322 (meta.evaluated_rev)
 *   GET  /policies/:id                            iga_gov_authoring_controller.go:147  GovPolicyView              iga_gov_authoring_service.go:546
 *   PATCH /policies/:id                           iga_gov_authoring_controller.go:244  models.IGAGovPolicy        models/iga_gov_policy.go:250
 *   POST /policies/:id/pause | resume             iga_gov_authoring_controller.go:318/321 (lifecycle :293)  models.IGAGovPolicy
 *   POST /policies/:id/archive                    iga_gov_authoring_controller.go:324  models.IGAGovPolicy
 *   GET  /policies/:id/versions                   iga_gov_authoring_controller.go:159  GovVersionView[]           iga_gov_authoring_service.go:330
 *   POST /policies/:id/versions                   iga_gov_authoring_controller.go:343  GovVersionView             iga_gov_authoring_service.go:1104
 *   GET  /policies/:id/versions/:no               iga_gov_authoring_controller.go:171  GovVersionView
 *   POST /policies/:id/versions/:no/propose       iga_gov_authoring_controller.go:372  ProposeResult              iga_gov_compile_service.go:389
 *   GET  /policies/:id/versions/:no/plans         iga_gov_authoring_controller.go:187  GovPlansView               iga_gov_compile_service.go:555
 *   GET  /policies/:id/versions/:no/export        iga_gov_export_controller.go:17      GovExportView              services/iga_gov_export.go:40
 *        ...?download=<plan_id>                   iga_gov_export_controller.go:18-54   GovExportPlan, NOT enveloped, as a file attachment
 *   POST /policies/:id/versions/:no/withdraw      iga_gov_authoring_controller.go:392  models.IGAGovPolicyVersion models/iga_gov_policy.go:269
 *   GET  /approvals                               iga_gov_authoring_controller.go:203  GovApprovalQueueItem[]     iga_gov_approval_service.go:429
 *   POST /policies/:id/versions/:no/approve       iga_gov_approval_controller.go:20    GovApprovalResult          iga_gov_approval_service.go:69
 *   POST /policies/:id/versions/:no/reject        iga_gov_approval_controller.go:45    models.IGAGovApproval      models/iga_gov_policy.go:472
 *   GET  /reviews                                 iga_gov_reviews_controller.go:87     GovReviewSummary[]         services/iga_gov_owner_review_service.go:1456
 *   GET  /reviews/:id                             iga_gov_reviews_controller.go:121    GovReviewView              iga_gov_owner_review_service.go:1349
 *   POST /reviews/:id/respond                     iga_gov_reviews_controller.go:158    GovRespondResult           iga_gov_owner_review_service.go:994
 *   POST /reviews/:id/exception                   iga_gov_reviews_controller.go:189    models.IGAGovOwnerReview   models/iga_gov_policy.go:434
 *   POST /reviews/:id/remind                      iga_gov_reviews_controller.go:220    {review_id, reminded_user_ids}
 *
 * Route table: controllers/platform/iga_gov_policy_controller.go:88-148.
 * Type names are the Go struct name prefixed `Gov`; `models.IGAGov*` rows drop
 * the `IGA` (`GovPolicy`, `GovPolicyVersion`, `GovApproval`, …).
 *
 * Cache: `IgaGovPolicy` (ALL + policy id), `IgaGovVersion` (`${policyId}:${no}`,
 * `${policyId}:ALL`, and `ALL` for a mutation that does not know the policy),
 * `IgaGovApproval ALL`, `IgaGovReview` (ALL + review id). A decision (propose,
 * approve, reject, withdraw, respond that creates a version, archive) also
 * invalidates the Finding, Readiness, Deployment and Rollout lists, which show
 * state those decisions move. Every mutation writes an `iga_gov_event`, so
 * `IgaGovEvent ALL` is invalidated by all of them.
 */

import { baseApi } from "./baseApi";
import { POLICY_BASE, enc, policyQuery } from "./igaPolicyCommon";
import type { PageArgs, PolicyEnvelope, WsArg } from "./igaPolicyCommon";

/* -------------------------------------------------------------------------- */
/*                         Vocabularies (Go constants)                         */
/* -------------------------------------------------------------------------- */

/** `govFamilies` (iga_gov_authoring_service.go:412). */
export const GOV_POLICY_FAMILIES = ["governance", "cloud_access", "time_bound", "runtime"] as const;
export type GovPolicyFamily = (typeof GOV_POLICY_FAMILIES)[number];

/** Only `aws` is accepted by `GET /policies?provider=` (ListPolicies). */
export type GovProvider = "aws";

/** `govLifecycles`, models.IGAGovPolicy.Lifecycle. */
export const GOV_POLICY_LIFECYCLES = ["active", "paused", "archived"] as const;
export type GovPolicyLifecycle = (typeof GOV_POLICY_LIFECYCLES)[number];

/** `govVStatuses`, iga_gov_policy_version.status. */
export const GOV_VERSION_STATUSES = ["draft", "in_review", "approved", "superseded", "withdrawn", "rejected"] as const;
export type GovVersionStatus = (typeof GOV_VERSION_STATUSES)[number];

/** `nextAction` (iga_gov_authoring_service.go:381). Rollout and deployment states do not refine it yet. */
export type GovNextAction = "none" | "create_version" | "propose" | "approve" | "rollout";

/** models.GovControl* (iga_gov_policy.go:440). */
export type GovControlState = "planned" | "active" | "removing" | "removed";

/** igagov/compile.go:34 (iga_gov_plan.kind CHECK). */
export const GOV_PLAN_KINDS = ["apply", "undo", "remove_control", "split", "split_revert"] as const;
export type GovPlanKind = (typeof GOV_PLAN_KINDS)[number];

/** Plans whose impact_hash an approval binds (`approvalHashes`, iga_gov_compile_service.go:717). */
export const GOV_IMPACT_PLAN_KINDS: readonly GovPlanKind[] = ["apply", "split"];

/** igagov/compile.go:40. */
export type GovEligibility = "eligible" | "iac_only" | "ineligible";

/** igagov/intent.go:32 (iga_gov_plan.delivery CHECK). */
export const GOV_DELIVERIES = ["direct", "iac_pr", "export"] as const;
export type GovDelivery = (typeof GOV_DELIVERIES)[number];

/** igagov/compile.go:44. */
export type GovAttachment = "present" | "absent" | "unchanged";
export type GovArtifactDisposition = "keep" | "delete" | "retain_shared";

/** igagov/intent.go:22. */
export type GovRetainBasis = "observed" | "dependency" | "owner" | "unreviewed";
export type GovRemoveBasis = "no_attempt";

/** igagov/findings.go:44. */
export type GovGrantAgeBasis = "observed_since_change" | "predates_observation" | "unknown";

/** igagov/routes.go:17-40. */
export type GovRouteUsage = "none_observed" | "confirm_required";
export type GovRouteState = "none_observed" | "bypass_known" | "effect_unknown" | "not_analysed";
export type GovRoutePrincipal = "role_arn" | "role_session" | "wildcard";
export type GovRouteEffect = "limited" | "bypass_known" | "effect_unknown" | "not_analysed";

/** igagov/bundle.go:18 and :38. */
export type GovTrust = "trusted" | "partial" | "untrusted";
export type GovGapKind = "resource_policy_coverage" | "unanalysed_form" | "policy_unparseable" | "consumers_unresolved";

/** igagov/recover.go:31-50 (the `kind` of a plan fact). */
export type GovFactKind =
  | "role_incarnation"
  | "role_definition"
  | "role_boundary"
  | "policy_document"
  | "policy_owner"
  | "policy_users"
  | "workload_binding"
  | "new_role";

/** igagov/intent.go:39. */
export type GovBindingKind = "ecs_task_role" | "lambda_role" | "ec2_instance_profile";

/** igagov/compile.go:931 (PlanDiff.case). */
export type GovPlanCase =
  | "none_to_authsec"
  | "authsec_version"
  | "customer_in_place"
  | "customer_split"
  | "undo_delete_new_boundary"
  | "undo_earlier_document"
  | "undo_customer_in_place"
  | "undo_split_copy"
  | "role_only_detach"
  | "role_only_new_policy"
  | "role_only_repoint_shared"
  | "remove_detach"
  | "remove_restore_in_place"
  | "remove_repoint_baseline"
  | "split_isolate"
  | "split_revert";

/** Why a plan is ineligible (igagov/compile.go:101-135 and split.go:32-36). `iga_gov_plan.ineligible_reason` joins these. */
export const GOV_REFUSAL_CODES = [
  "role_gone",
  "role_recreated",
  "service_linked_role",
  "aws_reserved_role",
  "authsec_managed_role",
  "protected_role",
  "recognition_only_identity",
  "service_not_in_activity_report",
  "removal_not_justified",
  "removal_is_dependency",
  "document_too_large",
  "resource_policy_evidence_incomplete",
  "resource_policy_blocks_boundary",
  "customer_boundary_requires_iac",
  "customer_boundary_not_narrowable",
  "customer_boundary_would_be_empty",
  "artifact_owned_elsewhere",
  "artifact_owned_by_other_control",
  "artifact_consumers_changed",
  "artifact_changed_outside_authsec",
  "boundary_policy_name_in_use",
  "policy_name_too_long",
  "role_only_recovery_not_needed",
  "role_only_recovery_unavailable",
  "baseline_boundary_missing",
  "direct_requires_authsec_boundary",
  "migration_evidence_unavailable",
  "subject_binding_mismatch",
  "new_role_name_in_use",
  "new_role_not_baseline_preserving",
  "split_requires_iac",
] as const;
export type GovRefusalCode = (typeof GOV_REFUSAL_CODES)[number];

/** Acceptance kinds (iga_gov_approval_service.go / iga_gov_compile_service.go:668). */
export type GovAcceptanceKind = "unanalysed_form" | "evidence_gap";

/** models.IGAGovApproval.Decision and Channel. */
export type GovDecision = "approve" | "reject";
export type GovApprovalChannel = "ui" | "slack";

/** `GET /approvals?status=` (ListApprovals). */
export type GovApprovalListStatus = "pending" | "decided";

/** Owner review (iga_gov_owner_review_service.go:150-175). */
export const GOV_REVIEW_STATUSES = ["open", "reopened", "complete", "excepted", "cancelled"] as const;
export type GovReviewStatus = (typeof GOV_REVIEW_STATUSES)[number];
export const GOV_RESPONSE_KINDS = ["acknowledge", "retain", "object"] as const;
export type GovResponseKind = (typeof GOV_RESPONSE_KINDS)[number];
export type GovReviewDelivery = "pending" | "delivered" | "failed";
export type GovReviewVia = "ui" | "slack" | "email_link";
export type GovReviewBlockerKind =
  | "missing_owner"
  | "owner_not_member"
  | "no_response"
  | "delivery_failed"
  | "objection"
  | "retained"
  | "new_owner"
  | "impact_changed";

/* -------------------------------------------------------------------------- */
/*                                  Intents                                    */
/* -------------------------------------------------------------------------- */
// igagov/intent.go. ParseIntent refuses unknown members, so these are the whole
// intent. A stored version's `intent` is the canonical (JCS) form of one of them.

/** A role an intent targets, by immutable RoleId (§2.2). */
export interface GovSubject {
  identity_account_id: string;
  /** `AROA…` */
  role_id: string;
  /** 12 digits. */
  account_id: string;
}

export interface GovRetainEntry {
  service: string;
  basis: GovRetainBasis;
  /** `observed`: RFC 3339 or YYYY-MM-DD, required. */
  last_attempt?: string;
  /** `dependency`: a catalog reference, required. */
  catalog?: string;
  /** `owner`: required. */
  reason?: string;
  /** `owner`: a review date, required. */
  review_by?: string;
}

/** A resource-policy route named on a removal (§2.7, §3.4). A route names a resource or a form. */
export interface GovIntentRoute {
  resource?: string;
  principal?: GovRoutePrincipal;
  form?: string;
}

export interface GovRemoveEntry {
  service: string;
  basis: GovRemoveBasis;
  /** At least 30 (`MinQualifiedDays`). */
  qualified_days: number;
  grant_age_basis: Exclude<GovGrantAgeBasis, "unknown">;
  route_usage?: GovRouteUsage;
  route_state?: GovRouteState;
  routes?: GovIntentRoute[];
}

export interface GovRolloutIntent {
  /** One of the subjects' `role_id`. */
  canary_target?: string;
  /** 1..336. */
  canary_hours?: number;
}

/** `right_size_services` (§2.7): restricts whole AWS services for the subject roles. */
export interface GovRightSizeIntent {
  kind: "right_size_services";
  subjects: GovSubject[];
  retain: GovRetainEntry[];
  remove: GovRemoveEntry[];
  /** 1..90. */
  observation_days: number;
  rollout?: GovRolloutIntent;
  delivery: GovDelivery;
  finding_ids?: string[];
  /** > 0: the revision the intent was proposed from. */
  evidence_rev: number;
}

/** `remove_control` (§8.10). Made by `POST /policies/:id/remove-control`, never by the versions route. */
export interface GovRemoveControlIntent {
  kind: "remove_control";
  control_ids: string[];
  reason: string;
}

export interface GovDedicatedWorkload {
  workload_id: string;
  binding_kind: GovBindingKind;
  /** An ARN. */
  binding_ref: string;
}

export interface GovInlinePolicyRef {
  name: string;
  /** `sha256:<64 hex>` */
  document_hash: string;
}

export interface GovNewRole {
  name: string;
  /** `/` or `/a/b/`. */
  path: string;
  trust_policy_hash: string;
  managed_policy_arns: string[];
  inline_policies: GovInlinePolicyRef[];
  boundary_arn?: string;
}

/** `dedicated_identity` (§11). Delivered only as `iac_pr` or `export`. */
export interface GovDedicatedIdentityIntent {
  kind: "dedicated_identity";
  source: GovSubject;
  workload: GovDedicatedWorkload;
  new_role: GovNewRole;
  delivery: Extract<GovDelivery, "iac_pr" | "export">;
}

/** A stored version's intent. Discriminated on `kind`. */
export type GovIntent = GovRightSizeIntent | GovRemoveControlIntent | GovDedicatedIdentityIntent;

/**
 * What `POST /policies/:id/versions` takes: `right_size_services`, or
 * `dedicated_identity` (the isolation flow, iga_gov_authoring_service.go:1112).
 * `remove_control` is refused 422 invalid_intent (field `kind`, code `not_supported_here`).
 */
export type GovIntentInput = GovRightSizeIntent | GovDedicatedIdentityIntent;

export type GovIntentKind = GovIntent["kind"];

/** One field-level problem of a 422 invalid_intent (igagov.IntentError). */
export interface GovIntentError {
  /** `subjects[0].role_id`, `remove[1].routes[0].principal`, `evidence_rev`; "" for the whole body. */
  field: string;
  /** `invalid`, `required`, `duplicate`, `conflict`, `out_of_range`, `not_qualified`, `shape`, `not_json`, `unknown_kind`, `not_supported_here`, `shape`. */
  code: string;
  message: string;
}

/** The services an intent removes, sorted and unique (`removedServices`, iga_gov_compile_service.go:72). */
export function govRemovedServices(intent: GovIntent): string[] {
  if (intent.kind !== "right_size_services") return [];
  return [...new Set(intent.remove.map((r) => r.service))].sort();
}

/* -------------------------------------------------------------------------- */
/*                       Shared building blocks (Go structs)                   */
/* -------------------------------------------------------------------------- */

/** services.TargetKey (iga_gov_targets.go:43). Exactly one form per key (ValidateTargetKeys). */
export interface GovTargetKey {
  provider?: "aws" | "k8s";
  account_id?: string;
  role_arn?: string;
  role_id?: string;
  object_id?: string;
  cluster_uid?: string;
  namespace?: string;
  service_account?: string;
  uid?: string;
}

/** services.ConsumerView (iga_gov_reads.go:617). */
export interface GovConsumerView {
  workload_id: string;
  name: string;
  runtime_kind: string;
  relationship: string;
}

/** igagov.Gap (bundle.go:126): one evidence gap an approver must accept. */
export interface GovGap {
  kind: GovGapKind;
  key: string;
  service?: string;
  form?: string;
  region?: string;
  resource?: string;
  reason?: string;
  count?: number;
}

/** igagov.Route (routes.go:57): a resource-policy route of a service, or a form or region the evidence could not analyse. */
export interface GovRoute {
  service: string;
  form?: string;
  region?: string;
  resource?: string;
  principal?: GovRoutePrincipal;
  effect: GovRouteEffect;
  reason?: string;
}

export interface GovImpactConsumer {
  workload_id: string;
  relationship: string;
}

/** `basis` is a retain or remove basis; an undo's `restored` entries use the basis of what returns. */
export interface GovImpactService {
  service: string;
  basis: string;
}

/**
 * igagov.Impact (canonical.go:805): who and what a plan affects, the input of
 * `impact_hash`. Arrays are always present (Normalized); `restored` is only
 * present on undo, role-only recovery and remove-control plans.
 */
export interface GovImpact {
  consumers: GovImpactConsumer[];
  /** User ids (json tag `owners`). */
  owners: string[];
  removed: GovImpactService[];
  retained: GovImpactService[];
  statement_revisions: string[];
  routes: GovRoute[];
  restored?: GovImpactService[];
}

/** igagov.UnanalysedItem (canonical.go:877): accepted one by one (kind `unanalysed_form`). */
export interface GovUnanalysedItem {
  key: string;
  form?: string;
  reason?: string;
}

/** igagov.Op (compile.go:880). Which members are set depends on `op`. */
export interface GovOp {
  /** `CreatePolicy`, `CreatePolicyVersion`, `DeletePolicyVersion`, `TagPolicy`, `DeletePolicy`, `PutRolePermissionsBoundary`, `DeleteRolePermissionsBoundary`, and the dedicated-identity steps (`CreateRole`, `AttachRolePolicy`, `PutRolePolicy`, `Add/RemoveResourcePolicyPrincipal`, `Add/RemoveTrustPolicyPrincipal`, `BindSubject`, `DeleteRole`). */
  op: string;
  role_name?: string;
  role_arn?: string;
  policy_arn?: string;
  policy_name?: string;
  path?: string;
  document_hash?: string;
  set_as_default?: boolean;
  /** A tag value `${deployment_id}` stands for the deploying deployment. */
  tags?: Record<string, string>;
  /** `oldest_non_default` | `all_non_default`. */
  select?: string;
  if_versions_at_least?: number;
  subject_arn?: string;
  trust_policy_hash?: string;
  resource_arn?: string;
  principal?: string;
  inline_name?: string;
  instance_profile?: string;
  only_if_unused?: boolean;
  binding?: string;
  steps?: string[];
}

export interface GovBoundaryRef {
  arn: string;
  document_hash: string;
}

export interface GovNarrowedStatement {
  index: number;
  sid?: string;
  effect: string;
  /** kept, narrowed or deleted. */
  result: string;
  removed_actions?: string[];
}

export interface GovNarrowing {
  statements: GovNarrowedStatement[];
  changed: boolean;
  subset_proof: boolean;
}

export interface GovIncompleteForm {
  form: string;
  region?: string;
  state: string;
}

/** An observed resource policy that makes a first attachment unsafe. */
export interface GovBlocker {
  kind: "deny_not_principal" | "unparseable";
  form: string;
  region?: string;
  resource: string;
  sid?: string;
}

export interface GovFirstAttachmentProof {
  scan_run_id: string;
  incomplete: GovIncompleteForm[];
  blockers: GovBlocker[];
  unanalysed: GovUnanalysedItem[];
  covered_by_gaps: string[];
}

export interface GovCompatibilityItem {
  /** `resource_policy` | `trust_policy` | `principal_condition`. */
  kind: string;
  resource: string;
  form?: string;
  principal?: string;
  /** `pr_adds_new_role` | `owner_confirmation` | `effect_unknown`. */
  handling: string;
}

/** The dedicated-identity part of a `split` plan's diff. */
export interface GovSplitDetail {
  source_role_arn: string;
  new_role_arn: string;
  new_role_hash: string;
  /** `ecs_service` | `lambda_function` | `ec2_auto_scaling_group` | `ec2_instance`. */
  subject_kind: string;
  subject_arn: string;
  from_workload_keys: string[];
  compatibility: GovCompatibilityItem[];
}

/** The classifier's fact table entry (igagov.Fact, recover.go:60). */
export interface GovFact {
  /** `kind` or `kind:subject`. */
  key: string;
  kind: GovFactKind;
  subject?: string;
  before: string;
  after: string;
  only_before?: boolean;
}

/**
 * igagov.PlanDiff (compile.go:916): what a plan changes and why. A note
 * prefixed `iac_fallback:` is read by the export (`IaCFallbackOf`).
 */
export interface GovPlanDiff {
  case: GovPlanCase;
  boundary_before: GovBoundaryRef | null;
  boundary_after: GovBoundaryRef | null;
  newly_excluded: string[];
  already_excluded: string[];
  newly_unexcluded: string[];
  narrowing?: GovNarrowing;
  first_attachment?: GovFirstAttachmentProof;
  split?: GovSplitDetail;
  /** `already_in_place`, `customer_boundary_already_excludes`, `baseline_document_changed`, `copy_retained_for_other_users`, `policy_retained_for_other_users`, or `iac_fallback:…`. */
  notes: string[];
  /** Null when the compiler recorded none. */
  facts: GovFact[] | null;
}

export interface GovAttachedEntity {
  kind: string;
  id: string;
  name: string;
  /** `boundary` | `permissions` */
  usage: string;
}

/** igagov.ArtifactStateFacts (canonical.go:682). */
export interface GovArtifactStateFacts {
  role_id: string;
  boundary_arn: string | null;
  boundary_document_hash: string | null;
  attachment_set: GovAttachedEntity[];
}

export interface GovPolicyRef {
  ref: string;
  document_hash: string;
}

/** igagov.ApplyPrecondition (canonical.go:731): an apply plan's precondition. */
export interface GovApplyPrecondition {
  artifact_state: GovArtifactStateFacts;
  role_arn: string;
  role_path: string;
  protection_tags: Record<string, string>;
  managed_policies: GovPolicyRef[];
  inline_policies: GovPolicyRef[];
}

/**
 * `iga_gov_plan.precondition`: an apply plan's {@link GovApplyPrecondition};
 * undo, remove-control and recovery plans carry `{artifact_state}` only; split
 * plans carry their own shape (igagov/split.go, not traced field by field).
 */
export type GovPlanPrecondition = GovApplyPrecondition | { artifact_state: GovArtifactStateFacts } | Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/*                         Policies, versions (read models)                    */
/* -------------------------------------------------------------------------- */

/** services.GovTargetView (iga_gov_authoring_service.go:315): one target of a version. */
export interface GovTargetView {
  id: string;
  control_id: string;
  identity_account_id: string;
  account_id: string;
  role_id: string;
  role_arn: string;
  is_canary: boolean;
  control_state: GovControlState;
  /** The current apply plan's; null before compilation. */
  eligibility: GovEligibility | null;
  /** "" when eligible. Refusals joined with "; ", each `code` or `code: detail`; see {@link govParseIneligibleReason}. */
  ineligible_reason: string;
}

/** services.GovVersionView (iga_gov_authoring_service.go:330). */
export interface GovVersionView {
  id: string;
  policy_id: string;
  /** json tag `no`. */
  no: number;
  status: GovVersionStatus;
  intent: GovIntent;
  intent_hash: string;
  catalog_version: number;
  evidence_rev: number;
  created_by: string;
  created_at: string;
  status_changed_at: string;
  targets: GovTargetView[];
}

/** services.GovControlRow (iga_gov_authoring_service.go:368). */
export interface GovControlRow {
  id: string;
  account_id: string;
  role_id: string;
  role_arn: string;
  identity_account_id: string;
  boundary_policy_arn: string;
  state: GovControlState;
}

/** services.GovPolicyView (iga_gov_authoring_service.go:346): a policy in a list or its detail. */
export interface GovPolicyView {
  id: string;
  name: string;
  purpose: string;
  family: GovPolicyFamily;
  provider: GovProvider;
  lifecycle: GovPolicyLifecycle;
  /** json tag `owner`: a workspace member's user id. */
  owner: string | null;
  /** The current version's status; null before any version is current. */
  status: GovVersionStatus | null;
  /** `1 role` | `N roles`. */
  scope_summary: string;
  /**
   * Where the policy stands, one server definition for the list, its tiles
   * and the detail (iga_gov_authoring_service.go `policyStageSQL`).
   */
  stage: GovPolicyStage;
  /** The newest current deployment's delivery; null before one. */
  delivery: "direct" | "iac_pr" | "export" | null;
  /** The newest verification of a live control's deployment; null before one. */
  last_verified_at: string | null;
  next_action: GovNextAction;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Detail only (`GET /policies/:id`). */
  current_version?: GovVersionView;
  /** Detail only; present when exactly one version is approved. */
  approved_version_no?: number;
  /** Detail only. */
  controls?: GovControlRow[];
}

/** models.IGAGovPolicy (iga_gov_policy.go:250): what PATCH, pause, resume and archive answer. */
export interface GovPolicy {
  id: string;
  workspace_id: string;
  name: string;
  purpose: string;
  family: GovPolicyFamily;
  provider: GovProvider;
  lifecycle: GovPolicyLifecycle;
  owner_user_id?: string;
  current_version_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * models.IGAGovPolicyVersion (iga_gov_policy.go:269): what `withdraw` answers.
 * `status` is `withdrawn` but `status_changed_at` is the value BEFORE the
 * withdrawal (the handler returns the row it loaded); re-read the version.
 */
export interface GovPolicyVersion {
  id: string;
  workspace_id: string;
  policy_id: string;
  /** json tag `version_no` (the views call it `no`). */
  version_no: number;
  intent: GovIntent;
  intent_hash: string;
  catalog_version: number;
  evidence_rev: number;
  status: GovVersionStatus;
  created_by: string;
  created_at: string;
  status_changed_at: string;
}

/** `GovPolicyStages` (iga_gov_authoring_service.go): in the order the server defines them. */
export const GOV_POLICY_STAGES = [
  "archived",
  "drifted",
  "failed",
  "canary",
  "observing",
  "partial",
  "verified",
  "applying",
  "in_review",
  "approved",
  "draft",
  "idle",
] as const;
export type GovPolicyStage = (typeof GOV_POLICY_STAGES)[number];

export interface GovPolicyListMeta {
  next_cursor: string | null;
  /** Policies per stage across the workspace (archived excluded), whatever page or filter is shown. List only. */
  stage_tiles?: Partial<Record<GovPolicyStage, number>>;
}

export interface GovPolicyListArgs extends WsArg, PageArgs {
  family?: GovPolicyFamily;
  provider?: GovProvider;
  /** The current version's status. */
  status?: GovVersionStatus;
  stage?: GovPolicyStage;
  lifecycle?: GovPolicyLifecycle;
  /** Case-insensitive name prefix. */
  q?: string;
}

/** `PATCH /policies/:id`: only these three members; any other is 400. `owner_user_id: null` clears the owner. */
export interface GovPolicyPatch {
  name?: string;
  purpose?: string;
  owner_user_id?: string | null;
}

/** pause and resume require a reason; archive's is optional. */
export interface GovReasonBody {
  reason: string;
}

/* -------------------------------------------------------------------------- */
/*                                 Proposals                                   */
/* -------------------------------------------------------------------------- */

/**
 * `POST /proposals` (services.ProposalRequest, iga_gov_authoring_service.go:1258):
 * EXACTLY ONE of `from`, `template`+`keys`, `context` (else 400 invalid_parameter
 * `body`). `template` is `right_size_services`, or `dedicated_identity` with `isolation`. `name` is generated when
 * absent (an explicit duplicate is 409 policy_name_taken); `delivery` is chosen
 * by the server when absent (`export` when a customer-owned boundary exists).
 */
export interface GovProposalRequest {
  from?: { finding_ids: string[] };
  template?: "right_size_services" | "dedicated_identity";
  isolation?: { workload: GovDedicatedWorkload; role_name: string; role_path?: string };
  /** 1..50 keys, each exactly one form (iga_gov_targets.go:143). */
  keys?: GovTargetKey[];
  context?: { object_id: string };
  name?: string;
  purpose?: string;
  delivery?: GovDelivery;
}

/** services.IndependentGrant (iga_gov_authoring_service.go:1275): a grant of a removed service beyond the selected context. */
export interface GovIndependentGrant {
  role_id: string;
  policy_arn: string;
  assignment_kind: string;
  statement_key: string;
  services: string[];
}

/** services.ProposalRoute: an igagov.Route of a removed service in the preview; `boundary_applies` is true when the boundary limits it. */
export interface GovProposalRoute extends GovRoute {
  role_id: string;
  boundary_applies: boolean;
}

/** services.ProposalContext: the graph object a proposal was opened from. */
export interface GovProposalContext {
  object_kind: string;
  object_id: string;
  policy_arn?: string;
}

/** services.ProposalEvidence: one target's evidence bundle. */
export interface GovProposalEvidence {
  identity_account_id: string;
  role_id: string;
  bundle_id: string;
  bundle_hash: string;
  trust: GovTrust;
  trust_reasons: string[] | null;
  gaps: GovGap[];
}

/**
 * services.ProposalRecommendation: what the new-policy flow renders.
 * `warnings` are machine strings: `not_common:<role_id>:<service>`,
 * `shared_role: N workloads run as <name>`, `consumers_unresolved: …`,
 * `age_unverified: <service> was granted before …`.
 */
export interface GovProposalRecommendation {
  qualified_days: number;
  retain: GovRetainEntry[];
  remove: GovRemoveEntry[];
  consumers: GovConsumerView[];
  independent_grants: GovIndependentGrant[];
  resource_policy_routes: GovProposalRoute[];
  warnings: string[];
  context?: GovProposalContext;
}

/** services.ProposalResult (iga_gov_authoring_service.go:1322): the draft that was created, plus the recommendation. */
export interface GovProposalResult {
  policy: { id: string; name: string; family: GovPolicyFamily; provider: GovProvider };
  /** The version is version 1, status `draft`; `intent` is the canonical right-sizing or dedicated-identity intent. */
  version: { id: string; no: number; status: GovVersionStatus; intent: GovRightSizeIntent | GovDedicatedIdentityIntent; intent_hash: string };
  /** The first target's bundle; `evidence_targets` lists every target's. */
  evidence: GovProposalEvidence;
  evidence_targets: GovProposalEvidence[];
  recommendation: GovProposalRecommendation;
}

/** `meta` of `POST /proposals`: the highest evidence revision any target's bundle was built at. */
export interface GovProposalMeta {
  evaluated_rev: number;
}

/* -------------------------------------------------------------------------- */
/*                                Plans, export                                */
/* -------------------------------------------------------------------------- */

/**
 * services.GovPlanView (iga_gov_compile_service.go:537): models.IGAGovPlan
 * (flattened) plus its role and the archived documents. Every field below is
 * a json tag of models.IGAGovPlan (iga_gov_policy.go:396) unless noted.
 */
export interface GovPlanView {
  id: string;
  workspace_id: string;
  version_id: string;
  target_id: string;
  control_id: string;
  kind: GovPlanKind;
  delivery: GovDelivery;
  eligibility: GovEligibility;
  /** "" when eligible; see {@link govParseIneligibleReason}. */
  ineligible_reason: string;
  /** Always `live_read` today; `graph_rev` is reserved. */
  basis: string;
  basis_read_at: string;
  precondition: GovPlanPrecondition;
  precondition_hash: string;
  before_document_hash?: string;
  desired_attachment: GovAttachment;
  desired_boundary_arn?: string;
  desired_document_hash?: string;
  replaced_boundary_arn?: string;
  artifact_disposition: GovArtifactDisposition;
  evidence_bundle_id: string;
  evidence_rev: number;
  resource_policy_scan_run_id?: string;
  first_attachment: boolean;
  unanalysed: GovUnanalysedItem[];
  impact: GovImpact;
  impact_hash: string;
  /** In execution order; empty for an ineligible plan. */
  operations: GovOp[];
  diff: GovPlanDiff;
  plan_hash: string;
  material_hash: string;
  /** Never set on the current plans this route returns. */
  superseded_at?: string;
  created_at: string;
  /** From the plan's control. */
  role_id: string;
  role_arn: string;
  /** The canonical boundary document before the plan; absent when none or not archived. */
  before_document?: Record<string, unknown> | null;
  /** The canonical boundary document after the plan; absent when none or not archived. */
  desired_document?: Record<string, unknown> | null;
  /** The gaps of the plan's evidence bundle. */
  gaps: GovGap[];
}

/**
 * services.GovAcceptanceItem (iga_gov_compile_service.go:527): one uncertainty
 * the approver must accept item by item, echoed back with `kind`, `plan_id`,
 * `item_key`, `item_hash`. Only apply and split plans of an eligible target
 * carry items (a gap is accepted once, on the forward plan).
 */
export interface GovAcceptanceItem {
  kind: GovAcceptanceKind;
  plan_id: string;
  role_id: string;
  item_key: string;
  item_hash: string;
  /** `unanalysed_form`: a {@link GovUnanalysedItem}; `evidence_gap`: a {@link GovGap}. */
  detail: GovUnanalysedItem | GovGap;
}

/** services.GovApprovalHashes (iga_gov_compile_service.go:547): the values an approval must echo. */
export interface GovApprovalHashes {
  intent_hash: string;
  /** Apply and split plans' `impact_hash`, sorted. */
  impact_hashes: string[];
  /** Every current plan's `plan_hash` (apply AND undo), sorted. */
  plan_hashes: string[];
  /** Every current plan's `material_hash`, sorted. */
  material_hashes: string[];
}

/** services.GovPlansView (iga_gov_compile_service.go:555). Plans are ordered by role id, then kind (apply before undo). */
export interface GovPlansView {
  version_no: number;
  status: GovVersionStatus;
  plans: GovPlanView[];
  acceptance_items: GovAcceptanceItem[];
  hashes: GovApprovalHashes;
}

/** services.ProposeResult (iga_gov_compile_service.go:389). */
export interface GovProposeResult {
  version: GovVersionView;
  plans: GovPlansView;
}

/** iacpr.Description (iacpr/describe.go:14). */
export interface GovArtifactDescription {
  title: string;
  effect: string;
  plan_hash: string;
  recognition: string[];
  body: string;
}

/** iacpr.Fallback: why an `iac_pr` plan is delivered as an export. */
export interface GovIaCFallback {
  reason: string;
  detail: string;
}

/** iacpr.Artifact (iacpr/export.go:18). */
export interface GovArtifact {
  plan_kind: GovPlanKind;
  role_arn: string;
  role_id: string;
  description: GovArtifactDescription;
  /** File name -> canonical JSON. */
  documents: Record<string, string>;
  aws_cli: string[];
  terraform: string;
  iac_fallback?: GovIaCFallback;
}

/** services.GovExportPlan (iga_gov_export.go:29): one plan's artifact. */
export interface GovExportPlan {
  plan_id: string;
  kind: GovPlanKind;
  delivery: GovDelivery;
  plan_hash: string;
  /** The latest deployment of this plan, when one exists. */
  deployment_id?: string;
  deployment_state?: string;
  artifact: GovArtifact;
}

/** services.GovExportView (iga_gov_export.go:40). Needs a live approval, else 409 version_not_approved. Ineligible plans are left out. */
export interface GovExportView {
  version_no: number;
  plans: GovExportPlan[];
}

/* -------------------------------------------------------------------------- */
/*                                  Approvals                                  */
/* -------------------------------------------------------------------------- */

/** services.GovApprovalQueueItem (iga_gov_approval_service.go:429): one row of GET /approvals. */
export interface GovApprovalQueueItem {
  policy_id: string;
  policy_name: string;
  version_id: string;
  version_no: number;
  status: GovVersionStatus;
  author_id: string;
  /** The version's `status_changed_at`: when it entered review (pending) or last changed. */
  proposed_at: string;
  targets: number;
  /** `decided` rows only. */
  approval_id?: string;
  decision?: GovDecision;
  decided_at?: string;
  revoked_at?: string;
  revoked_reason?: string;
}

export interface GovApprovalListArgs extends WsArg, PageArgs {
  /** Default `pending`: versions in review the caller did not author. `decided`: the caller's own decisions. */
  status?: GovApprovalListStatus;
}

/** services.GovAcceptanceInput (iga_gov_approval_service.go:46): one accepted item; `reason` is required. */
export interface GovAcceptanceInput {
  kind: GovAcceptanceKind;
  plan_id: string;
  item_key: string;
  item_hash: string;
  reason: string;
}

/**
 * services.GovApproveRequest (iga_gov_approval_service.go:57). The four hash
 * members are required (an absent array is 400; `[]` is accepted). Every hash
 * must equal its current value (see {@link buildGovApproveRequest}) and every
 * acceptance item must be accepted exactly once.
 */
export interface GovApproveRequest {
  intent_hash: string;
  impact_hashes: string[];
  plan_hashes: string[];
  material_hashes: string[];
  acceptances: GovAcceptanceInput[];
  reason?: string;
}

/** models.IGAGovApproval (iga_gov_policy.go:472). */
export interface GovApproval {
  id: string;
  workspace_id: string;
  version_id: string;
  decision: GovDecision;
  decided_by: string;
  channel: GovApprovalChannel;
  intent_hash: string;
  impact_hashes: string[];
  plan_hashes: string[];
  material_hashes: string[];
  evidence_rev: number;
  reason: string;
  /** `approve`: decided_at + the workspace's approval validity days (default 7); `reject`: decided_at. */
  expires_at: string;
  revoked_at?: string;
  revoked_reason: string;
  decided_at: string;
}

/** models.IGAGovAcceptance (models/iga_gov_rollout.go:105): a recorded acceptance. */
export interface GovAcceptance {
  id: string;
  workspace_id: string;
  kind: GovAcceptanceKind;
  item_key: string;
  item_hash: string;
  version_id: string;
  approval_id?: string;
  plan_id?: string;
  evidence_bundle_id?: string;
  rollout_id?: string;
  stage?: string;
  window_start?: string;
  window_end?: string;
  reason: string;
  accepted_by: string;
  accepted_at: string;
}

/** services.GovApprovalResult (iga_gov_approval_service.go:69). The version is `approved`. */
export interface GovApprovalResult {
  approval: GovApproval;
  acceptances: GovAcceptance[];
  version: GovVersionView;
}

/* -------------------------------------------------------------------------- */
/*                                Owner review                                 */
/* -------------------------------------------------------------------------- */

/** services.GovAgeItem: owners confirm a removed service's grant is not new. */
export interface GovAgeItem {
  target_id: string;
  service: string;
  grant_age_basis: GovGrantAgeBasis;
}

/** services.GovRouteItem: owners confirm a resource-policy route is unused. `route` is the key a confirmation names (a resource ARN, `form:<form>[@<region>]` or `service:<service>`). */
export interface GovRouteItem {
  target_id: string;
  service: string;
  route: string;
  resource?: string;
  form?: string;
  region?: string;
  principal?: GovRoutePrincipal;
  effect: GovRouteEffect;
}

/** services.GovRetainItem (the body of a `retain` response). `review_by`: YYYY-MM-DD or RFC 3339, in the future. */
export interface GovRetainItem {
  service: string;
  reason: string;
  review_by: string;
}

/** services.GovAgeConfirmation. Only `confirmed: true` is accepted. */
export interface GovAgeConfirmation {
  service: string;
  confirmed: boolean;
}

/** services.GovRouteConfirmation. `route` is a {@link GovRouteItem}'s `route`. Only `confirmed: true` is accepted. */
export interface GovRouteConfirmation {
  service: string;
  route: string;
  confirmed: boolean;
}

/** services.GovReviewBlocker (iga_gov_owner_review_service.go:247): why the review cannot complete. */
export interface GovReviewBlocker {
  kind: GovReviewBlockerKind;
  target_id?: string;
  user_id?: string;
  workload_id?: string;
  name?: string;
  detail?: string;
  /** `retained`: the services the owner keeps. */
  services?: string[];
}

/** services.GovReviewOwnerOf: one reason a person is asked (a target role they own, directly or through a consuming workload). */
export interface GovReviewOwnerOf {
  target_id: string;
  identity_account_id: string;
  role_arn: string;
  object_kind: string;
  object_id: string;
  name: string;
  role: string;
  source: string;
}

/** services.OwnerView (iga_gov_ownership_service.go:69). */
export interface GovOwnerView {
  id: string;
  object_kind: string;
  object_id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  source: string;
  rule_id: string | null;
  review_due_at: string | null;
  /** False when the user is no longer an active member of the workspace. */
  member: boolean;
  created_at: string;
  updated_at: string;
}

/** services.ConsumerOwners: a workload running as a role and its accountable owners. */
export interface GovConsumerOwners extends GovConsumerView {
  owners: GovOwnerView[];
}

/** services.GovReviewTargetView. */
export interface GovReviewTargetView {
  target_id: string;
  control_id: string;
  identity_account_id: string;
  role_arn: string;
  removed: GovImpactService[];
  retained: GovImpactService[];
  consumers: GovConsumerOwners[];
}

/** services.GovReviewResponseView: one owner's row; an owner not yet asked has `asked: false`. */
export interface GovReviewResponseView {
  user_id: string;
  name: string;
  asked: boolean;
  current_owner: boolean;
  owner_of: GovReviewOwnerOf[];
  delivery: GovReviewDelivery;
  delivery_channels: string[];
  response: GovResponseKind | null;
  retain_items: GovRetainItem[];
  age_confirmations: GovAgeConfirmation[];
  route_confirmations: GovRouteConfirmation[];
  comment: string;
  responded_at: string | null;
  responded_via: GovReviewVia | null;
}

/** `GovReviewView.version` (a map in Go; keys from `view`, iga_gov_owner_review_service.go:1406). */
export interface GovReviewVersionRef {
  id: string;
  policy_id: string;
  policy_name: string;
  version_no: number;
  status: GovVersionStatus;
  created_by: string;
  /** The author's display name, served with the review so an owner who cannot list members still reads who asked. */
  created_by_name?: string;
  intent_hash: string;
}

/**
 * The owner gate as the view reports it (`gate`, a map in Go). `code` is the
 * 409 the approval would answer: `review_incomplete`, `age_unconfirmed` or
 * `route_unconfirmed`. Null only when the gate failed with an error that is not
 * a GovError.
 */
export type GovReviewGate = { passed: true } | { passed: false; code: string; message: string };

/** services.GovReviewView (iga_gov_owner_review_service.go:1349): GET /reviews/:id. */
/** services.GovReviewDeployment: a forward deployment of the reviewed version. */
export interface GovReviewDeployment {
  id: string;
  kind: string;
  state: string;
  delivery: string;
  role_arn: string;
}

export interface GovReviewView {
  /** The forward deployments of the reviewed version; an owner needs no governance:read to report on them. */
  deployments: GovReviewDeployment[];
  id: string;
  status: GovReviewStatus;
  deadline_at: string;
  /** Past the deadline and not closed. Silence is not consent: the deadline changes nothing. */
  overdue: boolean;
  created_at: string;
  closed_at: string | null;
  exception_by: string | null;
  exception_reason: string;
  /** The impact hashes the owners were asked about. */
  impact_hashes: string[];
  /** The current forward plans' impact hashes; a difference means the review must be reopened. */
  current_impact_hashes: string[];
  version: GovReviewVersionRef;
  targets: GovReviewTargetView[];
  /** What owners are asked to confirm. */
  requested: { age_confirmations: GovAgeItem[]; route_confirmations: GovRouteItem[] };
  responses: GovReviewResponseView[];
  /** The viewer's own row; null when the viewer was not asked or is not a verified member. */
  my_response: GovReviewResponseView | null;
  blockers: GovReviewBlocker[];
  gate: GovReviewGate | null;
  /** Items no responding owner of their target has confirmed. */
  unconfirmed: { age: GovAgeItem[]; routes: GovRouteItem[] };
  viewer_is_owner: boolean;
}

/** services.GovReviewSummary (iga_gov_owner_review_service.go:1456): one row of GET /reviews. */
export interface GovReviewSummary {
  id: string;
  version_id: string;
  policy_id: string;
  policy_name: string;
  version_no: number;
  status: GovReviewStatus;
  deadline_at: string;
  overdue: boolean;
  created_at: string;
  closed_at: string | null;
  owners_asked: number;
  owners_responded: number;
  /** The viewer's response; null when none yet, or when `mine` is not set and the viewer was not asked. */
  my_response: GovResponseKind | null;
  asked: boolean;
}

export interface GovReviewListArgs extends WsArg, PageArgs {
  /** Only the reviews the caller was asked in. Needs a verified member session; without it the list needs governance:read. */
  mine?: boolean;
  status?: GovReviewStatus[];
  /** `due`: open reviews first by deadline, then closed ones; global across pages. Default newest first. */
  order?: "due";
}

/**
 * services.GovRespondInput (iga_gov_owner_review_service.go:983). Unknown
 * members are refused (400 invalid_parameter `body`). `retain` needs at least
 * one retain item for a service this version removes on a role the caller owns;
 * `object` needs a comment; `acknowledge` takes no retain items. Confirmations
 * must be requested of the caller (see GovReviewView.requested).
 */
export interface GovRespondRequest {
  response: GovResponseKind;
  retain_items?: GovRetainItem[];
  age_confirmations?: GovAgeConfirmation[];
  route_confirmations?: GovRouteConfirmation[];
  comment?: string;
}

/** models.IGAGovOwnerResponse (iga_gov_policy.go:455), as Respond returns it. */
export interface GovOwnerResponse {
  id: string;
  workspace_id: string;
  review_id: string;
  user_id: string;
  owner_of: GovReviewOwnerOf[];
  delivery: GovReviewDelivery;
  delivery_channels: string[];
  response?: GovResponseKind;
  retain_items: GovRetainItem[];
  age_confirmations: GovAgeConfirmation[];
  route_confirmations: GovRouteConfirmation[];
  comment: string;
  responded_at?: string;
  responded_via?: GovReviewVia;
}

/**
 * services.GovRespondResult (iga_gov_owner_review_service.go:994). A `retain`
 * response creates the next version (`new_version_id`) and withdraws the
 * reviewed one; an `object` response creates nothing and blocks the gate.
 */
export interface GovRespondResult {
  response: GovOwnerResponse;
  review_status: GovReviewStatus;
  new_version_id: string | null;
}

/** models.IGAGovOwnerReview (iga_gov_policy.go:434): what `exception` answers. */
export interface GovOwnerReview {
  id: string;
  workspace_id: string;
  version_id: string;
  impact_hashes: string[];
  status: GovReviewStatus;
  deadline_at: string;
  exception_by?: string;
  exception_reason: string;
  created_at: string;
  closed_at?: string;
}

/** `data` of `POST /reviews/:id/remind`. */
export interface GovRemindResult {
  review_id: string;
  reminded_user_ids: string[];
}

/* -------------------------------------------------------------------------- */
/*                         Error `detail` shapes (§7.12)                       */
/* -------------------------------------------------------------------------- */
// Every error is `{error: {code, message, detail}}` (PolicyErrorBody). `detail`
// is always an object; read it with {@link govErrorDetail}. Members are
// optional where the producers differ (the same code is raised from several
// places).

/** 400 `invalid_parameter` (GovBadParam). `parameter` is `body`, `keys[2]`, `acceptances[0].reason`, `retain_items[0].review_by`, … */
export interface GovInvalidParameterDetail {
  parameter: string;
}

/** 400 `cursor_invalid`. */
export interface GovCursorInvalidDetail {
  parameter?: string;
}

/** 409 `version_conflict`: a stale edit, a status that does not allow the action, or a lifecycle that does not. */
export interface GovVersionConflictDetail {
  /** POST versions: the version the caller edited. */
  base_version_no?: number;
  /** POST versions: the newest version. */
  current_version_no?: number;
  current_status?: GovVersionStatus;
  /** propose, approve, reject, withdraw: the version's status. */
  status?: GovVersionStatus;
  /** pause, resume: the policy's lifecycle. */
  lifecycle?: GovPolicyLifecycle;
}

/** 409 `role_controlled_by_policy`: another policy already controls the role. */
export interface GovRoleControlledDetail {
  policy_id?: string;
  control_id?: string;
  role_id: string;
}

/** 409 `policy_controls_roles` (archive): remove AuthSec control first. */
export interface GovPolicyControlsRolesDetail {
  controls: GovControlRow[];
}

/** 409 `policy_name_taken`. */
export interface GovPolicyNameTakenDetail {
  name: string;
}

/** 409 `deployment_in_flight` (withdraw of an approved version). */
export interface GovDeploymentInFlightDetail {
  deployments: number;
}

/** 409 `version_not_approved` (export). */
export interface GovVersionNotApprovedDetail {
  status: GovVersionStatus;
}

/** 422 `invalid_intent`. */
export interface GovInvalidIntentDetail {
  errors: GovIntentError[];
  /** Compile-time variant (propose): which role and why. */
  role_id?: string;
  target_id?: string;
  reasons?: string[];
  compile_code?: string;
}

/** 422 `target_not_supported`: Kubernetes and other providers; `prerequisite` is K-1, K-2 or K-3. */
export interface GovTargetNotSupportedDetail {
  targets: { key: GovTargetKey; prerequisite?: string; reason?: string }[];
  prerequisite?: string;
}

/**
 * One target in a 422 `target_ineligible`. The producers differ:
 * - proposals: `{key, status, reasons[], role_id?}` (a key that did not resolve, or a role that cannot be controlled);
 * - versions: `{subject, role_id, reasons[]}`;
 * - propose: `{target_id, role_id, reasons: GovRefusal[], ineligible_reason}`;
 * - approve: `{target_id, role_id, reason}` (`reason` may be `not_compiled`);
 * - compile: `{role_id, target_id, reasons[], compile_code}`.
 */
export interface GovIneligibleTarget {
  key?: GovTargetKey;
  /** `not_found` | `ambiguous` | `resolved`. */
  status?: string;
  subject?: string;
  target_id?: string;
  role_id?: string;
  reasons?: (string | GovRefusal)[];
  reason?: string;
  ineligible_reason?: string;
  compile_code?: string;
}

/** igagov.Refusal (compile.go:142). */
export interface GovRefusal {
  code: GovRefusalCode | (string & {});
  detail?: string;
}

export interface GovTargetIneligibleDetail {
  targets: GovIneligibleTarget[];
}

/** One untrusted source in a 422 `evidence_untrusted`; `remedy` is a console path (`/iga/connections/<id>/coverage`). */
export interface GovUntrustedSource {
  kind: string;
  rev: number;
  connector_id: string;
  connector_run: string;
  reasons: string[];
  freshness_hours: number;
  remedy: string;
}

/** 422 `evidence_untrusted`: from a bundle (`sources`), or from a missing evaluation (`role_id`, `reasons`, `sources: []`). */
export interface GovEvidenceUntrustedDetail {
  sources?: GovUntrustedSource[];
  reasons?: string[] | null;
  role_id?: string;
  target_id?: string;
  compile_code?: string;
}

/** 422 `nothing_to_remove`: no service has a qualified no-attempt basis, or the selected roles share none. */
export interface GovNothingToRemoveDetail {
  targets?: { role_id: string; reason: string }[];
  warnings?: string[];
}

/** 422 `finding_not_actionable`: only open or reopened unused_service findings seed a proposal. */
export interface GovFindingNotActionableDetail {
  findings: { finding_id: string; kind: string; status: string }[];
}

/** 503 `discovery_unavailable`, 503 `iac_unavailable`. */
export interface GovDiscoveryUnavailableDetail {
  reason?: string;
  role_id?: string;
  target_id?: string;
  reasons?: string[];
  compile_code?: string;
}

/** 409 `plan_changed` / `impact_changed`: the hashes now current, and (acceptance mismatch) the items now required. */
export interface GovPlanChangedDetail {
  current?: GovApprovalHashes;
  /** An accepted item that is not (or no longer) part of the plan. */
  acceptance?: GovAcceptanceInput;
  current_items?: GovAcceptanceItem[];
}
export interface GovImpactChangedDetail {
  current: GovApprovalHashes;
}

/** 409 `residuals_not_accepted`: every unanalysed item must be accepted; `missing_gaps` are the gaps also still missing. */
export interface GovResidualsNotAcceptedDetail {
  missing: GovAcceptanceItem[];
  missing_gaps: GovAcceptanceItem[];
}

/** 409 `evidence_gaps_not_accepted`. */
export interface GovGapsNotAcceptedDetail {
  missing: GovAcceptanceItem[];
}

/** 409 `review_incomplete` (the owner gate, §7.4). `reason`: `no_review`, `cancelled` or `impact_changed` when there is no blocker list. */
export interface GovReviewIncompleteDetail {
  reason?: "no_review" | "cancelled" | "impact_changed";
  review_id?: string;
  status?: GovReviewStatus;
  deadline_at?: string;
  overdue?: boolean;
  blockers?: GovReviewBlocker[];
}

/** 409 `age_unconfirmed`. */
export interface GovAgeUnconfirmedDetail {
  review_id: string;
  items: GovAgeItem[];
}

/** 409 `route_unconfirmed`. */
export interface GovRouteUnconfirmedDetail {
  review_id: string;
  items: GovRouteItem[];
}

/** 409 `review_closed` (respond, exception, remind on a review that no longer takes them). */
export interface GovReviewClosedDetail {
  status: GovReviewStatus;
}

/** Error code -> `detail` shape, for the codes this file's routes add detail to. */
export interface GovErrorDetails {
  invalid_parameter: GovInvalidParameterDetail;
  cursor_invalid: GovCursorInvalidDetail;
  version_conflict: GovVersionConflictDetail;
  role_controlled_by_policy: GovRoleControlledDetail;
  policy_controls_roles: GovPolicyControlsRolesDetail;
  policy_name_taken: GovPolicyNameTakenDetail;
  deployment_in_flight: GovDeploymentInFlightDetail;
  version_not_approved: GovVersionNotApprovedDetail;
  invalid_intent: GovInvalidIntentDetail;
  target_not_supported: GovTargetNotSupportedDetail;
  target_ineligible: GovTargetIneligibleDetail;
  evidence_untrusted: GovEvidenceUntrustedDetail;
  nothing_to_remove: GovNothingToRemoveDetail;
  finding_not_actionable: GovFindingNotActionableDetail;
  discovery_unavailable: GovDiscoveryUnavailableDetail;
  iac_unavailable: GovDiscoveryUnavailableDetail;
  plan_changed: GovPlanChangedDetail;
  impact_changed: GovImpactChangedDetail;
  residuals_not_accepted: GovResidualsNotAcceptedDetail;
  evidence_gaps_not_accepted: GovGapsNotAcceptedDetail;
  review_incomplete: GovReviewIncompleteDetail;
  age_unconfirmed: GovAgeUnconfirmedDetail;
  route_unconfirmed: GovRouteUnconfirmedDetail;
  review_closed: GovReviewClosedDetail;
}

/**
 * A failure's `detail` when its `code` is `code`, else undefined. Takes the
 * shape `classifyPolicyError` returns (`{code, detail}`).
 */
export function govErrorDetail<C extends keyof GovErrorDetails>(
  failure: { code: string; detail?: Record<string, unknown> } | null | undefined,
  code: C,
): GovErrorDetails[C] | undefined {
  if (!failure || failure.code !== code) return undefined;
  return (failure.detail ?? {}) as unknown as GovErrorDetails[C];
}

/**
 * Every error `POST /policies/:id/versions/:no/approve` can answer, traced from
 * ApproveVersion (iga_gov_approval_controller.go:20) -> GovAuthoring.Approve
 * (iga_gov_approval_service.go:127), the owner gate wired by
 * InstallGovOwnerReviewWiring (iga_gov_wiring.go:42) and matchAcceptances
 * (iga_gov_approval_service.go:331). Order is the order the checks run.
 * `approval_expired` is NOT an approve error: it is raised when a deployment
 * starts from an approval (UsableApproval).
 */
export const GOV_APPROVE_ERRORS = [
  { status: 503, code: "policy_unavailable", when: "The policy product is off, or its schema is not verified (the route gate)." },
  { status: 401, code: "unauthenticated", when: "No workspace in the token." },
  { status: 403, code: "forbidden", when: "The caller lacks governance:approve (middleware, status only), or is not a verified workspace member session (the decision is a person's)." },
  { status: 400, code: "invalid_parameter", when: "Body is not JSON (`body`); intent_hash or an array of hashes is absent (`body`); an acceptance has a bad kind, no reason or a non-uuid plan_id (`acceptances[i].kind|reason|plan_id`); an item is accepted twice (`acceptances[i]`)." },
  { status: 404, code: "not_found", when: "Policy or version is not in the token's workspace, or an id or version number is malformed." },
  { status: 409, code: "policy_archived", when: "The policy is archived." },
  { status: 403, code: "self_approval", when: "The caller authored the version (admins included)." },
  { status: 409, code: "version_conflict", when: "The version is not in_review (detail.status), or someone else approved it at the same moment." },
  { status: 422, code: "target_ineligible", when: "A target has no current eligible forward plan (detail.targets[].reason, `not_compiled` when never compiled)." },
  { status: 409, code: "plan_changed", when: "intent_hash differs; plan_hashes or material_hashes differ (detail.current); or an accepted item is not, or no longer, in the plan (detail.acceptance, detail.current_items)." },
  { status: 409, code: "impact_changed", when: "impact_hashes differ from the current (detail.current)." },
  { status: 409, code: "review_incomplete", when: "The owner gate: no review, cancelled, impact changed since the owners were asked, or a blocker (missing owner, no response, delivery failed, objection, retained service). detail.blockers." },
  { status: 409, code: "age_unconfirmed", when: "A removal's grant age is not observed and no owner confirmed it (detail.items)." },
  { status: 409, code: "route_unconfirmed", when: "A resource-policy route of a removed service has no owner confirmation (detail.items)." },
  { status: 409, code: "residuals_not_accepted", when: "An unanalysed item is not accepted (detail.missing, detail.missing_gaps)." },
  { status: 409, code: "evidence_gaps_not_accepted", when: "A bundle gap is not accepted (detail.missing)." },
  { status: 500, code: "internal_error", when: "Anything else. A failed membership lookup answers code `internal` (policyInternal), not `internal_error`." },
] as const;
export type GovApproveErrorCode = (typeof GOV_APPROVE_ERRORS)[number]["code"];

/* -------------------------------------------------------------------------- */
/*                                Pure helpers                                 */
/* -------------------------------------------------------------------------- */

const sorted = (xs: string[]) => [...xs].sort();

/** Anything with the plans of a version: a {@link GovPlansView} or its `plans`. */
type PlansInput = Pick<GovPlansView, "plans"> | readonly GovPlanView[];
const plansOf = (p: PlansInput): readonly GovPlanView[] => ("plans" in p ? p.plans : p);

/**
 * `plan_hashes` as the server compares them (`approvalHashes`,
 * iga_gov_compile_service.go:717): every current plan's `plan_hash`, apply and
 * undo alike, compared as a multiset.
 */
export function planHashesOf(p: PlansInput): string[] {
  return sorted(plansOf(p).map((x) => x.plan_hash));
}

/** `material_hashes`: every current plan's `material_hash` (apply and undo). */
export function materialHashesOf(p: PlansInput): string[] {
  return sorted(plansOf(p).map((x) => x.material_hash));
}

/** `impact_hashes`: the `impact_hash` of the apply and split plans only (undo and remove_control plans are not bound). */
export function impactHashesOf(p: PlansInput): string[] {
  return sorted(plansOf(p).filter((x) => GOV_IMPACT_PLAN_KINDS.includes(x.kind)).map((x) => x.impact_hash));
}

/** True when the hashes recomputed from the plans equal the `hashes` the server sent with them. */
export function govHashesConsistent(view: GovPlansView): boolean {
  const same = (a: string[], b: string[]) => a.length === b.length && sorted(a).every((x, i) => x === sorted(b)[i]);
  return (
    same(planHashesOf(view), view.hashes.plan_hashes) &&
    same(materialHashesOf(view), view.hashes.material_hashes) &&
    same(impactHashesOf(view), view.hashes.impact_hashes)
  );
}

/** The key the server matches an acceptance on: kind, plan and item key. */
export const govAcceptanceKey = (x: Pick<GovAcceptanceItem, "kind" | "plan_id" | "item_key">): string =>
  `${x.kind}\u001f${x.plan_id}\u001f${x.item_key}`;

/** The acceptance an approver gives for one required item. `reason` must be non-blank. */
export function govAcceptanceFor(item: GovAcceptanceItem, reason: string): GovAcceptanceInput {
  return { kind: item.kind, plan_id: item.plan_id, item_key: item.item_key, item_hash: item.item_hash, reason: reason.trim() };
}

/** The items of the plans that `accepted` does not yet cover, in the plans' order. */
export function govMissingAcceptances(items: readonly GovAcceptanceItem[], accepted: readonly GovAcceptanceInput[]): GovAcceptanceItem[] {
  const have = new Set(accepted.map(govAcceptanceKey));
  return items.filter((i) => !have.has(govAcceptanceKey(i)));
}

/**
 * The approve body for what the approver is looking at: the four hashes
 * recomputed from the plans exactly as the server compares them, the intent
 * hash the server sent with the plans, and the acceptances given. The server
 * still decides: a hash that moved since the plans were read is 409
 * plan_changed / impact_changed.
 */
export function buildGovApproveRequest(view: GovPlansView, acceptances: GovAcceptanceInput[], reason?: string): GovApproveRequest {
  return {
    intent_hash: view.hashes.intent_hash,
    impact_hashes: impactHashesOf(view),
    plan_hashes: planHashesOf(view),
    material_hashes: materialHashesOf(view),
    acceptances,
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  };
}

/**
 * Splits `iga_gov_plan.ineligible_reason` ("code: detail; code; …") into its
 * refusals. Best effort: the producer joins `Refusal.String()` with "; ", and a
 * detail that itself contains "; " splits into more than one entry.
 */
export function govParseIneligibleReason(reason: string | null | undefined): GovRefusal[] {
  if (!reason) return [];
  return reason
    .split("; ")
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf(": ");
      return i < 0 ? { code: part } : { code: part.slice(0, i), detail: part.slice(i + 2) };
    });
}

/** The cache id of a version: `${policyId}:${versionNo}`. */
export const govVersionTagId = (policyId: string, versionNo: number): string => `${policyId}:${versionNo}`;

/* -------------------------------------------------------------------------- */
/*                                  Endpoints                                  */
/* -------------------------------------------------------------------------- */

/** A policy version addressed by its policy and number. */
export interface GovVersionRef {
  policyId: string;
  versionNo: number;
}
export interface GovPolicyArg {
  policyId: string;
}

type GovTagType =
  | "IgaGovPolicy"
  | "IgaGovVersion"
  | "IgaGovApproval"
  | "IgaGovReview"
  | "IgaGovFinding"
  | "IgaGovReadiness"
  | "IgaGovDeployment"
  | "IgaGovRollout"
  | "IgaGovEvent"
  | "IgaGovMetrics";

const tag = <T extends GovTagType>(type: T, id: string) => ({ type, id }) as const;
const ALL = "ALL";

/** The lists a decision moves: findings under review, readiness, deployments and rollouts. */
const decisionReflected = () => [
  tag("IgaGovFinding", ALL),
  tag("IgaGovReadiness", ALL),
  tag("IgaGovDeployment", ALL),
  tag("IgaGovRollout", ALL),
];

/** Every cached read of one policy's versions. */
const versionsOf = (policyId: string, versionNo?: number) => [
  tag("IgaGovVersion", `${policyId}:${ALL}`),
  ...(versionNo === undefined ? [] : [tag("IgaGovVersion", govVersionTagId(policyId, versionNo))]),
];

const versionPath = ({ policyId, versionNo }: GovVersionRef) => `${POLICY_BASE}/policies/${enc(policyId)}/versions/${versionNo}`;

export const igaPolicyAuthoringApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    /* ------------------------------ policies ------------------------------ */

    listGovPolicies: b.query<PolicyEnvelope<GovPolicyView[], GovPolicyListMeta>, GovPolicyListArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/policies${policyQuery(args)}` }),
      providesTags: (res) => [tag("IgaGovPolicy", ALL), ...(res?.data ?? []).map((p) => tag("IgaGovPolicy", p.id))],
    }),

    /** Creates the policy and its draft version 1 from findings, a template or a Discovery object; `meta.evaluated_rev`. */
    createGovProposal: b.mutation<PolicyEnvelope<GovProposalResult, GovProposalMeta>, GovProposalRequest>({
      query: (body) => ({ url: `${POLICY_BASE}/proposals`, method: "POST", body }),
      invalidatesTags: () => [
        tag("IgaGovPolicy", ALL),
        tag("IgaGovFinding", ALL),
        tag("IgaGovReadiness", ALL),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    getGovPolicy: b.query<GovPolicyView, GovPolicyArg & WsArg>({
      query: ({ policyId }) => ({ url: `${POLICY_BASE}/policies/${enc(policyId)}` }),
      transformResponse: (res: PolicyEnvelope<GovPolicyView, Record<string, never>>) => res.data,
      providesTags: (_r, _e, { policyId }) => [tag("IgaGovPolicy", policyId)],
    }),

    patchGovPolicy: b.mutation<GovPolicy, GovPolicyArg & { patch: GovPolicyPatch }>({
      query: ({ policyId, patch }) => ({ url: `${POLICY_BASE}/policies/${enc(policyId)}`, method: "PATCH", body: patch }),
      transformResponse: (res: PolicyEnvelope<GovPolicy, Record<string, never>>) => res.data,
      // The name shows in the approvals queue and the review lists.
      invalidatesTags: (_r, _e, { policyId }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        tag("IgaGovEvent", ALL),
      ],
    }),

    /** Active -> paused: no new deployment starts; verification and drift continue. A reason is required. */
    pauseGovPolicy: b.mutation<GovPolicy, GovPolicyArg & GovReasonBody>({
      query: ({ policyId, reason }) => ({ url: `${POLICY_BASE}/policies/${enc(policyId)}/pause`, method: "POST", body: { reason } }),
      transformResponse: (res: PolicyEnvelope<GovPolicy, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        tag("IgaGovDeployment", ALL),
        tag("IgaGovRollout", ALL),
        tag("IgaGovEvent", ALL),
      ],
    }),

    resumeGovPolicy: b.mutation<GovPolicy, GovPolicyArg & GovReasonBody>({
      query: ({ policyId, reason }) => ({ url: `${POLICY_BASE}/policies/${enc(policyId)}/resume`, method: "POST", body: { reason } }),
      transformResponse: (res: PolicyEnvelope<GovPolicy, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        tag("IgaGovDeployment", ALL),
        tag("IgaGovRollout", ALL),
        tag("IgaGovEvent", ALL),
      ],
    }),

    /** 409 policy_controls_roles while AuthSec still controls a role; otherwise withdraws open versions and releases planned controls. */
    archiveGovPolicy: b.mutation<GovPolicy, GovPolicyArg & { reason?: string }>({
      query: ({ policyId, reason }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/archive`,
        method: "POST",
        body: reason ? { reason } : {},
      }),
      transformResponse: (res: PolicyEnvelope<GovPolicy, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        ...versionsOf(policyId),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        ...decisionReflected(),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    /* ------------------------------ versions ------------------------------ */

    listGovVersions: b.query<GovVersionView[], GovPolicyArg & WsArg>({
      query: ({ policyId }) => ({ url: `${POLICY_BASE}/policies/${enc(policyId)}/versions` }),
      transformResponse: (res: PolicyEnvelope<GovVersionView[], { next_cursor: null }>) => res.data,
      providesTags: (res, _e, { policyId }) => [
        tag("IgaGovVersion", ALL),
        ...versionsOf(policyId),
        ...(res ?? []).map((v) => tag("IgaGovVersion", govVersionTagId(policyId, v.no))),
      ],
    }),

    /**
     * The next version of a policy. `base_version_no` is the version edited
     * (409 version_conflict when a newer exists). A draft or in-review
     * predecessor is withdrawn in the same call.
     */
    createGovVersion: b.mutation<GovVersionView, GovPolicyArg & { intent: GovIntentInput; baseVersionNo: number }>({
      query: ({ policyId, intent, baseVersionNo }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/versions`,
        method: "POST",
        body: { intent, base_version_no: baseVersionNo },
      }),
      transformResponse: (res: PolicyEnvelope<GovVersionView, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId, baseVersionNo }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        ...versionsOf(policyId, baseVersionNo),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        tag("IgaGovFinding", ALL),
        tag("IgaGovReadiness", ALL),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    getGovVersion: b.query<GovVersionView, GovVersionRef & WsArg>({
      query: (ref) => ({ url: versionPath(ref) }),
      transformResponse: (res: PolicyEnvelope<GovVersionView, Record<string, never>>) => res.data,
      providesTags: (_r, _e, { policyId, versionNo }) => [tag("IgaGovVersion", ALL), tag("IgaGovVersion", govVersionTagId(policyId, versionNo))],
    }),

    /**
     * Compiles a draft (or re-compiles an in-review version) from live reads and
     * fresh bundles and moves it to `in_review`; opens the owner review. All or
     * nothing: any target that cannot compile answers its error and nothing is written.
     */
    proposeGovVersion: b.mutation<GovProposeResult, GovVersionRef>({
      query: (ref) => ({ url: `${versionPath(ref)}/propose`, method: "POST" }),
      transformResponse: (res: PolicyEnvelope<GovProposeResult, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId, versionNo }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        ...versionsOf(policyId, versionNo),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        ...decisionReflected(),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    getGovVersionPlans: b.query<GovPlansView, GovVersionRef & WsArg>({
      query: (ref) => ({ url: `${versionPath(ref)}/plans` }),
      transformResponse: (res: PolicyEnvelope<GovPlansView, Record<string, never>>) => res.data,
      providesTags: (_r, _e, { policyId, versionNo }) => [tag("IgaGovVersion", ALL), tag("IgaGovVersion", govVersionTagId(policyId, versionNo))],
    }),

    /** Boundary documents, AWS CLI and Terraform per approved plan. 409 version_not_approved without a live approval. */
    getGovVersionExport: b.query<GovExportView, GovVersionRef & WsArg>({
      query: (ref) => ({ url: `${versionPath(ref)}/export` }),
      transformResponse: (res: PolicyEnvelope<GovExportView, Record<string, never>>) => res.data,
      providesTags: (_r, _e, { policyId, versionNo }) => [tag("IgaGovVersion", ALL), tag("IgaGovVersion", govVersionTagId(policyId, versionNo))],
    }),

    /**
     * One plan's artifact as the server's file download
     * (`?download=<plan_id>`, iga_gov_export_controller.go:18). The body is the
     * bare {@link GovExportPlan} (no `{data, meta}` envelope).
     */
    downloadGovPlanArtifact: b.query<GovExportPlan, GovVersionRef & { planId: string } & WsArg>({
      query: (ref) => ({ url: `${versionPath(ref)}/export${policyQuery({ download: ref.planId })}` }),
      providesTags: (_r, _e, { policyId, versionNo }) => [tag("IgaGovVersion", govVersionTagId(policyId, versionNo))],
    }),

    /** Draft, in-review or approved only; an approved version needs no deployment in flight (409 deployment_in_flight). Revokes the approval and cancels the owner review. */
    withdrawGovVersion: b.mutation<GovPolicyVersion, GovVersionRef & { reason?: string }>({
      query: ({ reason, ...ref }) => ({ url: `${versionPath(ref)}/withdraw`, method: "POST", body: reason ? { reason } : {} }),
      transformResponse: (res: PolicyEnvelope<GovPolicyVersion, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId, versionNo }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        ...versionsOf(policyId, versionNo),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        ...decisionReflected(),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    /* ----------------------------- approvals ------------------------------ */

    listGovApprovals: b.query<PolicyEnvelope<GovApprovalQueueItem[], GovPolicyListMeta>, GovApprovalListArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/approvals${policyQuery(args)}` }),
      providesTags: [tag("IgaGovApproval", ALL)],
    }),

    approveGovVersion: b.mutation<GovApprovalResult, GovVersionRef & { body: GovApproveRequest }>({
      query: ({ body, ...ref }) => ({ url: `${versionPath(ref)}/approve`, method: "POST", body }),
      transformResponse: (res: PolicyEnvelope<GovApprovalResult, Record<string, never>>) => res.data,
      // The previously approved version of the policy is superseded in the same transaction.
      invalidatesTags: (_r, _e, { policyId, versionNo }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        ...versionsOf(policyId, versionNo),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        ...decisionReflected(),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    rejectGovVersion: b.mutation<GovApproval, GovVersionRef & GovReasonBody>({
      query: ({ reason, ...ref }) => ({ url: `${versionPath(ref)}/reject`, method: "POST", body: { reason } }),
      transformResponse: (res: PolicyEnvelope<GovApproval, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { policyId, versionNo }) => [
        tag("IgaGovPolicy", policyId),
        tag("IgaGovPolicy", ALL),
        ...versionsOf(policyId, versionNo),
        tag("IgaGovApproval", ALL),
        tag("IgaGovReview", ALL),
        ...decisionReflected(),
        tag("IgaGovEvent", ALL),
        tag("IgaGovMetrics", ALL),
      ],
    }),

    /* ---------------------------- owner review ---------------------------- */

    listGovReviews: b.query<PolicyEnvelope<GovReviewSummary[], GovPolicyListMeta>, GovReviewListArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/reviews${policyQuery({ ...args, mine: args.mine ? "true" : undefined })}` }),
      providesTags: (res) => [tag("IgaGovReview", ALL), ...(res?.data ?? []).map((r) => tag("IgaGovReview", r.id))],
    }),

    getGovReview: b.query<GovReviewView, { id: string } & WsArg>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/reviews/${enc(id)}` }),
      transformResponse: (res: PolicyEnvelope<GovReviewView, Record<string, never>>) => res.data,
      providesTags: (_r, _e, { id }) => [tag("IgaGovReview", id), tag("IgaGovDeployment", ALL)],
    }),

    /**
     * An owner's answer. `retain` creates the next version and withdraws the
     * reviewed one (`new_version_id`); the version-wide lists are invalidated
     * only then.
     */
    respondGovReview: b.mutation<GovRespondResult, { id: string; body: GovRespondRequest }>({
      query: ({ id, body }) => ({ url: `${POLICY_BASE}/reviews/${enc(id)}/respond`, method: "POST", body }),
      transformResponse: (res: PolicyEnvelope<GovRespondResult, Record<string, never>>) => res.data,
      invalidatesTags: (res, _e, { id }) => [
        tag("IgaGovReview", id),
        tag("IgaGovReview", ALL),
        tag("IgaGovEvent", ALL),
        ...(res?.new_version_id
          ? [
              tag("IgaGovPolicy", ALL),
              tag("IgaGovVersion", ALL),
              tag("IgaGovApproval", ALL),
              ...decisionReflected(),
              tag("IgaGovMetrics", ALL),
            ]
          : []),
      ],
    }),

    /** An approver lets the version proceed without the missing owners (not the version's author: 403 self_approval). */
    exceptGovReview: b.mutation<GovOwnerReview, { id: string } & GovReasonBody>({
      query: ({ id, reason }) => ({ url: `${POLICY_BASE}/reviews/${enc(id)}/exception`, method: "POST", body: { reason } }),
      transformResponse: (res: PolicyEnvelope<GovOwnerReview, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { id }) => [tag("IgaGovReview", id), tag("IgaGovReview", ALL), tag("IgaGovEvent", ALL)],
    }),

    /** Resyncs the owners, then re-sends the review to those who have not responded. */
    remindGovReview: b.mutation<GovRemindResult, { id: string }>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/reviews/${enc(id)}/remind`, method: "POST" }),
      transformResponse: (res: PolicyEnvelope<GovRemindResult, Record<string, never>>) => res.data,
      invalidatesTags: (_r, _e, { id }) => [tag("IgaGovReview", id), tag("IgaGovReview", ALL), tag("IgaGovEvent", ALL)],
    }),
  }),
});

export const {
  useListGovPoliciesQuery,
  useCreateGovProposalMutation,
  useGetGovPolicyQuery,
  usePatchGovPolicyMutation,
  usePauseGovPolicyMutation,
  useResumeGovPolicyMutation,
  useArchiveGovPolicyMutation,
  useListGovVersionsQuery,
  useCreateGovVersionMutation,
  useGetGovVersionQuery,
  useProposeGovVersionMutation,
  useGetGovVersionPlansQuery,
  useGetGovVersionExportQuery,
  useLazyDownloadGovPlanArtifactQuery,
  useWithdrawGovVersionMutation,
  useListGovApprovalsQuery,
  useApproveGovVersionMutation,
  useRejectGovVersionMutation,
  useListGovReviewsQuery,
  useGetGovReviewQuery,
  useRespondGovReviewMutation,
  useExceptGovReviewMutation,
  useRemindGovReviewMutation,
} = igaPolicyAuthoringApi;
