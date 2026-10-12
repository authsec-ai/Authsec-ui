/**
 * What the Policies list and the policy page share (SPEC-iga-phase3-policy.md
 * §9.3 S5, S7): routes, words for the family / provider / next action, and the
 * four status lines of a rollout. Pure. Nothing here is inferred beyond what
 * `GET /policies`, `GET /policies/:id` and `GET /policies/:id/rollout` serve.
 */

import type {
  GovIntent,
  GovNextAction,
  GovPolicyFamily,
  GovPolicyView,
  GovReviewStatus,
  GovVersionView,
} from "@/app/api/igaPolicyAuthoringApi";
import type { GovDeploymentState, GovGateOutcome, GovRolloutStage, GovRolloutView } from "@/app/api/igaPolicyDeploymentsApi";
import type { ConsoleTone } from "@/components/console/status";
import { SessionManager } from "@/utils/sessionManager";

import { deploymentState, humanize, plural } from "../shared";
import { isRightSize, removedServicesOf } from "../new/intentEdit";

export const POLICIES_PATH = "/iga/policy/policies";

export const POLICY_TABS = ["overview", "targets", "owners", "rollout", "deployments", "events", "versions"] as const;
export type PolicyTab = (typeof POLICY_TABS)[number];

export function parseTab(s: string | undefined): PolicyTab {
  return (POLICY_TABS as readonly string[]).includes(s ?? "") ? (s as PolicyTab) : "overview";
}

export function policyHref(id: string, tab: PolicyTab = "overview", search = ""): string {
  const base = `${POLICIES_PATH}/${encodeURIComponent(id)}${tab === "overview" ? "" : `/${tab}`}`;
  return search ? `${base}?${search.replace(/^\?/, "")}` : base;
}

const FAMILY: Record<GovPolicyFamily, string> = {
  cloud_access: "Cloud access",
  governance: "Governance",
  time_bound: "Time-bound access",
  runtime: "Runtime",
};
export const familyLabel = (f: string) => FAMILY[f as GovPolicyFamily] ?? humanize(f);

export const providerLabel = (p: string) => (p === "aws" ? "AWS" : humanize(p));

/** The signed-in person's user id, to say "You" and to know whether they authored a version. */
export function currentUserId(): string | undefined {
  return SessionManager.getSession()?.user_id || undefined;
}

/** The list's Next action column: the server's `next_action`, in words. */
export function nextActionWords(p: Pick<GovPolicyView, "next_action" | "lifecycle">): string {
  if (p.lifecycle === "archived") return "None: archived";
  if (p.lifecycle === "paused") return "Resume to continue";
  const m: Record<GovNextAction, string> = {
    none: "Nothing to do",
    create_version: "Edit to create a new version",
    propose: "Propose for owner review",
    approve: "Waiting for an approver",
    rollout: "Start the rollout",
  };
  return m[p.next_action] ?? humanize(p.next_action);
}

/** `1 service`, `3 services`. */
export const serviceCount = (n: number) => plural(n, "service");

/* ------------------------------ status lines ------------------------------ */

export interface StatusLine {
  key: "boundary" | "health" | "denials" | "restriction";
  label: string;
  tone: ConsoleTone;
  /** What is known, in words; "No evidence yet" when the rollout carries nothing for this line. */
  text: string;
  /** Why, when the server gave a reason. */
  note?: string;
}

const NONE: Omit<StatusLine, "key" | "label"> = { tone: "neutral", text: "No evidence yet" };

const reasonWords = (r: string | undefined) => (r ? humanize(r) : undefined);

function gateTone(o: GovGateOutcome): ConsoleTone {
  switch (o) {
    case "passed":
      return "success";
    case "failed":
      return "danger";
    case "awaiting_evidence":
      return "info";
    case "not_available":
      return "warning";
    default:
      return "neutral";
  }
}

const BOUNDARY_BAD: GovDeploymentState[] = ["failed", "blocked", "drifted", "outcome_unresolved", "outcome_unknown"];

/**
 * The four statuses kept apart (spec §9.3 S5): the boundary in AWS matches the
 * plan, the application still works, nothing unexpected was denied, and a
 * removed service was seen restricted. Each is read from the rollout; one with
 * no data says so rather than borrowing another line's answer.
 */
