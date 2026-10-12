/**
 * Pure helpers over a policy version's intent (igagov/intent.go, SPEC-iga-phase3
 * §2.7). The New-policy flow edits a right-size intent with these, and the
 * Policies detail "Edit version" dialog can reuse them: every function returns a
 * NEW intent and never mutates its argument. Nothing here calls the server;
 * `POST /policies/:id/versions` (createGovVersion) takes the result.
 *
 * Exports
 *   isRightSize(intent)                      narrows a stored intent to `right_size_services`
 *   removedServicesOf(intent)                services the intent removes, sorted and unique
 *   retainedServicesOf(intent)               services it keeps, sorted and unique
 *   ownerRetainsOf(intent)                   the keeps a person chose (basis `owner`: reason + review date)
 *   withRetained(intent, services, keep)     move removed services to `retain` with basis `owner`
 *                                            (what an owner's "retain" does server-side, RetainVersionTx)
 *   restorableServices(intent, baseline)     owner-kept services that `baseline` (version 1) removed
 *   withRemoved(intent, baseline, services)  undo a keep: restore the baseline's removal entry
 *   withObservationDays(intent, days)        1..90
 *   withCanary(intent, { target?, hours? })  rollout.canary_target (a subject's role id) / canary_hours 1..336
 *   withDelivery(intent, delivery)           direct | iac_pr | export
 *   intentEquals(a, b)                       key-order independent equality
 *   intentProblems(intent)                   the rules that need no evidence (ValidateIntent mirror)
 *   excludeOnlyDocument(services)            the R1a boundary document AuthSec writes for those services
 *   reviewByProblem(date, today?)            why a review date is not acceptable, or null
 *   OBSERVATION_DAYS / CANARY_HOURS          the ranges
 *
 * The server stays the judge: compile re-justifies every removal from fresh
 * evidence (justifyRemovals, compile.go:1469); these helpers only stop the
 * author from sending what ValidateIntent would refuse.
 */

import type { GovDelivery, GovIntent, GovRemoveEntry, GovRetainEntry, GovRightSizeIntent } from "@/app/api/igaPolicyAuthoringApi";

/** igagov/intent.go:54-57 (055 iga_gov_settings CHECKs). */
export const OBSERVATION_DAYS = { min: 1, max: 90 } as const;
export const CANARY_HOURS = { min: 1, max: 336 } as const;

export function isRightSize(intent: GovIntent | null | undefined): intent is GovRightSizeIntent {
  return !!intent && intent.kind === "right_size_services";
}

const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort();

export function removedServicesOf(intent: GovIntent | null | undefined): string[] {
  return isRightSize(intent) ? sortedUnique(intent.remove.map((r) => r.service)) : [];
}

export function retainedServicesOf(intent: GovIntent | null | undefined): string[] {
  return isRightSize(intent) ? sortedUnique(intent.retain.map((r) => r.service)) : [];
}

export function ownerRetainsOf(intent: GovIntent | null | undefined): GovRetainEntry[] {
  return isRightSize(intent) ? intent.retain.filter((r) => r.basis === "owner") : [];
}

const byService = <T extends { service: string }>(a: T, b: T) => (a.service < b.service ? -1 : a.service > b.service ? 1 : 0);

/**
 * Keeps `services` instead of removing them, each with the reason and the
 * review date an owner keep needs (intent.go:300-307). A service the intent
 * does not remove is left alone.
 */
export function withRetained(
  intent: GovRightSizeIntent,
  services: readonly string[],
  keep: { reason: string; review_by: string },
): GovRightSizeIntent {
  const move = new Set(services.filter((s) => intent.remove.some((r) => r.service === s)));
  if (move.size === 0) return intent;
  const retain: GovRetainEntry[] = [
    ...intent.retain.filter((r) => !move.has(r.service)),
    ...[...move].map((service) => ({ service, basis: "owner" as const, reason: keep.reason.trim(), review_by: keep.review_by })),
  ].sort(byService);
  return { ...intent, retain, remove: intent.remove.filter((r) => !move.has(r.service)) };
}

/** Owner-kept services that `baseline` removed: the ones "Remove again" can restore. */
export function restorableServices(intent: GovRightSizeIntent, baseline: GovRightSizeIntent | null | undefined): string[] {
  if (!baseline) return [];
  const was = new Set(baseline.remove.map((r) => r.service));
  return sortedUnique(intent.retain.filter((r) => r.basis === "owner" && was.has(r.service)).map((r) => r.service));
}

