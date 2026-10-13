/**
 * Deployments, rollout and removing AuthSec control — the Phase 3 policy API
 * for SPEC-iga-phase3-policy.md §7.5 (rollout), §7.6 (deployments, validations,
 * health reports), §7.7 (remove control) and §8 (execution, verification,
 * recovery).
 *
 * Every shape below was traced from the registered route to the handler and on
 * to the Go struct that is serialised (field names are the Go `json` tags;
 * `omitempty` pointers are optional, other pointers and `json.RawMessage`
 * columns that can be SQL/JSON null are `| null`). Where a Go field is a
 * `json.RawMessage` the producing code was read and its shape is typed; the
 * one exception (`GovWorkloadMigration.evidence`, produced by
 * internal/awsdiscovery/migration_evidence.go) is an open record.
 * Timestamps and uuids are strings. The plan row embedded in a deployment is
 * `GovDeploymentPlanRow`: the plan screens own the full plan shapes
 * (`GET /policies/:id/versions/:no/plans`), so its jsonb columns stay opaque
 * here.
 *
 * Endpoint -> Go handler (authsec/controllers/platform/, routes registered in
 * iga_gov_policy_controller.go:148-167):
 *
 *   GET  /deployments                         ListDeployments          iga_gov_deployments_controller.go:22
 *   GET  /deployments/:id                     GetDeployment            iga_gov_deployments_controller.go:46
 *   POST /deployments/:id/recovery-plans/:plan_id/approve ApproveRecoveryPlan iga_gov_deployments_controller.go (governance:approve)
 *   POST /deployments/:id/accept-drift        AcceptDrift              iga_gov_deployments_controller.go (governance:enforce)
 *   POST /deployments/:id/reapply             ReapplyDeployment        iga_gov_deployments_controller.go (governance:author)
 *   POST /deployments/:id/resolve             ResolveDeployment        iga_gov_deployments_controller.go:59
 *   POST /deployments/:id/undo                UndoDeployment           iga_gov_deployments_controller.go:112 (undo :86)
 *   POST /deployments/:id/emergency-undo      EmergencyUndoDeployment  iga_gov_deployments_controller.go:115
 *   POST /deployments/:id/validations         DeclareValidation        iga_gov_deployments_controller.go:118
 *   GET  /deployments/:id/validations         ListValidations          iga_gov_deployments_controller.go:138
 *   POST /deployments/:id/health-reports      CreateHealthReport       iga_gov_deployments_controller.go:151
 *   GET  /deployments/:id/health-reports      ListHealthReports        iga_gov_deployments_controller.go:174
 *   POST /policies/:id/remove-control         RemoveControl            iga_gov_deployments_controller.go:209 (removeControl :185)
 *   POST /policies/:id/emergency-remove-control EmergencyRemoveControl iga_gov_deployments_controller.go:212
 *   GET  /policies/:id/rollout                GetRollout               iga_gov_rollout_controller.go:46
 *   POST /policies/:id/rollout/start          StartRollout             iga_gov_rollout_controller.go:66
 *   POST /policies/:id/rollout/expand         ExpandRollout            iga_gov_rollout_controller.go:87
 *   POST /policies/:id/rollout/pause          PauseRollout             iga_gov_rollout_controller.go:108
 *   POST /policies/:id/rollout/resume         ResumeRollout            iga_gov_rollout_controller.go:113
 *
 * What the backend does NOT serve although the spec describes it:
 *   - Nothing the spec describes for deployments is missing any more:
 *     `GET /deployments` takes `delivery` and `attention=1`, orders
 *     outcome_unresolved first and then newest first with a keyset cursor, and
 *     the detail carries `context` and the pull request (`iac_change`). Recovery
 *     plan approval, Accept drift and Re-apply have their own routes (below).
 *   - `POST /deployments/:id/health-reports` always records channel `ui`
 *     (the request type's Channel is `json:"-"`).
 *
 * Cache: tag `IgaGovDeployment` (ALL + deployment id) and `IgaGovRollout`
 * (ALL + policy id). Every deployment or rollout mutation also invalidates the
 * policy, version, finding, readiness, metrics and event caches, because a
 * deployment moves the posture, findings, readiness and the event stream.
 */

import { baseApi } from "./baseApi";
import {
  POLICY_BASE,
  enc,
  policyQuery,
  type PageArgs,
  type PolicyEnvelope,
  type PolicyMeta,
  type WsArg,
} from "./igaPolicyCommon";

/* ------------------------------ vocabularies ------------------------------ */

/** The 14 deployment states (models/iga_gov_rollout.go:39-54; migration 051 CHECK). */
export const GOV_DEPLOYMENT_STATES = [
  "queued",
  "blocked",
  "applying",
  "outcome_unknown",
  "outcome_unresolved",
  "recovered",
  "awaiting_merge",
  "awaiting_apply",
  "applied_unverified",
  "verified",
  "failed",
  "drifted",
  "superseded",
  "undone",
] as const;
export type GovDeploymentState = (typeof GOV_DEPLOYMENT_STATES)[number];

/** Deployment kinds (migration 051; igagov.Plan* constants, compile.go:34-38). */
export type GovDeploymentKind = "apply" | "undo" | "remove_control" | "split" | "split_revert";

/** Delivery of a plan / deployment (igagov intent.go:33-35). */
export type GovDelivery = "direct" | "iac_pr" | "export";

/** Write-ahead attempt lifecycle (models/iga_gov_rollout.go:59-65). */
export type GovAttemptStatus = "prepared" | "dispatched" | "completed" | "unknown" | "abandoned";

/** An attempt's answer (migration 051 iga_gov_attempt.outcome CHECK). */
export type GovAttemptOutcome = "ok" | "retryable" | "terminal" | "recognised_done" | "not_needed";

/** How an `unknown` attempt was later settled (migration 051 resolved_as CHECK). */
export type GovAttemptResolvedAs = "applied" | "not_applied";

/** The four verification dimensions (migration 051 CHECK; iga_gov_deploy_verify.go:97-110). */
export type GovVerificationDimension = "artifact" | "graph" | "application_health" | "restriction";

/** A dimension's result (migration 051 CHECK). `overdue` is only ever written to `graph`. */
export type GovVerificationResult =
  | "passed"
  | "failed"
  | "awaiting_evidence"
  | "overdue"
  | "not_available"
  | "not_applicable";

/** Who caused a denial (migration 051; igagov health.go:26-29). */
export type GovAttribution = "not_applicable" | "boundary_attributed" | "cause_unknown" | "validation_request" | "";

/** Per-service history: change relative to the boundary it replaced (migration 051). */
export type GovServiceChange = "newly_excluded" | "already_excluded" | "newly_unexcluded";

/** Per-service history: what the exclusion write did (migration 051; not the posture's `not_applied`). */
export type GovServiceExclusion = "pending" | "applied" | "failed" | "reverted";

/** Whether another route to the service remains (models/iga_gov_rollout.go:73-76). */
export type GovRouteState = "none_observed" | "bypass_known" | "effect_unknown" | "not_analysed";

