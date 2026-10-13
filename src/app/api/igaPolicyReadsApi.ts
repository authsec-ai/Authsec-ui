/**
 * Phase 3 policy: the findings, readiness, target-resolution, evidence, owners,
 * settings, events and metrics routes (SPEC-iga-phase3-policy.md §7.1 owners and
 * findings, §7.2 target resolution and evidence bundles, §7.8 settings, events
 * and metrics). Every shape below was traced from the Go response struct that
 * the registered handler serialises; `authsec/controllers/platform/
 * iga_gov_policy_controller.go` `RegisterIGAPolicyRoutes` is the route table.
 *
 * All paths are under `POLICY_BASE`. The workspace is the token's: nothing here
 * sends a workspace id; `ws` on a query argument is a client-only cache key
 * (`policyQuery` drops it).
 *
 * Endpoint                                  Permission          Go handler (file:line)
 * ----------------------------------------  ------------------  -----------------------------------------------
 * GET    /readiness                         governance:read     iga_gov_findings_controller.go:222 (services/iga_gov_readiness.go:90)
 * GET    /findings                          governance:read     iga_gov_findings_controller.go:121 (services/iga_gov_reads.go:368)
 * GET    /findings/summary                  governance:read     iga_gov_findings_controller.go:163 (services/iga_gov_reads.go:481)
 * GET    /findings/:id                      governance:read     iga_gov_findings_controller.go:180 (services/iga_gov_reads.go:526)
 * GET    /identities/:id/activity-evidence  governance:read     iga_gov_findings_controller.go:201 (services/iga_gov_reads.go:580)
 * POST   /targets/resolve                   governance:read     iga_gov_findings_controller.go:239 (services/iga_gov_targets.go:210)
 * GET    /evidence-bundles/:id              governance:read     iga_gov_findings_controller.go:256 (services/iga_gov_reads.go:598)
 * GET    /owners                            governance:read     iga_gov_owners_controller.go:122 (services/iga_gov_ownership_service.go:158)
 * PUT    /owners                            iga:admin           iga_gov_owners_controller.go:164 (services/iga_gov_ownership_service.go:387)
 * PATCH  /owners/:id                        iga:admin           iga_gov_owners_controller.go:211 (services/iga_gov_ownership_service.go:456)
 * GET    /owner-rules                       iga:admin           iga_gov_owners_controller.go:256 (services/iga_gov_ownership_service.go:572)
 * POST   /owner-rules                       iga:admin           iga_gov_owners_controller.go:295 (services/iga_gov_ownership_service.go:494)
 * DELETE /owner-rules/:id                   iga:admin           iga_gov_owners_controller.go:323 (services/iga_gov_ownership_service.go:542)
 * GET    /settings                          governance:read     iga_gov_events_controller.go:104 (services/iga_gov_settings_service.go:390)
 * PUT    /settings                          governance:enforce  iga_gov_events_controller.go:118 (services/iga_gov_settings_service.go:522)
 * GET    /events                            governance:read     iga_gov_events_controller.go:37  (services/iga_gov_events_service.go:248)
 * GET    /events/kinds                      governance:read     iga_gov_events_controller.go:92  (services/iga_gov_event_vocabulary.go:289)
 * GET    /events/export                     governance:read     iga_gov_events_controller.go:61  (services/iga_gov_events_service.go:308)
 * GET    /metrics                           governance:read     iga_gov_metrics_controller.go:24 (services/iga_gov_metrics.go:415)
 *
 * `GET /status` is internal (the gate) and is not wrapped.
 *
 * DESIGN CHOICES
 * - `POST /targets/resolve` is a READ: it writes no event and no audit row
 *   (iga_gov_findings_controller.go:25-29). It is an RTK `query` endpoint with a
 *   body (not a mutation) so it caches by key set, deduplicates, honours `skip`
 *   and gets `useLazyResolveGovTargetsQuery` for "ask when the user clicks".
 *   It carries `ws` like every query, and provides the owner / policy / finding
 *   tags so an owner or policy change refetches a mounted answer.
 * - Reads whose `meta` matters (revision pinning, cursors, metrics summary)
 *   return `PolicyEnvelope<T, Meta>`; the rest return `data` alone.
 * - Mutations invalidate what they change. Every write here also appends an
 *   `iga_gov_event`, so each also invalidates `IgaGovEvent ALL` (Logs).
 *
 * ERROR CODES beyond `PolicyErrorCode` that these routes answer (the code type
 * is open, so they classify as "rejected"/"conflict" by status): `cursor_invalid`
 * (400, a cursor reused with another filter or revision: restart paging),
 * `evaluation_incomplete` (409, `?rev` not evaluated), `revision_not_retained`
 * (410), `forbidden` (403, an owner/settings write by a non-human session),
 * `owner_rule_exists` (409), `notification_settings_unavailable` (409),
 * `notification_secret_store_unavailable` (503), `version_conflict` (409,
 * settings `expected_updated_at`), `internal` (500, owners handlers) and
 * `internal_error` (500).
 */

import config from "../../config";
import { baseApi } from "./baseApi";
import {
  enc,
  policyQuery,
  POLICY_BASE,
  type PageArgs,
  type PolicyEnvelope,
  type PolicyErrorBody,
  type WsArg,
} from "./igaPolicyCommon";

/* -------------------------------------------------------------------------- */
/*                                 vocabularies                               */
/* -------------------------------------------------------------------------- */

/** RFC 3339 timestamp (Go `time.Time` marshals as RFC 3339 with nanoseconds). */
export type GovTimestamp = string;
export type GovUuid = string;

/** services/iga_gov_reads.go:273 `govKinds`; internal/igagov/findings.go:17. */
export const FINDING_KINDS = [
  "unused_service",
  "broad_grant",
  "shared_role",
  "missing_owner",
  "missing_review_date",
  "activity_not_read",
] as const;
export type GovFindingKind = (typeof FINDING_KINDS)[number];

/** services/iga_gov_reads.go:275 `govStatuses` (048 CHECK; §2.5). No hide or dismiss. */
export const FINDING_STATUSES = [
  "open",
  "under_review",
  "excepted",
  "mitigated",
  "resolved",
  "cleared",
  "superseded",
  "reopened",
] as const;
export type GovFindingStatus = (typeof FINDING_STATUSES)[number];

/** Statuses the readiness counts treat as "open": services/iga_gov_readiness.go:158. */
export const OPEN_FINDING_STATUSES = ["open", "reopened", "under_review"] as const satisfies readonly GovFindingStatus[];

/** services/iga_gov_reads.go:277 `govSeverities`. */
export const FINDING_SEVERITIES = ["high", "medium", "low", "info"] as const;
export type GovSeverity = (typeof FINDING_SEVERITIES)[number];

/** services/iga_gov_reads.go:278 `govConfidences`. */
export const FINDING_CONFIDENCES = ["qualified", "age_unverified", "not_applicable"] as const;
export type GovConfidence = (typeof FINDING_CONFIDENCES)[number];

/** 048 `family` CHECK; internal/igagov/findings.go:26. Governance kinds: missing_owner, missing_review_date. */
export type GovFindingFamily = "governance" | "cloud_access";

/** services/iga_gov_readiness.go:44, in precedence order (no_change_needed last). */
export const READINESS_CATEGORIES = [
  "blocked_by_collection",
  "ineligible",
  "needs_owner",
  "iac_only",
  "direct_eligible",
  "no_change_needed",
] as const;
export type GovReadinessCategory = (typeof READINESS_CATEGORIES)[number];

/** services/iga_gov_targets.go:29. */
export const TARGET_STATUSES = ["resolved", "not_found", "ambiguous", "not_supported"] as const;
export type GovTargetStatus = (typeof TARGET_STATUSES)[number];

/** internal/igagov/bundle.go:17. */
export type GovTrust = "trusted" | "partial" | "untrusted";

