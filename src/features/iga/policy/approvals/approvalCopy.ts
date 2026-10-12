/**
 * The words of the approval panel (SPEC-iga-phase3-policy.md §9.3 S6, §2.8).
 * Pure. Each sentence is built from fields the plans, version and review
 * endpoints serve and claims no more than they establish: a route that remains
 * is "still reachable", an unanalysed form is "not analysed", never "safe".
 */

import type {
  GovAcceptanceItem,
  GovApprovalHashes,
  GovGap,
  GovPlanView,
  GovPlansView,
  GovRoute,
  GovUnanalysedItem,
} from "@/app/api/igaPolicyAuthoringApi";
import { GOV_IMPACT_PLAN_KINDS, govAcceptanceFor, govAcceptanceKey, type GovAcceptanceInput } from "@/app/api/igaPolicyAuthoringApi";

import { humanize, roleNameOf } from "../shared";
import { arnTail } from "../reviews/reviewCopy";

/** The plans an approval binds the impact of: the forward plans. */
export const forwardPlans = (plans: readonly GovPlanView[]): GovPlanView[] => plans.filter((p) => GOV_IMPACT_PLAN_KINDS.includes(p.kind));

/** Plans that undo or recover what a forward plan did. */
export const undoPlans = (plans: readonly GovPlanView[]): GovPlanView[] => plans.filter((p) => !GOV_IMPACT_PLAN_KINDS.includes(p.kind));

/** One required acceptance in the owner's and approver's words: what it is, and why AuthSec cannot decide it. */
export function itemWords(item: GovAcceptanceItem, roleName: string): { title: string; why: string } {
  const on = roleName ? ` on ${roleName}` : "";
  if (item.kind === "unanalysed_form") {
    const d = item.detail as GovUnanalysedItem;
    return {
      title: `Resource policies of the “${d.form || d.key}” form were not analysed${on}`,
      why: d.reason ? humanize(d.reason) : "AuthSec could not tell whether these policies keep a removed service reachable.",
    };
  }
  const g = item.detail as GovGap;
  const where = g.service || g.form || "a service";
  const region = g.region ? ` in ${g.region}` : "";
  switch (g.kind) {
    case "resource_policy_coverage":
      return { title: `Resource policies for ${where}${region} were not fully collected${on}`, why: g.reason ? humanize(g.reason) : "Access through them is not known." };
    case "unanalysed_form":
      return { title: `Resource policies of the “${g.form || g.key}” form were not analysed${on}`, why: g.reason ? humanize(g.reason) : "Access through them is not known." };
    case "policy_unparseable":
      return {
        title: `A policy document could not be read${g.resource ? ` (${arnTail(g.resource)})` : ""}${on}`,
        why: g.reason ? humanize(g.reason) : "What it grants is not known.",
      };
    case "consumers_unresolved":
      return {
        title: `AuthSec could not tell everything that runs as this role${on}${g.count ? ` (${g.count} unresolved)` : ""}`,
        why: g.reason ? humanize(g.reason) : "Some workloads using the role may be missing from the impact.",
      };
    default:
      return { title: `${humanize(g.kind)}${on}`, why: g.reason ? humanize(g.reason) : "" };
  }
}

/** A resource-policy route that remains for a removed service, in words that never claim more than `effect` says. */
export function routeLine(r: GovRoute): string {
  const where = r.resource
    ? `the resource policy of ${arnTail(r.resource)}`
    : r.form
      ? `${humanize(r.form).toLowerCase()} policies${r.region ? ` in ${r.region}` : ""}`
      : "resource policies";
  switch (r.effect) {
    case "bypass_known":
      return `${r.service}: excluded from the role's own policies, but still reachable through ${where}`;
    case "limited":
      return `${r.service}: reachable through ${where}, and the boundary limits it`;
    case "effect_unknown":
      return `${r.service}: AuthSec could not tell whether the boundary limits access through ${where}`;
    default:
      return `${r.service}: ${where} could not be analysed`;
  }
}

/** What an undo or recovery plan does, from the compiler's `diff.case`. */
export function undoLine(p: GovPlanView): string {
  const role = roleNameOf(p.role_arn) || "the role";
  if (p.eligibility === "ineligible") return `${role}: this plan cannot be run as things stand${p.ineligible_reason ? ` (${p.ineligible_reason})` : ""}.`;
  switch (p.diff.case) {
    case "undo_delete_new_boundary":
      return `${role}: removes AuthSec's boundary again; the role had none before.`;
    case "undo_earlier_document":
      return `${role}: returns the boundary to its earlier document.`;
    case "undo_customer_in_place":
      return `${role}: restores your boundary's earlier document.`;
    case "undo_split_copy":
      return `${role}: returns the role to the shared boundary and deletes the copy made for it.`;
    case "role_only_detach":
    case "role_only_new_policy":
    case "role_only_repoint_shared":
      return `${role}: recovers this role only, leaving other roles that share the boundary as they are.`;
    case "remove_detach":
    case "remove_restore_in_place":
    case "remove_repoint_baseline":
      return `${role}: removes AuthSec's control and restores the role's baseline.`;
    case "split_revert":
      return `${role}: puts the role back on the shared role.`;
    default:
      return `${role}: ${humanize(p.diff.case).toLowerCase()}.`;
  }
}

const sorted = (xs: string[]) => [...xs].sort();
const same = (a: string[], b: string[]) => a.length === b.length && sorted(a).every((x, i) => x === sorted(b)[i]);

export const sameHashes = (a: GovApprovalHashes, b: GovApprovalHashes): boolean =>
  a.intent_hash === b.intent_hash && same(a.impact_hashes, b.impact_hashes) && same(a.plan_hashes, b.plan_hashes) && same(a.material_hashes, b.material_hashes);

/** True when the plans an approver is looking at differ from the plans now: any hash, or any item to accept. */
export function plansChanged(shown: GovPlansView, now: GovPlansView): boolean {
  if (!sameHashes(shown.hashes, now.hashes)) return true;
  const key = (i: GovAcceptanceItem) => `${govAcceptanceKey(i)}\u001f${i.item_hash}`;
  return !same(shown.acceptance_items.map(key), now.acceptance_items.map(key));
}

export type AcceptState = Record<string, { on: boolean; reason: string }>;

/** The acceptances given so far: ticked, with a non-blank reason. */
export function acceptancesGiven(items: readonly GovAcceptanceItem[], state: AcceptState): GovAcceptanceInput[] {
  return items.flatMap((i) => {
    const s = state[govAcceptanceKey(i)];
    return s?.on && s.reason.trim() !== "" ? [govAcceptanceFor(i, s.reason)] : [];
  });
}