/** Whether the restriction was seen in CloudTrail (igagov health.go:632-634). */
export type GovRestrictionObservation = "not_observed" | "observed" | "contradicted";

/** The outcome of a service, derived (models/iga_gov_rollout.go:78-82). */
export type GovServiceOutcomeKind =
  | "pending"
  | "removed"
  | "excluded_routes_remain"
  | "excluded_routes_unknown"
  | "not_removed";

/** A resource-policy route's effect (igagov routes.go:37-40). */
export type GovRouteEffect = "limited" | "bypass_known" | "effect_unknown" | "not_analysed";

/** Ledger artifact kinds / ownership / state (migration 051 iga_gov_artifact CHECKs). */
export type GovArtifactKind = "boundary_policy" | "boundary_attachment" | "dedicated_role" | "workload_binding";
export type GovArtifactOwner = "authsec_direct" | "customer_iac";
export type GovArtifactState = "intended" | "present" | "removed" | "released" | "drifted" | "lost";

/** Workload migration (migration 051 iga_gov_workload_migration CHECKs). */
export type GovMigrationSubjectKind = "ecs_service" | "lambda_function" | "ec2_auto_scaling_group" | "ec2_instance";
export type GovMigrationState = "pending" | "moving" | "moved" | "incomplete" | "reverted";

/** A revalidation's result (models/iga_gov_policy.go:372-374). */
export type GovRevalidationResult = "unchanged" | "material_change" | "blocked";

/** Acceptance kinds (models/iga_gov_rollout.go:30-34). */
export type GovAcceptanceKind = "evidence_gap" | "unanalysed_form" | "gate_not_available";

/** Rollout stages (models/iga_gov_rollout.go:18-27). */
export type GovRolloutStage =
  | "observe"
  | "awaiting_approval"
  | "canary"
  | "expand"
  | "complete"
  | "partial"
  | "paused"
  | "undone";

/** Why a rollout is paused (iga_gov_rollout_service.go:149-155). */
export type GovPauseKind = "manual" | "gate_failed" | "deployment_failed" | "drifted" | "returned_to_draft";

/**
 * The five canary gates (igagov health.go:17-21), in the order EvaluateCanary
 * returns them. `accept_not_available` may name only a gate that is
 * `not_available` now.
 */
export const GOV_CANARY_GATES = [
  "artifact_verified",
  "no_unexpected_failures",
  "required_operations",
  "no_problem_reports",
  "window_elapsed",
] as const;
export type GovCanaryGate = (typeof GOV_CANARY_GATES)[number];

/** A gate's outcome (igagov health.go:23-27). */
export type GovGateOutcome = "passed" | "failed" | "awaiting_evidence" | "not_available" | "not_applicable" | "";

/** What the console may offer on a rollout now (iga_gov_rollout_service.go view(), :1721-:1735). */
export type GovRolloutAction = "start" | "expand" | "pause" | "resume" | "undo_canary";

/** Validation correlation, expected outcome, results (migration 051 CHECKs; igagov health.go:34-35). */
export type GovValidationCorrelation = "assumed_session" | "dedicated_workload";
export type GovExpectedOutcome = "denied" | "allowed";
export type GovValidationResultKind = "pending" | "matched" | "partial" | "not_seen" | "contradicted";
export type GovValidationItemResult = "pending" | "matched" | "not_seen" | "contradicted";

/** A health report's kind and channel (igagov health.go:39-40; migration 051). */
export type GovHealthReportKind = "problem" | "working";
export type GovHealthReportChannel = "ui" | "slack";

/** How an op of a deployment was recorded done (iga_gov_aws_executor.go:196-214). */
export type GovOpBasis = "attempt" | "live_read" | "selector";

/** Classification of a role against a plan (igagov recover.go:224-227, :60-69). */
export type GovClassificationClass = "before" | "intermediate" | "after" | "conflict";
export type GovFactKind =
  | "role_incarnation"
  | "role_definition"
  | "role_boundary"
  | "policy_document"
  | "policy_owner"
  | "policy_users"
  | "workload_binding"
  | "new_role";
export type GovFactPosition = "before" | "after" | "both" | "neither";

/**
 * Error codes these routes add to `PolicyErrorCode` (iga_gov_deploy_routes.go:
 * 34-47, iga_gov_rollout_service.go:112-124). `PolicyErrorBody.error.code` is
 * open, so this is documentation plus narrowing.
 */
export type GovDeploymentErrorCode =
  | "not_latest_deployment"
  | "deployment_in_flight"
  | "outcome_unknown_pending"
  | "artifact_consumers_changed"
  | "artifact_changed_outside_authsec"
  | "artifact_owned_elsewhere"
  | "action_not_mappable"
  | "session_not_unique"
  | "not_undoable"
  | "not_unresolved"
  | "emergency_undo_unavailable"
  | "not_consumer_owner"
  | "no_artifact_to_remove"
  | "control_not_in_policy"
  | "plan_changed"
  | "approval_required"
  | "material_change"
  | "observation_incomplete"
  | "gates_not_passed"
  | "enforcement_not_enabled"
  | "canary_not_acknowledged"
  | "canary_admin_role"
  | "canary_not_chosen"
  | "rollout_paused"
  | "rollout_not_started"
  | "rollout_conflict"
  | "policy_paused"
  | "remove_control_not_available"
  | "discovery_unavailable"
  | "cursor_invalid"
  | "self_approval"
  | "forbidden";

/* ------------------------------ shared records ----------------------------- */

/** igagov.Fact, with igagov.FactResult's observation (recover.go:60-69, :254-258). */
export interface GovFactResult {
  key: string;
  kind: GovFactKind;
  subject?: string;
  before: string;
  after: string;
  only_before?: boolean;
  observed: string;
  at: GovFactPosition;
}

/** igagov.Classification (recover.go:261-276): where the live role stands against a plan. */
export interface GovClassification {
  class: GovClassificationClass;
  /** First op to (re)run; -1 for a conflict and for IaC / export. */
  next_op: number;
  visible: number;
  total: number;
  facts: GovFactResult[] | null;
  conflicts: GovFactResult[] | null;
  /** igagov.Conflict* when `class` is `conflict` (recover.go:242-250); free text for other reasons. */
  reason?: string;
}

/** igagov.GateResult (health.go:205-210). */
export interface GovGateResult {
  gate: GovCanaryGate;
  outcome: GovGateOutcome;
  reason?: string;
  evidence?: string[];
}

/** igagov.DimensionResult (health.go:213-217). */
export interface GovDimensionResult {
  outcome: GovGateOutcome;
  attribution: GovAttribution;
  reason?: string;
}

/** igagov.ItemResult (health.go:222-229). */
export interface GovValidationItemOutcome {
  action: string;
  expected: GovExpectedOutcome;
  result: GovValidationItemResult;
  matched_events: number;
  opposite_events: number;
  boundary_attributed: boolean;
}

/** igagov.ValidationResult (health.go:232-236). */
export interface GovValidationOutcome {
  id: string;
  result: GovValidationResultKind;
  items: GovValidationItemOutcome[];
}

