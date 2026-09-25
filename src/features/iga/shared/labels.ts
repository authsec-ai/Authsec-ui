/**
 * Display vocabulary for the graph screens. Wording follows
 * SPEC-iga-phase2-graph.md §2.14.8: nothing here claims access, activity or
 * verification the product does not establish.
 */

import { format, formatDistanceToNow } from "date-fns";

import type {
  Basis,
  Classification,
  EvidenceLimitation,
  ExactCount,
  ExecutionRoleState,
  GraphAccount,
  IdentitySummary,
  LimitationCode,
  PolicyKind,
  RelState,
  ResourceKind,
  RuntimeKind,
  SurfaceState,
} from "@/app/api/igaGraphApi";
import type { ConsoleTone } from "@/components/console/status";

export const RUNTIME_LABEL: Record<RuntimeKind, string> = {
  lambda_function: "Lambda function",
  ecs_task_definition: "ECS task definition",
  ec2_instance: "EC2 instance",
  bedrock_agent: "Bedrock agent",
  bedrock_agentcore_runtime: "AgentCore runtime",
  bedrock_agentcore_gateway: "AgentCore gateway",
};

export const RUNTIME_SHORT: Record<RuntimeKind, string> = {
  lambda_function: "Lambda",
  ecs_task_definition: "ECS",
  ec2_instance: "EC2",
  bedrock_agent: "Bedrock",
  bedrock_agentcore_runtime: "AgentCore",
  bedrock_agentcore_gateway: "Gateway",
};

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  provider_native_agent: "Provider-native agent",
  classified_agent: "Classified as agent",
  unclassified: "Unclassified workload",
};

/** `Unclassified` is never a negative (§2.14.3), so it is neutral, not muted. */
export const CLASSIFICATION_TONE: Record<Classification, ConsoleTone> = {
  provider_native_agent: "info",
  classified_agent: "info",
  unclassified: "neutral",
};

export const EXECUTION_ROLE_LABEL: Record<ExecutionRoleState, string> = {
  resolved: "Runs as",
  not_in_scan: "Role not read in the latest scan",
  not_in_inventory: "Role not in any connected account",
  none: "No execution role configured",
};

/** An ARN that states no account is "Unknown account", never blank (§2.14.10). */
export function accountLabel(account: GraphAccount | null): string {
  if (!account) return "Unknown account";
  return account.label && account.label !== account.id ? account.label : account.id;
}

export const SURFACE_STATE_LABEL: Record<SurfaceState, string> = {
  reached: "read",
  partial: "partly read",
  denied: "denied",
  throttled: "throttled",
  not_selected: "not selected",
  unsupported: "not supported",
  not_configured: "not configured",
  unknown: "not checked",
  stale: "not reconfirmed",
  constrained: "blocked by policy",
  revoked: "connection revoked",
};

/** A surface state's words, including a state this console does not know yet. */
export function surfaceStateText(state: string): string {
  return SURFACE_STATE_LABEL[state as SurfaceState] ?? state.replace(/_/g, " ");
}

/**
 * States that leave a result short of the whole answer — rows missing or not
 * reconfirmed — as opposed to surfaces nobody asked for (not selected, not
 * supported, not configured). "Complete" is never said while one applies.
 */
export const INCOMPLETE_STATES: ReadonlySet<SurfaceState> = new Set<SurfaceState>([
  "partial",
  "denied",
  "throttled",
  "unknown",
  "stale",
  "constrained",
  "revoked",
]);

/** "22 min ago"; a time the server does not have is "not known", never now. */
export function agoText(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "not known";
}

/** "12 Mar 2026"; "not known" when absent. */
export function dayText(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM yyyy") : "not known";
}

/** "3 workloads", "at least 3 workloads", or "an unknown number of workloads" when the count timed out. */
export function countText(c: ExactCount | null | undefined, one: string, many: string): string {
  if (!c || c.value == null) return `an unknown number of ${many}`;
  return `${c.exact ? "" : "at least "}${c.value} ${c.value === 1 && c.exact ? one : many}`;
}

export const RELATIONSHIP_LABEL: Record<string, string> = {
  executes_as: "Runs as",
  task_execution_role: "ECS task execution role",
  member_of: "Member of",
  can_assume: "May assume",
};

/** Where a claim came from, in words (§2.14.9). Never collapsed into a tone. */
export const BASIS_EXPLANATION: Record<Basis, string> = {
  declared: "Configuration. The workload is configured this way; we have not observed it run.",
  observed: "Observed in activity AWS reported.",
  derived: "Derived from other claims the scan collected.",
  asserted: "Recorded by a person in AuthSec.",
};

export const REL_STATE_TONE: Record<RelState, ConsoleTone> = {
  current: "neutral",
  stale: "warning",
  ended: "neutral",
};

/**
 * What a claim does NOT establish, per limitation code (§5.3 *Evidence*). The
 * Limitations part of the evidence panel is never empty and never generic:
 * each line names the specific gap that applies.
 */