export function statusLines(rollout: GovRolloutView | null): StatusLine[] {
  const canary = rollout?.results.canary;
  const deps = (rollout?.deployments ?? []).filter((d) => d.state !== "superseded" && d.state !== "recovered");

  let boundary: Omit<StatusLine, "key" | "label"> = NONE;
  if (deps.length > 0) {
    const verified = deps.filter((d) => d.state === "verified").length;
    const bad = deps.filter((d) => BOUNDARY_BAD.includes(d.state));
    if (verified === deps.length) {
      boundary = { tone: "success", text: `Verified on ${plural(verified, "role")}` };
    } else if (bad.length > 0) {
      boundary = {
        tone: bad.some((d) => d.state === "failed" || d.state === "blocked") ? "danger" : "warning",
        text: `${verified} of ${deps.length} verified`,
        note: [...new Set(bad.map((d) => deploymentState(d.state).label))].join(", "),
      };
    } else {
      boundary = { tone: "info", text: `${verified} of ${deps.length} verified`, note: "The rest are still being applied or checked." };
    }
  }

  let health: Omit<StatusLine, "key" | "label"> = NONE;
  let denials: Omit<StatusLine, "key" | "label"> = NONE;
  let restriction: Omit<StatusLine, "key" | "label"> = NONE;
  if (canary) {
    const ah = canary.application_health;
    health = {
      tone: gateTone(ah.outcome),
      text:
        ah.outcome === "passed"
          ? "No problems found by the checks that ran"
          : ah.outcome === "failed"
            ? "A health check failed"
            : ah.outcome === "awaiting_evidence"
              ? "Waiting for evidence"
              : ah.outcome === "not_available"
                ? "Could not be checked"
                : "Not applicable",
      note: reasonWords(ah.reason),
    };
    const gate = canary.gates.find((g) => g.gate === "no_unexpected_failures");
    const failures = canary.unexpected_failures ?? [];
    if (failures.length > 0) {
      denials = { tone: "danger", text: `${plural(failures.length, "denied call")} no declared test explains` };
    } else if (gate?.outcome === "not_available") {
      denials = { tone: "warning", text: "Could not be checked", note: reasonWords(gate.reason) };
    } else if (gate?.outcome === "passed") {
      denials = { tone: "success", text: "None seen" };
    } else if (gate) {
      denials = { tone: gateTone(gate.outcome), text: "Waiting for evidence", note: reasonWords(gate.reason) };
    }
    const r = canary.restriction;
    restriction = {
      tone: gateTone(r.outcome),
      text:
        r.outcome === "passed"
          ? "Observed: a call to a removed service was denied by the boundary"
          : r.outcome === "failed"
            ? "Contradicted: a call expected to be denied was allowed"
            : r.outcome === "awaiting_evidence"
              ? "Not observed yet"
              : r.outcome === "not_applicable"
                ? "Not applicable"
                : "Could not be checked",
      note: reasonWords(r.reason),
    };
  }

  return [
    { key: "boundary", label: "Boundary verified", ...boundary },
    { key: "health", label: "Application health", ...health },
    { key: "denials", label: "Unexpected denials", ...denials },
    { key: "restriction", label: "Restriction observed", ...restriction },
  ];
}

/* ---------------------- progress and the next action ---------------------- */

/** What the page knows of a version's owner review, or that it could not be read. */
export interface ReviewFacts {
  status: GovReviewStatus;
  asked: number;
  responded: number;
  overdue: boolean;
  /** Age confirmations the review asks for, and how many an owner has given. */
  ageRequested: number;
  ageConfirmed: number;
}

export type StepState = "done" | "current" | "pending" | "blocked" | "unknown";

export interface ProgressStep {
  key: "owners" | "observed" | "approved" | "canary" | "expand";
  label: string;
  state: StepState;
  detail?: string;
}

export interface ProgressInput {
  version: Pick<GovVersionView, "no" | "status"> | undefined;
  /** `null`: no review exists. `"unknown"`: the read failed. */
  review: ReviewFacts | null | "unknown";
  /** `null`: no rollout (not started). `"unknown"`: the read failed. */
  rollout: GovRolloutView | null | "unknown";
  /** Who approved and where; `undefined` when the event trail could not say. */
  approval: { by: string; channel: string } | null | undefined;
  now?: number;
}

const LATE_STAGES: GovRolloutStage[] = ["canary", "expand", "complete", "partial"];

function hoursLeft(until: string | undefined, now: number): number | null {
  if (!until) return null;
  const t = Date.parse(until);
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - now) / 3_600_000));
}

const channelWords = (c: string) => (c === "slack" ? "in Slack" : c === "ui" ? "in the console" : "");

