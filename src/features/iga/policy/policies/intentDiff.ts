/**
 * Reading and comparing a version's intent (SPEC-iga-phase3-policy.md §9.3 S5
 * Versions). Pure. Only `right_size_services` has fields worth a line-by-line
 * diff; another kind is reported as a different kind of change.
 *
 * R1a restricts whole AWS services for the selected roles. It does not narrow
 * actions or resources inside a kept service, so a diff never says it does.
 */

import type { GovIntent, GovRetainEntry } from "@/app/api/igaPolicyAuthoringApi";

import { delivery, humanize, serviceList } from "../shared";
import { isRightSize, removedServicesOf } from "../new/intentEdit";

/** Why a service is kept, in words. */
export function retainReason(r: GovRetainEntry): string {
  switch (r.basis) {
    case "observed":
      return r.last_attempt ? `Used: last call ${r.last_attempt.slice(0, 10)}` : "Used recently";
    case "dependency":
      return `Needed by ${r.catalog ?? "a dependency"}`;
    case "owner":
      return `${r.reason ?? "Kept by an owner"}${r.review_by ? ` · review by ${r.review_by.slice(0, 10)}` : ""}`;
    case "unreviewed":
      return "Not reviewed";
    default:
      return humanize(r.basis);
  }
}

/** One line of the intent, for a version's summary. */
export function intentLines(i: GovIntent): string[] {
  if (!isRightSize(i)) {
    return [i.kind === "remove_control" ? "Removes AuthSec's control from the selected roles" : "Moves a workload to a dedicated identity"];
  }
  const out = [
    `Removes ${serviceList(removedServicesOf(i), 8)}`,
    `Keeps ${serviceList(i.retain.map((r) => r.service), 8)}`,
    `${i.subjects.length === 1 ? "1 role" : `${i.subjects.length} roles`} · observe ${i.observation_days} ${i.observation_days === 1 ? "day" : "days"}`,
    `Canary ${i.rollout?.canary_hours ? `${i.rollout.canary_hours} h` : "default window"} · ${delivery(i.delivery)}`,
  ];
  return out;
}

export interface IntentChange {
  kind: "added" | "removed" | "changed";
  text: string;
}

/** What `to` does differently from `from`, one readable line each. Empty when they are the same. */
export function diffIntents(from: GovIntent, to: GovIntent): IntentChange[] {
  if (!isRightSize(from) || !isRightSize(to)) {
    return from.kind === to.kind ? [] : [{ kind: "changed", text: `Kind of change: ${humanize(from.kind)} to ${humanize(to.kind)}` }];
  }
  const out: IntentChange[] = [];

  const fr = new Set(removedServicesOf(from));
  const tr = new Set(removedServicesOf(to));
  for (const s of tr) if (!fr.has(s)) out.push({ kind: "added", text: `Now removes ${s}` });
  for (const s of fr) if (!tr.has(s)) out.push({ kind: "removed", text: `No longer removes ${s}` });

  const fk = new Map(from.retain.map((r) => [r.service, r]));
  const tk = new Map(to.retain.map((r) => [r.service, r]));
  for (const [s, r] of tk) {
    const was = fk.get(s);
    if (!was) out.push({ kind: "added", text: `Now keeps ${s}: ${retainReason(r)}` });
    else if (retainReason(was) !== retainReason(r)) out.push({ kind: "changed", text: `${s} kept: ${retainReason(was)} → ${retainReason(r)}` });
  }
  for (const s of fk.keys()) if (!tk.has(s)) out.push({ kind: "removed", text: `No longer keeps ${s}` });

  const froles = new Set(from.subjects.map((x) => x.role_id));
  const troles = new Set(to.subjects.map((x) => x.role_id));
  const added = [...troles].filter((r) => !froles.has(r)).length;
  const dropped = [...froles].filter((r) => !troles.has(r)).length;
  if (added) out.push({ kind: "added", text: `${added} more ${added === 1 ? "role" : "roles"}` });
  if (dropped) out.push({ kind: "removed", text: `${dropped} fewer ${dropped === 1 ? "role" : "roles"}` });

  if (from.observation_days !== to.observation_days) {
    out.push({ kind: "changed", text: `Observation window: ${from.observation_days} → ${to.observation_days} days` });
  }
  if ((from.rollout?.canary_hours ?? 0) !== (to.rollout?.canary_hours ?? 0)) {
    out.push({ kind: "changed", text: `Canary window: ${from.rollout?.canary_hours ?? "default"} → ${to.rollout?.canary_hours ?? "default"} hours` });
  }
  if ((from.rollout?.canary_target ?? "") !== (to.rollout?.canary_target ?? "")) {
    out.push({ kind: "changed", text: "Canary role changed" });
  }
  if (from.delivery !== to.delivery) {
    out.push({ kind: "changed", text: `Delivery: ${delivery(from.delivery)} → ${delivery(to.delivery)}` });
  }
  if (from.evidence_rev !== to.evidence_rev) {
    out.push({ kind: "changed", text: `Evidence revision: ${from.evidence_rev} → ${to.evidence_rev}` });
  }
  return out;
}
