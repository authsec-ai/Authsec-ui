/**
 * The AWS identity graph read API — SPEC-iga-phase2-graph.md §5.
 *
 * Every read runs server-side in one snapshot of one published revision
 * (§5.1). The console pins the revision it first receives and sends it on
 * every later request of the same investigation; the server answers a stale
 * one with `409 revision_stale`, and the console keeps what it shows and
 * offers Refresh (§2.14.5). Nothing from two revisions is ever combined.
 *
 * CACHE ISOLATION. Every query takes `ws` (the workspace id) and `key`, which
 * the server never sees. They are there only so RTK Query keys the cache per
 * workspace — the backend takes the workspace from the token, so two
 * workspaces' requests to one URL would otherwise share a cache entry — and
 * per Refresh (`key` carries the revision epoch, and for a list the restart
 * count), so a refreshed read is never answered from a pre-refresh entry
 * (§2.14.14). `rev` is part of the key for the same reason.
 *
 * OPT-IN. `graph` and `provider` are also part of that cache key. They are
 * omitted from the request unless the caller sets them, so a default read
 * sends the same URL it did before TRD 2. A v2 read (`graph: "v2"`) never
 * reuses a default entry, and two provider filters do not share one.
 *
 * TYPED REFERENCES. Objects and claims are `"<type>:<uuid>"` strings. A bare
 * uuid never identifies an object on its own (§5.2).
 */

import { baseApi } from "./baseApi";

/* ------------------------------ references ------------------------------ */

export type GraphObjectType =
  | "workload"
  | "identity"
  | "external_principal"
  | "resource"
  | "policy"
  | "statement";

export type GraphClaimType =
  | "relationship"
  | "assignment"
  | "grant"
  | "target"
  | "presence"
  | "coverage"
  | "cloud_scan_run"
  | "cloud_connector"
  | "cloud_observation"
  | "observed_access"
  | "runtime_instance"
  | "runtime_binding";

/** `"workload:6f1e…"` — the type is always part of the reference. */
export type GraphRef = `${GraphObjectType | GraphClaimType}:${string}`;

export function refType(ref: GraphRef): GraphObjectType | GraphClaimType {
  return ref.slice(0, ref.indexOf(":")) as GraphObjectType | GraphClaimType;
}

/** The uuid part of a typed reference, for building a type-specific route. */
export function refId(ref: GraphRef): string {
  const i = ref.indexOf(":");
  return i < 0 ? ref : ref.slice(i + 1);
}

/** The console route of an object reference, or null for a claim. */
export function objectPath(ref: GraphRef): string | null {
  const id = encodeURIComponent(refId(ref));
  switch (refType(ref)) {
    case "workload":
      return `/iga/estate/${id}`;
    case "identity":
      return `/iga/identities/${id}`;
    case "resource":
      return `/iga/resources/${id}`;
    case "external_principal":
      return `/iga/external-principals/${id}`;
    default:
      return null;
  }
}

/* -------------------------------- envelopes ------------------------------- */

/** `null` = the object's ARN states no account (every S3 ARN, §2.14.10). */
export interface GraphAccount {
  id: string;
  label: string;
  connected: boolean;
}

export type GraphState = "published" | "not_published";

/** A coverage gap bearing on a result (`meta.coverage`); `surface` is `*` for a revoked account. */
export interface GraphCoverageGap {
  account_id: string;
  surface: string;
  state: SurfaceState;
  affects: string;
}

export interface GraphFacetValue {
  value: string;
  label: string;
  count: number;
}

export interface GraphListMeta {
  rev: number | null;
  published_at: string | null;
  graph_state: GraphState;
  next_cursor: string | null;
  limit: number;
  total_known: boolean;
  total?: number;
  total_at_least?: number;
  /** A facet whose count timed out is null: not counted, never guessed (§5.1). */
  facets?: Record<string, GraphFacetValue[] | null>;
  coverage: GraphCoverageGap[];
  /** Present only when the read opted in with `graph=v2`. */
  graph_revision?: number;
}

export interface GraphDetailMeta {
  rev: number | null;
  published_at: string | null;
  graph_state: GraphState;
  /** `{}` everywhere except workload detail, which always states `can_classify`. */
  capabilities: { can_classify?: boolean };
  coverage?: GraphCoverageGap[];
  /** Present only when the read opted in with `graph=v2`. */
  graph_revision?: number;
}

export interface GraphList<T> {
  data: T[];
  meta: GraphListMeta;
}

export interface GraphDetail<T> {
  data: T;
  meta: GraphDetailMeta;
}

/** The error body every graph route uses (§5.2). */
export interface GraphErrorBody {
  error: {
    code: string;
    message: string;
    parameter?: string;
    requested_rev?: number;
    current_rev?: number | null;
    current_published_at?: string | null;
    reason?: string | null;
    graph_projection?: "off" | "misconfigured";
    current?: ClassificationConflict;
  };
}

/* ---------------------------- shared vocabulary --------------------------- */

/** Every state a surface can be in; `revoked` only on a revoked account's `*` gap. */
export type SurfaceState =
  | "reached"
  | "partial"
  | "denied"
  | "throttled"
  | "not_selected"
  | "unsupported"
  | "not_configured"
  | "unknown"
  | "stale"
  | "constrained"
  | "revoked";

export type RelState = "current" | "stale" | "ended";
export type Lifecycle = "active" | "retired";
export type LifecycleFilter = "active" | "retired" | "all";
export type Basis = "declared" | "observed" | "derived" | "asserted";
export type Continuity = "immutable" | "recognition_only";

export type RuntimeKind =
  | "lambda_function"
  | "ecs_task_definition"
  | "ec2_instance"
  | "bedrock_agent"
  | "bedrock_agentcore_runtime"
  | "bedrock_agentcore_gateway";

export type Classification = "unclassified" | "provider_native_agent" | "classified_agent";

export type ExecutionRoleState = "resolved" | "not_in_scan" | "not_in_inventory" | "none";

export type IdentityKind = "iam_role" | "iam_user" | "iam_group";

/** S21.2c. The AWS kinds stay `IdentityKind`. The rest arrive only under graph=v2. */
export type AccountKind =
  | IdentityKind
  | "local_user"
  | "local_group"
  | "k8s_service_account"
  | "k8s_group"
  | "ad_user"
  | "ad_group"
  | "ad_computer"
  | "ad_managed_service_account";

/** enabled, disabled or unknown. Not lifecycle. The reader may omit it until it is projected. */
export type AccountState = "enabled" | "disabled" | "unknown";

export type GraphProvider = "aws" | "linux" | "kubernetes" | "ad";

/** referenced, observed or inventoried. Set on resources only for graph=v2. */
export type ReferenceStatus = "referenced" | "observed" | "inventoried";

/** §2.14.12. "Discovered resource" is not produced this phase. */
export type ResourceKind = "exact" | "selector" | "external";