/** What `SummarizeCoverage` returns (internal/igagov/bundle.go:196); `denied` is a per-row state only. */
export type GovResourcePolicyCoverage = "complete" | "partial" | "not_collected";

/** internal/igagov/routes.go:17,23: route facts of an activity row / a finding. */
export type GovRouteUsage = "none_observed" | "confirm_required";
export type GovRouteState = "none_observed" | "bypass_known" | "effect_unknown" | "not_analysed";

/** internal/igagov/routes.go:30-40. */
export type GovRoutePrincipal = "role_arn" | "role_session" | "wildcard";
export type GovRouteEffect = "limited" | "bypass_known" | "effect_unknown" | "not_analysed";

/** models/iga_gov_policy.go:27-34. */
export const OWNER_ROLES = ["accountable", "technical"] as const;
export type GovOwnerRole = (typeof OWNER_ROLES)[number];
export type GovOwnerSource = "manual" | "tag_rule";
export const OWNER_OBJECT_KINDS = ["workload", "identity_account"] as const;
export type GovOwnerObjectKind = (typeof OWNER_OBJECT_KINDS)[number];
/** services/iga_gov_ownership_service.go:499: `both` when omitted. */
export const OWNER_RULE_APPLIES_TO = ["workload", "identity_account", "both"] as const;
export type GovOwnerRuleAppliesTo = (typeof OWNER_RULE_APPLIES_TO)[number];

/** models/iga_gov_ops.go:18. */
export const ENFORCEMENT_MODES = ["findings_only", "enforce"] as const;
export type GovEnforcementMode = (typeof ENFORCEMENT_MODES)[number];

/** models/iga_gov_ops.go:34; the `actor_kind` filter of /events. */
export const EVENT_ACTOR_KINDS = ["user", "system", "slack_user", "aws"] as const;
export type GovEventActorKind = (typeof EVENT_ACTOR_KINDS)[number];

export type GovEventExportFormat = "csv" | "json";

/** 055 CHECK ranges, as services/iga_gov_settings_service.go:504 validates them (a miss is 400 naming the field). */
export const GOV_SETTINGS_RANGES = {
  default_window_days: { min: 30, max: 400 },
  default_observation_days: { min: 1, max: 90 },
  owner_review_days: { min: 1, max: 30 },
  approval_valid_days: { min: 1, max: 30 },
  canary_hours: { min: 1, max: 336 },
  iac_apply_hours: { min: 1, max: 336 },
  evidence_retention_revs: { min: 5, max: 365 },
} as const;
export type GovSettingsNumberField = keyof typeof GOV_SETTINGS_RANGES;

/** Largest page every list accepts (`MaxGovPage`, services/iga_gov_reads.go:64). */
export const GOV_MAX_PAGE = 200;

/* -------------------------------------------------------------------------- */
/*                         meta shared by finding reads                       */
/* -------------------------------------------------------------------------- */

/** services/iga_gov_reads.go:76. `error` is "" unless the evaluation failed. */
export interface GovEvalSummary {
  rev: number;
  /** `running` | `complete` | `failed` | `superseded` (models/iga_gov_policy.go:79). */
  status: "running" | "complete" | "failed" | "superseded";
  attempts: number;
  error: string;
  finished_at: GovTimestamp | null;
}

/**
 * services/iga_gov_reads.go:67 `GovRevMeta`: the meta of every finding read.
 * `evaluated_rev` is the revision served (the newest COMPLETE evaluation, never
 * the newest publication, unless `?rev` named one); null when nothing has been
 * evaluated. `latest_rev` is the newest publication; `last_evaluation` the
 * newest evaluation of any status ("evaluated at N-k; N failed").
 */
export interface GovRevMeta {
  evaluated_rev: number | null;
  latest_rev: number | null;
  last_evaluation: GovEvalSummary | null;
  next_cursor: string | null;
}

/* -------------------------------------------------------------------------- */
/*                                  findings                                  */
/* -------------------------------------------------------------------------- */

/** internal/igagov/routes.go:57 `Route`. Empty fields are omitted. */
export interface GovRoute {
  service: string;
  /** The resource-policy form (`sqs_queue`, `s3_bucket`, ...). */
  form?: string;
  region?: string;
  /** The resource ARN, empty for a not_analysed entry. */
  resource?: string;
  principal?: GovRoutePrincipal;
  effect: GovRouteEffect;
  /** Why it was not analysed (`form_not_collected`, `policy_unparseable`, ...). */
  reason?: string;
}

/** internal/igagov/canonical.go:790 `ImpactConsumer`. */
export interface GovImpactConsumer {
  workload_id: GovUuid;
  /** `executes_as` | `task_execution_role`. */
  relationship: string;
}

/** internal/igagov/findings.go:659 `grantRef`: one live statement granting the service. */
export interface GovGrantRef {
  policy_key: string;
  policy_arn: string;
  statement_key: string;
  statement_hash: string;
}

/** `grant_age_basis` of an activity row and of an unused_service detail. */
export type GovGrantAgeBasis = "observed_since_change" | "predates_observation" | "unknown";

/** `detail` of an unused_service condition: internal/igagov/findings.go:797 (`detail := map[string]any{...}`). */
export interface GovUnusedServiceDetail {
  service: string;
  scope: "identity_policies";
  qualified_days: number;
  requested_window_days: number;
  window_start: GovTimestamp | null;
  coverage_start: GovTimestamp | null;
  covered_until: GovTimestamp | null;
  report_generated_at: GovTimestamp | null;
  last_authenticated_at: GovTimestamp | null;
  role_created_at: GovTimestamp | null;
  tracking_from: GovTimestamp | null;
  grant_age_basis: GovGrantAgeBasis;
  verified_grant_from: GovTimestamp | null;
  route_usage: GovRouteUsage;
  route_state: GovRouteState;
  routes: GovRoute[] | null;
  grants: GovGrantRef[] | null;
}

/** `detail` of a broad_grant condition (internal/igagov/findings.go:895). */
export interface GovBroadGrantDetail {
  policy_key: string;
  policy_arn: string;
  /** Boundary assignments are skipped by the evaluator. */
  assignment_kind: "attached" | "inline";
  statement_key: string;
  statement_hash: string;
  sid: string;
  reasons: ("full_wildcard" | "not_action_on_all_resources" | "service_wildcard" | "escalation")[];
  service_wildcards: string[];
  /** Matched escalation catalog actions (`iam:PassRole`, ...); null when none. */
  escalations: string[] | null;
  has_condition: boolean;
}

/** `detail` of a shared_role condition (findings.go:910). */
export interface GovSharedRoleDetail {
  workload_count: number;
  consumers: GovImpactConsumer[];
}

/** `detail` of a missing_owner condition (findings.go:940). */
export interface GovMissingOwnerDetail {
  consumers: GovImpactConsumer[];
  unmatched_owner_tags: string[];
}

/** `detail` of a missing_review_date condition (findings.go:988). */
export interface GovMissingReviewDateDetail {
  rule_ids: GovUuid[];
  owner_ids_without_review_date: GovUuid[];
}

/** `detail` of an activity_not_read condition (findings.go:839). `reason` is a collection-gap code. */
export interface GovActivityNotReadDetail {
  reason: string;
  scan_run_id: GovUuid | null;
  connector_id: GovUuid | null;
  consumers: GovImpactConsumer[];
}

export interface GovFindingDetailByKind {
  unused_service: GovUnusedServiceDetail;
  broad_grant: GovBroadGrantDetail;
  shared_role: GovSharedRoleDetail;
  missing_owner: GovMissingOwnerDetail;
  missing_review_date: GovMissingReviewDateDetail;
  activity_not_read: GovActivityNotReadDetail;
}

/**
 * services/iga_gov_reads.go:244 `FindingAtRev`: the condition at the read
 * revision, frozen when that revision's evaluation completed. `detail` is the
 * canonical JSON the evaluator stored; its shape depends on the finding's
 * `kind` (read it with `govFindingDetail`).
 */
