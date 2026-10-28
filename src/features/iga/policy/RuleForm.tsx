/**
 * RuleForm edits an authsec.runtime.v1 document as rules, not as JSON.
 * Saving a draft updates that draft. Saving an approved or published
 * policy starts a new draft revision. The last published copy stays in
 * effect until the new draft is approved and published.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/console/status";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";

import { usePutDraftMutation, type PolicyLifecycle, type PolicyRevision } from "./policyApi";

const ACTIONS = [
  "network.connect",
  "file.read",
  "file.write",
  "exec",
  "secret.read",
  "admission",
] as const;

const EFFECTS = ["allow", "deny", "require_approval"] as const;

type ActionName = (typeof ACTIONS)[number];
type EffectName = (typeof EFFECTS)[number];

const PATH_REQUIRED = new Set<string>(["file.read", "file.write", "exec"]);

const CONTROL_FOR: Record<string, string[]> = {
  "network.connect": ["egress"],
  "file.read": ["filesystem"],
  "file.write": ["filesystem"],
  exec: ["exec", "privilege"],
  "secret.read": ["secret"],
  admission: ["admission"],
};

export interface RuntimeRule {
  id: string;
  action: ActionName;
  resource_id?: string;
  path: string;
  effect: EffectName;
  adapter?: string;
}

interface RuntimeTargets {
  workload_ids: string[];
  include_future_incarnations: boolean;
  bounded_future_approval?: boolean;
}

interface RuntimeDocument {
  name: string;
  format: string;
  targets: RuntimeTargets;
  profile: string;
  default_effect: "deny";
  rules: RuntimeRule[];
  evidence_graph_revision: number;
  mode: string;
}

interface RuleFormProps {
  policyId: string;
  policyName: string;
  lifecycle: PolicyLifecycle;
  revisions: PolicyRevision[];
  etag: string;
}

function isAction(value: string): value is ActionName {
  return (ACTIONS as readonly string[]).includes(value);
}

function isEffect(value: string): value is EffectName {
  return (EFFECTS as readonly string[]).includes(value);
}

export function parseRuntimeDocument(raw: unknown): RuntimeDocument | null {
  let value = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const doc = value as Record<string, unknown>;
  if (doc.format !== "authsec.runtime.v1" || typeof doc.name !== "string" || !doc.name) return null;
  if (doc.default_effect !== "deny") return null;
  const targets = doc.targets as Record<string, unknown> | undefined;
  const workloadIDs = Array.isArray(targets?.workload_ids)
    ? targets.workload_ids.filter((id): id is string => typeof id === "string")
    : [];
  if (workloadIDs.length === 0 || typeof doc.profile !== "string" || !doc.profile) return null;
  const rulesIn = Array.isArray(doc.rules) ? doc.rules : [];
  const rules: RuntimeRule[] = [];
  for (const item of rulesIn) {
    if (!item || typeof item !== "object") return null;
    const rule = item as Record<string, unknown>;
    if (typeof rule.id !== "string" || !rule.id) return null;
    if (typeof rule.action !== "string" || !isAction(rule.action)) return null;
    if (typeof rule.effect !== "string" || !isEffect(rule.effect)) return null;
    rules.push({
      id: rule.id,
      action: rule.action,
      resource_id: typeof rule.resource_id === "string" ? rule.resource_id : undefined,
      path: typeof rule.path === "string" ? rule.path : "",
      effect: rule.effect,
      adapter: typeof rule.adapter === "string" ? rule.adapter : undefined,
    });
  }
  return {
    name: doc.name,
    format: "authsec.runtime.v1",
    targets: {
      workload_ids: workloadIDs,
      include_future_incarnations: targets?.include_future_incarnations === true,
      bounded_future_approval: targets?.bounded_future_approval === true ? true : undefined,
    },
    profile: doc.profile,
    default_effect: "deny",
    rules,
    evidence_graph_revision: typeof doc.evidence_graph_revision === "number" ? doc.evidence_graph_revision : 0,
    mode: typeof doc.mode === "string" && doc.mode ? doc.mode : "observe",
  };
}

function requiredControls(rules: RuntimeRule[]): string[] {
  const controls = new Set<string>();
  for (const rule of rules) {
    for (const control of CONTROL_FOR[rule.action] ?? []) controls.add(control);
  }
  return [...controls].sort();
}

function draftDocument(base: RuntimeDocument, rules: RuntimeRule[]) {
  return {
    name: base.name,
    format: "authsec.runtime.v1",
    targets: {
      workload_ids: base.targets.workload_ids,
      include_future_incarnations: base.targets.include_future_incarnations,
      ...(base.targets.bounded_future_approval ? { bounded_future_approval: true } : {}),
    },
    profile: base.profile,
    default_effect: "deny" as const,
    rules: rules.map((rule) => {
      const out: Record<string, string> = {
        id: rule.id,
        action: rule.action,
        effect: rule.effect,
      };
      if (rule.resource_id) out.resource_id = rule.resource_id;
      if (rule.path) out.path = rule.path;
      if (rule.effect === "require_approval") out.adapter = rule.adapter?.trim() || "approval";
      return out;
    }),
    required_controls: requiredControls(rules),
    evidence_graph_revision: base.evidence_graph_revision,
    mode: base.mode,
  };
}

function ruleSignature(rules: RuntimeRule[]): string {
  return JSON.stringify(
    rules.map((rule) => ({
      id: rule.id,
      action: rule.action,
      path: rule.path,
      effect: rule.effect,
      resource_id: rule.resource_id ?? "",
      adapter: rule.effect === "require_approval" ? rule.adapter?.trim() || "approval" : "",
    })),
  );
}

function newRuleID(): string {
  const hex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `rule-${hex}`;
}

function originLabel(id: string): string | null {
  if (id.startsWith("review-")) return "Needs review";
  if (id.startsWith("denied-")) return "Denied observation";
  if (id.startsWith("allow-")) return "Allowed observation";
  return null;
}

function is412(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error && (error as { status: number }).status === 412;
}

function pathProblem(rules: RuntimeRule[]): string | null {
  for (const rule of rules) {
    if (PATH_REQUIRED.has(rule.action) && !rule.path.trim()) {
      return `${rule.action} needs a path.`;
    }
  }
  return null;
}

const EDITABLE = new Set<PolicyLifecycle>(["draft", "validated", "simulated", "approved", "published"]);

function rulesHelp(lifecycle: PolicyLifecycle): string {
  switch (lifecycle) {
    case "draft":
      return "Edit each rule, then save the draft. Approve it when it is ready, then publish.";
    case "approved":
      return "These rules are approved and not yet published. Saving starts a new draft and clears this approval. Approve the new draft, then publish.";
    case "published":
      return "Collectors are following this revision. Saving starts a new draft and clears the approval. This published copy stays in effect until you approve and publish the new draft.";
    case "validated":
    case "simulated":
      return "Saving starts a new draft. The current review no longer applies. Approve the new draft, then publish.";
    default:
      return "These rules can no longer be edited.";
  }
}

export function RuleForm({ policyId, policyName, lifecycle, revisions, etag }: RuleFormProps) {
  const latest = revisions.length > 0 ? revisions[revisions.length - 1] : null;
  const parsed = useMemo(() => parseRuntimeDocument(latest?.document ?? ""), [latest?.document]);
  const editable = EDITABLE.has(lifecycle);
  const [rules, setRules] = useState<RuntimeRule[]>(parsed?.rules ?? []);
  const [conflict, setConflict] = useState(false);
  const [putDraft, { isLoading: isSaving }] = usePutDraftMutation();

  useEffect(() => {
    setRules(parsed?.rules ?? []);
    setConflict(false);
  }, [latest?.content_hash, parsed]);

  const dirty = parsed ? ruleSignature(rules) !== ruleSignature(parsed.rules) : false;
  const problem = pathProblem(rules);

  const update = (index: number, patch: Partial<RuntimeRule>) => {
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  const save = async () => {
    if (!parsed || !editable || problem) return;
    try {
      await putDraft({ id: policyId, etag, document: draftDocument(parsed, rules) }).unwrap();
      toast.success(lifecycle === "draft" ? "Draft saved." : "Saved as a new draft. Approve it, then publish.");
    } catch (err) {
      if (is412(err)) {
        setConflict(true);
        toast.error("This draft changed since you opened it. Reload the policy and try again.");
        return;
      }
      toast.error("Could not save the draft.");
    }
  };

  if (!latest) {
    return (
      <Panel title="Rules">
        <p className="text-sm text-(--color-text-muted)">No revisions available.</p>
      </Panel>
    );
  }

  if (!parsed) {
    return (
      <Panel title="Rules" description={`Revision v${latest.revision}`}>
        <p className="text-sm text-(--color-text-muted)">
          This revision is not an authsec.runtime.v1 rule document, so it cannot be edited as a form.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Policy">
        <Facts>
          <Fact label="Name">{policyName}</Fact>
          <Fact label="Profile">{parsed.profile}</Fact>
          <Fact label="Mode">{parsed.mode}</Fact>
          <Fact label="Default effect">deny</Fact>
          <Fact label="Revision">v{latest.revision}</Fact>
        </Facts>
      </Panel>

      <Panel
        title="Rules"
        description={rulesHelp(lifecycle)}
        count={`${rules.length}`}
      >
        {conflict && (
          <p className="mb-3 text-sm text-(--color-danger-text)">
            This draft changed since you opened it. Reload the page before saving.
          </p>
        )}
        <div className="space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-(--color-text-muted)">No rules yet. Add one to allow or deny an action.</p>
          )}
          {rules.map((rule, index) => {
            const origin = originLabel(rule.id);
            return (
              <div key={rule.id} className="rounded-md border border-(--color-border-subtle) p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-(--color-text-muted)">{rule.id}</span>
                    {origin && <StatusBadge tone={rule.effect === "allow" ? "success" : "warning"}>{origin}</StatusBadge>}
                  </div>
                  {editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setRules((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Action</Label>
                    <Select
                      value={rule.action}
                      disabled={!editable}
                      onValueChange={(value) => {
                        if (isAction(value)) update(index, { action: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((action) => (
                          <SelectItem key={action} value={action}>
                            {action}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Effect</Label>
                    <Select
                      value={rule.effect}
                      disabled={!editable}
                      onValueChange={(value) => {
                        if (isEffect(value)) update(index, { effect: value });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EFFECTS.map((effect) => (
                          <SelectItem key={effect} value={effect}>
                            {effect}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor={`path-${rule.id}`}>
                      Path
                    </Label>
                    <Input
                      id={`path-${rule.id}`}
                      value={rule.path}
                      disabled={!editable}
                      placeholder={PATH_REQUIRED.has(rule.action) ? "Required" : "Optional"}
                      onChange={(event) => update(index, { path: event.target.value })}
                    />
                  </div>
                </div>
                {rule.resource_id && (
                  <p className="mt-2 font-mono text-xs text-(--color-text-muted)">Resource {rule.resource_id}</p>
                )}
                {editable && rule.effect === "require_approval" && (
                  <div className="mt-3 max-w-sm space-y-1.5">
                    <Label className="text-xs" htmlFor={`adapter-${rule.id}`}>
                      Approval adapter
                    </Label>
                    <Input
                      id={`adapter-${rule.id}`}
                      value={rule.adapter ?? "approval"}
                      onChange={(event) => update(index, { adapter: event.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setRules((current) => [
                  ...current,
                  { id: newRuleID(), action: "network.connect", path: "", effect: "deny" },
                ])
              }
            >
              <Plus className="size-3.5" />
              Add rule
            </Button>
            <Button type="button" size="sm" disabled={!dirty || !!problem || isSaving || conflict} onClick={save}>
              {isSaving ? "Saving..." : lifecycle === "draft" ? "Save draft" : "Save as new draft"}
            </Button>
            {problem && <span className="text-xs text-(--color-danger-text)">{problem}</span>}
            {dirty && !problem && <span className="text-xs text-(--color-text-muted)">Unsaved changes</span>}
          </div>
        )}
      </Panel>
    </div>
  );
}