/** The list of steps a version passes through (spec §9.3 S5). Each step says only what its own source says. */
export function progressSteps(i: ProgressInput): ProgressStep[] {
  const now = i.now ?? Date.now();
  const status = i.version?.status;
  const rollout = i.rollout === "unknown" ? null : i.rollout;
  const stage = rollout?.rollout.stage || "";
  const late = LATE_STAGES.includes(stage as GovRolloutStage);

  // Owners reviewed.
  let owners: ProgressStep;
  const r = i.review;
  if (r === "unknown") {
    owners = { key: "owners", label: "Owners reviewed", state: "unknown", detail: "The review could not be read." };
  } else if (!r) {
    owners = {
      key: "owners",
      label: "Owners reviewed",
      state: "pending",
      detail: status === "draft" || !status ? "Starts when the version is proposed." : "No owner review was opened for this version.",
    };
  } else {
    const ages = r.ageRequested > 0 ? ` (${plural(r.ageConfirmed, "age confirmation")} of ${r.ageRequested})` : "";
    if (r.status === "complete") owners = { key: "owners", label: `Owners reviewed ${r.responded}/${r.asked}`, state: "done", detail: ages.trim() || undefined };
    else if (r.status === "excepted") owners = { key: "owners", label: "Owners reviewed", state: "done", detail: `Proceeding by exception: ${r.responded} of ${r.asked} owners responded.` };
    else if (r.status === "cancelled") owners = { key: "owners", label: "Owners reviewed", state: "blocked", detail: "The review was cancelled." };
    else
      owners = {
        key: "owners",
        label: `Owners reviewed ${r.responded}/${r.asked}`,
        state: "current",
        detail: `${r.overdue ? "Past the deadline. " : ""}Silence is not consent: the deadline changes nothing.${ages}`,
      };
  }

  // Observed.
  let observed: ProgressStep;
  if (i.rollout === "unknown") {
    observed = { key: "observed", label: "Observed", state: "unknown", detail: "The rollout could not be read." };
  } else if (!rollout || !stage) {
    observed = { key: "observed", label: "Observed", state: "pending", detail: "Not started." };
  } else {
    const obs = rollout.results.observation?.result;
    if (obs && obs.back_to_draft.length > 0) {
      observed = { key: "observed", label: "Observed", state: "blocked", detail: "A service this version removes was attempted during observation, so it went back to draft." };
    } else if (late || stage === "awaiting_approval" || obs?.complete) {
      observed = { key: "observed", label: "Observed", state: "done", detail: "The window ended and a fresh activity report followed it." };
    } else if (stage === "observe") {
      const left = rollout.rollout.observe_until ? hoursLeft(rollout.rollout.observe_until, now) : null;
      observed = {
        key: "observed",
        label: "Observing",
        state: "current",
        detail: obs && obs.awaiting_report.length > 0 ? `Waiting for a fresh activity report for ${plural(obs.awaiting_report.length, "role")}.` : left ? `About ${left} h of the window left.` : undefined,
      };
    } else {
      observed = { key: "observed", label: "Observed", state: stage === "paused" && rollout.results.pause?.from === "observe" ? "blocked" : "pending", detail: stage === "paused" ? rollout.results.pause?.reason : undefined };
    }
  }

  // Approved.
  let approved: ProgressStep;
  if (status === "approved" || late) {
    const who = i.approval ? `Approved by ${i.approval.by} ${channelWords(i.approval.channel)}`.trim() : "Approved";
    approved = { key: "approved", label: who, state: "done" };
  } else if (status === "in_review") {
    approved = { key: "approved", label: "Approval", state: "current", detail: "Waiting for an approver who did not write this version." };
  } else if (status === "rejected") {
    approved = { key: "approved", label: "Approval", state: "blocked", detail: "The version was rejected." };
  } else {
    approved = { key: "approved", label: "Approval", state: "pending" };
  }

  // Canary and expansion.
  const canary = rollout?.results.canary;
  let canaryStep: ProgressStep;
  if (stage === "canary") {
    const left = hoursLeft(canary?.window_end, now);
    canaryStep = { key: "canary", label: "Canary", state: "current", detail: left === null ? undefined : left === 0 ? "The minimum window has ended; the gates decide." : `About ${left} h of the window left.` };
  } else if (stage === "expand" || stage === "complete" || stage === "partial") {
    canaryStep = { key: "canary", label: "Canary", state: "done" };
  } else if (stage === "paused" && rollout?.results.pause?.from === "canary") {
    canaryStep = { key: "canary", label: "Canary", state: "blocked", detail: rollout.results.pause.reason };
  } else if (stage === "undone") {
    canaryStep = { key: "canary", label: "Canary", state: "blocked", detail: "The canary was undone." };
  } else {
    canaryStep = { key: "canary", label: "Canary", state: i.rollout === "unknown" ? "unknown" : "pending" };
  }

  let expand: ProgressStep;
  if (stage === "expand") expand = { key: "expand", label: "Expanding to the other roles", state: "current" };
  else if (stage === "complete") expand = { key: "expand", label: "Expanded to every role", state: "done" };
  else if (stage === "partial") expand = { key: "expand", label: "Expanded", state: "blocked", detail: "Some roles could not be changed. Open Rollout." };
  else if (stage === "paused" && rollout?.results.pause?.from === "expand") expand = { key: "expand", label: "Expanding", state: "blocked", detail: rollout.results.pause.reason };
  else expand = { key: "expand", label: "Expand", state: i.rollout === "unknown" ? "unknown" : "pending" };

  return [owners, observed, approved, canaryStep, expand];
}