export type PolicyKind = "aws_managed" | "customer_managed" | "inline";

/** `value` is null when the count timed out: unknown, never zero (§5.1). Row counts cap at 1000. */
export interface ExactCount {
  value: number | null;
  exact: boolean;
}

/** Why a row is stale: the surface whose read did not reconfirm it. Present only on stale rows. */
export interface StaleReason {
  account_id: string;
  surface: string;
  state: string;
  since: string | null;
}

/** A connector's support for an object (`sources[]` on detail routes). */
export interface GraphSource {
  presence: GraphRef;
  integration: string;
  account: GraphAccount | null;
  state: RelState;
  first_seen_at: string | null;
  last_confirmed_at: string | null;
  ended_reason: string | null;
}

/** The claim fields every relationship row carries. */
export interface ClaimFields {
  claim: GraphRef;
  basis: Basis;
  state: RelState;
  stale_reason?: StaleReason[];
  valid_from: string | null;
  valid_to?: string;
  ended_reason?: string;
  last_confirmed_at: string | null;
}

/** One section of a tab, paged on its own (workload identities, used-by). */
export interface PagedSection<T> {
  items: T[];
  next_cursor: string | null;
  total_known: boolean;
  total?: number;
  total_at_least?: number;
  /** principals only: `not_principal_unresolved` when the trust uses NotPrincipal. */
  limitations?: string[];
}

/* ------------------------------ summaries ------------------------------ */

export interface WorkloadSummary {
  ref: GraphRef;
  name: string;
  /** AWS runtimes are `RuntimeKind`. Linux and Kubernetes send their own (`systemd`, `deployment`, …). */
  runtime_kind: string;
  arn: string;
  account: GraphAccount | null;
  region: string | null;
}

/**
 * An identity as another object's page names it. For an external principal,
 * `kind` is its mechanism (`aws_account`, `aws_service`, `oidc`, …) and `arn`
 * is null.
 */
export interface IdentitySummary {
  ref: GraphRef;
  name: string;
  kind: string;
  arn: string | null;
  account: GraphAccount | null;
}

export interface ResourceSummary {
  ref: GraphRef;
  text: string;
  kind: ResourceKind;
  /** Distinguishes an object selector from a bucket (§2.14.12): `s3_object`, `s3_bucket`, … `unknown`. */
  type: string;
  service: string | null;
  account: GraphAccount | null;
  region: string | null;
}

export interface PolicySummary {
  ref: GraphRef;
  name: string;
  kind: PolicyKind;
}

export interface StatementSummary {
  ref: GraphRef;
  /** Empty when the statement has no Sid; it is then named by its index. */
  sid: string;
  index: number | null;
  actions: string[];
  not_actions: string[];
  conditional: boolean;
}

/** A `NotResource` entry: a resource the statement excludes, never a destination (§5.4). */
export interface Exclusion {
  ref: GraphRef;
  text: string;
}

export interface TrustStatement {
  key: string;
  sid: string;
  negated: boolean;
}

/* -------------------------------- workloads ------------------------------- */

export type ExecutionRole =
  | { state: "resolved"; identity: GraphRef | null; name: string | null }
  | { state: "not_in_scan" | "not_in_inventory"; execution_role_arn: string }
  | { state: "none" };

export interface WorkloadRow {
  ref: GraphRef;
  name: string;
  runtime_kind: string;
  arn: string;
  account: GraphAccount | null;
  region: string | null;
  classification: Classification;
  classification_version: number;
  execution_role: ExecutionRole;
  lifecycle: Lifecycle;
  retired_reason?: string | null;
  state: RelState;
  stale_reason?: StaleReason[];
  first_seen_at: string | null;
  last_confirmed_at: string | null;
  instances: { state: "not_collected" };
}

/** The latest decision on a workload (`decision` on its detail). */
export interface LatestDecision {
  id: string;
  operation_id: string;
  decision: "classified_agent" | "unclassified";
  purpose: string | null;
  reason: string;
  decided_by: { user_id: string; display: string };
  decided_at: string | null;
}

/** One entry of a workload's decision history, newest first. */
export interface ClassificationDecision extends LatestDecision {
  previous: Classification;
  against_version: number;
  result_version: number;
  undoes_decision_id: string | null;
}

export interface GatewayTarget {
  id: string;
  name: string;
  status: string;
  type: string;
}

export interface WorkloadDetail extends WorkloadRow {
  retired_reason: string | null;
  continuity: Continuity;
  provider_attrs: {
    status: string | null;
    foundation_model: string | null;
    /** null = not collected; [] = collected, none. */
    env_var_names: string[] | null;
    gateway_targets: GatewayTarget[] | null;
  };
  sources: GraphSource[];
  decision: LatestDecision | null;
}

export type WorkloadSort = "name" | "-name" | "account" | "last_confirmed" | "classification";

export type ClassificationFilter =
  | "agent"
  | "provider_native_agent"
  | "classified_agent"
  | "unclassified";

/** A relationship between a workload (or its execution identity) and an identity. */
export interface IdentityRelationship extends ClaimFields {
  type: "executes_as" | "task_execution_role" | "member_of";
  identity: IdentitySummary;
  /** groups only: the execution identity that is the member. */
  via_identity?: GraphRef;
  used_by_count?: ExactCount;
}

export interface AssumeRelationship extends ClaimFields {
  type: "can_assume";
  /** The execution identity the trust policy names. */
  via_identity: GraphRef;
  target: IdentitySummary;
  mechanism: string;
  statement: TrustStatement;
  conditions: Record<string, unknown> | null;
}

export type WorkloadIdentitySection = "execution" | "other" | "groups" | "may_assume";

/**
 * One request returns the first page of every section, each with its own
 * cursor; `?section=<name>&cursor=` continues one section and returns only it.
 */
export interface WorkloadIdentities {
  ref: GraphRef;
  execution?: PagedSection<IdentityRelationship>;
  execution_role_state?: ExecutionRoleState;
  execution_role_arn?: string | null;
  other?: PagedSection<IdentityRelationship>;
  groups?: PagedSection<IdentityRelationship>;
  may_assume?: PagedSection<AssumeRelationship>;
}

/** One grant line under a resource (§5.3 *Workload › Resources*). */
export interface GrantLine {
  claim: GraphRef;
  via_identity: GraphRef;
  via_group?: GraphRef;
  policy: PolicySummary;
  statement: StatementSummary;
  target_mode: "resource";
  exclusions: Exclusion[];
  state: RelState;
  stale_reason?: StaleReason[];
  valid_from: string | null;
  valid_to?: string;
  ended_reason?: string;
  last_confirmed_at: string | null;
}

export interface Restrictions {
  deny_statements: number;
  permissions_boundary: boolean;
}

export interface WorkloadResourceRow {
  resource: ResourceSummary;
  grants: GrantLine[];
  restrictions: Restrictions;
}