/** How a denial was classified (igagov health.go:239-243). */
export type GovUnexpectedFailureClass = "denied_retained_service" | "denied_removed_service" | "denied_other_service";

/** igagov.UnexpectedFailure (health.go:246-253): a denial no declared expected=denied item explains. */
export interface GovUnexpectedFailure {
  event_time: string;
  action: string;
  session_name: string;
  error_code: string;
  class: GovUnexpectedFailureClass;
  /** T3.04's classification of the denial message, e.g. `permissions_boundary`, `identity_policy`, `scp`, `unknown`. */
  denial_policy_type: string;
}

/** igagov.CanaryResult (health.go:256-268), stored in the application_health row's evidence. */
export interface GovCanaryResult {
  gates: GovGateResult[];
  pass: boolean;
  pause: boolean;
  not_available: GovCanaryGate[] | null;
  application_health: GovDimensionResult;
  restriction: GovDimensionResult;
  service_restriction: Record<string, GovRestrictionObservation>;
  validations: GovValidationOutcome[] | null;
  unexpected_failures: GovUnexpectedFailure[] | null;
}

/** igagov.Route (routes.go:57-65): a resource-policy route to a service, or a form/region not analysed. */
export interface GovRoute {
  service: string;
  form?: string;
  region?: string;
  resource?: string;
  principal?: string;
  effect: GovRouteEffect;
  reason?: string;
}

/** GovChange (iga_gov_compile_service.go:863-867): one thing a revalidation found different. */
export interface GovChange {
  item: string;
  before?: unknown;
  after?: unknown;
}

/** A completed op of a deployment (`completed_ops`, iga_gov_attempt_log.go:281-292; aws_executor.go:196-208, :615-635). */
export interface GovCompletedOp {
  op_seq: number;
  operation: string;
  /** Null for an op recognised from a read (`basis` live_read / selector). */
  attempt_id: string | null;
  outcome: GovAttemptOutcome;
  /** Present on ops recorded without a request (`appendCompleted`); absent on attempt-completed ops. */
  basis?: GovOpBasis;
}

/* -------------------------------- deployments ------------------------------ */

/** models.IGAGovDeployment (models/iga_gov_rollout.go:129-156). */
export interface IGAGovDeployment {
  id: string;
  workspace_id: string;
  version_id: string;
  plan_id: string;
  control_id: string;
  approval_id?: string;
  emergency_by?: string;
  emergency_reason: string;
  kind: GovDeploymentKind;
  delivery: GovDelivery;
  state: GovDeploymentState;
  /** Free text: a machine reason (e.g. `policy_paused`, `delivery_not_available`, `binding_unavailable`) or a sentence. */
  state_reason: string;
  completed_ops: GovCompletedOp[];
  attempts: number;
  applied_at?: string;
  verified_at?: string;
  verify_deadline_at?: string;
  apply_deadline_at?: string;
  outcome_unknown_op: string;
  /** No conflicting operation on the control starts before this (§8.1). */
  settle_after?: string;
  recovered_by_deployment_id?: string;
  recovers_deployment_id?: string;
  revalidation_id?: string;
  revalidation_result?: "unchanged";
  created_at: string;
  updated_at: string;
  /** Set when an operator accepted this drifted deployment (§8.8); its state stays `drifted`. */
  drift_accepted_at?: string;
  drift_accepted_by?: string;
  drift_accepted_reason: string;
}

/** services.GovDeploymentView (iga_gov_deploy_routes.go:63-70): a list row. */
export interface GovDeploymentView extends IGAGovDeployment {
  policy_id: string;
  version_no: number;
  account_id: string;
  role_id: string;
  role_arn: string;
}

/** `meta` of `GET /deployments`. */
export interface GovDeploymentListMeta extends PolicyMeta {
  next_cursor: string | null;
}

/**
 * models.IGAGovPlan as embedded in a deployment detail (models/iga_gov_policy.go:396-428).
 * The jsonb columns are typed by the plan screens' API; they are opaque here.
 */
export interface GovDeploymentPlanRow {
  id: string;
  workspace_id: string;
  version_id: string;
  target_id: string;
  control_id: string;
  kind: GovDeploymentKind;
  delivery: GovDelivery;
  eligibility: "eligible" | "iac_only" | "ineligible";
  ineligible_reason: string;
  basis: "live_read" | "graph_rev";
  basis_read_at: string;
  precondition: Record<string, unknown>;
  precondition_hash: string;
  before_document_hash?: string;
  desired_attachment: "present" | "absent" | "unchanged";
  desired_boundary_arn?: string;
  desired_document_hash?: string;
  replaced_boundary_arn?: string;
  artifact_disposition: "keep" | "delete" | "retain_shared";
  evidence_bundle_id: string;
  evidence_rev: number;
  resource_policy_scan_run_id?: string;
  first_attachment: boolean;
  unanalysed: unknown[];
  impact: Record<string, unknown>;
  impact_hash: string;
  operations: unknown[];
  diff: Record<string, unknown>;
  plan_hash: string;
  material_hash: string;
  superseded_at?: string;
  created_at: string;
}

/** models.IGAGovAttempt (models/iga_gov_rollout.go:163-184): the write-ahead record of one AWS mutation. */
export interface IGAGovAttempt {
  id: string;
  workspace_id: string;
  deployment_id: string;
  op_seq: number;
  attempt_no: number;
  lease_version: number;
  operation: string;
  request_hash: string;
  document_hash?: string;
  status: GovAttemptStatus;
  prepared_at: string;
  signed_at?: string;
  dispatched_at?: string;
  completed_at?: string;
  request_id: string;
  outcome?: GovAttemptOutcome;
  error_code: string;
  error_message: string;
  resolved_as?: GovAttemptResolvedAs;
  resolved_at?: string;
}

/**
 * The evidence of the `artifact` verification (iga_gov_deploy_verify.go:97-100
 * for direct delivery; iga_gov_iac_delivery.go:870-883 `GovApplyProgress` for
 * iac_pr / export while the customer's apply is awaited). Discriminate with
 * `"classification" in evidence`.
 */
export interface GovApplyProgress {
  class: GovClassificationClass;
  visible: number;
  total: number;
  overdue: boolean;
  apply_deadline_at: string | null;
  visible_facts: GovFactResult[] | null;
  awaited_facts: GovFactResult[] | null;
  conflicts: GovFactResult[] | null;
  reason?: string;
  summary: string;
}
/**
 * An artifact verification's evidence. `{}` is real: a verification row recorded
 * before any readback carries an empty object (observed in a captured deployment detail).
 */
export type GovArtifactEvidence = { classification: GovClassification; reason: string } | GovApplyProgress | Record<string, never>;

/** The `graph` verification's evidence (iga_gov_deploy_verify.go:215-290). Keys of a boundary assignment are Go field names (no json tags). */
export interface GovGraphEvidence {
  reason?: string;
  rev?: number;
  boundary_assignments?: { NativeRef: string; DocumentHash: string; VersionID: string }[] | null;
}

