/**
 * Policy › Setup › Finding rules (SPEC-iga-phase3-policy.md §7.1, §2.5): the
 * workspace's rules the evaluator reads at every publication. Two kinds exist:
 * *require a review date* (raises "missing review date" for a class of workload
 * whose accountable owner has none) and *unused window* (how many days without
 * use make a service "unused" for that class). A rule changes nothing until the
 * next evaluation, and its scope limits it to the runtimes, stages and
 * classifications chosen (none chosen = all). Rules are `governance:author`;
 * the list is cursor-paged by the server, so a "load more" follows `next_cursor`.
 */

import { useState } from "react";

import {
  GOV_RULE_CLASSIFICATIONS,
  GOV_RULE_RUNTIME_KINDS,
  GOV_RULE_STAGES,
  GOV_RULE_WINDOW_DAYS,
  useCreateGovFindingRuleMutation,
  useDeleteGovFindingRuleMutation,
  useListGovFindingRulesQuery,
  useUpdateGovFindingRuleMutation,
  type GovFindingRuleBody,
  type GovFindingRuleKind,
  type GovFindingRuleScope,
  type GovFindingRuleView,
} from "@/app/api/igaPolicyFindingRulesApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyActionError, PolicyLoadFailure, classifyPolicyError, humanize, usePolicyAction, usePolicyPermission } from "../shared";
import { ActionDialog } from "./ActionDialog";

const KINDS: Record<GovFindingRuleKind, { label: string; words: string }> = {
  require_review_date: {
    label: "Require a review date",
    words: "Raises “missing review date” for a workload whose accountable owner has no review date.",
  },
  unused_window: {
    label: "Unused window",
    words: "How many days without use make a service unused for these workloads.",
  },
};

const STAGE_LABEL: Record<string, string> = { production: "Production", non_production: "Non-production", unknown: "Unknown stage" };
const RUNTIME_LABEL: Record<string, string> = {
  lambda_function: "Lambda function",
  ecs_task_definition: "ECS task definition",
  ec2_instance: "EC2 instance",
  bedrock_agent: "Bedrock agent",
  bedrock_agentcore_runtime: "Bedrock AgentCore runtime",
  bedrock_agentcore_gateway: "Bedrock AgentCore gateway",
};
const CLASS_LABEL: Record<string, string> = {
  unclassified: "Unclassified",
  provider_native_agent: "Provider-native agent",
  classified_agent: "Classified agent",
};

function scopeWords(s: GovFindingRuleScope | null): string {
  const parts = [
    ...(s?.runtime_kinds ?? []).map((k) => RUNTIME_LABEL[k] ?? humanize(k)),
    ...(s?.stages ?? []).map((k) => STAGE_LABEL[k] ?? humanize(k)),
    ...(s?.classifications ?? []).map((k) => CLASS_LABEL[k] ?? humanize(k)),
  ];
  return parts.length === 0 ? "Every workload" : parts.join(" · ");
}

function kindLabel(kind: string): string {
  return KINDS[kind as GovFindingRuleKind]?.label ?? humanize(kind);
}

function ruleTitle(r: GovFindingRuleView): string {
  return r.kind === "unused_window" && r.params?.window_days ? `${kindLabel(r.kind)}: ${r.params.window_days} days` : kindLabel(r.kind);
}