/* ------------------------------- identities ------------------------------ */

export interface IdentityRow {
  ref: GraphRef;
  name: string;
  kind: AccountKind;
  /** Present when the reader projects it. Absent is unknown, never assumed enabled. */
  account_state?: AccountState;
  arn: string;
  account: GraphAccount | null;
  region: "global";
  used_by_count: ExactCount;
  lifecycle: Lifecycle;
  retired_reason?: string | null;
  state: RelState;
  stale_reason?: StaleReason[];
  last_confirmed_at: string | null;
}

export interface IdentityCredential {
  key_id: string;
  /** AWS's own casing; null for lifecycles AWS has no status for. */
  status: "Active" | "Inactive" | null;
  lifecycle: string;
  created_at: string | null;
  last_used_at: string | null;
  last_seen_at: string | null;
}

export interface IdentityDetail extends IdentityRow {
  retired_reason: string | null;
  first_seen_at: string | null;
  continuity: Continuity;
  immutable_key: string;
  provider_attrs: {
    path: string | null;
    tags: Record<string, unknown>;
    permissions_boundary_arn: string | null;
    trust_has_deny: boolean | null;
    trust_has_not_principal: boolean | null;
  };
  credentials?: IdentityCredential[];
  sources: GraphSource[];
}

export type IdentitySort = "name" | "-name" | "kind" | "account" | "last_confirmed";

/** Sections by identity kind: roles → workloads, principals; groups → members; users → none. */
export type UsedBySection = "workloads" | "principals" | "members";

export interface UsedByWorkload extends ClaimFields {
  type: "executes_as" | "task_execution_role";
  workload: WorkloadSummary;
}

export interface UsedByPrincipal extends ClaimFields {
  type: "can_assume";
  principal: IdentitySummary;
  mechanism: string;
  conditions: Record<string, unknown> | null;
  statement: TrustStatement;
}

export interface GroupMember extends ClaimFields {
  type: "member_of";
  member: IdentitySummary;
}

export interface IdentityHeader {
  ref: GraphRef;
  name: string;
  kind: AccountKind;
  lifecycle: Lifecycle;
  retired_reason?: string;
  state: RelState;
}

export interface IdentityUsedBy {
  identity: IdentityHeader;
  workloads?: PagedSection<UsedByWorkload>;
  principals?: PagedSection<UsedByPrincipal>;
  members?: PagedSection<GroupMember>;
}

export interface StatementTarget {
  ref: GraphRef;
  claim: GraphRef;
  text: string;
  kind: ResourceKind;
  /** `not_resource` is an exclusion, never a destination (§5.4). */
  mode: "resource" | "not_resource";
}

export interface StatementDetail {
  ref: GraphRef;
  sid: string;
  index: number | null;
  effect: "allow" | "deny";
  actions: string[];
  not_actions: string[];
  targets: StatementTarget[];
  condition: Record<string, unknown> | null;
  /** The grant claim, for Allow statements through a granting assignment only. */
  grant: GraphRef | null;
  grant_state: RelState | null;
  grant_stale_reason?: StaleReason[];
  /** null when the optional count timed out. */
  revision_count: number | null;
  state: RelState;
  stale_reason?: StaleReason[];
}

export interface PolicyGroup {
  ref: GraphRef;
  name: string;
  kind: PolicyKind;
  assignment: {
    claim: GraphRef;
    kind: "attached" | "inline" | "boundary";
    via_group: GraphRef | null;
    state: RelState;
    stale_reason?: StaleReason[];
    valid_from: string | null;
    valid_to?: string;
    ended_reason?: string;
  };
  statements: StatementDetail[];
}

export interface IdentityPermissions {
  identity: IdentityHeader;
  policies: PolicyGroup[];
  boundary: { policy: PolicyGroup | null; others?: PolicyGroup[] };
  inherited: { group: GraphRef; name: string; membership: ClaimFields & { type: string }; policies: PolicyGroup[] }[];
  activity: {
    source: "access_advisor";
    /** `not_collected`: Access Advisor was not read — no claim either way. */
    state: "collected" | "not_collected";
    reason: string | null;
    tracking_note: string;
    /** null when not collected; [] = collected, none reported. */
    services: { namespace: string; last_authenticated_attempt: string | null }[] | null;
  };
  /** The statement cap bound: the policies listed are not the whole set. */
  truncated: boolean;
}

/* ------------------------------ external principals ---------------------- */

export interface ExternalPrincipalDetail {
  ref: GraphRef;
  name: string;
  mechanism: string;
  issuer: string;
  subject: string;
  account: GraphAccount | null;
  account_connected: boolean | null;
  /** Null when nothing resolves it. */
  resolution: {
    state: string;
    basis: string;
    rule: string | null;
    resolved_to: GraphRef | null;
    resolved_by: string | null;
  } | null;
  unresolved_reason: string | null;
  lifecycle: Lifecycle;
  retired_reason: string | null;
  state: RelState;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_confirmed_at: string | null;
}

export interface ReferencedByRow extends ClaimFields {
  type: "can_assume";
  target: IdentitySummary;
  mechanism: string;
  statement: TrustStatement;
  conditions: Record<string, unknown> | null;
}

/* -------------------------------- resources ------------------------------- */

export interface ResourceRow {
  ref: GraphRef;
  text: string;
  kind: ResourceKind;
  /** graph=v2 only. */
  reference_status?: ReferenceStatus;
  /** graph=v2 only. Provider-native kind, not the reference class. */
  native_kind?: string;
  /** Distinguishes an object selector from a bucket (§2.14.12); `unknown` when not an ARN. */
  type: string;
  service: string | null;
  account: GraphAccount | null;
  region: string | null;
  named_by_count: ExactCount;
  excluded_by_count: ExactCount;
  lifecycle: Lifecycle;
  retired_reason?: string | null;
  state: RelState;
  stale_reason?: StaleReason[];
  last_confirmed_at: string | null;
}

export interface ResourceDetail extends ResourceRow {
  retired_reason: string | null;
  existence: "not_verified";
  resource_policy: { read: boolean; has_deny: boolean | null };
  sources: GraphSource[];
}

export type ResourceSort = "kind" | "name" | "service" | "account";

export interface AccessClaim {
  claim: GraphRef;
  state: RelState;
  valid_from: string | null;
}

export interface AccessRow {
  holder: IdentitySummary;
  via_group: { ref: GraphRef; name: string; membership: AccessClaim } | null;
  grant: AccessClaim;
  policy: PolicySummary;
  statement: StatementSummary;
  /** The row's own state: the worse of its grant and its group membership. */
  state: RelState;
}

/** A statement that restricts rather than grants: an exclusion or a Deny. */
export interface RestrictionRow {
  statement: StatementSummary;
  policy: PolicySummary;
  holders: GraphRef[];
  holders_more: boolean;
}

