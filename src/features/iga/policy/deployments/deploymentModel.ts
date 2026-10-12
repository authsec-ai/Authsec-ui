/**
 * Words and small pure helpers for the deployment and rollout views
 * (SPEC-iga-phase3-policy.md §8.4-§8.10, §9.7). One place, so a gate, a
 * dimension or a deployment's next step reads the same on the rollout tab, in
 * the list and on the detail page.
 *
 * Nothing here says more than the API proves: a verified deployment proves the
 * boundary state in AWS, not that a service is unreachable and not that
 * applications still work. Those are separate lines with their own evidence.
 */

import { format, isSameDay, isValid, parseISO } from "date-fns";

import { GOV_CANARY_GATES } from "@/app/api/igaPolicyDeploymentsApi";
import type {
  GovApplyProgress,
  GovArtifactEvidence,
  GovAttemptStatus,
  GovCanaryGate,
  GovCanaryResult,
  GovClassification,
  GovDeploymentDetail,
  GovFactResult,
  GovGateOutcome,
  GovGateResult,
  GovPauseKind,
  GovRolloutStage,
  GovUnexpectedFailure,
  GovVerificationDimension,
  GovVerificationResult,
  IGAGovAttempt,
  IGAGovDeployment,
  IGAGovServiceOutcome,
  IGAGovVerification,
} from "@/app/api/igaPolicyDeploymentsApi";

import { humanize, plural, roleNameOf, shortHash, type StateView } from "../shared";

/* --------------------------------- time ---------------------------------- */

/** "14:02" today, "9 Oct 14:02" otherwise; empty for a missing or unparseable time. */
export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return "";
  return isSameDay(d, new Date()) ? format(d, "HH:mm") : format(d, "d MMM HH:mm");
}

/** "9 Oct 2026, 14:02": for the audit table, where the day always matters. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "d MMM yyyy, HH:mm:ss") : "";
}

/* ---------------------------------- role --------------------------------- */

/** A role named for people: the IAM name from its ARN, else the stable role id. */
export function roleLabel(roleArn?: string | null, roleId?: string | null): string {
  return roleNameOf(roleArn) || roleId || "this role";
}

/* --------------------------------- gates --------------------------------- */

export const GATE_WORDS: Record<GovCanaryGate, { label: string; checks: string }> = {
  artifact_verified: {
    label: "Boundary verified",
    checks: "AWS holds the approved boundary on the role (read back from AWS).",
  },
  no_unexpected_failures: {
    label: "No unexpected denials",
    checks:
      "The role had no authorization denial in the canary window, except test calls you declared as expected denials.",
  },
  required_operations: {
    label: "Kept services still work",
    checks:
      "Each kept service the role was using shows a successful call, a matched test call or an owner's working report since the change.",
  },
  no_problem_reports: {
    label: "No problem reports",
    checks: "No owner has reported a problem since the change.",
  },
  window_elapsed: {
    label: "Canary window elapsed",
    checks:
      "The canary hours have passed, CloudTrail reads cover the whole window, and a scan has published since the change.",
  },
};

/** The five gates, in the API's order, for a canary that has not been evaluated. */
export const UNEVALUATED_GATES: GovGateResult[] = GOV_CANARY_GATES.map((gate) => ({ gate, outcome: "" }));

export function gateLabel(gate: string): string {
  return GATE_WORDS[gate as GovCanaryGate]?.label ?? humanize(gate);
}

/** A gate or dimension outcome as text plus tone. */
export const GATE_OUTCOME: Record<Exclude<GovGateOutcome, ""> | "overdue", StateView> = {
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  awaiting_evidence: { label: "Waiting for evidence", tone: "info", hint: "Not enough evidence yet; not a failure." },
  not_available: {
    label: "Cannot be evaluated",
    tone: "warning",
    hint: "AuthSec cannot evaluate this. An approver may accept it, with a reason, to expand.",
  },
  not_applicable: { label: "Not applicable", tone: "neutral" },
  overdue: { label: "Overdue", tone: "warning", hint: "Past its verification deadline. Never read as verified by elapsed time." },
};
export function gateOutcome(v: string | null | undefined): StateView {
  // The empty string is a real gate outcome: nothing has been evaluated yet.
  if (!v) return { label: "Not evaluated yet", tone: "neutral", hint: "Nothing has been evaluated for this yet; not a failure." };
  return GATE_OUTCOME[v as keyof typeof GATE_OUTCOME] ?? { label: humanize(v), tone: "neutral" };
}