function CheckList({ legend, options, labels, value, onChange }: { legend: string; options: readonly string[]; labels: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-[13px] font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={value.includes(o)} onCheckedChange={(c) => onChange(c === true ? [...value, o] : value.filter((x) => x !== o))} />
            {labels[o] ?? humanize(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AddRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [create] = useCreateGovFindingRuleMutation();
  const action = usePolicyAction("governance:author");
  const [kind, setKind] = useState<GovFindingRuleKind>("require_review_date");
  const [days, setDays] = useState("180");
  const [kinds, setKinds] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);

  const n = /^\d+$/.test(days.trim()) ? Number(days.trim()) : null;
  const daysOk = kind !== "unused_window" || (n !== null && n >= GOV_RULE_WINDOW_DAYS.min && n <= GOV_RULE_WINDOW_DAYS.max);

  async function save() {
    const scope: GovFindingRuleScope = {};
    if (kinds.length) scope.runtime_kinds = kinds;
    if (stages.length) scope.stages = stages;
    if (classes.length) scope.classifications = classes;
    const body: GovFindingRuleBody = { kind, scope, ...(kind === "unused_window" && n !== null ? { params: { window_days: n } } : {}) };
    const res = await action.run(() => create(body));
    if (res) {
      onOpenChange(false);
      setKinds([]);
      setStages([]);
      setClasses([]);
    }
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a finding rule"
      description="The rule is read at the next scan evaluation. It does not change findings that already exist until then."
      confirmLabel="Add rule"
      busyLabel="Adding…"
      pending={action.pending}
      failure={action.failure}
      confirmDisabled={!daysOk}
      onConfirm={() => void save()}
      wide
    >
      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">What the rule does</legend>
        {(Object.keys(KINDS) as GovFindingRuleKind[]).map((k) => (
          <label key={k} className="flex items-start gap-2 text-[13px]">
            <input type="radio" name="rule-kind" className="mt-1" checked={kind === k} onChange={() => setKind(k)} />
            <span>
              <span className="font-medium">{KINDS[k].label}</span>
              <span className="block text-xs text-(--color-text-muted)">{KINDS[k].words}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {kind === "unused_window" ? (
        <div className="space-y-1">
          <label className="block text-[13px] font-medium" htmlFor="rule-window-days">
            Days without use
          </label>
          <Input id="rule-window-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="w-32" />
          {!daysOk ? (
            <p className="text-xs text-(--color-danger-text)">
              Between {GOV_RULE_WINDOW_DAYS.min} and {GOV_RULE_WINDOW_DAYS.max}.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-(--color-text-muted)">Limit the rule to some workloads, or leave everything unchosen for all.</p>
      <CheckList legend="Stage" options={GOV_RULE_STAGES} labels={STAGE_LABEL} value={stages} onChange={setStages} />
      <CheckList legend="Classification" options={GOV_RULE_CLASSIFICATIONS} labels={CLASS_LABEL} value={classes} onChange={setClasses} />
      <CheckList legend="Runtime" options={GOV_RULE_RUNTIME_KINDS} labels={RUNTIME_LABEL} value={kinds} onChange={setKinds} />
    </ActionDialog>
  );
}

function RuleRow({ rule, canChange, onRemove }: { rule: GovFindingRuleView; canChange: boolean; onRemove: (r: GovFindingRuleView) => void }) {
  const [update] = useUpdateGovFindingRuleMutation();
  const action = usePolicyAction("governance:author");
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-(--color-text)">{ruleTitle(rule)}</p>
          <p className="text-xs text-(--color-text-muted)">{scopeWords(rule.scope)}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "On" : "Off"}</StatusBadge>
          {canChange ? (
            <>
              <Switch
                aria-label={`${rule.enabled ? "Turn off" : "Turn on"} ${ruleTitle(rule)}`}
                checked={rule.enabled}
                disabled={action.pending}
                onCheckedChange={(enabled) => void action.run(() => update({ id: rule.id, enabled }))}
              />
              <Button variant="outline" onClick={() => onRemove(rule)}>
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <PolicyActionError failure={action.failure} />
    </li>
  );
}

export default function FindingRulesSection() {
  const ws = getWorkspaceId() ?? "";
  const author = usePolicyPermission("governance:author");
  const [paging, setPaging] = useState<{ ws: string; stack: string[] }>({ ws, stack: [] });
  const stack = paging.ws === ws ? paging.stack : [];
  const rules = useListGovFindingRulesQuery({ ws, limit: 25, cursor: stack.at(-1) });
  const [del] = useDeleteGovFindingRuleMutation();
  const delAction = usePolicyAction("governance:author");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GovFindingRuleView | null>(null);
  const failure = classifyPolicyError(rules.error);
  const rows = rules.currentData?.data ?? [];
  const canChange = author.offered;

  async function remove() {
    if (!removing) return;
    const res = await delAction.run(() => del({ id: removing.id }));
    if (res) setRemoving(null);
  }

  return (
    <Panel
      title="Finding rules"
      description="Rules the evaluator applies at every scan. They change findings at the next evaluation, not immediately."
      actions={
        canChange ? (
          <Button onClick={() => setAdding(true)}>Add a rule…</Button>
        ) : undefined
      }
      flush
    >
      {rules.isFetching && !rules.currentData ? (
        <p role="status" className="px-4 py-3 text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !rules.currentData ? (
        <div className="px-4 py-3">
          {failure.kind === "forbidden" ? (
            <p className="text-[13px] text-(--color-text-muted)">Your role cannot see finding rules. They are for people who can author policy.</p>
          ) : (
            <PolicyLoadFailure failure={failure} subject="the finding rules" onRetry={() => void rules.refetch()} />
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-1 px-4 py-3 text-[13px]">
          <p className="font-medium text-(--color-text)">No finding rules.</p>
          <p className="text-(--color-text-muted)">Findings use the default window and do not require owners to have a review date.</p>
        </div>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {rows.map((r) => (
            <RuleRow key={r.id} rule={r} canChange={canChange} onRemove={setRemoving} />
          ))}
        </ul>
      )}
      {rules.currentData ? (
        <CursorPager meta={{ limit: 25, next_cursor: rules.currentData.meta.next_cursor ?? null }}
          pageIndex={stack.length} rowsOnPage={rows.length}
          onPrev={() => setPaging({ ws, stack: stack.slice(0, -1) })}
          onNext={(cursor) => setPaging({ ws, stack: [...stack, cursor] })} />
      ) : stack.length > 0 ? (
        <Button variant="outline" className="m-3" onClick={() => setPaging({ ws, stack: stack.slice(0, -1) })}>Previous page</Button>
      ) : null}
      <AddRuleDialog open={adding} onOpenChange={setAdding} />
      <ActionDialog
        open={!!removing}
        onOpenChange={(o) => (o ? undefined : setRemoving(null))}
        title="Delete this rule?"
        description={removing ? `${ruleTitle(removing)} stops applying at the next evaluation. Findings it raised are not removed until then.` : ""}
        confirmLabel="Delete rule"
        busyLabel="Deleting…"
        destructive
        pending={delAction.pending}
        failure={delAction.failure}
        onConfirm={() => void remove()}
      />
    </Panel>
  );
}
