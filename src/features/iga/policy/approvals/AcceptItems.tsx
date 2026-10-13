/**
 * The items an approver must accept one by one (SPEC-iga-phase3-policy.md
 * §2.8, §9.3 S6): each unanalysed resource-policy form and each evidence gap is
 * its own checkbox with its own required reason, recorded as its own
 * acceptance bound to the approval, the plan and the evidence. There is no
 * "accept all": accepting says the approver knows AuthSec could not verify that
 * item and wants the change to proceed anyway.
 */

import { govAcceptanceKey, type GovPlansView } from "@/app/api/igaPolicyAuthoringApi";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Meta } from "@/features/iga/shared/components/Panel";

import { roleNameOf } from "../shared";
import { acceptancesGiven, itemWords, type AcceptState } from "./approvalCopy";
import { Block } from "./ApprovalSections";

export function AcceptItems({
  plans,
  state,
  onChange,
  disabled,
}: {
  plans: GovPlansView;
  state: AcceptState;
  onChange: (next: AcceptState) => void;
  disabled?: boolean;
}) {
  const items = plans.acceptance_items;
  if (items.length === 0) return null;
  const roleOf = (planId: string, roleId: string) => {
    const p = plans.plans.find((x) => x.id === planId);
    return p ? roleNameOf(p.role_arn) : roleId;
  };
  const accepted = acceptancesGiven(items, state).length;

  return (
    <Block title={`Accept ${items.length === 1 ? "this item" : `these ${items.length} items`} before you approve`}>
      <Meta>
        AuthSec could not verify {items.length === 1 ? "this" : "these"}. Accept each one separately, with your reason; {accepted} of {items.length} accepted.
      </Meta>
      <ul className="space-y-3">
        {items.map((item, n) => {
          const key = govAcceptanceKey(item);
          const s = state[key] ?? { on: false, reason: "" };
          const words = itemWords(item, roleOf(item.plan_id, item.role_id));
          const id = `accept-${n}`;
          return (
            <li key={key} className="space-y-1.5 rounded-md border border-(--color-border-subtle) p-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id={id}
                  checked={s.on}
                  disabled={disabled}
                  onCheckedChange={(v) => onChange({ ...state, [key]: { on: v === true, reason: s.reason } })}
                  className="mt-0.5"
                />
                <label htmlFor={id} className="text-[13px] leading-5 text-(--color-text)">
                  <span className="font-medium">{words.title}</span>
                  <span className="block text-xs text-(--color-text-muted)">{words.why}</span>
                  <span className="block text-xs font-medium text-(--color-text)">Accept to continue</span>
                </label>
              </div>
              {s.on ? (
                <label className="block pl-7 text-xs text-(--color-text-muted)">
                  Reason (required)
                  <Input
                    value={s.reason}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...state, [key]: { on: true, reason: e.target.value } })}
                    placeholder="Why the change is safe to proceed despite this"
                    className="mt-1"
                  />
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Block>
  );
}