/** Machine reasons the gates and dimensions carry (igagov health.go), in words. */
const REASONS: Record<string, string> = {
  canary_hours_not_elapsed: "The canary window is still open.",
  no_publication_after_apply: "No scan has published since the change was applied.",
  no_cloudtrail_coverage: "No CloudTrail read covers the window, so AuthSec cannot tell whether there were denials.",
  cloudtrail_coverage_gap: "CloudTrail reads leave a gap in the window (a scan at least every 48 hours is needed).",
  cloudtrail_event_cap_hit: "A CloudTrail read reached its 10,000-event cap, so the window may be incomplete.",
  awaiting_success_evidence: "No successful call to a kept service has been seen yet.",
  no_success_evidence_in_window: "The window ended without a successful call, matched test call or working report for these kept services.",
  allowed_validation_denied: "A test call declared as allowed was denied.",
  problem_reported: "An owner reported a problem.",
  denied_retained_service: "A kept service was denied.",
  denied_removed_service: "A removed service was attempted and denied.",
  denied_other_service: "A service outside this change was denied.",
  not_observed: "No request to a removed service has been seen. Declare a test call to prove it.",
  denied_cause_not_attributed: "A request was denied, but AWS did not say the boundary caused it.",
  expected_denial_was_allowed: "A test call that should have been denied was allowed.",
};
export function reasonWords(reason: string | null | undefined): string {
  if (!reason) return "";
  return REASONS[reason] ?? humanize(reason);
}

/* ------------------------------ verification ------------------------------ */

export const DIMENSION_LABEL: Record<GovVerificationDimension, string> = {
  artifact: "Boundary (artifact)",
  graph: "Published scan",
  application_health: "Application health",
  restriction: "Restriction observed",
};

export const DIMENSION_HELP: Record<GovVerificationDimension, string> = {
  artifact: "Whether AWS holds the approved boundary on the role, read back from AWS.",
  graph: "Whether a scan published after the change agrees with that boundary.",
  application_health: "Whether the role's kept services still work: no unexpected denials, no problem reports, successful calls seen.",
  restriction: "Whether a request to a removed service was actually denied by the boundary. Absence is never a failure.",
};

export function dimensionResult(v: GovVerificationResult | string | null | undefined): StateView {
  return gateOutcome(v);
}

/* -------------------------------- attempts -------------------------------- */

export const ATTEMPT_STATUS: Record<GovAttemptStatus, StateView> = {
  prepared: { label: "Prepared", tone: "neutral", hint: "Recorded before sending. Not sent to AWS." },
  dispatched: { label: "Sent", tone: "info", hint: "Sent to AWS; no answer recorded yet." },
  completed: { label: "Completed", tone: "success", hint: "AWS answered." },
  unknown: { label: "Unknown", tone: "warning", hint: "AWS did not answer. The request may or may not have taken effect." },
  abandoned: { label: "Abandoned", tone: "neutral", hint: "Never sent." },
};
export function attemptStatus(v: string | null | undefined): StateView {
  return ATTEMPT_STATUS[v as GovAttemptStatus] ?? { label: humanize(v) || "Unknown", tone: "neutral" };
}

/** Where the role stood against the plan at the last check (igagov recover.go classes). */
export const CLASSIFICATION_WORDS: Record<string, string> = {
  before: "Still in its state before the change",
  intermediate: "Partly changed: some of the plan's changes are visible, not all",
  after: "In the state the plan describes",
  conflict: "In a state the plan does not describe",
};

/* ------------------------------- rollout ---------------------------------- */