/** The `application_health` verification's evidence (iga_gov_deploy_verify.go:104-107). */
export interface GovApplicationHealthEvidence {
  canary: GovCanaryResult;
  reason?: string;
}

/** The `restriction` verification's evidence (iga_gov_deploy_verify.go:108-110). */
export interface GovRestrictionEvidence {
  reason?: string;
  service_restriction: Record<string, GovRestrictionObservation>;
}

interface GovVerificationBase {
  id: string;
  workspace_id: string;
  deployment_id: string;
  outcome: GovVerificationResult;
  attribution: GovAttribution;
  checked_at: string;
}

/**
 * models.IGAGovVerification (models/iga_gov_rollout.go:189-198), one row per
 * (deployment, dimension), as a union discriminated by `dimension` so the
 * evidence is typed. (J1/J2 delivery writes an `artifact` row without
 * attribution; the column default `not_applicable` applies.)
 */
export type IGAGovVerification =
  | (GovVerificationBase & { dimension: "artifact"; evidence: GovArtifactEvidence })
  | (GovVerificationBase & { dimension: "graph"; evidence: GovGraphEvidence })
  | (GovVerificationBase & { dimension: "application_health"; evidence: GovApplicationHealthEvidence })
  | (GovVerificationBase & { dimension: "restriction"; evidence: GovRestrictionEvidence });

/** models.IGAGovServiceOutcome (models/iga_gov_rollout.go:204-215): per-service HISTORY of one deployment. */
export interface IGAGovServiceOutcome {
  workspace_id: string;
  deployment_id: string;
  service: string;
  change: GovServiceChange;
  exclusion: GovServiceExclusion;
  route_state: GovRouteState;
  /** Empty exactly when `route_state` is `none_observed` (migration 051 iga_gov_so_routes_chk). */
  routes: GovRoute[];
  restriction: GovRestrictionObservation;
  outcome: GovServiceOutcomeKind;
  updated_at: string;
}

/** models.IGAGovValidationItem (models/iga_gov_rollout.go:324-333). */
export interface IGAGovValidationItem {
  workspace_id: string;
  validation_id: string;
  action: string;
  expected: GovExpectedOutcome;
  result: GovValidationItemResult;
  matched_events: number;
  opposite_events: number;
  /** `{}` until verification correlates it, then `{ boundary_attributed }` (iga_gov_deploy_verify.go:408-412). */
  evidence: { boundary_attributed?: boolean };
}

/** services.GovValidationView (iga_gov_deploy_routes.go:153-156): models.IGAGovValidation with its items. */
export interface GovValidationView {
  id: string;
  workspace_id: string;
  deployment_id: string;
  created_by: string;
  role_id: string;
  correlation: GovValidationCorrelation;
  /** `authsec-validate-<12 hex>` for assumed_session; the dedicated workload's display name for dedicated_workload. */
  session_name: string;
  dedicated_workload_id?: string;
  window_start: string;
  window_end: string;
  note: string;
  result: GovValidationResultKind;
  created_at: string;
  items: IGAGovValidationItem[];
}

/** models.IGAGovHealthReport (models/iga_gov_rollout.go:288-298). */
export interface IGAGovHealthReport {
  id: string;
  workspace_id: string;
  deployment_id: string;
  reported_by: string;
  kind: GovHealthReportKind;
  service: string;
  detail: string;
  channel: GovHealthReportChannel;
  created_at: string;
}

/** models.IGAGovArtifact (models/iga_gov_rollout.go:246-260): the ledger of native objects AuthSec controls (per control, not per deployment). */
export interface IGAGovArtifact {
  id: string;
  workspace_id: string;
  control_id: string;
  kind: GovArtifactKind;
  native_arn: string;
  owned_by: GovArtifactOwner;
  state: GovArtifactState;
  document_hash?: string;
  aws_version_id: string;
  last_readback_at?: string;
  last_readback_hash: string;
  last_deployment_id: string;
  updated_at: string;
}

/** models.IGAGovRevalidation (models/iga_gov_policy.go:495-509): a later evidence check of the approved plan. */
export interface IGAGovRevalidation {
  id: string;
  workspace_id: string;
  plan_id: string;
  approved_material_hash: string;
  evidence_bundle_id: string;
  evidence_rev: number;
  resource_policy_scan_run_id?: string;
  basis_read_at: string;
  material_hash?: string;
  result: GovRevalidationResult;
  changes: GovChange[];
  blocked_reason: string;
  created_at: string;
}

