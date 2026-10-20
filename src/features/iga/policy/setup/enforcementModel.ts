/**
 * What the enforcement view says about a binding (SPEC-iga-phase3-policy.md
 * §3.6, §9.3 S9). Pure words and checks; no requests.
 */

import {
  ENFORCEMENT_CAPABILITIES,
  ENFORCEMENT_CAPABILITY_LABELS,
  type EnforcementBindingView,
  type EnforcementCapabilityName,
  type EnforcementCapabilityResult,
  type EnforcementSetupState,
} from "@/app/api/igaPolicySetupApi";
import type { Connection } from "@/app/api/connectionsApi";
import type { ConsoleTone } from "@/components/console/status";

import { bindingState, type StateView } from "../shared";

/** The row's state in the §9.3 words: `waiting_for_stack`, `off`, `verifying`, `On · verified`, `Partial`, `Error`. */
export function setupStateView(state: EnforcementSetupState | string | undefined): StateView {
  const v = bindingState(state);
  const hints: Record<string, string> = {
    off: "AuthSec can read this account but cannot change anything in it.",
    waiting_for_stack: "Waiting for the CloudFormation stack to register with AuthSec.",
    verifying: "AuthSec is running the self-test in the account.",
    verified: "Every self-test check passed. AuthSec can apply approved changes here.",
    partial: "Some self-test checks failed. AuthSec will not apply changes here until every check passes.",
    error: "AuthSec could not use the enforcement role.",
  };
  return { ...v, hint: v.hint ?? (state ? hints[state] : undefined) };
}

/** A binding that has a role bound (verified, partial, or an error after a bind), as opposed to none or still pending. */
export function hasBoundRole(b: EnforcementBindingView | undefined): boolean {
  return !!b && !!b.role_arn;
}

/** The self-test checklist in probe order, one entry per §3.6 capability. */
export interface CapabilityRow {
  name: EnforcementCapabilityName;
  label: string;
  status: "ok" | "denied" | "error" | "untested";
  tone: ConsoleTone;
  /** "ok", "denied", "error", "not checked". */
  word: string;
  /** The AWS error code, when there is one. */
  code?: string;
  /** The AWS error message, when there is one. */
  message?: string;
  /** A foreign boundary AWS accepted is an error that means "the check failed", not "denied". */
  note?: string;
}

const ZERO_TIME = /^0001-01-01/;

export function capabilityRows(caps: Record<string, EnforcementCapabilityResult> | undefined): CapabilityRow[] {
  return ENFORCEMENT_CAPABILITIES.map((name) => {
    const r = caps?.[name];
    const status = r?.status ?? "untested";
    const checked = !!r && !!r.checked_at && !ZERO_TIME.test(r.checked_at);
    const word = status === "untested" ? "not checked" : status;
    const tone: ConsoleTone = status === "ok" ? "success" : status === "untested" ? "neutral" : "danger";
    const row: CapabilityRow = {
      name,
      label: ENFORCEMENT_CAPABILITY_LABELS[name],
      status,
      tone,
      word,
      code: r?.error_code || undefined,
      message: status === "ok" || (status === "untested" && !checked) ? undefined : r?.message || undefined,
    };
    if (name === "refuses_foreign_boundary" && r?.error_code === "ForeignBoundaryAccepted") {
      row.note = "AWS accepted a boundary that is not AuthSec's. The role is broader than the stack should allow.";
    }
    return row;
  });
}

/** `true` only for a link on AWS's own console; anything else is never opened. */
export function isAwsConsoleUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".console.aws.amazon.com");
  } catch {
    return false;
  }
}

/** GitHub's own pages only (the App's installation settings). */
export function isGitHubUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname.endsWith(".github.com"));
  } catch {
    return false;
  }
}

/** The AWS accounts among the connections; `id` is the cloud connector's id, the `:id` of every setup route. */
export function awsAccounts(connections: Connection[] | undefined): Connection[] {
  return (connections ?? []).filter((c) => c.provider === "aws");
}

export function githubConnections(connections: Connection[] | undefined): Connection[] {
  return (connections ?? []).filter((c) => c.provider === "github");
}

/** A role ARN of one account: `arn:aws:iam::123456789012:role/Name`. */
export function roleArnProblem(value: string, accountId: string, expectedName: string): string | null {
  const v = value.trim();
  if (!v) return "Required.";
  const m = /^arn:aws:iam::(\d{12}):role\/(.+)$/.exec(v);
  if (!m) return "Must be an IAM role ARN: arn:aws:iam::<account>:role/<name>.";
  if (accountId && m[1] !== accountId) return `Must be in account ${accountId}.`;
  if (expectedName && m[2] !== expectedName) return `Must be the role this stack creates: ${expectedName}.`;
  return null;
}