export interface GovFindingAtRev {
  rev: number;
  severity: GovSeverity;
  confidence: GovConfidence;
  detail: GovFindingDetailByKind[GovFindingKind] | Record<string, unknown>;
  evidence_scan_run_id: GovUuid | null;
}

/** services/iga_gov_reads.go:253: the finding's CURRENT workflow status (labelled as current). */
export interface GovFindingCurrent {
  status: GovFindingStatus;
  status_changed_at: GovTimestamp;
  excepted_until: GovTimestamp | null;
  exception_reason: string;
  first_seen_rev: number;
  last_evaluated_rev: number;
}

/** services/iga_gov_reads.go:265: the collection gap a finding depends on; `remedy` is a console path. */
export interface GovCollectionGap {
  connector_id: GovUuid | null;
  scan_run_id: GovUuid | null;
  reason: string;
  /** `/iga/connections/<id>/coverage`, or `/iga/connections` when the connector is unknown. */
  remedy: string;
}

/** services/iga_gov_reads.go:226 `FindingView`: one finding as read at a revision. */
export interface GovFinding {
  id: GovUuid;
  fingerprint: string;
  kind: GovFindingKind;
  family: GovFindingFamily;
  /** The AWS RoleId (immutable); null when the finding has no role. */
  role_id: string | null;
  identity_account_id: GovUuid | null;
  role_name: string;
  role_arn: string;
  account_id: string;
  connector_id: GovUuid | null;
  /** A service for unused_service, an escaped statement key for broad_grant, "" otherwise. */
  detail_key: string;
  /** Null when the condition does not hold at the read revision (possible on `GET /findings/:id` only). */
  condition: GovFindingAtRev | null;
  current: GovFindingCurrent;
  /** Present on activity_not_read, and where evidence was not collected for the role. */
  collection_gap?: GovCollectionGap;
}

/** A workload that runs as a role (iga_gov_reads.go `GroupWorkload`). */
export interface GovGroupWorkload {
  workload_id: GovUuid;
  name: string;
  runtime_kind: string;
}

/**
 * services/iga_gov_reads.go `RoleGroup`: `group=role` answers one entry per
 * role and pages by role (a role's findings are never split across pages).
 */
export interface GovRoleGroup {
  role_id: string | null;
  identity_account_id: GovUuid | null;
  role_name: string;
  role_arn: string;
  findings: GovFinding[];
  /** At most five; `workload_count` is the whole count. */
  workloads: GovGroupWorkload[];
  workload_count: number;
}

/** services/iga_gov_reads.go:473. Keys are present only for counted values. */
export interface GovFindingSummary {
  total: number;
  by_kind: Partial<Record<GovFindingKind, number>>;
  by_status: Partial<Record<GovFindingStatus, number>>;
  by_severity: Partial<Record<GovSeverity, number>>;
}

/** services/iga_gov_reads.go:617 `ConsumerView`: a workload running as the role. */
export interface GovConsumerView {
  workload_id: GovUuid;
  name: string;
  runtime_kind: string;
  /** `executes_as` | `task_execution_role`. */
  relationship: string;
}

/** services/iga_gov_reads.go:625 `TargetOwnerView`: an owner of a role, or of a workload consuming it. */
export interface GovTargetOwnerView {
  owner_id: GovUuid;
  user_id: GovUuid;
  role: GovOwnerRole;
  source: GovOwnerSource;
  object_kind: GovOwnerObjectKind;
  object_id: GovUuid;
  /** "role" for the role's own owner, else the consuming workload's name. */
  for: string;
  review_due_at: GovTimestamp | null;
}

/** services/iga_gov_reads.go:519. */
export interface GovLinkedPolicy {
  control_id: GovUuid;
  policy_id: GovUuid;
  /** `planned` | `active` | `removing` (a `removed` control is not linked): models/iga_gov_policy.go:242. */
  state: "planned" | "active" | "removing";
}

/** models/iga_gov_policy.go:137 `IGAGovActivityEvidence`: the activity fact the evaluator relied on, per role and service. */
export interface GovActivityEvidence {
  workspace_id: GovUuid;
  rev: number;
  identity_account_id: GovUuid;
  role_id: string;
  service: string;
  state: "collected" | "not_collected";
  /** A qualification outcome reason, or the collection-gap code when `not_collected`. Open vocabulary. */
  reason: string;
  last_authenticated_at?: GovTimestamp;
  report_generated_at?: GovTimestamp;
  grant_observed_since?: GovTimestamp;
  grant_age_basis: GovGrantAgeBasis;
  tracking_from?: GovTimestamp;
  scan_run_id?: GovUuid;
  route_usage: GovRouteUsage;
}

/** services/iga_gov_reads.go:509 `FindingDetail`: `GovFinding` plus its evidence, owners, linked policy and consumers. */
export interface GovFindingDetail extends GovFinding {
  condition_holds_at_rev: boolean;
  evidence: GovActivityEvidence[];
  owners: GovTargetOwnerView[];
  /** The live control on the role; null when none (or more than one, which the server does not report). */
  linked_policy: GovLinkedPolicy | null;
  consumers: GovConsumerView[];
}

/**
 * The typed `detail` of a finding when it is of `kind`, else null. The
 * server stores the evaluator's canonical JSON, so the shape follows `kind`.
 */
export function govFindingDetail<K extends GovFindingKind>(f: GovFinding, kind: K): GovFindingDetailByKind[K] | null {
  if (f.kind !== kind || !f.condition) return null;
  return f.condition.detail as GovFindingDetailByKind[K];
}

/* -------------------------------------------------------------------------- */
/*                                  readiness                                 */
/* -------------------------------------------------------------------------- */

/** services/iga_gov_readiness.go:58. `code` examples: activity_not_collected, resource_policy_coverage_partial, no_accountable_owner, enforcement_mode_findings_only, no_verified_enforcement_binding, customer_boundary, and the ineligibility codes. */
export interface GovReadinessReason {
  category: GovReadinessCategory;
  code: string;
  /** Code-specific: a collection reason, `iac_source_mapped` / `no_iac_source`, or a boundary ARN. */
  detail?: string;
}

/** services/iga_gov_readiness.go:65 `ReadinessRole`. */
export interface GovReadinessRole {
  identity_account_id: GovUuid;
  role_id: string;
  role_name: string;
  role_arn: string;
  account_id: string;
  connector_id: GovUuid | null;
  category: GovReadinessCategory;
  /** EVERY reason that applies, not only the deciding one. */
  reasons: GovReadinessReason[];
  /** A console path to fix it: connection coverage, Findings filtered to the role, or `/iga/policy/setup`; "" for no_change_needed. */
  remedy: string;
  /** Open (open, reopened, under_review) finding counts by kind; absent kinds are zero. */
  open_findings: Partial<Record<GovFindingKind, number>>;
}

/** iga_gov_findings_controller.go:232: `data` of GET /readiness. `counts` covers every role reviewed, not the page, and sums to `roles_reviewed`. */
export interface GovReadiness {
  roles_reviewed: number;
  counts: Record<GovReadinessCategory, number>;
  /** The precedence order. */
  categories: GovReadinessCategory[];
  roles: GovReadinessRole[];
}

/** iga_gov_findings_controller.go:234. Not `GovRevMeta`: readiness is always at the latest complete evaluation. */
export interface GovReadinessMeta {
  evaluated_rev: number | null;
  next_cursor: string | null;
}

/* -------------------------------------------------------------------------- */
/*                              target resolution                              */
/* -------------------------------------------------------------------------- */

export type GovTargetProvider = "aws" | "k8s";

/**
 * One resolve key, exactly one form (services/iga_gov_targets.go:143
 * `ValidateTargetKeys`; the server rejects a key with zero or several forms and
 * an ARN key lacking `account_id` or `role_arn`). The wire has no discriminant,
 * so the forms exclude each other with `never`; build one with the
 * `govTargetKey*` helpers and read one with `govTargetKeyForm`.
 */