/** models.IGAGovAcceptance (models/iga_gov_rollout.go:105-122): one accepted uncertainty. Insert-once. */
export interface IGAGovAcceptance {
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

/** models.IGAGovWorkloadMigration (models/iga_gov_rollout.go:267-283): one subject moved off a shared role. */
export interface IGAGovWorkloadMigration {
  id: string;
  workspace_id: string;
  plan_id: string;
  control_id: string;
  subject_kind: GovMigrationSubjectKind;
  subject_arn: string;
  from_role_arn: string;
  to_role_arn: string;
  from_workload_keys: string[];
  to_workload_keys: string[];
  state: GovMigrationState;
  /** Per-subject binding evidence read by internal/awsdiscovery/migration_evidence.go; shape not typed here. */
  evidence: Record<string, unknown>;
  evidence_complete: boolean;
  remaining_old_refs?: number;
  checked_at?: string;
}

/** services.GovDimensionFact (iga_gov_deploy_service.go:747-751). */
export interface GovDimensionFact {
  outcome: GovVerificationResult;
  attribution: GovAttribution;
  reason?: string;
}

/**
 * services.DeploymentGateFacts (iga_gov_deploy_service.go:728-744): the
 * deployment's four dimensions as last recorded and the canary gates the
 * verify job computed. Dimensions not checked yet are absent from
 * `dimensions`; `gates` is empty until the verify job has run.
 */
export interface GovDeploymentGateFacts {
  deployment_id: string;
  control_id: string;
  kind: GovDeploymentKind;
  state: GovDeploymentState;
  state_reason: string;
  applied_at?: string;
  verified_at?: string;
  verify_deadline_at?: string;
  /** Verification is past its deadline: never "verified by elapsed time". */
  overdue: boolean;
  dimensions: Partial<Record<GovVerificationDimension, GovDimensionFact>>;
  gates: GovGateResult[];
  unexpected_failures: GovUnexpectedFailure[] | null;
  validations: GovValidationOutcome[] | null;
  service_restriction: Record<string, GovRestrictionObservation>;
  checked_at: Partial<Record<GovVerificationDimension, string>>;
}

/** services.GovDeploymentDetail (iga_gov_deploy_routes.go:136-149): `GET /deployments/:id`. */
/** services.GovDeploymentContext: what the deployment is of. */
export interface GovDeploymentContext {
  policy_id: string;
  policy_name: string;
  version_no: number;
  account_id: string;
  role_id: string;
  role_arn: string;
}

/** models.IGAGovIaCChange: the pull request of an `iac_pr` deployment (§8.11). */
export interface GovIaCChange {
  id: string;
  deployment_id: string;
  source_id: string;
  branch: string;
  pr_number?: number;
  pr_url: string;
  proposed_sha: string;
  reviewed_sha: string;
  merged_sha: string;
  merged_at?: string;
  apply_run_ref: string;
  state: string;
  updated_at: string;
}

/** services.GovRecoveryPlanView: a role-only recovery plan (§8.9) with the approval it holds, if any. */
export interface GovRecoveryPlan {
  plan_id: string;
  plan_hash: string;
  desired_attachment: string;
  artifact_disposition: string;
  created_at: string;
  approval_id?: string;
  approved_by?: string;
  approved_at?: string;
  approval_expires_at?: string;
}

export interface GovDeploymentDetail {
  deployment: IGAGovDeployment;
  context: GovDeploymentContext;
  /** Null unless the deployment's delivery is `iac_pr`. */
  iac_change: GovIaCChange | null;
  /** Role-only recovery plans of an apply deployment; empty unless an undo was blocked. */
  recovery_plans: GovRecoveryPlan[];
  plan: GovDeploymentPlanRow;
  /** Ordered by op_seq, attempt_no. */
  attempts: IGAGovAttempt[];
  /** One per dimension, ordered by dimension. */
  verifications: IGAGovVerification[];
  /** Ordered by service. */
  service_outcomes: IGAGovServiceOutcome[];
  validations: GovValidationView[];
  health_reports: IGAGovHealthReport[];
  /** The artifact ledger of this deployment's CONTROL (all deployments of the role). */
  ledger: IGAGovArtifact[];
  /** Of the deployment's plan. */
  revalidations: IGAGovRevalidation[];
  /** Of the deployment's version. */
  acceptances: IGAGovAcceptance[];
  /** Of the deployment's plan (split / dedicated-identity moves). */
  migrations: IGAGovWorkloadMigration[];
  evidence_bundle_id: string;
  gate_facts: GovDeploymentGateFacts | null;
}

/* ----------------------------- request bodies ------------------------------ */

/** `POST /deployments/:id/resolve` body (GovResolveRequest, iga_gov_deploy_routes.go:544-551). Reason is required. */
export interface GovResolveRequest {
  /** `emergency_undo` needs governance:emergency (checked in the handler :69-77). */
  action: "reread" | "accept_observed" | "emergency_undo";
  reason: string;
  /** The second `accept_observed` call: the approved version whose deployment takes over the role. */
  version_no?: number;
}

/**
 * What resolve returns, by action (iga_gov_deploy_routes.go:567-707):
 *  - `reread`: the deployment (back in `outcome_unknown`);
 *  - `accept_observed` without `version_no`: a new version proposed from what
 *    is in AWS now (`GovResolveProposed`; the role stays held);
 *  - `accept_observed` with `version_no`, and `emergency_undo`: the successor
 *    deployment (queued) that takes over from the recovered one.
 */
export interface GovResolveProposed {
  /** The version row (GovVersionView) and compiled plans (GovPlansView): typed by the policy authoring API. */
  version: Record<string, unknown>;
  plans: Record<string, unknown> | null;
}
export type GovResolveResult = IGAGovDeployment | GovResolveProposed;

export function isResolveProposed(r: GovResolveResult): r is GovResolveProposed {
  return "version" in r;
}

/** `POST /deployments/:id/undo` body (GovUndoRequest, iga_gov_deploy_routes.go:254-261). Optional for undo. */
export interface GovUndoRequest {
  /** A role-only recovery plan compiled for a blocked undo (409 artifact_consumers_changed `detail.recovery_plan_id`). */
  plan_id?: string;
  reason?: string;
}
/** `POST /deployments/:id/emergency-undo` body: a reason is required (:271-273). */
export interface GovEmergencyUndoRequest extends GovUndoRequest {
  reason: string;
}

/** One declared validation action (GovValidationItemInput, iga_gov_deploy_routes.go:743-746). */
export interface GovValidationItemInput {
  /** `<service>:<ApiName>` matching `^[a-z0-9-]+:[A-Za-z0-9]+$` and mappable to a CloudTrail event, else 422 action_not_mappable. */
  action: string;
  expected: GovExpectedOutcome;
}

/** `POST /deployments/:id/validations` body (GovValidationRequest, iga_gov_deploy_routes.go:749-756). */
export interface GovValidationRequest {
  /** At least one; actions are distinct. */
  items: GovValidationItemInput[];
  correlation: GovValidationCorrelation;
  /** Required for `dedicated_workload`; its display name becomes the session name (422 session_not_unique when another active workload shares it). */
  dedicated_workload_id?: string;
  /** RFC 3339; `window_end` must be after `window_start`. */
  window_start: string;
  window_end: string;
  note?: string;
}

/** `POST /deployments/:id/health-reports` body (GovHealthReportRequest, iga_gov_deploy_routes.go:888-893). */
export interface GovHealthReportRequest {
  kind: GovHealthReportKind;
  /** Lower-cased by the server. */
  service?: string;
  /** Required (non-blank) for `problem`. */
  detail: string;
}

/** Body of both remove-control routes (GovRemoveControlRequest, iga_gov_deploy_remove.go:44-48). */
export interface GovRemoveControlRequest {
  /** Distinct, each a live (not removed) control of the policy. */
  control_ids: string[];
  /** Required for the emergency route. */
  reason: string;
  /** Default `direct`. */
  delivery?: GovDelivery;
}

/** `POST /policies/:id/rollout/start` body (GovRolloutStartInput, iga_gov_rollout_service.go:691-694). */
export interface GovRolloutStartInput {
  /** Default: the policy's active version. */
  version_no?: number;
  reason?: string;
}

/** One accepted `not_available` gate (GovGateAcceptInput, :1379-1382). Both fields are required. */
export interface GovGateAcceptInput {
  gate: GovCanaryGate;
  reason: string;
}

/**
 * `POST /policies/:id/rollout/expand` body (GovRolloutExpandInput, :1385-1388).
 * Accepting a gate needs governance:approve and a caller who did not author
 * the version (403 self_approval / forbidden).
 */
export interface GovRolloutExpandInput {
  accept_not_available?: GovGateAcceptInput[];
  reason?: string;
}

/* ------------------------------ remove-control ----------------------------- */

/** services.GovReviewSync (iga_gov_owner_review_service.go:741-747): the owner review opened for a removal. */
export interface GovReviewSync {
  review_id: string;
  created: boolean;
  reopened: boolean;
  new_owner_user_ids: string[] | null;
  status: string;
}

/**
 * services.GovRemoveControlResult (iga_gov_deploy_remove.go:51-58), 201.
 * The ordinary route opens an owner review (`review`) and creates no
 * deployment; the emergency route creates the deployments at once.
 * `version_id` / `version_no` are absent when every control was retired
 * without a plan.
 */
export interface GovRemoveControlResult {
  version_id?: string;
  version_no?: number;
  plans: GovDeploymentPlanRow[];
  /** Controls with no AuthSec artifact in AWS: retired at once, no plan. */
  retired_without_plan: string[];
  deployments: IGAGovDeployment[];
  review?: GovReviewSync;
}

/* --------------------------------- rollout --------------------------------- */

/** models.IGAGovRollout (models/iga_gov_rollout.go:86-98). */
export interface IGAGovRollout {
  /** The nil uuid, with an empty `stage`, for a remove_control version (it has no rollout row). */
  id: string;
  workspace_id: string;
  version_id: string;
  stage: GovRolloutStage | "";
  observe_until?: string;
  observe_evidence_required_after?: string;
  canary_started_at?: string;
  canary_min_until?: string;
  /** The same document as `GovRolloutView.results`; null for a remove_control version. */
  gate_results: GovRolloutResults | null;
  paused_reason: string;
  updated_at: string;
}

/** igagov.AttemptDuringObservation (health.go:692-696): a removed service attempted after the evidence report. */
export interface GovAttemptDuringObservation {
  role_id: string;
  service: string;
  at: string;
}

/** igagov.ObservationResult (health.go:699-707). */
export interface GovObservationResult {
  required_after: string;
  complete: boolean;
  back_to_draft: GovAttemptDuringObservation[];
  /** Role ids still without a report generated at or after `required_after`. */
  awaiting_report: string[];
  needs_refresh: boolean;
}

/** gate_results.observation (GovRolloutObservation, iga_gov_rollout_service.go:404-410). */
export interface GovRolloutObservation {
  rev: number;
  evaluated_at: string;
  result: GovObservationResult;
}

/** gate_results.canary (GovRolloutCanary, :412-427). */
export interface GovRolloutCanary {
  deployment_id: string;
  state: GovDeploymentState;
  rev?: number;
  evaluated_at: string;
  /** The canary window: applied_at .. applied_at + canary hours. */
  window_start?: string;
  window_end?: string;
  gates: GovGateResult[];
  /** Gates that were `not_available` and accepted by an approver. */
  accepted: GovCanaryGate[];
  pass: boolean;
  not_available: GovCanaryGate[] | null;
  application_health: GovDimensionResult;
  restriction: GovDimensionResult;
  unexpected_failures: GovUnexpectedFailure[] | null;
}

/** gate_results.pause (GovRolloutPause, :390-395). `from` is empty for `returned_to_draft`. */
export interface GovRolloutPause {
  from: GovRolloutStage | "";
  kind: GovPauseKind;
  reason: string;
  at: string;
}

/** gate_results.undo_offered[] (GovRolloutUndoOffer, :398-401): a deployment the paused rollout offers to undo. */
export interface GovRolloutUndoOffer {
  deployment_id: string;
  /** `/deployments/<id>/undo` (relative to the policy base). */
  path: string;
}

/** A target no deployment could be created for (GovRolloutRefusal, :429-436). */
export interface GovRolloutRefusal {
  target_id: string;
  role_id: string;
  /** A policy error code, e.g. `deployment_in_flight`, `material_change`, `binding_not_verified`. */
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

/** gate_results.expansion (GovRolloutExpansion, :438-443). */
export interface GovRolloutExpansion {
  at: string;
  deployments: string[];
  /** Counts as a failed target: the rollout ends `partial`. */
  refused: GovRolloutRefusal[];
}

/** iga_gov_rollout.gate_results (GovRolloutResults, :445-451). Every part is optional. */
export interface GovRolloutResults {
  observation?: GovRolloutObservation;
  canary?: GovRolloutCanary;
  pause?: GovRolloutPause;
  undo_offered?: GovRolloutUndoOffer[];
  expansion?: GovRolloutExpansion;
}

/** services.GovRolloutDeployment (:680-688): one deployment of the rolled-out version. */
export interface GovRolloutDeployment {
  id: string;
  target_id: string;
  role_id: string;
  canary: boolean;
  state: GovDeploymentState;
  applied_at?: string;
  created_at: string;
}

/**
 * services.GovRolloutView (iga_gov_rollout_service.go:666-678): `GET
 * /policies/:id/rollout` and the response of every rollout mutation.
 * `GET` answers 404 `rollout_not_started` when the policy (or the named
 * version) has no rollout: that is "not started", not a failure.
 */
export interface GovRolloutView {
  rollout: IGAGovRollout;
  results: GovRolloutResults;
  policy_id: string;
  version_no: number;
  /** The version's status (json `version_status`). */
  version_status: string;
  deployments: GovRolloutDeployment[];
  /** Of this rollout. */
  acceptances: IGAGovAcceptance[];
  actions: GovRolloutAction[];
}

/* ------------------------------ error details ------------------------------ */

/** 409 `gates_not_passed` detail (iga_gov_rollout_service.go:1438, :1445, :1459). `gates` lists the failing / unaccepted gates; the other keys are absent when the canary has no deployment or is not applied yet (then `state` may be present). */
export interface GovGatesNotPassedDetail {
  gates?: GovGateResult[];
  not_available?: GovCanaryGate[] | null;
  accepted?: GovCanaryGate[];
  state?: GovDeploymentState;
}

/** 409 `outcome_unknown_pending` / `deployment_in_flight` detail (iga_gov_deploy_routes.go:245-259, :553-554). */
export interface GovInFlightDetail {
  deployment_id?: string;
  state?: GovDeploymentState;
  settle_after?: string | null;
}

/** 409 `not_latest_deployment` detail (:283-289). */
export interface GovNotLatestDetail {
  deployment_id: string;
  latest_deployment_id?: string;
}

/** 409 `artifact_consumers_changed` detail (:337-352): a role-only recovery plan was prepared (needs its own approval or an emergency undo). */
export interface GovConsumersChangedDetail {
  classification: GovClassification;
  recovery_plan_id?: string;
  recovery_plan?: GovDeploymentPlanRow;
}

/** 409 `artifact_changed_outside_authsec` / `artifact_owned_elsewhere` / `plan_changed` (undo) detail. */
export interface GovChangedOutsideDetail {
  classification: GovClassification;
}

/** 409 `material_change` detail (iga_gov_rollout_service.go:973-974). */
export interface GovMaterialChangeDetail {
  plan_id: string;
  revalidation_id: string;
  changes: GovChange[];
}

/* ---------------------------------- helpers -------------------------------- */

/**
 * States that hold the role: at most one deployment per control may be in one
 * of them (unique index uq_iga_gov_deployment_inflight, migration 051:146-148;
 * `inFlightCheck`, iga_gov_deploy_routes.go:234).
 */
export const HOLDING_ROLE_STATES: readonly GovDeploymentState[] = [
  "queued",
  "applying",
  "outcome_unknown",
  "outcome_unresolved",
  "awaiting_merge",
  "awaiting_apply",
];

export function isHoldingRole(state: GovDeploymentState): boolean {
  return HOLDING_ROLE_STATES.includes(state);
}

/** The fields a deployment row needs for the helpers (a list row or a detail's `deployment`). */
export type GovDeploymentFacts = Pick<
  IGAGovDeployment,
  "id" | "control_id" | "kind" | "state" | "applied_at" | "verify_deadline_at" | "apply_deadline_at" | "drift_accepted_at"
>;

/**
 * Whether a deployment needs a person now (spec S8 `attention=1`, which the
 * list serves; this is the same rule for a row already in hand): blocked,
 * failed or drifted and not accepted; an outcome the system could not
 * establish (`outcome_unknown`, `outcome_unresolved` which needs an operator's
 * Resolve); verification past its deadline; a customer apply past its
 * deadline. Gate failures live on the rollout, not on the row.
 */
export function needsOperator(d: GovDeploymentFacts, now: Date = new Date()): boolean {
  switch (d.state) {
    case "blocked":
    case "failed":
    case "outcome_unknown":
    case "outcome_unresolved":
      return true;
    case "drifted":
      return d.drift_accepted_at === undefined;
    case "applied_unverified":
      return d.verify_deadline_at !== undefined && new Date(d.verify_deadline_at) < now;
    case "awaiting_apply":
      return d.apply_deadline_at !== undefined && new Date(d.apply_deadline_at) < now;
    default:
      return false;
  }
}

/** Why `UndoDeployment` would refuse (iga_gov_deploy_routes.go:269-306). */
export type GovUndoBlocker =
  /** Only an `apply` deployment is undone (`not_undoable`). */
  | "not_apply"
  /** A deployment on the control holds it (`deployment_in_flight` / `outcome_unknown_pending`). */
  | "in_flight"
  /** Not the latest non-undone applied deployment of the control (`not_latest_deployment`). */
  | "not_latest";

/**
 * `latestUndoable` (iga_gov_deploy_routes.go:406-422): the latest, by
 * `applied_at`, applied deployment of the control that is not an undo and is
 * verified, applied_unverified, drifted or superseded. A remove_control or
 * split deployment counts, so it blocks undoing an earlier apply.
 */
function latestUndoable(siblings: readonly GovDeploymentFacts[]): GovDeploymentFacts | null {
  let best: GovDeploymentFacts | null = null;
  for (const x of siblings) {
    if (!x.applied_at || x.kind === "undo") continue;
    if (!["verified", "applied_unverified", "drifted", "superseded"].includes(x.state)) continue;
    if (!best || new Date(x.applied_at) > new Date(best.applied_at as string)) best = x;
  }
  return best;
}

/**
 * The reason `UndoDeployment` would refuse `d`, from the control's
 * deployments (`siblings`: every deployment with the same `control_id`,
 * including `d`; list `GET /deployments?policy_id=` and filter on
 * `control_id`), or null when none of the checks the client can run applies.
 * Advisory: the server also requires the deployment's approval to name the
 * undo plan (or an emergency undo), a reachable AWS read and a role still in
 * its post-apply state, and decides all of it.
 */
export function undoBlocker(d: GovDeploymentFacts, siblings: readonly GovDeploymentFacts[]): GovUndoBlocker | null {
  if (d.kind !== "apply") return "not_apply";
  const sameControl = siblings.filter((s) => s.control_id === d.control_id);
  if (sameControl.some((s) => isHoldingRole(s.state))) return "in_flight";
  const latest = latestUndoable(sameControl);
  if (!latest || latest.id !== d.id) return "not_latest";
  return null;
}

/** Whether to offer Undo for `d` (see `undoBlocker`). */
export function canUndo(d: GovDeploymentFacts, siblings: readonly GovDeploymentFacts[]): boolean {
  return undoBlocker(d, siblings) === null;
}

/* ----------------------------------- API ----------------------------------- */

export interface ListGovDeploymentsArgs extends WsArg, PageArgs {
  policy_id?: string;
  state?: GovDeploymentState;
  /** A 12-digit AWS account id. */
  account?: string;
  kind?: GovDeploymentKind;
  delivery?: GovDelivery;
  /** Only deployments that need a person (the server's rule, see `needsOperator`). */
  attention?: boolean;
}

/** `POST /deployments/:id/recovery-plans/:plan_id/approve` body; `plan_hash` is the hash the approver was shown. */
export interface GovApproveRecoveryPlanRequest {
  plan_hash: string;
  reason?: string;
}

/** `POST /deployments/:id/accept-drift` and `/reapply` body. Reason is required. */
export interface GovDriftActionRequest {
  reason: string;
}

/** What Accept drift did (services.GovDriftAccepted). */
export interface GovDriftAccepted {
  deployment: IGAGovDeployment;
  /** AuthSec's boundary was no longer attached, so the control moved to `removed`. */
  control_removed: boolean;
}

export interface GovDeploymentArgs extends WsArg {
  id: string;
}

export interface GetGovRolloutArgs extends WsArg {
  policyId: string;
  /** Default: the active (else newest) rollout's version. */
  version_no?: number;
}

/** Caches every deployment, rollout and removal changes (see the file header). */
const DEPLOYMENT_FANOUT = [
  { type: "IgaGovPolicy", id: "ALL" },
  { type: "IgaGovVersion", id: "ALL" },
  { type: "IgaGovFinding", id: "ALL" },
  { type: "IgaGovReadiness", id: "ALL" },
  { type: "IgaGovMetrics", id: "ALL" },
  { type: "IgaGovEvent", id: "ALL" },
] as const;

export const igaPolicyDeploymentsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    listGovDeployments: b.query<PolicyEnvelope<GovDeploymentView[], GovDeploymentListMeta>, ListGovDeploymentsArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/deployments${policyQuery(args)}` }),
      providesTags: (res) => [
        { type: "IgaGovDeployment", id: "ALL" },
        ...(res?.data ?? []).map((d) => ({ type: "IgaGovDeployment" as const, id: d.id })),
      ],
    }),

    getGovDeployment: b.query<GovDeploymentDetail, GovDeploymentArgs>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}` }),
      transformResponse: (res: { data: GovDeploymentDetail }) => res.data,
      providesTags: (_r, _e, { id }) => [{ type: "IgaGovDeployment", id }],
    }),

    resolveGovDeployment: b.mutation<GovResolveResult, { id: string } & GovResolveRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/resolve`, method: "POST", body }),
      transformResponse: (res: { data: GovResolveResult }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        { type: "IgaGovDeployment", id: "ALL" },
        { type: "IgaGovRollout", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
        // accept_observed (first call) creates a version, its plans and an owner review.
        { type: "IgaGovReview", id: "ALL" },
      ],
    }),

    /** 201: the new undo deployment (queued). */
    undoGovDeployment: b.mutation<IGAGovDeployment, { id: string } & GovUndoRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/undo`, method: "POST", body }),
      transformResponse: (res: { data: IGAGovDeployment }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        { type: "IgaGovDeployment", id: "ALL" },
        { type: "IgaGovRollout", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    /** 201: the new undo deployment (queued), with `emergency_by` set. Needs governance:emergency. */
    emergencyUndoGovDeployment: b.mutation<IGAGovDeployment, { id: string } & GovEmergencyUndoRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/emergency-undo`, method: "POST", body }),
      transformResponse: (res: { data: IGAGovDeployment }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        { type: "IgaGovDeployment", id: "ALL" },
        { type: "IgaGovRollout", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    /** 201: the recovery plan's own approval (`scope: "recovery"`). Needs governance:approve; never the version's author. */
    approveGovRecoveryPlan: b.mutation<{ id: string }, { id: string; planId: string } & GovApproveRecoveryPlanRequest>({
      query: ({ id, planId, ...body }) => ({
        url: `${POLICY_BASE}/deployments/${enc(id)}/recovery-plans/${enc(planId)}/approve`,
        method: "POST",
        body,
      }),
      transformResponse: (res: { data: { id: string } }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: "IgaGovDeployment", id }, { type: "IgaGovEvent", id: "ALL" }],
    }),

    /** 200: the deployment, marked accepted. Needs governance:enforce. */
    acceptGovDrift: b.mutation<GovDriftAccepted, { id: string } & GovDriftActionRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/accept-drift`, method: "POST", body }),
      transformResponse: (res: { data: GovDriftAccepted }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        { type: "IgaGovDeployment", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    /** 201: a new version proposed with the drifted deployment's intent (plans compiled from AWS now). Needs governance:author. */
    reapplyGovDeployment: b.mutation<GovResolveProposed, { id: string } & GovDriftActionRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/reapply`, method: "POST", body }),
      transformResponse: (res: { data: GovResolveProposed }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        { type: "IgaGovApproval", id: "ALL" },
        { type: "IgaGovReview", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    /** 201: the declared validation, with the session name the test must use. */
    declareGovDeploymentValidation: b.mutation<GovValidationView, { id: string } & GovValidationRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/validations`, method: "POST", body }),
      transformResponse: (res: { data: GovValidationView }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        // The canary gates (required_operations, no_unexpected_failures) read validations.
        { type: "IgaGovRollout", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    listGovDeploymentValidations: b.query<GovValidationView[], GovDeploymentArgs>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/validations` }),
      transformResponse: (res: { data: GovValidationView[] }) => res.data,
      providesTags: (_r, _e, { id }) => [{ type: "IgaGovDeployment", id }],
    }),

    /** 201. Allowed for an owner of a consumer of the role, or a holder of governance:author (403 not_consumer_owner). */
    createGovDeploymentHealthReport: b.mutation<IGAGovHealthReport, { id: string } & GovHealthReportRequest>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/health-reports`, method: "POST", body }),
      transformResponse: (res: { data: IGAGovHealthReport }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovDeployment", id },
        // The no_problem_reports gate reads these.
        { type: "IgaGovRollout", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    listGovDeploymentHealthReports: b.query<IGAGovHealthReport[], GovDeploymentArgs>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/deployments/${enc(id)}/health-reports` }),
      transformResponse: (res: { data: IGAGovHealthReport[] }) => res.data,
      providesTags: (_r, _e, { id }) => [{ type: "IgaGovDeployment", id }],
    }),

    /** 201. Creates a remove_control version and plans, and opens the owner review; deployments follow approval and rollout start. */
    removeGovControl: b.mutation<GovRemoveControlResult, { policyId: string } & GovRemoveControlRequest>({
      query: ({ policyId, ...body }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/remove-control`,
        method: "POST",
        body,
      }),
      transformResponse: (res: { data: GovRemoveControlResult }) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "IgaGovRollout", id: policyId },
        { type: "IgaGovRollout", id: "ALL" },
        { type: "IgaGovDeployment", id: "ALL" },
        { type: "IgaGovReview", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    /** 201. Needs governance:emergency; no review or approval, the deployments are created at once. */
    emergencyRemoveGovControl: b.mutation<GovRemoveControlResult, { policyId: string } & GovRemoveControlRequest>({
      query: ({ policyId, ...body }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/emergency-remove-control`,
        method: "POST",
        body,
      }),
      transformResponse: (res: { data: GovRemoveControlResult }) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "IgaGovRollout", id: policyId },
        { type: "IgaGovRollout", id: "ALL" },
        { type: "IgaGovDeployment", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    getGovRollout: b.query<GovRolloutView, GetGovRolloutArgs>({
      query: ({ policyId, ...rest }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/rollout${policyQuery(rest)}`,
      }),
      transformResponse: (res: { data: GovRolloutView }) => res.data,
      providesTags: (_r, _e, { policyId }) => [
        { type: "IgaGovRollout", id: "ALL" },
        { type: "IgaGovRollout", id: policyId },
      ],
    }),

    startGovRollout: b.mutation<GovRolloutView, { policyId: string } & GovRolloutStartInput>({
      query: ({ policyId, ...body }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/rollout/start`,
        method: "POST",
        body,
      }),
      transformResponse: (res: { data: GovRolloutView }) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "IgaGovRollout", id: policyId },
        // Starting the canary (or a removal) creates deployments; observation changes the version's state.
        { type: "IgaGovDeployment", id: "ALL" },
        { type: "IgaGovApproval", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    /** 409 `gates_not_passed` (detail: `GovGatesNotPassedDetail`) when the canary's gates have not passed. */
    expandGovRollout: b.mutation<GovRolloutView, { policyId: string } & GovRolloutExpandInput>({
      query: ({ policyId, ...body }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/rollout/expand`,
        method: "POST",
        body,
      }),
      transformResponse: (res: { data: GovRolloutView }) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [
        { type: "IgaGovRollout", id: policyId },
        { type: "IgaGovDeployment", id: "ALL" },
        ...DEPLOYMENT_FANOUT,
      ],
    }),

    pauseGovRollout: b.mutation<GovRolloutView, { policyId: string; reason: string }>({
      query: ({ policyId, reason }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/rollout/pause`,
        method: "POST",
        body: { reason },
      }),
      transformResponse: (res: { data: GovRolloutView }) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [{ type: "IgaGovRollout", id: policyId }, ...DEPLOYMENT_FANOUT],
    }),

    resumeGovRollout: b.mutation<GovRolloutView, { policyId: string; reason: string }>({
      query: ({ policyId, reason }) => ({
        url: `${POLICY_BASE}/policies/${enc(policyId)}/rollout/resume`,
        method: "POST",
        body: { reason },
      }),
      transformResponse: (res: { data: GovRolloutView }) => res.data,
      invalidatesTags: (_r, _e, { policyId }) => [{ type: "IgaGovRollout", id: policyId }, ...DEPLOYMENT_FANOUT],
    }),
  }),
});

export const {
  useListGovDeploymentsQuery,
  useGetGovDeploymentQuery,
  useResolveGovDeploymentMutation,
  useUndoGovDeploymentMutation,
  useEmergencyUndoGovDeploymentMutation,
  useApproveGovRecoveryPlanMutation,
  useAcceptGovDriftMutation,
  useReapplyGovDeploymentMutation,
  useDeclareGovDeploymentValidationMutation,
  useListGovDeploymentValidationsQuery,
  useCreateGovDeploymentHealthReportMutation,
  useListGovDeploymentHealthReportsQuery,
  useRemoveGovControlMutation,
  useEmergencyRemoveGovControlMutation,
  useGetGovRolloutQuery,
  useStartGovRolloutMutation,
  useExpandGovRolloutMutation,
  usePauseGovRolloutMutation,
  useResumeGovRolloutMutation,
} = igaPolicyDeploymentsApi;