/** Every limitation code (§5.3 *Evidence*); a Record so a new code must be worded. */
const LIMITATION_CODES: Record<LimitationCode, true> = {
  effective_access_not_evaluated: true,
  conditions_not_evaluated: true,
  negated_statement: true,
  deny_statements_present: true,
  permissions_boundary_present: true,
  organizations_not_collected: true,
  resource_policy_not_projected: true,
  resource_existence_not_verified: true,
  selector_may_match_nothing: true,
  account_not_connected: true,
  caller_permission_not_evaluated: true,
  not_principal_unresolved: true,
  surface_stale: true,
  surface_partial: true,
  surface_denied: true,
  activity_attempts_not_outcomes: true,
};

export function isLimitationCode(code: string): code is LimitationCode {
  return Object.prototype.hasOwnProperty.call(LIMITATION_CODES, code);
}

export function limitationText(l: EvidenceLimitation): string {
  switch (l.code) {
    case "effective_access_not_evaluated":
      return "Whether a request would succeed was not evaluated. This is declared access, not proven access.";
    case "conditions_not_evaluated":
      return l.keys?.length
        ? `The statement has conditions (${l.keys.join(", ")}) that were not evaluated.`
        : "The statement has conditions that were not evaluated.";
    case "negated_statement":
      return "The statement uses NotAction or NotResource: it grants everything except what it lists.";
    case "deny_statements_present":
      return `The identity has ${l.count ?? "some"} Deny ${l.count === 1 ? "statement" : "statements"}, which may block this. They were not evaluated against it.`;
    case "permissions_boundary_present":
      return "The identity has a permissions boundary, which may limit this. It was not evaluated.";
    case "organizations_not_collected":
      return "AWS Organizations service control policies were not collected.";
    case "resource_policy_not_projected":
      return "The resource has its own policy, which was read but not combined with this grant.";
    case "resource_existence_not_verified":
      return "Named exactly by a policy statement. We have not confirmed that this resource exists.";
    case "selector_may_match_nothing":
      return "A selector, not a resource. We have not enumerated what it matches, and it may match nothing.";
    case "account_not_connected":
      return l.accounts?.length
        ? `${l.accounts.length === 1 ? "Account" : "Accounts"} ${l.accounts.join(", ")} ${l.accounts.length === 1 ? "is" : "are"} not connected, so nothing about ${l.accounts.length === 1 ? "it" : "them"} could be read.`
        : "An account on the far side is not connected, so nothing about it could be read.";
    case "caller_permission_not_evaluated":
      return "Assuming the role also needs sts:AssumeRole permission on the caller's side, which was not checked.";
    case "not_principal_unresolved":
      return "The trust policy uses NotPrincipal, so who it admits could not be resolved.";
    case "surface_stale":
    case "surface_partial":
    case "surface_denied": {
      const since = l.since ? ` since ${new Date(l.since).toLocaleDateString()}` : "";
      return `${l.surface ?? "A surface this claim depends on"}${l.account_id ? ` in ${l.account_id}` : ""} is ${
        l.state ? surfaceStateText(l.state) : l.code.replace("surface_", "")
      }${since}.`;
    }
    case "activity_attempts_not_outcomes":
      return "AWS reports authenticated attempts, including requests that were then denied — not successful use.";
    default:
      // A code newer than this console: name it rather than print nothing.
      return `A limitation this console does not describe yet (${String((l as { code: string }).code)}).`;
  }
}

export const POLICY_KIND_LABEL: Record<PolicyKind, string> = {
  aws_managed: "AWS managed",
  customer_managed: "Customer managed",
  inline: "Inline",
};

export const IDENTITY_KIND_LABEL: Record<IdentitySummary["kind"], string> = {
  iam_role: "IAM role",
  iam_user: "IAM user",
  iam_group: "IAM group",
  external_principal: "External principal",
  // An external principal named on another object carries its mechanism.
  aws_account: "AWS account",
  aws_principal: "AWS principal",
  aws_service: "AWS service",
  oidc: "OIDC provider",
  saml: "SAML provider",
  k8s_service_account: "Kubernetes service account",
};

/** §2.14.12: an ARN in a policy is not proof a resource exists. */
export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  exact: "Exact reference",
  selector: "Selector",
  external: "External or unresolved",
};

export const RESOURCE_KIND_NOTE: Record<ResourceKind, string> = {
  exact: "Named exactly by a policy statement. Not independently discovered — we have not confirmed it exists.",
  selector: "A pattern, not a resource. We have not enumerated what it matches, and it may match nothing.",
  external: "Belongs to an account or provider we cannot read.",
};

/** A statement is named by its Sid, or by its position when it has none. */
export function statementLabel(s: { sid: string; index: number | null }): string {
  if (s.sid) return s.sid;
  return s.index != null ? `statement ${s.index}` : "a statement without a Sid";
}