export interface GovTargetKeyByObject {
  /** Any graph object id: an identity is itself; a workload resolves to the one role it runs as; an edge, assignment or grant to its holder. */
  object_id: GovUuid;
  provider?: GovTargetProvider;
  account_id?: never;
  role_arn?: never;
  role_id?: never;
  cluster_uid?: never;
  namespace?: never;
  service_account?: never;
  uid?: never;
}
export interface GovTargetKeyByArn {
  account_id: string;
  role_arn: string;
  provider?: GovTargetProvider;
  object_id?: never;
  role_id?: never;
  cluster_uid?: never;
  namespace?: never;
  service_account?: never;
  uid?: never;
}
export interface GovTargetKeyByRoleId {
  /** The immutable AWS RoleId. */
  role_id: string;
  provider?: GovTargetProvider;
  object_id?: never;
  account_id?: never;
  role_arn?: never;
  cluster_uid?: never;
  namespace?: never;
  service_account?: never;
  uid?: never;
}
/** Kubernetes keys are always answered `not_supported` (prerequisite K-1). Any one of the fields makes the form. */
export interface GovTargetKeyByServiceAccount {
  provider?: "k8s";
  cluster_uid?: string;
  namespace?: string;
  service_account?: string;
  uid?: string;
  object_id?: never;
  account_id?: never;
  role_arn?: never;
  role_id?: never;
}
export type GovTargetKey =
  | GovTargetKeyByObject
  | GovTargetKeyByArn
  | GovTargetKeyByRoleId
  | GovTargetKeyByServiceAccount;

export type GovTargetKeyForm = "object" | "role_arn" | "role_id" | "k8s_service_account";

export const govTargetKeyForObject = (objectId: GovUuid): GovTargetKeyByObject => ({ object_id: objectId });
export const govTargetKeyForArn = (accountId: string, roleArn: string): GovTargetKeyByArn => ({
  provider: "aws",
  account_id: accountId,
  role_arn: roleArn,
});
export const govTargetKeyForRoleId = (roleId: string): GovTargetKeyByRoleId => ({ provider: "aws", role_id: roleId });

/** Which form a key is (the server's own precedence: a Kubernetes provider wins). */
export function govTargetKeyForm(k: GovTargetKey): GovTargetKeyForm {
  if (k.provider === "k8s" || k.cluster_uid || k.namespace || k.service_account || k.uid) return "k8s_service_account";
  if (k.role_arn) return "role_arn";
  if (k.role_id) return "role_id";
  return "object";
}

/** `MaxTargetKeys` (services/iga_gov_targets.go:30): 1..50 keys per request. */
export const GOV_MAX_TARGET_KEYS = 50;

/** services/iga_gov_targets.go:56 `ResolvedIdentity`: the identity incarnation a key resolved to. `kind` is the account kind (`iam_role`), `continuity` e.g. `immutable`. */
export interface GovResolvedIdentity {
  id: GovUuid;
  role_id: string;
  arn: string;
  name: string;
  path: string;
  tags: Record<string, string>;
  account_id: string;
  kind: string;
  continuity: string;
}

/** services/iga_gov_targets.go:69: the live control on the role (`removed` controls are not reported). */
export interface GovControlRef {
  id: GovUuid;
  policy_id: GovUuid;
  state: "planned" | "active" | "removing";
}

/** services/iga_gov_targets.go:78: a workload that names the role but whose edge could not be resolved. `state` is `not_in_scan` | `not_in_inventory`. */
export interface GovUnresolvedConsumer {
  workload_id: GovUuid;
  name: string;
  state: "not_in_scan" | "not_in_inventory";
}

/** services/iga_gov_targets.go:86: the evidence trust a plan for the role would rest on (a bundle built now, §2.11). */
export interface GovTargetEvidence {
  trust: GovTrust;
  /** `stale`, `unauthenticated`, `unordered`, `resource_policy_coverage_<state>`, `no_complete_evaluation`, `role_not_in_latest_evaluation`, `provider_not_supported:K-1`. */
  trust_reasons: string[];
  published_rev: number | null;
  freshness_hours: number | null;
  resource_policy_coverage: GovResourcePolicyCoverage;
  connector_id: GovUuid | null;
  connector_run: string | null;
  activity_report_generated_at: GovTimestamp | null;
}

/** services/iga_gov_targets.go:99: the object a key resolved THROUGH (context, never the target). */
export interface GovTargetContext {
  object_kind: "workload" | "relationship" | "assignment" | "grant";
  object_id: GovUuid;
}

/**
 * services/iga_gov_targets.go:105 `ResolvedTarget`: the answer for one key
 * (results are in request order). Non-`resolved` answers carry `identity: null`,
 * `control: null`, `evidence: null`, `eligible: false` and empty lists.
 *
 * `reason` values: `account_mismatch`, `no_live_identity`,
 * `workload_runs_as_no_role`, `identity_retired` (not_found);
 * `several_live_identities` (ambiguous, with `candidates`);
 * `provider_not_supported:<provider>` or the Kubernetes text (not_supported,
 * `prerequisite: "K-1"`, `ineligible_reasons: ["provider_not_supported:K-1"]`).
 *
 * `ineligible_reasons` (resolved, from `RoleIneligibility`,
 * services/iga_gov_targets.go:356): `not_a_role`, `no_immutable_role_id`,
 * `service_linked_role`, `aws_reserved_role`, `authsec_protected`,
 * `authsec_managed_role`. `eligible` is true exactly when it is empty.
 */
export interface GovResolvedTarget {
  key: GovTargetKey;
  status: GovTargetStatus;
  reason?: string;
  prerequisite?: string;
  candidates?: GovUuid[];
  context?: GovTargetContext;
  identity: GovResolvedIdentity | null;
  eligible: boolean;
  ineligible_reasons: string[];
  control: GovControlRef | null;
  consumers: GovConsumerView[];
  consumers_unresolved: number;
  unresolved_consumers: GovUnresolvedConsumer[];
  owners: GovTargetOwnerView[];
  evidence: GovTargetEvidence | null;
}

/** Body of POST /targets/resolve: `{ keys }`, 1..50. */
export interface GovResolveTargetsBody {
  keys: GovTargetKey[];
}

/* -------------------------------------------------------------------------- */
/*                               evidence bundles                              */
/* -------------------------------------------------------------------------- */

/** internal/igagov/bundle.go:58 `BundleSource`. */
export interface GovBundleSource {
  /** `aws_publication` | `k8s_sweep`. */
  kind: "aws_publication" | "k8s_sweep";
  rev: number;
  published_at: GovTimestamp | null;
  connector_id: string;
  connector_run: string;
  authenticated: boolean;
  ordered: boolean;
  trust: GovTrust;
  trust_reasons: string[];
  freshness_hours: number;
  activity_report_generated_at: GovTimestamp | null;
  resource_policy_coverage: GovResourcePolicyCoverage;
  resource_policy_run: string | null;
}

export interface GovBundleTarget {
  account_id: string;
  role_id: string;
  role_arn: string;
  /** `aws:account:<id>`. */
  estate_scope: string;
}

export interface GovBundleGrant {
  policy_arn: string;
  assignment_kind: "attached" | "inline";
  statement_key: string;
  statement_hash: string;
  services: string[];
}

export interface GovBundleActivity {
  service: string;
  state: "collected" | "not_collected";
  /** The §2.6 outcome; empty ("") for a not_collected service. */
  outcome: "observed" | "no_attempt" | "not_enough_history" | "unreviewed" | "";
  last_authenticated_at: GovTimestamp | null;
  grant_age_basis: GovGrantAgeBasis;
  verified_grant_from: GovTimestamp | null;
  qualified_days: number;
}

/** internal/igagov/bundle.go:126: evidence the approver must accept item by item. */
export interface GovBundleGap {
  kind: "resource_policy_coverage" | "unanalysed_form" | "policy_unparseable" | "consumers_unresolved";
  key: string;
  service?: string;
  form?: string;
  region?: string;
  resource?: string;
  reason?: string;
  /** consumers_unresolved only. */
  count?: number;
}

