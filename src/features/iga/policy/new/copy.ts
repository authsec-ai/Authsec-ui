/**
 * The words of the new-policy flow (SPEC-iga-phase3-policy.md §9.3 S3, §9.7).
 * Pure; every sentence is built from fields the proposal, intent and resolve
 * endpoints serve. A service with a route that remains is "excluded", never
 * "can no longer be called".
 */

import type { GovRefusal, GovRemoveEntry, GovRetainEntry } from "@/app/api/igaPolicyAuthoringApi";
import type { GovResolvedTarget, GovTargetKey } from "@/app/api/igaPolicyReadsApi";

import { humanize, relTime } from "../shared";
import { arnTail, refusalText, trustReasonText } from "../plans/planCopy";

export { R1A_SCOPE } from "../plans/planCopy";

/** `ecs-task-execution@1` becomes "ECS task execution". */
export function catalogLabel(catalog: string | undefined): string {
  if (!catalog) return "a dependency";
  const name = catalog.split("@")[0].replace(/-/g, " ");
  return name.replace(/\becs\b/i, "ECS").replace(/\blambda\b/i, "Lambda").replace(/\bec2\b/i, "EC2");
}

/** Why a service is kept, in the list's one line. */
export function retainWords(r: GovRetainEntry): string {
  switch (r.basis) {
    case "observed":
      return r.last_attempt ? `used ${relTime(r.last_attempt) || "recently"}` : "used in AWS's activity report";
    case "dependency":
      return `${catalogLabel(r.catalog)} dependency`;
    case "owner":
      return `kept: ${r.reason ?? "an owner's choice"}${r.review_by ? ` (review by ${r.review_by.slice(0, 10)})` : ""}`;
    default:
      return r.reason ? humanize(r.reason).replace(/^Granted; /i, "granted; ") : "granted, not reviewed";
  }
}

/** The removal's basis, in the list's one line. */
export function removeWords(r: GovRemoveEntry): string {
  return `no attempt · ${r.qualified_days} d`;
}

export const AGE_HINT = "The grant existed before AuthSec's first scan; owners will be asked to confirm it was not added recently.";

/** A removal is "clean" when no resource-policy route to the service is known to remain. */
export function routeRemains(r: GovRemoveEntry): boolean {
  return !!r.route_state && r.route_state !== "none_observed";
}

/** What a removal does for a service, without claiming more than the route state allows. */
export function routeStateSentence(r: GovRemoveEntry): string {
  switch (r.route_state) {
    case "bypass_known":
      return `${r.service}: excluded from the role's IAM permissions, but still reachable through a resource policy that names this role's session.`;
    case "effect_unknown":
      return `${r.service}: excluded from the role's IAM permissions; whether a resource policy that names any principal still allows it is not established.`;
    case "not_analysed":
      return `${r.service}: excluded from the role's IAM permissions; AuthSec could not read or analyse some of its resource policies, so use through them is unknown.`;
    default:
      return r.route_usage === "confirm_required"
        ? `${r.service}: excluded from the role's IAM permissions; owners confirm use through its resource policies.`
        : `${r.service}: removed; no resource-policy route was found in the scan.`;
  }
}