export const PAUSE_WORDS: Record<GovPauseKind, string> = {
  manual: "Paused by a person.",
  gate_failed: "A canary gate failed, so the rollout paused.",
  deployment_failed: "A deployment failed, so the rollout paused.",
  drifted: "A deployed boundary no longer matches what AuthSec applied, so the rollout paused.",
  returned_to_draft: "A removed service was attempted during observation, so the version went back to draft.",
};
export function pauseWords(kind: string | null | undefined): string {
  return PAUSE_WORDS[kind as GovPauseKind] ?? humanize(kind);
}

/** The five stages a rollout walks, in order. `partial` replaces `complete`. */
export const ROLLOUT_STEPS: readonly GovRolloutStage[] = ["observe", "awaiting_approval", "canary", "expand", "complete"];

/* ------------------------------ per-service ------------------------------- */

/**
 * One sentence per service (§8.7). The words follow `route_state`, never only
 * `outcome`: a service excluded by the boundary with a route that remains is
 * never described as unreachable.
 */
export function serviceSentence(o: IGAGovServiceOutcome): string {
  const s = o.service;
  switch (o.outcome) {
    case "pending":
      return `${s}: waiting for the change to be verified.`;
    case "removed":
      return `${s}: excluded by the boundary; no other route to it was found. Verification proves the boundary state, not that ${s} is unreachable.`;
    case "excluded_routes_remain":
      return `${s}: excluded, a route remains. A resource policy still grants ${s} to this role directly, and the boundary does not limit that.`;
    case "excluded_routes_unknown":
      return `${s}: excluded, routes unknown. Some resource policies for ${s} could not be analysed.`;
    case "not_removed":
      return `${s}: not removed. The boundary does not exclude ${s}.`;
    default:
      return `${s}: ${humanize(o.outcome)}.`;
  }
}

export const SERVICE_CHANGE: Record<string, string> = {
  newly_excluded: "Excluded by this change",
  already_excluded: "Already excluded before",
  newly_unexcluded: "No longer excluded",
};

export const SERVICE_EXCLUSION: Record<string, string> = {
  pending: "Exclusion pending",
  applied: "Exclusion applied",
  failed: "Exclusion failed",
  reverted: "Exclusion reverted",
};

export const RESTRICTION_WORDS: Record<string, string> = {
  not_observed: "No request seen",
  observed: "Denied by the boundary",
  contradicted: "A request that should be denied was allowed",
};

/* ---------------------------- next-action wording --------------------------- */

const QUEUED_WHY: Record<string, string> = {
  policy_paused: "the policy is paused",
  delivery_not_available: "this delivery is not available",
  binding_unavailable: "enforcement access is not available for this account",
};

export interface NextActionContext {
  /** When the attempt whose outcome is unknown was sent. */
  unknownAt?: string;
  now?: Date;
}