/** Undoes a keep: the baseline's removal entry returns and the owner keep goes. */
export function withRemoved(
  intent: GovRightSizeIntent,
  baseline: GovRightSizeIntent | null | undefined,
  services: readonly string[],
): GovRightSizeIntent {
  const can = new Set(restorableServices(intent, baseline).filter((s) => services.includes(s)));
  if (!baseline || can.size === 0) return intent;
  const back: GovRemoveEntry[] = baseline.remove.filter((r) => can.has(r.service));
  return {
    ...intent,
    retain: intent.retain.filter((r) => !can.has(r.service)),
    remove: [...intent.remove, ...back].sort(byService),
  };
}

export function withObservationDays(intent: GovRightSizeIntent, days: number): GovRightSizeIntent {
  return { ...intent, observation_days: days };
}

/** `target` is a subject's `role_id`; `undefined` leaves a member as it is, `null` clears it. */
export function withCanary(
  intent: GovRightSizeIntent,
  change: { target?: string | null; hours?: number | null },
): GovRightSizeIntent {
  const cur = intent.rollout ?? {};
  const next = { ...cur };
  if (change.target !== undefined) {
    if (change.target === null) delete next.canary_target;
    else next.canary_target = change.target;
  }
  if (change.hours !== undefined) {
    if (change.hours === null) delete next.canary_hours;
    else next.canary_hours = change.hours;
  }
  const out: GovRightSizeIntent = { ...intent };
  if (Object.keys(next).length > 0) out.rollout = next;
  else delete out.rollout;
  return out;
}

export function withDelivery(intent: GovRightSizeIntent, delivery: GovDelivery): GovRightSizeIntent {
  return { ...intent, delivery };
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Equal as JSON, whatever the key order. */
export function intentEquals(a: GovIntent | null | undefined, b: GovIntent | null | undefined): boolean {
  return stable(a ?? null) === stable(b ?? null);
}

/** `YYYY-MM-DD`, the date an owner keep is reviewed by. */
export function reviewByProblem(date: string, today: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Choose a review date.";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "Choose a valid review date.";
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (d <= start) return "The review date must be in the future.";
  return null;
}

export interface IntentProblem {
  /** The intent field, as the server names it (`remove`, `observation_days`, `retain[1].reason`). */
  field: string;
  message: string;
}

/** What ValidateIntent (intent.go:262) would refuse without any evidence. An empty list means "send it". */
export function intentProblems(intent: GovRightSizeIntent): IntentProblem[] {
  const out: IntentProblem[] = [];
  if (intent.remove.length === 0) {
    out.push({ field: "remove", message: "Remove at least one service. A policy that removes nothing has nothing to propose." });
  }
  if (!Number.isInteger(intent.observation_days) || intent.observation_days < OBSERVATION_DAYS.min || intent.observation_days > OBSERVATION_DAYS.max) {
    out.push({ field: "observation_days", message: `Observe for ${OBSERVATION_DAYS.min} to ${OBSERVATION_DAYS.max} days.` });
  }
  const r = intent.rollout;
  if (r?.canary_target && !intent.subjects.some((s) => s.role_id === r.canary_target)) {
    out.push({ field: "rollout.canary_target", message: "The canary must be one of the selected roles." });
  }
  if (r?.canary_hours !== undefined && (!Number.isInteger(r.canary_hours) || r.canary_hours < CANARY_HOURS.min || r.canary_hours > CANARY_HOURS.max)) {
    out.push({ field: "rollout.canary_hours", message: `The canary window is ${CANARY_HOURS.min} to ${CANARY_HOURS.max} hours.` });
  }
  intent.retain.forEach((e, i) => {
    if (e.basis !== "owner") return;
    if (!e.reason?.trim()) out.push({ field: `retain[${i}].reason`, message: `Say why ${e.service} is kept.` });
    const why = e.review_by ? reviewByProblem(e.review_by.slice(0, 10)) : "Choose a review date.";
    if (why) out.push({ field: `retain[${i}].review_by`, message: `${e.service}: ${why}` });
  });
  return out;
}

/**
 * The document AuthSec writes for a role that has no boundary: one Allow with
 * NotAction of the removed services on "*" (compile.go:419 ExcludeOnlyDocument,
 * §3.2), so everything not selected stays allowed. For a role that already has
 * a boundary the compiled plan says exactly how it is replaced, copied or left
 * alone; this is the shape of the change, not that plan.
 */
export function excludeOnlyDocument(services: readonly string[]): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "AuthSecAllowAllExceptRemoved",
        Effect: "Allow",
        NotAction: sortedUnique(services.map((s) => `${s.trim().toLowerCase()}:*`)),
        Resource: "*",
      },
    ],
  };
}