/** internal/igagov/bundle.go:146 `BundleFacts`: the canonical content of a bundle. */
export interface GovBundleFacts {
  format: string;
  catalog: string;
  built_at: GovTimestamp;
  sources: GovBundleSource[];
  target: GovBundleTarget;
  removed_services: string[];
  grants: GovBundleGrant[];
  consumers: GovImpactConsumer[];
  consumers_unresolved: number;
  /** Owner user ids. */
  owners: GovUuid[];
  activity: GovBundleActivity[];
  /** Remaining routes of the removed services (not_analysed entries are `gaps`). */
  routes: GovRoute[];
  gaps: GovBundleGap[];
}

/** services/iga_gov_reads.go:610: GET /evidence-bundles/:id, re-verified; `trust` is re-derived from the facts, not read from the row. */
export interface GovEvidenceBundle {
  id: GovUuid;
  provider: string;
  bundle_hash: string;
  trust: GovTrust;
  trust_reasons: string[];
  facts: GovBundleFacts;
  created_at: GovTimestamp;
}

/* -------------------------------------------------------------------------- */
/*                                   owners                                    */
/* -------------------------------------------------------------------------- */

/** services/iga_gov_ownership_service.go:69 `OwnerView`. `email`/`name` are "" and `member` false when the user is no longer an active member. */
export interface GovOwnerView {
  id: GovUuid;
  object_kind: GovOwnerObjectKind;
  object_id: GovUuid;
  user_id: GovUuid;
  email: string;
  name: string;
  role: GovOwnerRole;
  source: GovOwnerSource;
  rule_id: GovUuid | null;
  review_due_at: GovTimestamp | null;
  member: boolean;
  created_at: GovTimestamp;
  updated_at: GovTimestamp;
}

/** services/iga_gov_ownership_service.go:88: a workload running as a role, and its ACCOUNTABLE owners. */
export interface GovConsumerOwners {
  workload_id: GovUuid;
  name: string;
  runtime_kind: string;
  relationship: string;
  owners: GovOwnerView[];
}

/** services/iga_gov_ownership_service.go:97: one reason a person owns the object. `name` is the workload's for a consumer, "" for the role itself. */
export interface GovOwnerOf {
  object_kind: GovOwnerObjectKind;
  object_id: GovUuid;
  name: string;
  role: GovOwnerRole;
  source: GovOwnerSource;
}

/** services/iga_gov_ownership_service.go:109: one person, with every reason they own the object. */
export interface GovResolvedOwner {
  user_id: GovUuid;
  email: string;
  name: string;
  member: boolean;
  owner_of: GovOwnerOf[];
}

/** services/iga_gov_ownership_service.go:118 `ObjectOwnership`: `data` of GET and PUT /owners. */
export interface GovObjectOwnership {
  object_kind: GovOwnerObjectKind;
  object_id: GovUuid;
  name: string;
  /** The object's own owners (manual and tag-rule). */
  owners: GovOwnerView[];
  /** An identity's consuming workloads and their accountable owners; empty for a workload. */
  consumers: GovConsumerOwners[];
  /** Everyone who owns the object (an identity: its own plus its consumers' accountable owners). */
  resolved: GovResolvedOwner[];
  /** Whether any accountable owner exists in `resolved`. */
  has_accountable: boolean;
}

/** models/iga_gov_policy.go:38 `IGAGovOwnerRule` (every field is serialised). */
export interface GovOwnerRule {
  id: GovUuid;
  workspace_id: GovUuid;
  tag_key: string;
  applies_to: GovOwnerRuleAppliesTo;
  role: GovOwnerRole;
  enabled: boolean;
  created_by: GovUuid;
  created_at: GovTimestamp;
}

export interface GovOwnerRulesMeta {
  /** The last rule id of the page (a keyset cursor), null on the last page. */
  next_cursor: string | null;
}

/** iga_gov_owners_controller.go:343: `data` of DELETE /owner-rules/:id. The rule and, by FK cascade, every owner it assigned are gone. */
export interface GovOwnerRuleDeleted {
  id: GovUuid;
  deleted: true;
  owners_removed: number;
}

/** One wanted manual owner of PUT /owners (iga_gov_owners_controller.go:139). */
export interface GovOwnerAssignmentInput {
  user_id: GovUuid;
  /** Default `accountable`. */
  role?: GovOwnerRole;
  /** RFC 3339, or null/omitted for none. */
  review_due_at?: GovTimestamp | null;
}

/**
 * Body of PUT /owners: the object's MANUAL owners become exactly `owners`
 * (`[]` clears them; `owners` is required). Tag-rule owners are kept, except
 * one with the same (user, role) as a wanted entry, which is taken over as
 * manual. Every user must be an active member; the same (user, role) twice is
 * 400. Requires a verified human workspace-member session (403 `forbidden`
 * otherwise).
 */
export interface GovPutOwnersBody {
  object_kind: GovOwnerObjectKind;
  object_id: GovUuid;
  owners: GovOwnerAssignmentInput[];
}

export interface GovCreateOwnerRuleBody {
  /** An AWS tag key, 1..128 characters. */
  tag_key: string;
  /** Default `both`. */
  applies_to?: GovOwnerRuleAppliesTo;
  /** Default `accountable`. */
  role?: GovOwnerRole;
}

/* -------------------------------------------------------------------------- */
/*                                   settings                                  */
/* -------------------------------------------------------------------------- */

/** services/slack_integration_service.go:559. */
export interface GovSlackStatus {
  connected: boolean;
  team_name?: string;
  approvals_channel_id?: string;
  installed_at?: GovTimestamp;
  linked_users: number;
}

/** services/iga_gov_settings_service.go:361. */
export interface GovChannelAvailability {
  available: boolean;
  reason?: string;
  status?: GovSlackStatus;
}

/**
 * services/iga_gov_settings_service.go:347: the notifications block. The
 * webhook secret is never returned (only whether one is set).
 */
export interface GovNotificationSettings {
  /** False when no channel store is installed: PUT with `notifications` is then 409. */
  available: boolean;
  reason?: string;
  email_enabled: boolean;
  /** https only, "" for none. */
  webhook_url: string;
  webhook_secret_set: boolean;
  /** `default` | `phase3`. */
  source: "default" | "phase3";
  slack: GovChannelAvailability;
}

/**
 * services/iga_gov_settings_service.go:369 `GovSettingsView` (models.IGAGovSettings
 * embedded). When `saved` is false the workspace has no row: every value is a
 * default and `updated_at` is Go's zero time ("0001-01-01T00:00:00Z").
 */
export interface GovSettings {
  workspace_id: GovUuid;
  enforcement_mode: GovEnforcementMode;
  default_window_days: number;
  default_observation_days: number;
  owner_review_days: number;
  approval_valid_days: number;
  canary_hours: number;
  iac_apply_hours: number;
  evidence_retention_revs: number;
  updated_by?: GovUuid;
  updated_at: GovTimestamp;
  saved: boolean;
  notifications: GovNotificationSettings;
}

/** services/iga_gov_settings_service.go:497 `GovNotificationsPatch`. Omitted fields keep their value; `webhook_secret` is write-only ("" clears it). */
export interface GovNotificationsPatch {
  email_enabled?: boolean;
  /** https:// or "" (which also drops the secret). */
  webhook_url?: string;
  webhook_secret?: string;
}

/**
 * Body of PUT /settings (`GovSettingsPatch`, services/iga_gov_settings_service.go:479).
 * The body is parsed strictly: an unknown field is 400. Every field is
 * optional; omitted keeps the current value.
 *
 * - `reason` is REQUIRED when `enforcement_mode` changes to `enforce`
 *   (otherwise 400 invalid_parameter, `detail.parameter: "reason"`);
 *   `govSettingsNeedsReason` says when.
 * - `expected_updated_at`, when sent, must equal the row's `updated_at`
 *   exactly (pass the string back unchanged) or the write is 409
 *   `version_conflict`. Send it only when `saved` is true: for an unsaved
 *   workspace any value is a conflict.
 * - Numbers outside `GOV_SETTINGS_RANGES` are 400 naming the field.
 * - Needs a verified human workspace-member session.
 */