export interface ResourceAccess {
  access: AccessRow[];
  excluded_by: RestrictionRow[];
  excluded_by_more: boolean;
  deny_statements_naming: RestrictionRow[];
  deny_statements_naming_more: boolean;
}

/* ---------------------------------- graph --------------------------------- */

export type GraphNodeKind =
  | "workload"
  | AccountKind
  | "external_principal"
  | "statement"
  | ResourceKind;

export type GraphEdgeKind =
  | "executes_as"
  | "task_execution_role"
  | "member_of"
  | "can_assume"
  | "grant"
  | "target"
  | "observed_access"
  | "backed_by_directory";

export interface GraphNode {
  ref: GraphRef;
  kind: GraphNodeKind;
  label: string;
  /** Absent on statements. */
  account?: GraphAccount | null;
  state: RelState;
  lifecycle?: Lifecycle;
  last_confirmed_at: string | null;
  stale_reason?: StaleReason[];
  arn?: string;
  /** AWS values are `RuntimeKind`. Linux and Kubernetes send free strings (`systemd`, `deployment`). */
  runtime_kind?: string;
  /** graph=v2 resource nodes only. */
  reference_status?: ReferenceStatus;
  native_kind?: string;
  restrictions?: Restrictions;
  used_by_count?: ExactCount;
  mechanism?: string;
  issuer?: string;
  subject?: string;
  resolution?: { state: string; basis: string; rule: string | null; resolved_to: string | null; resolved_by: string | null };
  /** Statement nodes: the declaring policy's display name, and its ref. */
  policy?: string;
  policy_ref?: GraphRef;
  effect?: "allow" | "deny";
  sid?: string;
  index?: number;
  /** Statement nodes: same actions and target set — drawable as one line. */
  group_key?: string;
  exclusions?: Exclusion[];
  text?: string;
  type?: string;
  limitations: EvidenceLimitation[];
}

export interface GraphEdge {
  claim: GraphRef;
  kind: GraphEdgeKind;
  from: GraphRef;
  to: GraphRef;
  state: RelState;
  mode?: "resource";
  basis: Basis;
  mechanism?: string;
  /** Grant edges: the policy's display name. */
  policy?: string;
  closes_cycle: boolean;
  crosses_account: boolean;
  last_confirmed_at: string | null;
  stale_reason?: StaleReason[];
  limitations: EvidenceLimitation[];
  /**
   * graph=v2. Observed edges carry `observed` and an outcome. Directory
   * backing is `declared` plus `meaning: "directory_backing"`. Absent on the
   * default AWS graph, so those lines stay grouped as they are today.
   */
  access_class?: "declared" | "observed";
  outcome?: string;
  meaning?: string;
  /** Stored grant facts. A traversal does not turn these into effective access. */
  calculation_state?: string;
  effective_conclusion?: string;
}

export type GraphDirection = "forward" | "reverse";

export interface GraphFrontier {
  node: GraphRef;
  edge: GraphEdgeKind;
  direction: GraphDirection;
  more: { count: number | null; exact: boolean };
  expand: string;
}

export interface GraphTruncation {
  bound_by: "nodes" | "edges" | "assume_hops" | "time";
}

export interface GraphNeighbourhood {
  root: GraphRef;
  nodes: GraphNode[];
  edges: GraphEdge[];
  frontier: GraphFrontier[];
  truncated: GraphTruncation | null;
  resolution_not_followed: boolean | null;
}

export interface GraphBudgets {
  nodes: number;
  edges: number;
  assume_hops: number;
  paths: number;
  neighbours_per_page: number;
  timeout_ms: number;
}

export interface GraphMeta {
  rev: number | null;
  published_at: string | null;
  graph_state?: GraphState;
  budgets?: GraphBudgets;
  /** Stated once for every element of the response. */
  limitations?: EvidenceLimitation[];
  /** Present only when the read opted in with `graph=v2`. */
  graph_revision?: number;
  /** Evidence reads under graph=v2. */
  provenance?: EvidenceProvenance;
}

export interface GraphExpansion {
  nodes: GraphNode[];
  edges: GraphEdge[];
  frontier: GraphFrontier[];
  next_cursor: string | null;
  truncated: GraphTruncation | null;
}

/** One declared path, as refs into `GraphPathResult.nodes` / `.edges`. */
export interface GraphPath {
  nodes: GraphRef[];
  edges: GraphRef[];
  limitations: EvidenceLimitation[];
}

/**
 * `/graph/path`, as the console holds it. The server returns full node and
 * edge objects inside each path; the API slice collects them once into
 * `nodes` / `edges` and leaves each path as refs, so a node on several paths
 * is one node (see `transformPathResponse`).
 */
