/**
 * The words of the owner review (SPEC-iga-phase3-policy.md §9.3 S4, §2.9),
 * shared by the owner's page, the approver's panel and the lists. Pure: every
 * sentence is built from fields the review and plan endpoints serve, and says
 * only what those fields establish (a route that remains is "still reachable",
 * never "can no longer be called").
 */

import { format, isValid, parseISO } from "date-fns";

import type {
  GovGrantAgeBasis,
  GovResponseKind,
  GovReviewBlocker,
  GovReviewDelivery,
  GovReviewStatus,
  GovRouteItem,
} from "@/app/api/igaPolicyAuthoringApi";

import { humanize, relTime, type StateView } from "../shared";

/** `iga_gov_owner_review.status`. */
export const REVIEW_STATUS: Record<GovReviewStatus, StateView> = {
  open: { label: "Open", tone: "info", hint: "Owners are being asked. Nothing is deployed by a review." },
  reopened: {
    label: "Reopened",
    tone: "warning",
    hint: "Who or what the change affects changed after owners were asked, so they are asked again.",
  },
  complete: { label: "Complete", tone: "success", hint: "Every owner has responded and nothing blocks the version." },
  excepted: { label: "Excepted by an approver", tone: "warning", hint: "An approver let the version proceed without the missing owners or responses." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "The version was withdrawn or replaced, so this review no longer applies." },
};

export const reviewStatus = (s: string | null | undefined): StateView =>
  (s && REVIEW_STATUS[s as GovReviewStatus]) || { label: humanize(s) || "Unknown", tone: "neutral" };

/** A review still takes answers, reminders and exceptions. */
export const reviewTakesAnswers = (s: string): boolean => s === "open" || s === "reopened" || s === "complete";

export const RESPONSE_LABEL: Record<GovResponseKind, string> = {
  acknowledge: "Looks fine",
  retain: "Keeps a service",
  object: "Says this will break something",
};
export const responseLabel = (r: string | null | undefined): string =>
  r ? RESPONSE_LABEL[r as GovResponseKind] ?? humanize(r) : "No response yet";

export const DELIVERY_LABEL: Record<GovReviewDelivery, { label: string; tone: StateView["tone"] }> = {
  pending: { label: "Not delivered yet", tone: "neutral" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Could not be delivered", tone: "danger" },
};

/** "Fri 3 Oct", in the viewer's time zone. */
export function dayText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "EEE d MMM") : "";
}

/** "Fri 3 Oct, 14:02". */
export function dateTimeText(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "EEE d MMM, HH:mm") : "";
}

/** Due line: the deadline never changes the outcome (silence is not consent). */
export function dueLine(deadline: string, overdue: boolean, closed: boolean): string {
  const day = dayText(deadline);
  if (closed) return `Was due ${day}`;
  return overdue ? `Overdue since ${day} (${relTime(deadline)})` : `Due ${day} (${relTime(deadline)})`;
}

/** A name for a role ARN's last segment. */
export function arnTail(arn: string): string {
  const i = Math.max(arn.lastIndexOf("/"), arn.lastIndexOf(":"));
  return i >= 0 ? arn.slice(i + 1) : arn;
}

const AGE_BASIS: Record<GovGrantAgeBasis, string> = {
  observed_since_change: "AuthSec watched this grant since it was added",
  predates_observation: "it predates AuthSec's first scan",
  unknown: "AuthSec could not tell when it was granted",
};
export const ageBasisText = (b: GovGrantAgeBasis | string): string => AGE_BASIS[b as GovGrantAgeBasis] ?? humanize(b);

const PRINCIPAL: Record<string, string> = {
  role_arn: "names this role",
  role_session: "names this role's sessions",
  wildcard: "allows any principal",
};

/** What a route is, in the owner's words. `who` is the workload or role asked about. */
export function routeQuestion(item: GovRouteItem, who: string): { question: string; note: string } {
  const where = item.resource
    ? `through the resource policy of ${arnTail(item.resource)}`
    : item.form
      ? `through its ${humanize(item.form).toLowerCase()} policies${item.region ? ` in ${item.region}` : ""}`
      : `through resource policies of ${item.service}`;
  const question = `Does ${who} use ${item.service} ${where}?`;
  const principal = item.principal ? PRINCIPAL[item.principal] ?? item.principal : "";
  let note: string;
  switch (item.effect) {
    case "bypass_known":
      note = `${principal ? `It ${principal}; it` : "It"} would stay reachable after the change, because the boundary does not limit it.`;
      break;
    case "limited":
      note = `${principal ? `It ${principal}; the` : "The"} boundary would limit it, so it would stop working for this role.`;
      break;
    case "effect_unknown":
      note = "AuthSec could not tell whether the boundary would limit it.";
      break;
    default:
      note = "AuthSec could not read or analyse these policies.";
  }
  return { question, note };
}

/** One sentence for each reason a review cannot complete (`GovReviewBlocker`). */
export function blockerText(b: GovReviewBlocker): string {
  const who = b.name || "An owner";
  switch (b.kind) {
    case "missing_owner":
      return b.detail || `${who} has no owner who can be asked.`;
    case "owner_not_member":
      return `${who} is no longer an active member of the workspace.`;
    case "no_response":
      return `${who} has not responded.`;
    case "delivery_failed":
      return `${who} could not be reached: the review was not delivered.`;
    case "objection":
      return `${who} objects${b.detail ? `: ${b.detail}` : "."}`;
    case "retained":
      return `${who} keeps ${b.services?.length ? b.services.join(", ") : "a service"}; the version that keeps it is a new version.`;
    case "new_owner":
      return `${who} became an owner after the review opened and has not been asked yet.`;
    case "impact_changed":
      return b.detail || "The plans' impact changed since the owners were asked; the review must be reopened.";
    default:
      return b.detail || humanize(b.kind);
  }
}

/** The R1a scope sentence the brief requires wherever a change is described. */
export const R1A_SCOPE =
  "R1a restricts whole AWS services for the selected roles; it does not narrow actions or resources within kept services.";