export interface GovSettingsPatch {
  enforcement_mode?: GovEnforcementMode;
  default_window_days?: number;
  default_observation_days?: number;
  owner_review_days?: number;
  approval_valid_days?: number;
  canary_hours?: number;
  iac_apply_hours?: number;
  evidence_retention_revs?: number;
  reason?: string;
  expected_updated_at?: GovTimestamp;
  notifications?: GovNotificationsPatch;
}

/** True when saving `next` over `current` is a switch to enforce, which needs a reason (services/iga_gov_settings_service.go:570). */
export function govSettingsNeedsReason(current: GovEnforcementMode, next: GovEnforcementMode | undefined): boolean {
  return next === "enforce" && current !== "enforce";
}

/* -------------------------------------------------------------------------- */
/*                                   events                                    */
/* -------------------------------------------------------------------------- */

/**
 * services/iga_gov_events_service.go:58 `GovEventView`. `payload` is the
 * event-specific object with every sensitive key's value replaced by
 * "[redacted]" (secret, token, email ...); its keys differ per `event`
 * (iga_gov_event.payload is free-form JSON written by each emitter), so the
 * shape is `Record<string, unknown>` and a screen reads only the keys it knows.
 * An unparseable stored payload comes back as `{ "unreadable": true }`.
 */
export interface GovEventView {
  id: number;
  occurred_at: GovTimestamp;
  /** The event name (see `GovEventKinds`): `owners.set`, `version_approved`, ... */
  event: string;
  /** The Logs category, "" when the name is not in the vocabulary. */
  category: string;
  actor_kind: GovEventActorKind;
  /** A user id, or `policy-worker`, `evaluator`, ... */
  actor_id: string;
  policy_id: GovUuid | null;
  version_id: GovUuid | null;
  deployment_id: GovUuid | null;
  finding_id: GovUuid | null;
  payload: Record<string, unknown>;
}

/**
 * Filter shared by GET /events and GET /events/export (iga_gov_events_controller.go:31
 * `eventFilter`, services/iga_gov_events_service.go:75). `kind` takes event
 * names; a name ending `.*` is a prefix (`review.*`). `object_kind` and
 * `object_id` go together (400 otherwise); the kinds are served by
 * `/events/kinds` (`object_kinds`). `from` is inclusive, `to` exclusive, `to`
 * must be after `from`.
 */
export interface GovEventsFilter {
  kind?: string[];
  category?: string;
  object_kind?: string;
  object_id?: GovUuid;
  actor?: string;
  actor_kind?: GovEventActorKind;
  from?: GovTimestamp;
  to?: GovTimestamp;
}

/** GET /events: newest first. `limit` 1..200 (default and max 200). A cursor is bound to its filter: change the filter, drop the cursor. */
export type GovEventsArgs = WsArg & GovEventsFilter & PageArgs;

export interface GovEventsMeta {
  next_cursor: string | null;
}

/** services/iga_gov_event_vocabulary.go:74 `GovEventKind`. `object` is "" for a workspace-level event, `workload|identity_account` for owners.set. */
export interface GovEventKind {
  name: string;
  category: string;
  object: string;
  description: string;
}

/** services/iga_gov_event_vocabulary.go:275: one Logs kind-filter entry; `reason` explains an unrecorded category. */
export interface GovEventCategoryView {
  category: string;
  recorded: boolean;
  events: string[];
  reason?: string;
}

/** iga_gov_events_controller.go:96: `data` of GET /events/kinds. */
export interface GovEventKinds {
  categories: GovEventCategoryView[];
  events: GovEventKind[];
  /** The values `object_kind` accepts, sorted. */
  object_kinds: string[];
}

/* -------------------------------------------------------------------------- */
/*                                   metrics                                   */
/* -------------------------------------------------------------------------- */

/** services/iga_gov_metrics.go:298 `GovMetricsRow`: one workspace-hour (UTC-aligned). */
export interface GovMetricsRow {
  hour: GovTimestamp;
  /** When the posture was read: the row's posture is as of this time, not the hour. */
  posture_as_of: GovTimestamp;
  posture_removed: number;
  posture_excluded_routes_remain: number;
  posture_excluded_routes_unknown: number;
  posture_pending: number;
  changes_newly_excluded: number;
  changes_newly_unexcluded: number;
  roles_right_sized: number;
  roles_eligible: number;
  approval_p50_seconds: number | null;
  approval_p95_seconds: number | null;
  approvals_pending: number;
  apply_to_verified_p95_seconds: number | null;
  unexpected_failures: number;
  undos: number;
}

/** services/iga_gov_metrics.go:329: a service excluded from a role but still reachable; `routes` are the known (bypass_known) ones. */
export interface GovMetricsRoute {
  account_id: string;
  role_id: string;
  role_name: string;
  service: string;
  routes: GovRoute[];
  text: string;
}

/**
 * services/iga_gov_metrics.go:342 `GovMetricsSummary` (`meta.summary`).
 * Posture and role counts are the LATEST row's; changes are summed over the
 * range; hours with no row are reported as missing, never as zeros;
 * percentiles are per hour and are not aggregated (the rows carry them).
 * `headline` is server-worded, honest text ("excluded ... still reachable").
 */
export interface GovMetricsSummary {
  from: GovTimestamp;
  to: GovTimestamp;
  hours_in_range: number;
  hours_with_row: number;
  hours_missing: number;
  latest_hour: GovTimestamp | null;
  posture_as_of: GovTimestamp | null;
  removed: number;
  excluded_routes_remain: number;
  excluded_routes_unknown: number;
  pending: number;
  roles_right_sized: number;
  roles_eligible: number;
  approvals_pending: number;
  newly_excluded: number;
  newly_unexcluded: number;
  net_excluded: number;
  undos: number;
  unexpected_failures: number;
  /** Read now, not as of a row; at most 50 (see the total). */
  current_routes_remaining: GovMetricsRoute[];
  current_routes_remaining_total: number;
  current_as_of: GovTimestamp;
  headline: string[];
}

/** iga_gov_metrics_controller.go:41: `meta` of GET /metrics (the summary is in every page). */
export interface GovMetricsMeta {
  next_cursor: string | null;
  from: GovTimestamp;
  to: GovTimestamp;
  summary: GovMetricsSummary;
}

/* -------------------------------------------------------------------------- */
/*                                query arguments                              */
/* -------------------------------------------------------------------------- */

/**
 * GET /readiness. `account` is an AWS account id. Always at the latest
 * complete evaluation; ordered by identity id; `limit` default 50, max 200.
 */
export type GovReadinessArgs = WsArg & PageArgs & { account?: string };

/**
 * GET /findings (and `group=role`). `status`, `kind`, `severity`, `confidence`
 * take several values (comma-joined). `account` is one AWS account id (the
 * role ARN's), `q` matches role name, role id and detail key, `identity_id` /
 * `workload_id` take a uuid (a workload also matches the roles it runs as).
 * `rev` pins an evaluated revision (409 `evaluation_incomplete` if it is not
 * complete, 410 `revision_not_retained` if pruned); omitted, the newest
 * complete evaluation is served. A cursor belongs to one filter set and one
 * revision (400 `cursor_invalid` otherwise). `limit` default 50, max 200.
 */
export interface GovFindingsFilter {
  status?: GovFindingStatus[];
  kind?: GovFindingKind[];
  severity?: GovSeverity[];
  confidence?: GovConfidence[];
  account?: string;
  /** A readiness category: only the findings of the roles `GET /readiness` puts in it. */
  category?: string;
  q?: string;
  identity_id?: GovUuid;
  workload_id?: GovUuid;
  rev?: number;
}
export type GovFindingsArgs = WsArg & PageArgs & GovFindingsFilter;