export interface GraphPathResult {
  from: GraphRef;
  to: GraphRef;
  outcome: "found" | "none_exists" | "not_found_within_budget";
  direction: GraphDirection | null;
  bound_by: "nodes" | "edges" | "assume_hops" | "time" | "paths" | "resolution_not_followed" | null;
  paths: GraphPath[];
  more_paths: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/* -------------------------------- evidence -------------------------------- */

export type LimitationCode =
  | "effective_access_not_evaluated"
  | "conditions_not_evaluated"
  | "negated_statement"
  | "deny_statements_present"
  | "permissions_boundary_present"
  | "organizations_not_collected"
  | "resource_policy_not_projected"
  | "resource_existence_not_verified"
  | "selector_may_match_nothing"
  | "account_not_connected"
  | "caller_permission_not_evaluated"
  | "not_principal_unresolved"
  | "surface_stale"
  | "surface_partial"
  | "surface_denied"
  | "activity_attempts_not_outcomes";

/** `{code, ...that code's own fields}` (§5.3 *Evidence*). */
export interface EvidenceLimitation {
  code: LimitationCode;
  keys?: string[];
  negations?: ("NotAction" | "NotResource")[];
  count?: number;
  statements?: GraphRef[];
  truncated?: boolean;
  holder?: boolean;
  policies?: GraphRef[];
  members?: GraphRef[];
  member_count?: number;
  resources?: GraphRef[];
  accounts?: string[];
  account_id?: string;
  surface?: string;
  state?: string;
  since?: string | null;
}

export interface EvidenceFact {
  fact: string;
  source_api: string | null;
  account_id: string | null;
  region: string | null;
  observed_in_run: string | null;
  last_confirmed_at: string | null;
  policy_version?: string;
  statement_excerpt?: unknown;
  policy?: { ref: GraphRef; name: string; kind: string };
  statement?: { ref: GraphRef; sid: string; index: number | null };
}

export interface Evidence {
  claim: { ref: GraphRef; sentence: string };
  status: {
    /** null for coverage claims. */
    basis: Basis | null;
    lifecycle: RelState;
    collection: "complete" | "partial" | "stale";
    effective_access: "not_evaluated";
  };
  facts: EvidenceFact[];
  freshness: {
    first_seen_at: string | null;
    last_confirmed_at: string | null;
    stale_since: string | null;
    valid_to: string | null;
    ended_reason: string | null;
  };
  limitations: EvidenceLimitation[];
  /** Aligned 1:1 with `facts` when `include=raw`, else null. */
  raw: { observation: string | null; source_api: string | null; sanitized_facts: unknown }[] | null;
}

/* --------------------------------- changes -------------------------------- */

export type ChangeKind =
  | "first_seen"
  | "retired"
  | "restored"
  | "relationship_started"
  | "relationship_ended"
  | "policy_attached"
  | "policy_detached"
  | "grant_started"
  | "grant_ended"
  | "statement_revised"
  | "statement_replaced"
  | "coverage_changed";

export type ChangeFeed = "configuration" | "coverage";

/** Every ref in `detail` is a typed-ref string; its name is in `labels`. */
export interface ChangeDetail {
  object?: string;
  type?: string;
  source?: string;
  target?: string | null;
  mechanism?: string;
  state?: RelState;
  policy?: string;
  holder?: string;
  assignment_kind?: "attached" | "inline" | "boundary";
  statement?: string;
  assignment?: string;
  actions?: string[];
  not_actions?: string[];
  targets?: string[];
  integration?: string;
  account_id?: string;
  surface?: string;
}

export interface ChangeRemaining {
  grant: GraphRef;
  state: "current" | "stale";
  last_confirmed_at: string | null;
  policy: GraphRef;
  statement: GraphRef;
  targets: GraphRef[];
}

export interface ChangeEvent {
  /** `<event>:<uuid>` — an id, not a typed ref. */
  id: string;
  event: ChangeKind;
  /** Microsecond precision. */
  at: string;
  rev: number | null;
  run: string | null;
  subject: string;
  claims: GraphRef[];
  reason: string | null;
  via?: GraphRef;
  detail: ChangeDetail;
  before?: unknown;
  after?: unknown;
  /** grant_ended, policy_detached: the grants that still declare the same path. */
  remaining?: ChangeRemaining[];
  paths?: { target: GraphRef; remains: "current" | "stale" | "none" }[];
  /** The display name of every ref the event names. */
  labels: Record<string, string>;
}

export interface ChangesMeta extends GraphListMeta {
  kind: ChangeFeed;
  /** Where the object's history begins; earlier changes predate collection. */
  history_begins: string | null;
}

/* -------------------------------- coverage -------------------------------- */

/** One surface of one account, from the runs the current revision was built from. */
export interface CoverageSurface {
  surface: string;
  state: SurfaceState;
  /** Only when reached: a count from a surface that was not is a floor, not a total. */
  count: number | null;
  error_code: string | null;
  api: string | null;
  /** The provider's own words. */
  error: string | null;
  /** policy_documents: the documents that could not be read. */
  items: { policy: string; version: string; error: string }[] | null;
  truncated: boolean;
  since: string | null;
  since_run: string | null;
  prevents: string | null;
  /** The one fix the evidence supports. */
  fix: "change_regions" | null;
  run: string;
  ref: GraphRef;
}

/** `GET /coverage`: per account, what the runs the current revision was built from could read. */
export interface CoverageAccount {
  integration: string;
  account: GraphAccount | null;
  connector_status: "active" | "error" | "revoked";
  /** Empty for a collector integration row. AWS rows still carry the stack fields. */
  template: { deployed?: string | null; current?: string; outdated?: boolean | null };
  /** Empty when the revision holds nothing of this account yet — never "no gaps". */
  runs: string[];
  surfaces: CoverageSurface[];
  /**
   * Collector instance id, when the server sends one. Coverage rows at
   * authsec 6a7becc do not; the card is skipped until it is present.
   */
  collector_id?: string;
}

/* ------------------------------ classification ---------------------------- */

export interface ClassifyRequest {
  operation_id: string;
  decision: "classified_agent" | "unclassified";
  purpose: string;
  reason: string;
  expected_version: number;
  undoes_decision_id: string | null;
}

export interface ClassifyResult {
  classification: Classification;
  classification_version: number;
  /** The recorded decision; its outcome is `classification`, not repeated here (§5.5). */
  decision: Omit<LatestDecision, "decision">;
  replayed: boolean;
}

/** The decision that won; its fields are null when no decision exists. */
export interface ClassificationConflict {
  classification: Classification;
  classification_version: number;
  decided_by: { user_id: string; display: string } | null;
  decided_at: string | null;
  reason: string | null;
}

/* ------------------------------ pipeline, caps ---------------------------- */

/** The account's state, decided by the server (§2.14.7) — rendered, never re-derived. */
export type PipelineState =
  | "never_scanned"
  | "queued"
  | "collecting"
  | "projecting"
  | "first_publication_pending"
  | "published"
  | "failed"
  | "revoked"
  | "collector";

export interface PipelineAccount {
  integration: string;
  account_id: string;
  label: string;
  connector_status: "active" | "error" | "revoked";
  state: PipelineState;
  latest_run: {
    ref: string;
    /** Omitted on a collector row, which may carry only `ref`. */
    status?: "queued" | "running" | "published" | "failed" | "abandoned";
    queued_at?: string | null;
    started_at?: string | null;
    published_at?: string | null;
    finished_at?: string | null;
    waiting_on?: string | null;
    error?: string | null;
  } | null;
  projection: {
    status?: "queued" | "running" | "complete" | "failed" | "abandoned";
    rev: number | null;
    attempts?: number;
    /** A failed job the projector will try again: not the end of the story. */
    retrying?: boolean;
    last_error: string | null;
    /** Collector rows: unknown and stale are first-class. */
    coverage_state?: string;
  } | null;
  last_published_rev: number | null;
  /** Present when the server names the collector instance. Not sent at 6a7becc. */
  collector_id?: string;
}

export interface Pipeline {
  /** The workspace barrier; the held run's account and start are null when idle. */
  barrier: {
    state: "idle" | "collecting" | "projecting";
    scan_run: string | null;
    since: string | null;
    integration: string | null;
    account_id: string | null;
    label: string | null;
    started_at: string | null;
  };
  accounts: PipelineAccount[];
  current_rev: number | null;
  current_published_at: string | null;
  /** Present only when the read opted in with `graph=v2`. */
  graph_revision?: number;
}

export type GraphFeature =
  | "workloads"
  | "identities"
  | "resources"
  | "graph"
  | "evidence"
  | "changes"
  | "classification"
  | "coverage";

export interface Capabilities {
  graph_projection: "on" | "off" | "misconfigured";
  reason: string | null;
  features: Partial<Record<GraphFeature, boolean>>;
  schema_head: string | null;
  /**
   * Sibling of `features`, not a ninth feature key. Older servers omit it.
   * v2 views render only when `available` is true.
   */
  graph_v2?: {
    opt_in: string;
    available: boolean;
    providers: string[];
  };
}

/* --------------------------------- args ---------------------------------- */

/**
 * Workspace, pinned revision and client-only cache key, carried by every
 * graph query (see the header). `ws` and `key` never reach the server.
 */
export interface GraphScope {
  ws: string;
  rev?: number | null;
  key?: string;
  /**
   * Opt in to the v2 graph. Omitted unless `"v2"`, so a default call keeps
   * today's URL. `provider` is valid only together with this.
   */
  graph?: "v2";
  /** Repeatable. Empty means every v2 provider. */
  provider?: GraphProvider[];
}

interface Paged {
  cursor?: string;
  limit?: number;
}

export interface ListWorkloadsArgs extends GraphScope, Paged {
  q?: string;
  account?: string[];
  region?: string;
  runtime_kind?: RuntimeKind;
  classification?: ClassificationFilter;
  execution_role_state?: ExecutionRoleState;
  lifecycle?: LifecycleFilter;
  sort?: WorkloadSort;
}

export interface ListIdentitiesArgs extends GraphScope, Paged {
  q?: string;
  account?: string[];
  kind?: IdentityKind;
  used_by?: "workloads";
  lifecycle?: LifecycleFilter;
  sort?: IdentitySort;
}

export interface ListResourcesArgs extends GraphScope, Paged {
  q?: string;
  account?: string[];
  region?: string;
  kind?: ResourceKind;
  service?: string;
  lifecycle?: LifecycleFilter;
  sort?: ResourceSort;
}

type ById = GraphScope & { id: string };

export type GraphRootArgs = GraphScope & {
  root: GraphRef;
  /** Required by the server: a request without it is refused. */
  direction: GraphDirection;
  assume_hops?: number;
};

export type GraphExpandArgs = GraphScope & {
  node: GraphRef;
  edge: GraphEdgeKind;
  direction: GraphDirection;
  cursor?: string;
};

export type GraphPathArgs = GraphScope & { from: GraphRef; to: GraphRef };

export type ChangesArgs = GraphScope & {
  object: "workloads" | "identities" | "resources";
  id: string;
  kind: ChangeFeed;
  cursor?: string;
};

/* ------------------------------ v2 reads ---------------------------------- */

/** Evidence `meta.provenance` when the read opted in with graph=v2. */
export interface EvidenceProvenance {
  graph_revision?: number;
  manifest?: string;
  source_manifest_v2?: unknown;
  integration_id?: string;
}

export interface RuntimeInstanceRow {
  ref: GraphRef;
  runtime_key: string;
  runtime_kind: string;
  started_at: string | null;
  ended_at: string | null;
  last_observed_at: string | null;
  /** Null while live. `runtime_unobserved` once `ended_at` is set. */
  ttl_basis: string | null;
}

export interface ObservedAccessRow {
  ref?: GraphRef;
  resource?: { ref?: string; text?: string; native_kind?: string } | string | null;
  action: string;
  outcome: string;
  attribution: string;
  access_class?: string;
  count?: number;
  first_observed_at?: string | null;
  last_observed_at?: string | null;
  runtime_instance?: string | null;
  observed_at?: string | null;
}

export interface ObservedAccessArgs {
  view?: "aggregate" | "events";
  from?: string;
  to?: string;
  action?: string;
  outcome?: string;
  runtime_instance?: string;
  attribution?: string;
}

export interface RuntimePolicyStatus {
  workload_id: string;
  status: string;
}

export interface ObservedUseBinding {
  ref: GraphRef;
  runtime_instance: GraphRef | string;
  workload: GraphRef | string;
  binding_kind: string;
  basis: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface ObservedUse {
  bindings: ObservedUseBinding[];
  observed_access?: unknown;
}

export interface CollectorCoverageItem {
  object_class: string;
  state: string;
  reason_code?: string | null;
}

/** `GET /api/iga/v2/collectors/:id`. The body is the view, not `{ data }`. */
export interface CollectorView {
  id: string;
  kind: string;
  status: string;
  row_version?: number;
  agent_version?: string | null;
  health?: { status?: string; last_seen_at?: string | null };
  capabilities?: unknown;
  coverage?: CollectorCoverageItem[];
  desired_revision?: number | null;
  applied_revision?: number | null;
  discovery_source_id?: string | null;
  integration_id?: string | null;
  estate_id?: string | null;
}

/* --------------------------------- helpers -------------------------------- */

type ParamValue = string | number | boolean | string[] | null | undefined;

/**
 * The query string for a graph request: every argument except the
 * client-only `ws` and `key`, and except any named in `omit` (path params).
 * Arrays repeat the parameter (`account=a&account=b`).
 * `graph` and `provider` are included only when the caller set them.
 */
export function graphQueryString(args: Record<string, ParamValue>, omit: string[] = [], extra: Record<string, string> = {}): string {
  const skip = new Set(["ws", "key", ...omit]);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (skip.has(k) || v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) for (const item of v) search.append(k, item);
    else search.set(k, String(v));
  }
  for (const [k, v] of Object.entries(extra)) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : "";
}

function asParams<T extends object>(args: T): Record<string, ParamValue> {
  return args as unknown as Record<string, ParamValue>;
}

/** `/graph/path` as the server sends it: full objects inside each path. */
interface WirePathResult extends Omit<GraphPathResult, "paths" | "nodes" | "edges"> {
  paths: { nodes: GraphNode[]; edges: GraphEdge[]; limitations: EvidenceLimitation[] }[];
}

/**
 * The one adapter between `/graph/path` and the canvas: nodes and edges are
 * collected once (a node on several paths is one node), each path keeps its
 * order as refs, and its own limitations stay with it.
 */
function collectPaths(wire: WirePathResult): GraphPathResult {
  const nodes = new Map<GraphRef, GraphNode>();
  const edges = new Map<GraphRef, GraphEdge>();
  const paths = wire.paths.map((p) => {
    for (const n of p.nodes) nodes.set(n.ref, n);
    for (const e of p.edges) edges.set(e.claim, e);
    return { nodes: p.nodes.map((n) => n.ref), edges: p.edges.map((e) => e.claim), limitations: p.limitations };
  });
  return { ...wire, paths, nodes: [...nodes.values()], edges: [...edges.values()] };
}

const BASE = "/api/iga/v1";
const COLLECTOR_BASE = "/api/iga/v2";
const enc = encodeURIComponent;

function q(args: object, omit: string[] = [], extra: Record<string, string> = {}): string {
  return graphQueryString(asParams(args), omit, extra);
}

/**
 * One URL per read. Endpoints and the golden-URL tests both call these, so a
 * default argument list cannot drift from the request the console sends.
 * `ws` and `key` never appear. `graph` and `provider` appear only when set.
 */
export const graphUrls = {
  capabilities: () => `${BASE}/capabilities`,
  pipeline: (args: GraphScope) => `${BASE}/pipeline${q(args)}`,
  coverage: (args: GraphScope & { account?: string }) => `${BASE}/coverage${q(args)}`,
  workloads: (args: ListWorkloadsArgs) =>
    `${BASE}/workloads${q(args, [], { facets: "account,runtime_kind,classification,region" })}`,
  workload: (args: ById) => `${BASE}/workloads/${enc(args.id)}${q(args, ["id"])}`,
  workloadIdentities: (args: ById) => `${BASE}/workloads/${enc(args.id)}/identities${q(args, ["id"])}`,
  workloadResources: (args: ById) => `${BASE}/workloads/${enc(args.id)}/resources${q(args, ["id"])}`,
  workloadClassification: (args: ById) => `${BASE}/workloads/${enc(args.id)}/classification${q(args, ["id", "rev"])}`,
  workloadClassificationPost: (id: string) => `${BASE}/workloads/${enc(id)}/classification`,
  runtimeInstances: (args: ById) => `${BASE}/workloads/${enc(args.id)}/runtime-instances${q(args, ["id"])}`,
  observedAccess: (args: ById) => `${BASE}/workloads/${enc(args.id)}/observed-access${q(args, ["id"])}`,
  runtimePolicyStatus: (args: ById) => `${BASE}/workloads/${enc(args.id)}/runtime-policy-status${q(args, ["id"])}`,
  identities: (args: ListIdentitiesArgs) => `${BASE}/identities${q(args, [], { facets: "account,kind" })}`,
  identity: (args: ById) => `${BASE}/identities/${enc(args.id)}${q(args, ["id"])}`,
  identityUsedBy: (args: ById) => `${BASE}/identities/${enc(args.id)}/used-by${q(args, ["id"])}`,
  identityPermissions: (args: ById) => `${BASE}/identities/${enc(args.id)}/permissions${q(args, ["id"])}`,
  identityObservedUse: (args: ById) => `${BASE}/identities/${enc(args.id)}/observed-use${q(args, ["id"])}`,
  externalPrincipal: (args: ById) => `${BASE}/external-principals/${enc(args.id)}${q(args, ["id"])}`,
  externalReferencedBy: (args: ById) => `${BASE}/external-principals/${enc(args.id)}/referenced-by${q(args, ["id"])}`,
  resources: (args: ListResourcesArgs) => `${BASE}/resources${q(args, [], { facets: "kind,service,account" })}`,
  resource: (args: ById) => `${BASE}/resources/${enc(args.id)}${q(args, ["id"])}`,
  resourceAccess: (args: ById) => `${BASE}/resources/${enc(args.id)}/access${q(args, ["id"])}`,
  changes: (args: ChangesArgs) => `${BASE}/${args.object}/${enc(args.id)}/changes${q(args, ["object", "id"])}`,
  neighbourhood: (args: GraphRootArgs) => `${BASE}/graph${q(args)}`,
  expand: (args: GraphExpandArgs) => `${BASE}/graph/expand${q(args)}`,
  path: (args: GraphPathArgs) => `${BASE}/graph/path${q(args)}`,
  evidence: (args: GraphScope & { claim: GraphRef; include?: "raw" }) => `${BASE}/evidence${q(args)}`,
  lookup: (args: GraphScope & { cloud_ref: string }) => `${BASE}/lookup${q(args)}`,
  collector: (id: string) => `${COLLECTOR_BASE}/collectors/${enc(id)}`,
};

/* -------------------------------- endpoints ------------------------------- */

export const igaGraphApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGraphCapabilities: builder.query<Capabilities, GraphScope>({
      query: () => ({ url: graphUrls.capabilities() }),
      transformResponse: (res: { data: Capabilities }) => res.data,
      providesTags: [{ type: "IgaGraph", id: "CAPABILITIES" }],
    }),

