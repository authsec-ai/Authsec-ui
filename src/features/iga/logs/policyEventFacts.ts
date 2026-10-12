/**
 * What a recorded policy event says about itself, read defensively. The
 * backend's `payload` is free-form per event name
 * (services/iga_gov_event_vocabulary.go `appendGovEvent`), so a screen reads
 * only the keys it knows and never assumes one is there. Pure.
 */

import type { GovEventView } from "@/app/api/igaPolicyReadsApi";
import { humanize, shortHash } from "@/features/iga/policy/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string | null | undefined): s is string {
  return !!s && UUID.test(s);
}

function payloadString(e: GovEventView, key: string): string | null {
  const v = e.payload?.[key];
  return typeof v === "string" && v ? v : null;
}

function payloadUuid(e: GovEventView, key: string): string | null {
  const v = payloadString(e, key);
  return isUuid(v) ? v : null;
}

/** The AWS request id of a mutating call's answer (`attempt.completed`), when the event carries one. */
export function requestIdOf(e: GovEventView): string | null {
  return payloadString(e, "request_id");
}

/** The reason a person gave (pause, resume, archive, settings, rollout), when there is one. */
export function reasonOf(e: GovEventView): string | null {
  return payloadString(e, "reason");
}

export interface EventLink {
  key: string;
  label: string;
  to: string;
}

/**
 * Where each object an event names can be opened in Policy. Only objects with
 * an id the event actually carries get a link; the routes are the Policy route
 * map (policy detail, deployment detail, review, findings drawer).
 */
export function eventLinks(e: GovEventView): EventLink[] {
  const links: EventLink[] = [];
  if (e.policy_id) links.push({ key: "policy", label: "Policy", to: `/iga/policy/policies/${e.policy_id}` });
  if (e.version_id && e.policy_id) {
    const no = e.payload?.version_no;
    links.push({
      key: "version",
      label: typeof no === "number" ? `Version ${no}` : "Version",
      to: `/iga/policy/policies/${e.policy_id}/versions`,
    });
  }
  const deployment = e.deployment_id ?? payloadUuid(e, "deployment_id");
  if (deployment) links.push({ key: "deployment", label: "Deployment", to: `/iga/policy/deployments/${deployment}` });
  const review = payloadUuid(e, "review_id");
  if (review) links.push({ key: "review", label: "Review", to: `/iga/policy/reviews/${review}` });
  if (e.finding_id) links.push({ key: "finding", label: "Finding", to: `/iga/policy/findings?finding=${e.finding_id}` });
  return links;
}

export const ACTOR_KIND_LABEL: Record<string, string> = {
  user: "Person",
  system: "System",
  slack_user: "Slack user",
  aws: "AWS",
};

/** "Person 5a855078…" / "System · rollout" / "Slack user …" / "AWS". The full id is in the drawer. */
export function actorLine(e: GovEventView): string {
  const kind = ACTOR_KIND_LABEL[e.actor_kind] ?? humanize(e.actor_kind);
  if (!e.actor_id) return kind;
  return e.actor_kind === "system" ? `${kind} · ${e.actor_id}` : `${kind} ${shortHash(e.actor_id, 8)}`;
}

/** True when a payload value, at any depth, was replaced by the server's redaction marker. */
export function hasRedaction(value: unknown): boolean {
  if (value === "[redacted]") return true;
  if (Array.isArray(value)) return value.some(hasRedaction);
  if (value && typeof value === "object") return Object.values(value).some(hasRedaction);
  return false;
}

/** The payload's top-level scalar entries, for the drawer's fact list. Objects and arrays stay in the collapsed payload. */
export function scalarFacts(payload: Record<string, unknown> | null | undefined): { key: string; value: string | number | boolean; redacted: boolean }[] {
  if (!payload) return [];
  const out: { key: string; value: string | number | boolean; redacted: boolean }[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out.push({ key, value, redacted: value === "[redacted]" });
    }
  }
  return out;
}