/** A machine warning of the recommendation, in a sentence. `nameOf` turns a role id into a name. */
export function warningText(w: string, nameOf: (roleId: string) => string): string {
  const i = w.indexOf(":");
  const head = i >= 0 ? w.slice(0, i) : w;
  const rest = i >= 0 ? w.slice(i + 1).trim() : "";
  if (head === "not_common") {
    const [roleId, service] = rest.split(":");
    return `${service} could be removed from ${nameOf(roleId)} but not from every selected role, so it is not in this change.`;
  }
  if (head === "age_unverified") return rest.replace(/^(\S+) was granted before AuthSec's first scan; owners will be asked to confirm$/, "$1 was granted before AuthSec's first scan; owners will be asked to confirm.");
  if (head === "shared_role" || head === "consumers_unresolved") return rest.endsWith(".") ? rest : `${rest}.`;
  return humanize(w);
}

/** `no_live_identity` and its siblings, in words. */
const NOT_FOUND: Record<string, string> = {
  account_mismatch: "That role is not in the account named.",
  no_live_identity: "AuthSec has no live copy of this role: it was not scanned, or it was deleted.",
  workload_runs_as_no_role: "This workload runs as no IAM role AuthSec knows of.",
  identity_retired: "This role was deleted and created again; the earlier one is retired.",
  several_live_identities: "Several live roles match. Use the role's ARN.",
};
const INELIGIBLE: Record<string, string> = {
  not_a_role: "It is not an IAM role.",
  no_immutable_role_id: "AuthSec has no immutable id for it, so it cannot follow the role across changes.",
  service_linked_role: "Service-linked roles belong to AWS and cannot be changed.",
  aws_reserved_role: "Roles under /aws-reserved/ belong to AWS and cannot be changed.",
  authsec_protected: "It is tagged authsec:protected=true.",
  authsec_managed_role: "It is one of AuthSec's own roles.",
};

/** A resolve, eligibility or compile refusal reason, in words. */
export function reasonText(r: string | GovRefusal): string {
  const code = typeof r === "string" ? r.split(": ")[0] : r.code;
  return NOT_FOUND[code] ?? INELIGIBLE[code] ?? refusalText(r);
}

export interface TargetProblem {
  title: string;
  words: string;
  /** A console link that fixes it. */
  fix?: { label: string; to: string };
}

/** Why a resolved key cannot be added, or null when it can. */
export function targetProblem(t: GovResolvedTarget): TargetProblem | null {
  if (t.status === "not_supported") {
    const need = t.prerequisite ? ` It needs ${t.prerequisite} first.` : "";
    return { title: "Not yet supported for policy", words: `${t.reason && !t.reason.startsWith("provider_not_supported") ? t.reason : "Policy changes AWS IAM roles in this release."}${need}` };
  }
  if (t.status === "not_found") return { title: "Not found", words: (t.reason && NOT_FOUND[t.reason]) || "AuthSec could not find this role." };
  if (t.status === "ambiguous") return { title: "Ambiguous", words: NOT_FOUND.several_live_identities };
  if (!t.eligible) {
    return { title: "Cannot be changed by policy", words: t.ineligible_reasons.map((r) => INELIGIBLE[r] ?? humanize(r)).join(" ") || "This role is not eligible." };
  }
  if (t.control) {
    return {
      title: "Already controlled by a policy",
      words: `${t.identity?.name ?? "This role"} is controlled by another policy. Edit that policy instead of creating a second one.`,
      fix: { label: "Edit that policy", to: `/iga/policy/policies/${encodeURIComponent(t.control.policy_id)}` },
    };
  }
  return null;
}

/** A name for a resolved key: the role's name, else what was asked. */
export function targetName(t: GovResolvedTarget): string {
  if (t.identity?.name) return t.identity.name;
  const k: GovTargetKey = t.key;
  if (k.role_arn) return arnTail(k.role_arn);
  if (k.role_id) return k.role_id;
  if (k.object_id) return `object ${k.object_id.slice(0, 8)}`;
  return k.service_account ? `service account ${k.service_account}` : "key";
}

const COVERAGE: Record<string, string> = {
  complete: "resource policies complete",
  partial: "resource policies partly read",
  not_collected: "resource policies not collected",
};
export const coverageWords = (c: string | null | undefined): string => (c ? COVERAGE[c] ?? humanize(c).toLowerCase() : "resource policies unknown");

export function trustReasons(reasons: readonly string[] | null | undefined): string {
  return (reasons ?? []).map(trustReasonText).join("; ");
}

/** "3 h ago" from a freshness in hours (how old the scan was when the bundle was built). */
export function hoursAgo(h: number | null | undefined): string {
  if (h === null || h === undefined) return "scan age unknown";
  if (h < 1) return "scanned under an hour ago";
  if (h < 48) return `scan published ${Math.round(h)} h ago`;
  return `scan published ${Math.round(h / 24)} days ago`;
}

/** A day count for a calendar-days setting. */
export const daysWord = (n: number): string => `${n} ${n === 1 ? "day" : "days"}`;