    getGraphPipeline: builder.query<Pipeline, GraphScope>({
      query: (args) => ({ url: graphUrls.pipeline(args) }),
      transformResponse: (res: { data: Pipeline }) => res.data,
      // A scan request invalidates CloudScanRun, which is when the pipeline
      // has something new to say.
      providesTags: [
        { type: "IgaGraph", id: "PIPELINE" },
        { type: "CloudScanRun", id: "ALL" },
      ],
    }),

    /** The meta is kept: `graph_state` tells "nothing published yet" from "no gaps". */
    getGraphCoverage: builder.query<GraphDetail<CoverageAccount[]>, GraphScope & { account?: string }>({
      query: (args) => ({ url: graphUrls.coverage(args) }),
      providesTags: [{ type: "IgaGraph", id: "COVERAGE" }],
    }),

    /* ---- workloads ---- */

    listGraphWorkloads: builder.query<GraphList<WorkloadRow>, ListWorkloadsArgs>({
      query: (args) => ({
        url: graphUrls.workloads(args),
      }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:WORKLOADS` }],
    }),

    getGraphWorkload: builder.query<GraphDetail<WorkloadDetail>, ById>({
      query: (args) => ({ url: graphUrls.workload(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    /** Without `section`: the first page of every section. With it (and a cursor): that section only. */
    getGraphWorkloadIdentities: builder.query<
      GraphDetail<WorkloadIdentities>,
      ById & { section?: WorkloadIdentitySection; cursor?: string }
    >({
      query: (args) => ({ url: graphUrls.workloadIdentities(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    listGraphWorkloadResources: builder.query<
      GraphList<WorkloadResourceRow>,
      ById & Paged & { sort?: "kind" | "name" }
    >({
      query: (args) => ({ url: graphUrls.workloadResources(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    getWorkloadClassificationHistory: builder.query<GraphList<ClassificationDecision>, ById & Paged>({
      query: (args) => ({
        url: graphUrls.workloadClassification(args),
      }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    /** Not revision-bound (§5.5): a decision lands at the current `rev`. */
    classifyWorkload: builder.mutation<ClassifyResult, { ws: string; id: string; body: ClassifyRequest }>({
      query: ({ id, body }) => ({ url: graphUrls.workloadClassificationPost(id), method: "POST", body }),
      transformResponse: (res: { data: ClassifyResult }) => res.data,
      invalidatesTags: (result, _e, { ws, id }) => result ? [
        { type: "IgaGraph", id: `${ws}:workload:${id}` },
        { type: "IgaGraph", id: `${ws}:WORKLOADS` },
      ] : [],
    }),

    /* ---- identities ---- */

    listGraphIdentities: builder.query<GraphList<IdentityRow>, ListIdentitiesArgs>({
      query: (args) => ({ url: graphUrls.identities(args) }),
      providesTags: [{ type: "IgaGraph", id: "IDENTITIES" }],
    }),

    getGraphIdentity: builder.query<GraphDetail<IdentityDetail>, ById>({
      query: (args) => ({ url: graphUrls.identity(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `identity:${args.id}` }],
    }),

    /**
     * Without `section`: the first page of every section the identity's kind
     * has (roles: workloads, principals; groups: members; users: none). With
     * `section` and a cursor: that section only. Asking a section the kind
     * does not have is refused.
     */
    getGraphIdentityUsedBy: builder.query<
      GraphDetail<IdentityUsedBy>,
      ById & { section?: UsedBySection; cursor?: string }
    >({
      query: (args) => ({ url: graphUrls.identityUsedBy(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `identity:${args.id}` }],
    }),

    getGraphIdentityPermissions: builder.query<GraphDetail<IdentityPermissions>, ById>({
      query: (args) => ({ url: graphUrls.identityPermissions(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `identity:${args.id}` }],
    }),

    /* ---- external principals ---- */

    getGraphExternalPrincipal: builder.query<GraphDetail<ExternalPrincipalDetail>, ById>({
      query: (args) => ({ url: graphUrls.externalPrincipal(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `external_principal:${args.id}` }],
    }),

    listGraphExternalReferencedBy: builder.query<GraphList<ReferencedByRow>, ById & Paged>({
      query: (args) => ({
        url: graphUrls.externalReferencedBy(args),
      }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `external_principal:${args.id}` }],
    }),

    /* ---- resources ---- */

    listGraphResources: builder.query<GraphList<ResourceRow>, ListResourcesArgs>({
      query: (args) => ({ url: graphUrls.resources(args) }),
      providesTags: [{ type: "IgaGraph", id: "RESOURCES" }],
    }),

    getGraphResource: builder.query<GraphDetail<ResourceDetail>, ById>({
      query: (args) => ({ url: graphUrls.resource(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `resource:${args.id}` }],
    }),

    /** Paged by holder; `excluded_by` and `deny_statements_naming` are never counted as access. */
    getGraphResourceAccess: builder.query<{ data: ResourceAccess; meta: GraphListMeta }, ById & Paged>({
      query: (args) => ({ url: graphUrls.resourceAccess(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `resource:${args.id}` }],
    }),

    /* ---- changes ---- */

    listGraphChanges: builder.query<{ data: ChangeEvent[]; meta: ChangesMeta }, ChangesArgs>({
      query: (args) => ({
        url: graphUrls.changes(args),
      }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `changes:${args.id}` }],
    }),

    /* ---- graph ---- */

    getGraphNeighbourhood: builder.query<{ data: GraphNeighbourhood; meta: GraphMeta }, GraphRootArgs>({
      query: (args) => ({ url: graphUrls.neighbourhood(args) }),
      providesTags: [{ type: "IgaGraph", id: "GRAPH" }],
    }),

    getGraphExpansion: builder.query<{ data: GraphExpansion; meta: GraphMeta }, GraphExpandArgs>({
      query: (args) => ({ url: graphUrls.expand(args) }),
      providesTags: [{ type: "IgaGraph", id: "GRAPH" }],
    }),

    getGraphPath: builder.query<{ data: GraphPathResult; meta: GraphMeta }, GraphPathArgs>({
      query: (args) => ({ url: graphUrls.path(args) }),
      transformResponse: (res: { data: WirePathResult; meta: GraphMeta }) => ({
        data: collectPaths(res.data),
        meta: res.meta,
      }),
      providesTags: [{ type: "IgaGraph", id: "GRAPH" }],
    }),

    /* ---- evidence, lookup ---- */

    getGraphEvidence: builder.query<{ data: Evidence; meta: GraphMeta }, GraphScope & { claim: GraphRef; include?: "raw" }>({
      query: (args) => ({ url: graphUrls.evidence(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `evidence:${args.claim}` }],
    }),

    /** The graph object projected from a Cloud Inventory row — by source key, never by name. */
    lookupGraphObject: builder.query<{ ref: GraphRef; lifecycle: Lifecycle }, GraphScope & { cloud_ref: string }>({
      query: (args) => ({ url: graphUrls.lookup(args) }),
      transformResponse: (res: { data: { ref: GraphRef; lifecycle: Lifecycle } }) => res.data,
    }),

    /* ---- v2 runtime, observed use, collector ---- */

    getWorkloadRuntimeInstances: builder.query<GraphList<RuntimeInstanceRow>, ById & Paged>({
      query: (args) => ({ url: graphUrls.runtimeInstances(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    getWorkloadObservedAccess: builder.query<GraphList<ObservedAccessRow>, ById & Paged & ObservedAccessArgs>({
      query: (args) => ({ url: graphUrls.observedAccess(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    getWorkloadRuntimePolicyStatus: builder.query<{ data: RuntimePolicyStatus }, ById>({
      query: (args) => ({ url: graphUrls.runtimePolicyStatus(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:workload:${args.id}` }],
    }),

    getIdentityObservedUse: builder.query<{ data: ObservedUse }, ById>({
      query: (args) => ({ url: graphUrls.identityObservedUse(args) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `identity:${args.id}` }],
    }),

    /** 404 when ingest is off or the collector is not in the workspace. `ws` is cache-only. */
    getCollector: builder.query<CollectorView, { ws: string; id: string }>({
      query: (args) => ({ url: graphUrls.collector(args.id) }),
      providesTags: (_r, _e, args) => [{ type: "IgaGraph", id: `${args.ws}:collector:${args.id}` }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetGraphCapabilitiesQuery,
  useGetGraphPipelineQuery,
  useGetGraphCoverageQuery,
  useListGraphWorkloadsQuery,
  useGetGraphWorkloadQuery,
  useGetGraphWorkloadIdentitiesQuery,
  useListGraphWorkloadResourcesQuery,
  useGetWorkloadClassificationHistoryQuery,
  useClassifyWorkloadMutation,
  useListGraphIdentitiesQuery,
  useGetGraphIdentityQuery,
  useGetGraphIdentityUsedByQuery,
  useLazyGetGraphIdentityUsedByQuery,
  useLazyGetGraphWorkloadIdentitiesQuery,
  useGetGraphIdentityPermissionsQuery,
  useGetGraphExternalPrincipalQuery,
  useListGraphExternalReferencedByQuery,
  useListGraphResourcesQuery,
  useGetGraphResourceQuery,
  useGetGraphResourceAccessQuery,
  useListGraphChangesQuery,
  useGetGraphNeighbourhoodQuery,
  useGetGraphExpansionQuery,
  useLazyGetGraphExpansionQuery,
  useGetGraphPathQuery,
  useGetGraphEvidenceQuery,
  useLookupGraphObjectQuery,
  useLazyLookupGraphObjectQuery,
  useGetWorkloadRuntimeInstancesQuery,
  useGetWorkloadObservedAccessQuery,
  useGetWorkloadRuntimePolicyStatusQuery,
  useGetIdentityObservedUseQuery,
  useGetCollectorQuery,
} = igaGraphApi;