/** The one sentence that says what happens next, or what this needs from a person. */
export function nextActionSentence(d: IGAGovDeployment, ctx: NextActionContext = {}): string {
  const now = ctx.now ?? new Date();
  switch (d.state) {
    case "queued": {
      const why = d.state_reason ? QUEUED_WHY[d.state_reason] ?? humanize(d.state_reason).toLowerCase() : "";
      return why ? `Waiting to start: ${why}. Nothing needs to be done unless that changes.` : "Queued. AuthSec starts it shortly; nothing is needed from you.";
    }
    case "blocked":
      return "It did not run: AWS or the approval changed since this was approved. Review the new plan; it needs a new approval.";
    case "applying":
      return "AuthSec is changing AWS now.";
    case "outcome_unknown":
      return `AWS did not answer when AuthSec changed the boundary${ctx.unknownAt ? ` at ${clock(ctx.unknownAt)}` : ""}. AuthSec will check AWS and CloudTrail${d.settle_after ? ` at ${clock(d.settle_after)}` : " shortly"}; until then nothing else changes this role. No action needed from you yet.`;
    case "outcome_unresolved":
      return `AuthSec could not confirm whether its${ctx.unknownAt ? ` ${clock(ctx.unknownAt)}` : ""} change reached AWS. This role stays locked until you choose: re-read, accept what AWS shows (needs approval), or emergency undo.`;
    case "recovered":
      return "A later deployment took over this role after an unresolved outcome.";
    case "awaiting_merge":
      return "Waiting for the pull request to be merged. AuthSec does not return a link to it here.";
    case "awaiting_apply":
      return d.apply_deadline_at && new Date(d.apply_deadline_at) < now
        ? `Waiting for your pipeline or you to apply the change; the deadline (${clock(d.apply_deadline_at)}) has passed.`
        : `Waiting for your pipeline or you to apply the change${d.apply_deadline_at ? `; due ${clock(d.apply_deadline_at)}` : ""}. AuthSec checks at every scan.`;
    case "applied_unverified":
      return d.verify_deadline_at && new Date(d.verify_deadline_at) < now
        ? `Applied, but verification is overdue (due ${clock(d.verify_deadline_at)}): no scan has confirmed it. This is not verified.`
        : `Applied. AuthSec is checking AWS and the next published scan${d.verify_deadline_at ? `; due ${clock(d.verify_deadline_at)}` : ""}.`;
    case "verified":
      return "The boundary in AWS matches the approved plan. That proves the boundary state, not that a service is unreachable or that applications still work; those are reported separately.";
    case "failed":
      return `The change did not complete as approved${d.state_reason ? `: ${humanize(d.state_reason)}` : ""}. Nothing further runs on this role until it is reviewed.`;
    case "drifted":
      return "AWS no longer matches what AuthSec applied. Review the difference before changing this role again.";
    case "superseded":
      return "A newer deployment replaced this one. No action needed.";
    case "undone":
      return "AuthSec's change was undone. Other controls may still restrict this role.";
    default:
      return "";
  }
}

/** Short next step for a table cell. */
export function nextActionShort(d: IGAGovDeployment, now: Date = new Date()): string {
  switch (d.state) {
    case "queued":
      return "Starts shortly";
    case "blocked":
      return "Review the new plan";
    case "applying":
      return "In progress";
    case "outcome_unknown":
      return d.settle_after ? `AuthSec re-checks at ${clock(d.settle_after)}` : "AuthSec re-checks shortly";
    case "outcome_unresolved":
      return "Resolve: choose how to continue";
    case "recovered":
      return "Taken over by a later deployment";
    case "awaiting_merge":
      return "Merge the pull request";
    case "awaiting_apply":
      return d.apply_deadline_at && new Date(d.apply_deadline_at) < now ? "Apply it: deadline passed" : "Apply it in your pipeline";
    case "applied_unverified":
      return d.verify_deadline_at && new Date(d.verify_deadline_at) < now ? "Verification overdue" : "Verifying";
    case "verified":
      return "None";
    case "failed":
      return "Review the failure";
    case "drifted":
      return "Review the difference";
    case "superseded":
    case "undone":
      return "None";
    default:
      return "";
  }
}

/** States in which a deployment is still moving: poll while the page is open. */
export function isLiveState(state: string | undefined): boolean {
  return state === "queued" || state === "applying" || state === "outcome_unknown" || state === "applied_unverified" || state === "awaiting_merge" || state === "awaiting_apply";
}

/* --------------------------------- routes --------------------------------- */

/**
 * The deployment page's address. The detail response names neither the policy
 * nor the role, so a row carries its policy id (`?policy=`, not personal data)
 * to let the page find its list row without scanning every deployment.
 */
export function deploymentHref(id: string, policyId?: string | null): string {
  const base = `/iga/policy/deployments/${encodeURIComponent(id)}`;
  return policyId ? `${base}?policy=${encodeURIComponent(policyId)}` : base;
}

/* ----------------------------- outcome unknown ---------------------------- */

/** When the request whose answer never came was sent: the unknown attempt's own time. */
export function unknownAttemptAt(attempts: readonly IGAGovAttempt[] | null | undefined): string | undefined {
  const a = [...(attempts ?? [])].reverse().find((x) => x.status === "unknown");
  return a ? (a.dispatched_at ?? a.signed_at ?? a.prepared_at) : undefined;
}