export type GovFindingsSummaryArgs = WsArg & { rev?: number };
export type GovFindingArgs = WsArg & { id: GovUuid; rev?: number };
export type GovActivityEvidenceArgs = WsArg & { identityId: GovUuid; rev?: number };
export type GovEvidenceBundleArgs = WsArg & { id: GovUuid };
export type GovResolveTargetsArgs = WsArg & GovResolveTargetsBody;

/** GET /owners: the object whose owners to read. */
export type GovOwnersArgs = WsArg & { object_kind: GovOwnerObjectKind; object_id: GovUuid };
/** GET /owner-rules: keyset-paged by rule id, `limit` 1..200, default 200. */
export type GovOwnerRulesArgs = WsArg & PageArgs;
/** PATCH /owners/:id: the owner row and its new review date (`null` clears it). */
export interface GovPatchOwnerArgs {
  id: GovUuid;
  review_due_at: GovTimestamp | null;
}
export type GovSettingsArgs = WsArg;

/**
 * GET /metrics: rows whose hour starts in [from, to), oldest first. Default
 * range is the 24 hours ending now; `from` must be before `to`. `limit`
 * default and max 200.
 */
export type GovMetricsArgs = WsArg & PageArgs & { from?: GovTimestamp; to?: GovTimestamp };

/* -------------------------------------------------------------------------- */
/*                                  endpoints                                  */
/* -------------------------------------------------------------------------- */

const ALL = "ALL" as const;

/** Reads whose answer is the same list under any grouping share the finding tags. */
const findingListTags = (rows: { id: GovUuid }[] | undefined) => [
  { type: "IgaGovFinding" as const, id: ALL },
  ...(rows ?? []).map((r) => ({ type: "IgaGovFinding" as const, id: r.id })),
];

export const igaPolicyReadsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /* ------------------------------ readiness ------------------------------ */
    getGovReadiness: builder.query<PolicyEnvelope<GovReadiness, GovReadinessMeta>, GovReadinessArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/readiness${policyQuery(args)}` }),
      providesTags: [
        { type: "IgaGovReadiness", id: ALL },
        // Readiness is computed from findings, owners and enforcement settings.
        { type: "IgaGovFinding", id: ALL },
      ],
    }),

    /* ------------------------------- findings ------------------------------ */
    listGovFindings: builder.query<PolicyEnvelope<GovFinding[], GovRevMeta>, GovFindingsArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/findings${policyQuery(args)}` }),
      providesTags: (res) => findingListTags(res?.data),
    }),
    /** `group=role`: one entry per role; the page is of roles, so a role is never split across pages. */
    listGovFindingsByRole: builder.query<PolicyEnvelope<GovRoleGroup[], GovRevMeta>, GovFindingsArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/findings${policyQuery({ ...args, group: "role" })}` }),
      providesTags: (res) => findingListTags(res?.data.flatMap((g) => g.findings)),
    }),
    getGovFindingsSummary: builder.query<PolicyEnvelope<GovFindingSummary, GovRevMeta>, GovFindingsSummaryArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/findings/summary${policyQuery(args)}` }),
      providesTags: [{ type: "IgaGovFinding", id: ALL }],
    }),
    getGovFinding: builder.query<PolicyEnvelope<GovFindingDetail, GovRevMeta>, GovFindingArgs>({
      query: ({ id, ...rest }) => ({ url: `${POLICY_BASE}/findings/${enc(id)}${policyQuery(rest)}` }),
      providesTags: (_res, _err, a) => [
        { type: "IgaGovFinding", id: a.id },
        { type: "IgaGovOwner", id: ALL },
      ],
    }),
    listGovActivityEvidence: builder.query<PolicyEnvelope<GovActivityEvidence[], GovRevMeta>, GovActivityEvidenceArgs>({
      query: ({ identityId, ...rest }) => ({
        url: `${POLICY_BASE}/identities/${enc(identityId)}/activity-evidence${policyQuery(rest)}`,
      }),
      providesTags: [{ type: "IgaGovFinding", id: ALL }],
    }),

    /* --------------------------- target resolution -------------------------- */
    // A read with a body (writes no event, no audit row): see the file header.
    resolveGovTargets: builder.query<GovResolvedTarget[], GovResolveTargetsArgs>({
      query: ({ keys }) => ({ url: `${POLICY_BASE}/targets/resolve`, method: "POST", body: { keys } }),
      providesTags: [
        { type: "IgaGovOwner", id: ALL },
        { type: "IgaGovPolicy", id: ALL },
        { type: "IgaGovFinding", id: ALL },
      ],
      transformResponse: (r: PolicyEnvelope<GovResolvedTarget[], Record<string, never>>) => r.data,
    }),

    /* ---------------------------- evidence bundles --------------------------- */
    getGovEvidenceBundle: builder.query<GovEvidenceBundle, GovEvidenceBundleArgs>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/evidence-bundles/${enc(id)}` }),
      // Insert-once and hash-verified: an id never changes its content.
      providesTags: (_res, _err, a) => [{ type: "IgaGovFinding", id: `BUNDLE:${a.id}` }],
      transformResponse: (r: PolicyEnvelope<GovEvidenceBundle, Record<string, never>>) => r.data,
    }),

    /* -------------------------------- owners -------------------------------- */
    getGovOwners: builder.query<GovObjectOwnership, GovOwnersArgs>({
      query: ({ object_kind, object_id }) => ({ url: `${POLICY_BASE}/owners${policyQuery({ object_kind, object_id })}` }),
      providesTags: (_res, _err, a) => [
        { type: "IgaGovOwner", id: ALL },
        { type: "IgaGovOwner", id: a.object_id },
      ],
      transformResponse: (r: PolicyEnvelope<GovObjectOwnership, Record<string, never>>) => r.data,
    }),
    /** Replaces the object's manual owners (see `GovPutOwnersBody`). Answers the object's owners after the change. */
    putGovOwners: builder.mutation<GovObjectOwnership, GovPutOwnersBody>({
      query: (body) => ({ url: `${POLICY_BASE}/owners`, method: "PUT", body }),
      invalidatesTags: [
        { type: "IgaGovOwner", id: ALL },
        { type: "IgaGovReadiness", id: ALL },
        { type: "IgaGovFinding", id: ALL },
        { type: "IgaGovEvent", id: ALL },
      ],
      transformResponse: (r: PolicyEnvelope<GovObjectOwnership, Record<string, never>>) => r.data,
    }),
    /** Sets or clears (null) one owner row's review date, manual or tag-rule alike. Answers the owner after the change. */
    patchGovOwner: builder.mutation<GovOwnerView, GovPatchOwnerArgs>({
      query: ({ id, review_due_at }) => ({
        url: `${POLICY_BASE}/owners/${enc(id)}`,
        method: "PATCH",
        body: { review_due_at },
      }),
      invalidatesTags: [
        { type: "IgaGovOwner", id: ALL },
        { type: "IgaGovReadiness", id: ALL },
        { type: "IgaGovFinding", id: ALL },
        { type: "IgaGovEvent", id: ALL },
      ],
      transformResponse: (r: PolicyEnvelope<GovOwnerView, Record<string, never>>) => r.data,
    }),
    listGovOwnerRules: builder.query<PolicyEnvelope<GovOwnerRule[], GovOwnerRulesMeta>, GovOwnerRulesArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/owner-rules${policyQuery(args)}` }),
      providesTags: [{ type: "IgaGovOwner", id: "RULES" }],
    }),
    /** Creates a rule (201). It is applied by a background job, so owners appear shortly after, not in this response. */
    createGovOwnerRule: builder.mutation<GovOwnerRule, GovCreateOwnerRuleBody>({
      query: (body) => ({ url: `${POLICY_BASE}/owner-rules`, method: "POST", body }),
      invalidatesTags: [
        { type: "IgaGovOwner", id: "RULES" },
        { type: "IgaGovOwner", id: ALL },
        { type: "IgaGovReadiness", id: ALL },
        { type: "IgaGovFinding", id: ALL },
        { type: "IgaGovEvent", id: ALL },
      ],
      transformResponse: (r: PolicyEnvelope<GovOwnerRule, Record<string, never>>) => r.data,
    }),
    /** Deletes a rule and every owner it assigned (`owners_removed`). */
    deleteGovOwnerRule: builder.mutation<GovOwnerRuleDeleted, { id: GovUuid }>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/owner-rules/${enc(id)}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "IgaGovOwner", id: "RULES" },
        { type: "IgaGovOwner", id: ALL },
        { type: "IgaGovReadiness", id: ALL },
        { type: "IgaGovFinding", id: ALL },
        { type: "IgaGovEvent", id: ALL },
      ],
      transformResponse: (r: PolicyEnvelope<GovOwnerRuleDeleted, Record<string, never>>) => r.data,
    }),

    /* -------------------------------- settings ------------------------------- */
    getGovSettings: builder.query<GovSettings, GovSettingsArgs>({
      query: () => ({ url: `${POLICY_BASE}/settings` }),
      providesTags: [{ type: "IgaGovSettings", id: ALL }],
      transformResponse: (r: PolicyEnvelope<GovSettings, Record<string, never>>) => r.data,
    }),
    /** Partial update (see `GovSettingsPatch`: enforce needs a `reason`). Answers the settings after the change. */
    putGovSettings: builder.mutation<GovSettings, GovSettingsPatch>({
      query: (body) => ({ url: `${POLICY_BASE}/settings`, method: "PUT", body }),
      invalidatesTags: [
        { type: "IgaGovSettings", id: ALL },
        // The mode decides whether roles are `iac_only`.
        { type: "IgaGovReadiness", id: ALL },
        { type: "IgaGovEvent", id: ALL },
      ],
      transformResponse: (r: PolicyEnvelope<GovSettings, Record<string, never>>) => r.data,
    }),

    /* -------------------------------- events -------------------------------- */
    listGovEvents: builder.query<PolicyEnvelope<GovEventView[], GovEventsMeta>, GovEventsArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/events${policyQuery(args)}` }),
      providesTags: [{ type: "IgaGovEvent", id: ALL }],
    }),
    getGovEventKinds: builder.query<GovEventKinds, WsArg>({
      query: () => ({ url: `${POLICY_BASE}/events/kinds` }),
      // The vocabulary is compiled into the server: no mutation changes it.
      providesTags: [{ type: "IgaGovEvent", id: "KINDS" }],
      transformResponse: (r: PolicyEnvelope<GovEventKinds, Record<string, never>>) => r.data,
    }),

    /* -------------------------------- metrics -------------------------------- */
    getGovMetrics: builder.query<PolicyEnvelope<GovMetricsRow[], GovMetricsMeta>, GovMetricsArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/metrics${policyQuery(args)}` }),
      providesTags: [{ type: "IgaGovMetrics", id: ALL }],
    }),
  }),
});

