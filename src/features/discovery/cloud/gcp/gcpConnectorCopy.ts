/**
 * Words for what a Google Cloud connector was PROVED able to reach, kept apart
 * from what a scan actually read: the permission probe (readiness, capability
 * profile, API enablement, role set) and the credential it holds. The two are
 * different questions, and the Connections screens show both.
 *
 * Moved here from the retired connector drawer, unchanged in meaning.
 */

import type { StatusTone } from "@/components/ui/status-badge";
import type { GCPCapabilityLimit, GCPConnectorAttrs } from "@/app/api/cloudDiscoveryApi";

export const READINESS_TONE: Record<string, StatusTone> = {
  ready: "success",
  partial: "warning",
  blocked: "danger",
};

/** The credential the connector holds. Federation is the default and the one
 * with no standing secret; a key is the fallback, and saying "JSON key" plainly
 * is how an operator notices they are carrying one. */
export const AUTH_METHOD_LABEL: Record<string, string> = {
  wif: "Workload Identity Federation",
  json_key: "Service-account JSON key",
};

export const SURFACE_LABEL: Record<string, string> = {
  identities: "Service accounts",
  keys: "Service-account keys",
  allow_bindings: "IAM allow bindings",
  roles: "Role definitions",
  deny: "Deny policies",
  pab: "Principal Access Boundary",
  resource_iam: "Resources",
  workloads: "Workload hosts",
  agents: "Agent runtimes",
  registry: "Agent Registry",
  logs: "Audit logs",
  audit_configs: "Audit configuration",
  apis: "API enablement",
};

/** Why a probe could not answer, in words. These are the backend's sanitized
 * reason codes; showing them raw would leak an internal vocabulary into the
 * console. */
export const PROBE_REASON: Record<string, string> = {
  permission_not_applicable_at_this_scope:
    "This permission does not apply at this scope kind, so the check could not run. Not evidence about access.",
  permission_check_denied: "The permission check itself was refused.",
  vpc_service_controls: "A VPC Service Controls perimeter refused the check.",
  org_policy_constraint: "An organization policy refused the check.",
  scope_not_found: "The scope could not be found.",
  throttled: "Google throttled the check.",
  permission_check_failed: "The check did not complete.",
};

/** Capability limits are permanent boundaries, not failures — each needs to
 * explain itself or it reads as a bug. */
export const LIMIT_COPY: Record<GCPCapabilityLimit, { label: string; body: string }> =
  {
    oauth_project_scope_only: {
      label: "Project scope only",
      body:
        "Onboarded with Google Authentication, which can only offer projects — Google's project search " +
        "does not return organizations or folders. Nothing above this project was ever in scope, so an " +
        "empty result higher up means it was never looked at.",
    },
    keyed_credential: {
      label: "Legacy key credential",
      body:
        "Authenticates with a stored service-account key rather than federation. No new connector can be " +
        "created this way. Re-onboard this scope to move it onto workload identity federation.",
    },
    quota_project_unusable: {
      label: "Quota project unusable",
      body:
        "The reader cannot use the quota project that Cloud Asset calls bill against, so those reads will " +
        "fail however complete its other permissions are. Usually the reader project sits outside the " +
        "onboarded scope and the role grants there do not reach it.",
    },
  };

/** Readiness, as a word a reader recognises.
 *
 * The raw values are lowercase enum strings ("ready", "partial", "blocked").
 * Rendering them verbatim in a pill put an internal identifier beside
 * badges that everywhere else read "Active" / "Error" / "Revoked". */
export const READINESS_LABEL: Record<string, string> = {
  ready: "Ready to scan",
  partial: "Partially ready",
  blocked: "Blocked",
};

/** Which of the three onboarding routes created this connector.
 *
 * They differ in what they could configure, and therefore in what a shortfall
 * means — so the value is worth showing, but not as the raw
 * "oauth_default" / "manual_wif" / "manual_key". */
export const ONBOARDING_PATH_LABEL: Record<string, string> = {
  oauth_default: "Google Authentication",
  manual_wif: "Workload Identity Federation (manual)",
  manual_key: "Service-account key (manual)",
};

/** How the reader can walk the resource tree below the top scope. */
export const ENUMERATION_VIA_LABEL: Record<string, string> = {
  rm_list: "Yes — by listing through Resource Manager",
  cai_search: "Yes — by searching Cloud Asset Inventory",
  both: "Yes — through Resource Manager and Cloud Asset Inventory",
};

/** Why readiness fell short of "ready".
 *
 * These codes are the ARGUMENT for the readiness verdict — the API's own
 * comment says that without them "the verdict is an assertion with no argument,
 * and nobody can act on it". Rendering them as raw codes in a <code> tag meant
 * nobody could act on them either. Unknown codes fall through to the code
 * itself, the same way PROBE_REASON handles it below. */
export const READINESS_REASON: Record<string, string> = {
  oauth_project_scope_only:
    "Onboarded through Google Authentication, which can only ever see one project — organization and folder bindings are out of reach for this connector.",
  keyed_credential:
    "Authenticates with a downloaded service-account key rather than federation, so the credential cannot be rotated by AuthSec.",
  quota_project_unusable:
    "The reader cannot use the quota project Cloud Asset calls bill against, so those reads will fail however complete its other permissions are.",
  missing_permissions: "The reader is missing one or more required read permissions.",
  api_not_enabled: "An API a first-phase surface depends on is not enabled on the reader project.",
  vpc_service_controls: "A VPC Service Controls perimeter refuses some reads by design.",
  org_policy_constraint: "An organization policy refuses some reads by design.",
  scope_enumeration_unavailable:
    "Neither listing route is available, so the resources below this scope cannot be walked.",
  scope_enumeration_unknown:
    "Neither listing route could be checked, so whether the tree below this scope is reachable is unknown.",
  never_probed: "This connector has not been probed yet — verify it to find out what the reader can reach.",
};

export function readinessReason(code: string): string {
  return READINESS_REASON[code] ?? code;
}

/** Whether the reader can walk below the top scope, in words.
 *
 * "None" and "unknown" are kept apart deliberately: one says no route is
 * available, the other says neither route could be checked. For an org
 * connector those lead to completely different next steps. */
export function enumerationLabel(attrs: GCPConnectorAttrs): string {
  const e = attrs.scope_enumeration;
  if (!e) return "Not checked";
  if (e.unknown) return "Unknown — could not check";
  if (e.via === "none") return "No — neither listing route is available";
  return ENUMERATION_VIA_LABEL[e.via] ?? e.via;
}