/** The held-role explanation shown beside `outcome_unknown` and `outcome_unresolved` (§8.1). */
export const HELD_ROLE_WORDS =
  "AuthSec changes a role through one deployment at a time. While this outcome is open, no other change, undo or removal starts on this role, so two changes cannot overlap.";

/* ---------------------------- verification lines ---------------------------- */

export interface VerificationLine {
  key: "artifact" | "graph" | "health" | "denials" | "restriction";
  label: string;
  help: string;
  result: StateView;
  /** What is known, in words. */
  text: string;
  /** The evidence behind it, one fact per entry; shown behind a disclosure. */
  evidence: string[];
  checkedAt?: string;
}

const NOT_CHECKED: StateView = { label: "Not checked yet", tone: "neutral" };

function verificationOf(detail: GovDeploymentDetail, dimension: GovVerificationDimension): IGAGovVerification | undefined {
  return detail.verifications.find((v) => v.dimension === dimension);
}

/** A dimension's result: the recorded verification row, else the verify job's last facts. */
function outcomeOf(detail: GovDeploymentDetail, dimension: GovVerificationDimension): { outcome: string; at?: string; reason?: string; attribution?: string } | null {
  const v = verificationOf(detail, dimension);
  if (v) return { outcome: v.outcome, at: v.checked_at, attribution: v.attribution };
  const f = detail.gate_facts?.dimensions?.[dimension];
  if (f) return { outcome: f.outcome, at: detail.gate_facts?.checked_at?.[dimension], reason: f.reason, attribution: f.attribution };
  return null;
}

function shortValue(v: string): string {
  if (!v) return "none";
  return v.startsWith("sha256:") ? shortHash(v) : v.length > 90 ? `${v.slice(0, 87)}…` : v;
}

function factLine(f: GovFactResult): string {
  const subject = f.subject ? ` ${f.subject}` : "";
  return `${humanize(f.kind)}${subject}: expected ${shortValue(f.after)}, AWS shows ${shortValue(f.observed)}`;
}

function isClassified(e: GovArtifactEvidence): e is { classification: GovClassification; reason: string } {
  return typeof e === "object" && e !== null && "classification" in e;
}
function isApplyProgress(e: GovArtifactEvidence): e is GovApplyProgress {
  return typeof e === "object" && e !== null && "summary" in e && "visible" in e;
}

function failureLine(f: GovUnexpectedFailure): string {
  const cls: Record<string, string> = {
    denied_retained_service: "a kept service",
    denied_removed_service: "a removed service",
    denied_other_service: "a service outside this change",
  };
  const by = f.denial_policy_type && f.denial_policy_type !== "unknown" ? `, denied by ${humanize(f.denial_policy_type).toLowerCase()}` : "";
  return `${clock(f.event_time) || "Unknown time"} · ${f.action} · session ${f.session_name || "unknown"} · ${cls[f.class] ?? humanize(f.class)}${by}`;
}

function gateEvidence(gates: readonly GovGateResult[]): string[] {
  return gates.map((g) => `${gateLabel(g.gate)}: ${gateOutcome(g.outcome).label}${g.reason ? `. ${reasonWords(g.reason)}` : ""}`);
}

/**
 * The deployment's verification, as separate lines (§8.7, §9.3 S5): the
 * boundary in AWS, the published scan, application health, unexpected denials
 * and the restriction. None borrows another's answer, and a dimension with no
 * record says so rather than reading as passing.
 */
