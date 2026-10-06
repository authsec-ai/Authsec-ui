/**
 * Every row in History carries a TYPE, so the feed can be scanned without
 * reading each sentence, and a GROUP, so it can be filtered to the kind of
 * change a reader is hunting for.
 *
 * Both are derived from `ChangeEvent.event`, which is the backend's own
 * vocabulary — nothing here invents a category the server did not report. The
 * one piece of judgement is the broad-access call-out: a grant whose actions or
 * targets contain `*` is still a `grant_started` to the API, but it is the row a
 * reviewer is actually hunting for, so it is named and shown in the danger tone
 * instead of sitting among the ordinary permissions. That is a presentation
 * decision about a fact the event already carries, not a new claim.
 *
 * `label` is plain language per the terminology rule — "Access granted", not
 * "grant_started". The API field names are untouched.
 */

import type { ChangeEvent, ChangeKind } from "@/app/api/igaGraphApi";
import type { ConsoleTone } from "@/components/console/status";

export interface EventType {
  label: string;
  tone: ConsoleTone;
}

const BY_KIND: Record<ChangeKind, EventType> = {
  first_seen: { label: "First seen", tone: "info" },
  retired: { label: "No longer present", tone: "neutral" },
  restored: { label: "Seen again", tone: "success" },
  relationship_started: { label: "Identity linked", tone: "neutral" },
  relationship_ended: { label: "Identity unlinked", tone: "neutral" },
  policy_attached: { label: "Policy attached", tone: "neutral" },
  policy_detached: { label: "Policy detached", tone: "neutral" },
  grant_started: { label: "Access granted", tone: "neutral" },
  grant_ended: { label: "Access ended", tone: "neutral" },
  statement_revised: { label: "Statement revised", tone: "neutral" },
  statement_replaced: { label: "Statement replaced", tone: "neutral" },
  coverage_changed: { label: "Scan coverage", tone: "neutral" },
};

/** What a History filter selects. `coverage` has no filter: it is its own feed. */
export type EventGroup = "access" | "identity" | "lifecycle" | "coverage";

export const EVENT_GROUP_LABEL: Record<Exclude<EventGroup, "coverage">, string> = {
  access: "Access",
  identity: "Identity",
  lifecycle: "Lifecycle",
};

const GROUP_OF: Record<ChangeKind, EventGroup> = {
  first_seen: "lifecycle",
  retired: "lifecycle",
  restored: "lifecycle",
  relationship_started: "identity",
  relationship_ended: "identity",
  policy_attached: "access",
  policy_detached: "access",
  grant_started: "access",
  grant_ended: "access",
  statement_revised: "access",
  statement_replaced: "access",
  coverage_changed: "coverage",
};

export function eventGroupOf(e: Pick<ChangeEvent, "event">): EventGroup {
  return GROUP_OF[e.event] ?? "lifecycle";
}

/** A `*` anywhere in what the grant allows, or in what it allows it on. */
function isWildcardGrant(e: ChangeEvent): boolean {
  if (e.event !== "grant_started") return false;
  const d = e.detail;
  const actions = [...(d.actions ?? []), ...(d.not_actions ?? [])];
  if (actions.some((a) => a.includes("*"))) return true;
  // A target ref has no readable shape to test, so the label the event itself
  // carries for it is what gets checked — the same string the sentence shows.
  return (d.targets ?? []).some((t) => (e.labels[t] ?? t).includes("*"));
}

export function eventTypeOf(e: ChangeEvent): EventType {
  if (isWildcardGrant(e)) return { label: "Broad access granted", tone: "danger" };
  return BY_KIND[e.event] ?? { label: "Change", tone: "neutral" };
}