/** The one sentence under the header: what happens or what to do next. Says "unknown" when a read failed rather than guessing. */
export function nextSentence(p: GovPolicyView, i: ProgressInput & { canApprove: boolean }): string {
  const now = i.now ?? Date.now();
  if (p.lifecycle === "archived") return "This policy is archived. Nothing more will happen.";
  if (p.lifecycle === "paused") return "Paused: no new deployment starts. Verification and drift checks continue. Resume it to continue.";
  const v = i.version;
  if (!v) return "This policy has no version yet.";
  const rollout = i.rollout === "unknown" ? null : i.rollout;
  const stage = rollout?.rollout.stage || "";
  const r = i.review;
  switch (stage) {
    case "paused":
      return `The rollout is paused${rollout?.results.pause?.reason ? `: ${rollout.results.pause.reason}` : ""}. Open Rollout to resume it or undo the canary.`;
    case "canary": {
      const left = hoursLeft(rollout?.results.canary?.window_end, now);
      return `Canary: ${left === null ? "waiting for the gates" : left === 0 ? "the minimum window has ended; the gates decide whether to expand" : `about ${left} h of the window left`}. Open Rollout for the gates.`;
    }
    case "expand":
      return "Expanding to the other roles. Each is verified in AWS as it is changed.";
    case "complete":
      return "Rollout complete. AuthSec keeps verifying; nothing needs you.";
    case "partial":
      return "Some roles could not be changed. Open Rollout to see which and why.";
    case "undone":
      return "The rollout was undone. Edit the policy to create a new version.";
    case "awaiting_approval":
      return i.canApprove ? `Version ${v.no} is ready for your decision. Review it below.` : `Version ${v.no} is waiting for an approver.`;
    case "observe":
      return "Observing: AuthSec watches for any attempt to use the services this version removes.";
  }
  if (v.status === "draft") return `Version ${v.no} is a draft. Propose it for owner review.`;
  if (v.status === "in_review") {
    if (r && r !== "unknown" && (r.status === "open" || r.status === "reopened")) return `Version ${v.no} is in owner review: ${r.responded} of ${r.asked} owners have responded.`;
    return i.canApprove ? `Version ${v.no} is ready for your decision. Review it below.` : `Version ${v.no} is waiting for an approver.`;
  }
  if (v.status === "approved") return "Approved. Start the rollout from Rollout.";
  if (v.status === "rejected") return `Version ${v.no} was rejected. Edit the policy to create a new version.`;
  return nextActionWords(p);
}

/* ------------------------------ change summary ----------------------------- */

export interface ChangeSummary {
  /** Services removed with no remaining route known. */
  removed: number;
  /** Services excluded from the role's IAM permissions that remain reachable through a resource policy (or whose routes were not analysed). */
  withRoute: string[];
  keeps: number;
}

/** "Removed n · excluded with a remaining route n · keeps n" for a right-size intent; null for any other kind. */
export function changeSummary(intent: GovIntent | undefined | null): ChangeSummary | null {
  if (!isRightSize(intent)) return null;
  const withRoute = [...new Set(intent.remove.filter((r) => r.route_state && r.route_state !== "none_observed").map((r) => r.service))].sort();
  const removed = removedServicesOf(intent).length - withRoute.length;
  return { removed, withRoute, keeps: new Set(intent.retain.map((r) => r.service)).size };
}

/** Why Edit is not offered for this policy's latest version, or null when it is. */
export function editBlockedReason(latest: GovVersionView | undefined): string | null {
  if (!latest) return "The versions could not be read.";
  if (!isRightSize(latest.intent)) return "Only a right-size version is edited here.";
  return null;
}