export function verificationLines(detail: GovDeploymentDetail): VerificationLine[] {
  const lines: VerificationLine[] = [];
  const direct = detail.deployment.delivery === "direct";

  // Boundary (artifact)
  {
    const o = outcomeOf(detail, "artifact");
    const av = verificationOf(detail, "artifact");
    const ev: GovArtifactEvidence | undefined = av?.dimension === "artifact" ? av.evidence : undefined;
    const evidence: string[] = [];
    let text = "No readback of AWS has been recorded yet.";
    if (o) {
      const reason = reasonWords(o.reason);
      switch (o.outcome) {
        case "passed":
          text = direct
            ? "AWS holds the approved boundary on the role, read back from AWS."
            : "The change visible in AWS matches the approved plan.";
          break;
        case "failed":
          text = "What AWS holds is not what was approved.";
          break;
        case "awaiting_evidence":
          text = direct ? "Waiting for AuthSec's readback of AWS." : "Waiting for the change to appear in AWS.";
          break;
        case "overdue":
          text = "Verification is past its deadline; this is not verified.";
          break;
        default:
          text = reason || humanize(o.outcome);
      }
    }
    if (ev && isClassified(ev)) {
      const c = ev.classification;
      evidence.push(`${CLASSIFICATION_WORDS[c.class] ?? humanize(c.class)} (${c.visible} of ${c.total} changes visible).`);
      if (ev.reason) evidence.push(humanize(ev.reason));
      for (const f of c.conflicts ?? []) evidence.push(factLine(f));
    } else if (ev && isApplyProgress(ev)) {
      if (ev.summary) text = o?.outcome === "passed" ? text : ev.summary;
      evidence.push(`${CLASSIFICATION_WORDS[ev.class] ?? humanize(ev.class)} (${ev.visible} of ${ev.total} changes visible).`);
      for (const f of ev.visible_facts ?? []) evidence.push(`Visible: ${factLine(f)}`);
      for (const f of ev.awaited_facts ?? []) evidence.push(`Waiting for: ${factLine(f)}`);
      for (const f of ev.conflicts ?? []) evidence.push(`Conflict: ${factLine(f)}`);
    }
    lines.push({
      key: "artifact",
      label: DIMENSION_LABEL.artifact,
      help: DIMENSION_HELP.artifact,
      result: o ? dimensionResult(o.outcome) : NOT_CHECKED,
      text,
      evidence,
      checkedAt: o?.at,
    });
  }

  // Published scan (graph)
  {
    const o = outcomeOf(detail, "graph");
    const v = verificationOf(detail, "graph");
    const ev = v?.dimension === "graph" ? v.evidence : undefined;
    let text = "No scan has been compared with the change yet.";
    if (o) {
      text =
        o.outcome === "passed"
          ? `A scan published after the change agrees with the boundary${ev?.rev ? ` (revision ${ev.rev})` : ""}.`
          : o.outcome === "failed"
            ? "A scan published after the change shows a different state."
            : o.outcome === "overdue"
              ? "No scan has published an agreeing state before the deadline; this is not verified."
              : o.outcome === "awaiting_evidence"
                ? "Waiting for a scan to publish after the change."
                : reasonWords(o.reason) || humanize(o.outcome);
    }
    lines.push({
      key: "graph",
      label: DIMENSION_LABEL.graph,
      help: DIMENSION_HELP.graph,
      result: o ? dimensionResult(o.outcome) : NOT_CHECKED,
      text,
      evidence: ev?.reason ? [humanize(ev.reason)] : [],
      checkedAt: o?.at,
    });
  }

  // Application health
  const hv = verificationOf(detail, "application_health");
  const canary: GovCanaryResult | undefined = hv?.dimension === "application_health" ? hv.evidence.canary : undefined;
  const gates: readonly GovGateResult[] = detail.gate_facts?.gates?.length ? detail.gate_facts.gates : (canary?.gates ?? []);
  {
    const o = outcomeOf(detail, "application_health");
    let text = "No application evidence yet.";
    if (o) {
      text =
        o.outcome === "passed"
          ? "No unexpected denials, no problem reports, and the kept services were seen working."
          : o.outcome === "failed"
            ? "A health check failed: see the gates below."
            : o.outcome === "awaiting_evidence"
              ? "Waiting for evidence from the kept services."
              : o.outcome === "not_applicable"
                ? "Not applicable to this kind of change."
                : reasonWords(o.reason || (hv?.dimension === "application_health" ? hv.evidence.reason : "")) || "Could not be evaluated.";
    }
    lines.push({
      key: "health",
      label: DIMENSION_LABEL.application_health,
      help: DIMENSION_HELP.application_health,
      result: o ? dimensionResult(o.outcome) : NOT_CHECKED,
      text,
      evidence: gateEvidence(gates.filter((g) => g.gate !== "artifact_verified")),
      checkedAt: o?.at,
    });
  }

  // Unexpected denials
  {
    const failures = detail.gate_facts?.unexpected_failures ?? canary?.unexpected_failures ?? [];
    const gate = gates.find((g) => g.gate === "no_unexpected_failures");
    let result: StateView = NOT_CHECKED;
    let text = "No evidence yet.";
    if (failures.length > 0) {
      result = { label: "Denials seen", tone: "danger" };
      text = `${plural(failures.length, "denied call")} no declared test explains.`;
    } else if (gate) {
      result = gate.outcome ? gateOutcome(gate.outcome) : { label: "Not evaluated yet", tone: "neutral" };
      text =
        gate.outcome === "passed"
          ? "None seen in the window."
          : gate.outcome === "not_available"
            ? reasonWords(gate.reason) || "AuthSec cannot tell whether there were denials."
            : gate.outcome === "awaiting_evidence"
              ? reasonWords(gate.reason) || "Waiting for CloudTrail evidence."
              : (reasonWords(gate.reason) || "Not evaluated yet.");
    }
    lines.push({
      key: "denials",
      label: "Unexpected denials",
      help: GATE_WORDS.no_unexpected_failures.checks,
      result,
      text,
      evidence: failures.map(failureLine),
      checkedAt: detail.gate_facts?.checked_at?.application_health,
    });
  }

  // Restriction observed
  {
    const o = outcomeOf(detail, "restriction");
    const rv = verificationOf(detail, "restriction");
    const perService = (rv?.dimension === "restriction" ? rv.evidence.service_restriction : undefined) ?? detail.gate_facts?.service_restriction ?? {};
    let text = "Not checked yet.";
    if (o) {
      if (o.outcome === "passed") {
        text =
          o.attribution === "validation_request"
            ? "Observed: a declared test call to a removed service was denied by the boundary."
            : "Observed: a request to a removed service was denied by the boundary.";
      } else if (o.outcome === "failed") {
        text = "A request that should have been denied was allowed.";
      } else if (o.outcome === "not_applicable") {
        text = "Not applicable: this change removes no service.";
      } else if (o.attribution === "cause_unknown") {
        text = "A request was denied, but AWS did not say the boundary caused it.";
      } else {
        text = reasonWords(o.reason || (rv?.dimension === "restriction" ? rv.evidence.reason : "")) || reasonWords("not_observed");
      }
    }
    lines.push({
      key: "restriction",
      label: DIMENSION_LABEL.restriction,
      help: DIMENSION_HELP.restriction,
      result: o ? dimensionResult(o.outcome) : NOT_CHECKED,
      text,
      evidence: Object.entries(perService).map(([svc, obs]) => `${svc}: ${RESTRICTION_WORDS[obs] ?? humanize(obs)}`),
      checkedAt: o?.at,
    });
  }
  return lines;
}

export const ACCEPTANCE_WORDS: Record<string, string> = {
  evidence_gap: "Evidence gap accepted",
  unanalysed_form: "Unanalysed item accepted",
  gate_not_available: "Gate that could not be evaluated accepted",
};

export const ARTIFACT_STATE_WORDS: Record<string, string> = {
  intended: "Intended: not confirmed in AWS yet",
  present: "Present in AWS",
  removed: "Removed",
  released: "Released: AuthSec no longer changes it",
  drifted: "Drifted: AWS no longer matches",
  lost: "Lost: not found in AWS",
};

export const MIGRATION_STATE_WORDS: Record<string, string> = {
  pending: "Not moved yet",
  moving: "Moving",
  moved: "Moved to its own role",
  incomplete: "Moved, with references still on the old role",
  reverted: "Moved back to the old role",
};
