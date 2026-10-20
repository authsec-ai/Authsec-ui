/**
 * Words and tones for the policy product's states. One place, so a status reads
 * the same in a list, a drawer and Logs, and is always text plus tone (never
 * colour alone). An unknown value from a newer backend is humanised, shown
 * neutral, and never hidden.
 */

import type { ConsoleTone } from "@/components/console/status";

export interface StateView {
  label: string;
  tone: ConsoleTone;
  /** One sentence for a tooltip or a help line. */
  hint?: string;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function view(map: Record<string, StateView>, value: string | null | undefined): StateView {
  if (!value) return { label: "Unknown", tone: "neutral" };
  return map[value] ?? { label: humanize(value), tone: "neutral" };
}

/** `iga_gov_deployment.state` (§8.4). */
export const DEPLOYMENT_STATE: Record<string, StateView> = {
  queued: { label: "Queued", tone: "neutral", hint: "Waiting to start." },
  blocked: { label: "Blocked", tone: "danger", hint: "AWS changed since approval, or evidence is no longer trusted. Review the new plan." },
  applying: { label: "Applying", tone: "info", hint: "AuthSec is changing AWS now." },
  outcome_unknown: { label: "Outcome unknown", tone: "warning", hint: "AWS did not answer. AuthSec will check at the settle time; nothing else changes this role meanwhile." },
  outcome_unresolved: { label: "Needs your decision", tone: "danger", hint: "AuthSec could not confirm what happened. This role stays locked until someone resolves it." },
  recovered: { label: "Recovered", tone: "neutral", hint: "Taken over by a later deployment." },
  awaiting_merge: { label: "Awaiting merge", tone: "info", hint: "The pull request is open." },
  awaiting_apply: { label: "Awaiting apply", tone: "info", hint: "Waiting for your pipeline or you to apply the change." },
  applied_unverified: { label: "Applied, verifying", tone: "info", hint: "Applied; AuthSec is checking that AWS matches the plan." },
  verified: { label: "Verified", tone: "success", hint: "The boundary in AWS matches the approved plan." },
  failed: { label: "Failed", tone: "danger" },
  drifted: { label: "Drifted", tone: "warning", hint: "AWS no longer matches what AuthSec applied." },
  superseded: { label: "Superseded", tone: "neutral", hint: "A newer version replaced this one." },
  undone: { label: "Undone", tone: "neutral", hint: "AuthSec's change was undone." },
};
/** A J1 export waits for the customer's own apply (§9.7), not for a pipeline. */
const AWAITING_YOUR_APPLY: StateView = {
  label: "Awaiting your apply",
  tone: "info",
  hint: "You apply the exported change yourself. AuthSec checks for it at every scan.",
};
export const deploymentState = (v?: string | null, deliveryKind?: string | null) =>
  v === "awaiting_apply" && deliveryKind === "export" ? AWAITING_YOUR_APPLY : view(DEPLOYMENT_STATE, v);

/** `iga_gov_policy_version.status`. */
export const VERSION_STATUS: Record<string, StateView> = {
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  superseded: { label: "Superseded", tone: "neutral" },
};
export const versionStatus = (v?: string | null) => view(VERSION_STATUS, v);

/** `iga_gov_policy.lifecycle`. */
export const LIFECYCLE: Record<string, StateView> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning", hint: "No new deployment starts; verification and drift continue." },
  archived: { label: "Archived", tone: "neutral" },
};
export const lifecycle = (v?: string | null) => view(LIFECYCLE, v);

/** `iga_gov_rollout.stage`. */
export const ROLLOUT_STAGE: Record<string, StateView> = {
  observe: { label: "Observing", tone: "info" },
  awaiting_approval: { label: "Awaiting approval", tone: "info" },
  canary: { label: "Canary", tone: "info" },
  expand: { label: "Expanding", tone: "info" },
  complete: { label: "Complete", tone: "success" },
  partial: { label: "Partial", tone: "warning", hint: "Some targets were verified and others failed or are blocked." },
  paused: { label: "Paused", tone: "warning" },
  undone: { label: "Undone", tone: "neutral" },
};
export const rolloutStage = (v?: string | null) => view(ROLLOUT_STAGE, v);

/** `GovPolicyView.stage`: where a policy stands (iga_gov_authoring_service.go `policyStageSQL`). */
export const POLICY_STAGE: Record<string, StateView> = {
  archived: { label: "Archived", tone: "neutral" },
  drifted: { label: "Drifted", tone: "warning", hint: "AWS no longer matches what AuthSec applied to a role of this policy." },
  failed: { label: "Failed", tone: "danger", hint: "A change failed, is blocked, or has an outcome nobody has resolved." },
  canary: { label: "Canary", tone: "info", hint: "The change is applied to the canary role and being watched." },
  observing: { label: "Observing", tone: "info", hint: "AuthSec is watching real use before it changes anything." },
  partial: { label: "Partial", tone: "warning", hint: "Some roles are verified and others are not yet." },
  verified: { label: "Verified", tone: "success", hint: "Every role's boundary in AWS matches the approved plan." },
  applying: { label: "Applying", tone: "info", hint: "Changes are being applied or verified." },
  in_review: { label: "In review", tone: "info", hint: "Owners and an approver are deciding." },
  approved: { label: "Approved", tone: "success", hint: "Approved; not rolled out yet." },
  draft: { label: "Draft", tone: "neutral" },
  idle: { label: "No active version", tone: "neutral" },
};
export const policyStage = (v?: string | null) => view(POLICY_STAGE, v);

