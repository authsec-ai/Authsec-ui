/**
 * An object's lifecycle as the header says it: the state AND since when
 * (SPEC-console-revamp.md *Detail header*). `stale` is not `ended` and missing
 * evidence is not proof of absence, so each state has its own words.
 *
 * "Stale since" is the earliest `since` among the surfaces that did not
 * reconfirm the object; when none is stated, the last confirmation is what is
 * known and it is said as that. A retired object carries no end timestamp in
 * the detail contract, so it reads "last confirmed", never an invented date.
 */

import type { GraphCoverageGap, Lifecycle, RelState, StaleReason } from "@/app/api/igaGraphApi";
import type { ConsoleTone } from "@/components/console/status";

import { INCOMPLETE_STATES, agoText, dayText } from "./labels";

export interface LifecycleView {
  state: "current" | "stale" | "retired";
  /** "Stale", "Not in the latest scan", "Current". */
  label: string;
  /** "since 3 Oct 2026", "last confirmed 3 Oct 2026". */
  since: string;
  tone: ConsoleTone;
}

export function lifecycleView(o: {
  lifecycle: Lifecycle;
  state: RelState;
  stale_reason?: StaleReason[];
  last_confirmed_at: string | null;
}): LifecycleView {
  if (o.lifecycle === "retired") {
    return { state: "retired", label: "Not in the latest scan", since: `last confirmed ${dayText(o.last_confirmed_at)}`, tone: "neutral" };
  }
  if (o.state === "stale") {
    const since = (o.stale_reason ?? [])
      .map((r) => r.since)
      .filter((s): s is string => !!s)
      .sort()[0];
    return {
      state: "stale",
      label: "Stale",
      since: since ? `since ${dayText(since)}` : `last confirmed ${dayText(o.last_confirmed_at)}`,
      tone: "warning",
    };
  }
  return { state: "current", label: "Current", since: `confirmed ${agoText(o.last_confirmed_at)}`, tone: "neutral" };
}

/**
 * "Coverage partial" for an account — said on the account, where it answers
 * "is this complete?", and not on every object. `gaps` is the detail's
 * `meta.coverage`; revoked is a decision, not a gap (see INCOMPLETE_STATES).
 */
export function accountCoverageNote(gaps: GraphCoverageGap[] | undefined, accountId: string | null | undefined): string | null {
  if (!accountId) return null;
  return (gaps ?? []).some((g) => g.account_id === accountId && INCOMPLETE_STATES.has(g.state)) ? "Coverage partial" : null;
}