export const {
  useGetGovReadinessQuery,
  useListGovFindingsQuery,
  useListGovFindingsByRoleQuery,
  useGetGovFindingsSummaryQuery,
  useGetGovFindingQuery,
  useListGovActivityEvidenceQuery,
  useResolveGovTargetsQuery,
  useLazyResolveGovTargetsQuery,
  useGetGovEvidenceBundleQuery,
  useGetGovOwnersQuery,
  usePutGovOwnersMutation,
  usePatchGovOwnerMutation,
  useListGovOwnerRulesQuery,
  useCreateGovOwnerRuleMutation,
  useDeleteGovOwnerRuleMutation,
  useGetGovSettingsQuery,
  usePutGovSettingsMutation,
  useListGovEventsQuery,
  useGetGovEventKindsQuery,
  useGetGovMetricsQuery,
} = igaPolicyReadsApi;

/* -------------------------------------------------------------------------- */
/*                               events export                                 */
/* -------------------------------------------------------------------------- */

/**
 * The path and query of GET /events/export (relative to the API origin; no
 * `ws`, cursor or limit: the export is every matching event, oldest first).
 * `format` is `csv` or `json` (NDJSON, one event per line).
 *
 * THIS IS NOT A LINK. The route authenticates only with the `Authorization:
 * Bearer` header (middlewares/auth.go:296 `extractBearerToken`: no cookie, no
 * `?token=`), which a plain `<a href>` or `window.open` cannot send, so a link
 * would answer 401. The console must fetch it with the header and save the
 * response: use `downloadGovEventsExport`. Nothing may put a token in the URL.
 *
 * The server streams (`Content-Disposition: attachment`, `Cache-Control:
 * no-store`) in batches of 500 and sends status 200 before the first row. A
 * validation error (bad filter or format) is a normal 4xx `{error}` envelope
 * sent BEFORE any row; a failure mid-stream cannot change the status, so the
 * file simply ends short and the server only logs it
 * (iga_gov_events_controller.go:84-87). The client has no row count to check:
 * do not present an export as proof of completeness.
 */
export function govEventsExportUrl(filter: GovEventsFilter, format: GovEventExportFormat): string {
  const { kind, category, object_kind, object_id, actor, actor_kind, from, to } = filter;
  return `${POLICY_BASE}/events/export${policyQuery({ kind, category, object_kind, object_id, actor, actor_kind, from, to, format })}`;
}

/**
 * A failed export. It carries `status` and `data` (the parsed `{error}`
 * envelope, when there is one), the same two fields `classifyPolicyError`
 * reads from an RTK `FetchBaseQueryError`, so the screen can pass it straight
 * to `classifyPolicyError`.
 */
export class GovEventsExportError extends Error {
  readonly status: number | "FETCH_ERROR";
  readonly data: PolicyErrorBody | undefined;
  constructor(status: number | "FETCH_ERROR", data: PolicyErrorBody | undefined, message: string) {
    super(message);
    this.name = "GovEventsExportError";
    this.status = status;
    this.data = data;
  }
}

function sessionToken(): string | undefined {
  try {
    const raw = localStorage.getItem("authsec_session_v2");
    const token = raw ? (JSON.parse(raw) as { token?: unknown }).token : undefined;
    return typeof token === "string" && token ? token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Downloads the filtered events as a file: fetches `govEventsExportUrl` with the
 * session's bearer token (the one `baseApi` sends), then saves the response
 * through a temporary object URL. Resolves with the file name the server chose
 * (`authsec-policy-events-<UTC time>.csv|ndjson`); rejects with
 * `GovEventsExportError`. The whole export is held in memory before it is
 * saved, which is acceptable for an audit export but not for unbounded ranges:
 * narrow with `from` / `to`.
 */
export async function downloadGovEventsExport(filter: GovEventsFilter, format: GovEventExportFormat): Promise<string> {
  const headers: Record<string, string> = {};
  const token = sessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${config.VITE_API_URL || "http://localhost:7468"}${govEventsExportUrl(filter, format)}`, {
      headers,
      credentials: "include",
    });
  } catch (e) {
    throw new GovEventsExportError("FETCH_ERROR", undefined, e instanceof Error ? e.message : "The export request failed.");
  }
  if (!res.ok) {
    let body: PolicyErrorBody | undefined;
    try {
      const parsed = (await res.json()) as Partial<PolicyErrorBody>;
      if (parsed && typeof parsed.error === "object") body = parsed as PolicyErrorBody;
    } catch {
      // Not an envelope (a router 404): classified by status alone.
    }
    throw new GovEventsExportError(res.status, body, body?.error.message ?? `The export failed (${res.status}).`);
  }
  const named = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
  const filename = named ?? `authsec-policy-events.${format === "csv" ? "csv" : "ndjson"}`;
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoked on the next tick so the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return filename;
}