/** `iga_gov_finding.status`. */
export const FINDING_STATUS: Record<string, StateView> = {
  open: { label: "Open", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
  mitigated: { label: "Mitigated", tone: "warning", hint: "Removed, but a resource policy still grants access the boundary does not limit." },
  reopened: { label: "Reopened", tone: "danger" },
  excepted: { label: "Excepted", tone: "neutral" },
  under_review: { label: "Under review", tone: "info", hint: "A proposed change for this finding is being reviewed." },
  cleared: { label: "Cleared", tone: "success", hint: "The condition no longer holds in the latest evaluation." },
  superseded: { label: "Superseded", tone: "neutral" },
};
export const findingStatus = (v?: string | null) => view(FINDING_STATUS, v);

export const SEVERITY: Record<string, StateView> = {
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "info" },
  info: { label: "Info", tone: "neutral" },
};
export const severity = (v?: string | null) => view(SEVERITY, v);

/** Finding kinds (§2.5). */
export const FINDING_KIND: Record<string, string> = {
  unused_service: "Unused service",
  broad_grant: "Broad grant",
  shared_role: "Shared role",
  missing_owner: "No owner",
  missing_review_date: "No review date",
  activity_not_read: "Activity not read",
};
export const findingKind = (v?: string | null) => (v ? FINDING_KIND[v] ?? humanize(v) : "");

/** Evidence trust (§2.11). */
export const TRUST: Record<string, StateView> = {
  trusted: { label: "Trusted", tone: "success" },
  partial: { label: "Partial", tone: "warning", hint: "Some evidence has gaps an approver must accept." },
  untrusted: { label: "Untrusted", tone: "danger", hint: "Not enough to propose a change." },
};
export const trust = (v?: string | null) => view(TRUST, v);

/** Delivery journeys (§1.1). */
export const DELIVERY: Record<string, { label: string; hint: string }> = {
  direct: { label: "AuthSec applies it", hint: "J3: AuthSec attaches the boundary through the enforcement role." },
  iac_pr: { label: "Pull request", hint: "J2: AuthSec opens a Terraform or CloudFormation pull request; your pipeline applies it." },
  export: { label: "Export", hint: "J1: you apply the change yourself; AuthSec verifies it." },
};
export const delivery = (v?: string | null) => (v ? DELIVERY[v]?.label ?? humanize(v) : "");

/** Plan kinds. */
export const PLAN_KIND: Record<string, string> = {
  apply: "Apply",
  undo: "Undo",
  remove_control: "Remove AuthSec control",
  split: "Dedicated identity",
  split_revert: "Revert dedicated identity",
};
export const planKind = (v?: string | null) => (v ? PLAN_KIND[v] ?? humanize(v) : "");

/** Per-service outcome (§8.7): what actually became true for one service. */
export const SERVICE_OUTCOME: Record<string, StateView> = {
  pending: { label: "Pending", tone: "neutral" },
  removed: { label: "Removed", tone: "success" },
  excluded_routes_remain: { label: "Excluded, route remains", tone: "warning", hint: "A resource policy still grants access the boundary does not limit." },
  excluded_routes_unknown: { label: "Excluded, routes unknown", tone: "warning", hint: "Some resource policies could not be analysed." },
  not_removed: { label: "Not removed", tone: "danger" },
};
export const serviceOutcome = (v?: string | null) => view(SERVICE_OUTCOME, v);

/** The words for "who the change touches" so the UI never says "can no longer be called" for a route that remains. */
export const ROUTE_STATE: Record<string, StateView> = {
  none_observed: { label: "No route found", tone: "success" },
  bypass_known: { label: "Route remains", tone: "warning" },
  effect_unknown: { label: "Route effect unknown", tone: "warning" },
  not_analysed: { label: "Not analysed", tone: "warning" },
};
export const routeState = (v?: string | null) => view(ROUTE_STATE, v);

/** Enforcement binding state (§3.6). */
export const BINDING_STATE: Record<string, StateView> = {
  pending: { label: "Waiting for stack", tone: "info" },
  verifying: { label: "Verifying", tone: "info" },
  verified: { label: "On · verified", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  error: { label: "Error", tone: "danger" },
  revoked: { label: "Off", tone: "neutral" },
  // The binding view's `setup_state` words (§9.3): `pending` reads `waiting_for_stack`, none or revoked reads `off`.
  waiting_for_stack: { label: "Waiting for stack", tone: "info" },
  off: { label: "Off", tone: "neutral" },
};
export const bindingState = (v?: string | null) => view(BINDING_STATE, v);
