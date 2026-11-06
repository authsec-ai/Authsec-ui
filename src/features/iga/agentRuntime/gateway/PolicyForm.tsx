/**
 * Create / edit one tool policy. Only what agentgateway.Policy supports
 * (internal/agentgateway/policy.go:76-110, validation :140-230): effect, kind,
 * subject selector (identity, workload, agent label, client id, gateway),
 * target patterns (server/server_url/tool or provider/model; `*` globs), a
 * time window, calls per minute (allow only) and deny-unlisted (allow only).
 * An empty field is not sent. The server validates and names the field.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import {
  useCreateToolPolicyMutation,
  useListAgentGatewaysQuery,
  useUpdateToolPolicyMutation,
  type PolicyEffect,
  type PolicyKind,
  type ToolPolicy,
  type ToolPolicyInput,
  type Weekday,
} from "@/app/api/igaAgentGatewayApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getWorkspaceId } from "@/utils/workspace";
import { Switch } from "@/components/ui/switch";

import { chipButtonClass } from "../model";
import { ActionError } from "../parts";
import { KIND_TEXT, WEEKDAYS } from "./gatewayModel";
import { useGwAction } from "./useGwAction";

interface Draft {
  name: string;
  description: string;
  effect: PolicyEffect;
  kind: PolicyKind;
  enabled: boolean;
  priority: string;
  agent_label: string;
  client_id: string;
  identity_id: string;
  workload_id: string;
  gateway_id: string;
  server: string;
  server_url: string;
  tool: string;
  provider: string;
  model: string;
  windowOn: boolean;
  days: Weekday[];
  start: string;
  end: string;
  timezone: string;
  rateOn: boolean;
  rate: string;
  deny_unlisted: boolean;
}

function toDraft(p: ToolPolicy | null): Draft {
  const w = p?.conditions.time_window;
  return {
    name: p?.name ?? "",
    description: p?.description ?? "",
    effect: p?.effect ?? "deny",
    kind: p?.kind ?? "mcp_tool",
    enabled: p?.enabled ?? true,
    priority: String(p?.priority ?? 0),
    agent_label: p?.subject.agent_label ?? "",
    client_id: p?.subject.client_id ?? "",
    identity_id: p?.subject.identity_id ?? "",
    workload_id: p?.subject.workload_id ?? "",
    gateway_id: p?.subject.gateway_id ?? "",
    server: p?.target.server ?? "",
    server_url: p?.target.server_url ?? "",
    tool: p?.target.tool ?? "",
    provider: p?.target.provider ?? "",
    model: p?.target.model ?? "",
    windowOn: !!w,
    days: w?.days ?? [],
    start: w?.start ?? "",
    end: w?.end ?? "",
    timezone: w?.timezone ?? "",
    rateOn: !!p?.conditions.max_calls_per_minute,
    rate: p?.conditions.max_calls_per_minute ? String(p.conditions.max_calls_per_minute) : "",
    deny_unlisted: p?.deny_unlisted ?? false,
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

function toInput(d: Draft): ToolPolicyInput {
  const allow = d.effect === "allow";
  const input: ToolPolicyInput = {
    name: d.name.trim(),
    description: d.description.trim() || undefined,
    effect: d.effect,
    kind: d.kind,
    enabled: d.enabled,
    priority: Number.parseInt(d.priority, 10) || 0,
    deny_unlisted: allow && d.deny_unlisted,
    subject: { agent_label: opt(d.agent_label), client_id: opt(d.client_id), identity_id: opt(d.identity_id), workload_id: opt(d.workload_id), gateway_id: opt(d.gateway_id) },
    target: d.kind === "mcp_tool" ? { server: opt(d.server), server_url: opt(d.server_url), tool: opt(d.tool) } : { provider: opt(d.provider), model: opt(d.model) },
  };
  const conditions: NonNullable<ToolPolicyInput["conditions"]> = {};
  if (d.windowOn) conditions.time_window = { days: d.days.length ? d.days : undefined, start: opt(d.start), end: opt(d.end), timezone: opt(d.timezone) };
  if (allow && d.rateOn && d.rate) conditions.max_calls_per_minute = Number.parseInt(d.rate, 10) || undefined;
  input.conditions = conditions;
  return input;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-(--color-text-muted)">{hint}</p> : null}
    </div>
  );
}

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={chipButtonClass(value === k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function PolicyFormDialog({ open, policy, onClose }: { open: boolean; policy: ToolPolicy | null; onClose: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(policy));
  const [create] = useCreateToolPolicyMutation();
  const [update] = useUpdateToolPolicyMutation();
  const gateways = useListAgentGatewaysQuery({ ws: getWorkspaceId() ?? "" }, { skip: !open }).data?.data ?? [];
  const act = useGwAction();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const allow = d.effect === "allow";

  const close = () => {
    if (act.pending) return;
    act.clear();
    onClose();
  };
  const save = async () => {
    const body = toInput(d);
    const ok = await act.run(() => (policy ? update({ id: policy.id, version: policy.version, policy: body }) : create(body)));
    if (ok) {
      toast.success(policy ? "Policy saved." : "Policy created.");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{policy ? `Edit ${policy.name}` : "New tool policy"}</DialogTitle>
          <DialogDescription>
            A policy says which agents may or may not call which tool or model. A matching deny always wins; then the highest-priority matching allow; then the workspace mode decides what is left.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pol-name" label="Name" hint="Unique in the workspace, up to 200 characters.">
              <Input id="pol-name" value={d.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
            </Field>
            <Field id="pol-desc" label="Description (optional)">
              <Input id="pol-desc" value={d.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} autoComplete="off" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[13px] font-medium">Effect</p>
              <Chips label="Effect" value={d.effect} options={[["allow", "Allow"], ["deny", "Deny"]]} onChange={(effect) => set({ effect })} />
            </div>
            <div className="space-y-1">
              <p className="text-[13px] font-medium">Applies to</p>
              <Chips label="Kind" value={d.kind} options={[["mcp_tool", KIND_TEXT.mcp_tool], ["model", KIND_TEXT.model]]} onChange={(kind) => set({ kind })} />
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md border border-(--color-border-subtle) p-3">
            <legend className="px-1 text-[13px] font-semibold">Which agents</legend>
            <p className="text-xs text-(--color-text-muted)">Every field you fill must match. Leave all empty to select every agent. Client id and label accept * as a wildcard.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="pol-label" label="Agent label">
                <Input id="pol-label" value={d.agent_label} onChange={(e) => set({ agent_label: e.target.value })} placeholder="prod-*" autoComplete="off" />
              </Field>
              <Field id="pol-client" label="Client id" hint="The agent's id at the gateway, or its SPIFFE id.">
                <Input id="pol-client" value={d.client_id} onChange={(e) => set({ client_id: e.target.value })} placeholder="billing-agent" autoComplete="off" />
              </Field>
              <Field id="pol-ident" label="Identity id (UUID)">
                <Input id="pol-ident" value={d.identity_id} onChange={(e) => set({ identity_id: e.target.value })} autoComplete="off" />
              </Field>
              <Field id="pol-work" label="Workload id (UUID)">
                <Input id="pol-work" value={d.workload_id} onChange={(e) => set({ workload_id: e.target.value })} autoComplete="off" />
              </Field>
              <Field id="pol-gw" label="Gateway">
                <select id="pol-gw" value={d.gateway_id} onChange={(e) => set({ gateway_id: e.target.value })} className="h-9 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-sm">
                  <option value="">Any gateway</option>
                  {gateways.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.state === "revoked" ? " (revoked)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-2 rounded-md border border-(--color-border-subtle) p-3">
            <legend className="px-1 text-[13px] font-semibold">{d.kind === "mcp_tool" ? "Which tools" : "Which models"}</legend>
            <p className="text-xs text-(--color-text-muted)">Patterns: * matches any run of characters; empty matches anything.</p>
            {d.kind === "mcp_tool" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="pol-server" label="MCP server">
                  <Input id="pol-server" value={d.server} onChange={(e) => set({ server: e.target.value })} placeholder="github" autoComplete="off" />
                </Field>
                <Field id="pol-surl" label="Server URL">
                  <Input id="pol-surl" value={d.server_url} onChange={(e) => set({ server_url: e.target.value })} autoComplete="off" />
                </Field>
                <Field id="pol-tool" label="Tool">
                  <Input id="pol-tool" value={d.tool} onChange={(e) => set({ tool: e.target.value })} placeholder="delete_*" autoComplete="off" />
                </Field>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="pol-prov" label="Provider" hint="Lower-cased: openai, anthropic.">
                  <Input id="pol-prov" value={d.provider} onChange={(e) => set({ provider: e.target.value })} placeholder="openai" autoComplete="off" />
                </Field>
                <Field id="pol-model" label="Model">
                  <Input id="pol-model" value={d.model} onChange={(e) => set({ model: e.target.value })} placeholder="gpt-4*" autoComplete="off" />
                </Field>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3 rounded-md border border-(--color-border-subtle) p-3">
            <legend className="px-1 text-[13px] font-semibold">Conditions</legend>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Switch checked={d.windowOn} onCheckedChange={(v) => set({ windowOn: v })} aria-label="Only within a time window" />
                <span className="text-[13px] font-medium">Only within a time window</span>
              </div>
              {d.windowOn ? (
                <div className="space-y-2 pl-1">
                  <div role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((w) => (
                      <button key={w.id} type="button" aria-pressed={d.days.includes(w.id)} onClick={() => set({ days: d.days.includes(w.id) ? d.days.filter((x) => x !== w.id) : [...d.days, w.id] })} className={chipButtonClass(d.days.includes(w.id))}>
                        {w.label}
                      </button>
                    ))}
                    <span className="self-center text-xs text-(--color-text-muted)">{d.days.length ? "" : "No day chosen: every day."}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field id="pol-start" label="From (HH:MM)">
                      <Input id="pol-start" value={d.start} onChange={(e) => set({ start: e.target.value })} placeholder="09:00" />
                    </Field>
                    <Field id="pol-end" label="To (HH:MM)" hint="Earlier than From spans midnight.">
                      <Input id="pol-end" value={d.end} onChange={(e) => set({ end: e.target.value })} placeholder="17:00" />
                    </Field>
                    <Field id="pol-tz" label="Time zone" hint="IANA name; empty is UTC.">
                      <Input id="pol-tz" value={d.timezone} onChange={(e) => set({ timezone: e.target.value })} placeholder="Europe/London" />
                    </Field>
                  </div>
                  <p className="text-xs text-(--color-text-muted)">From and To are both set or both empty (the whole day). Outside the window the policy does not apply.</p>
                </div>
              ) : null}
            </div>
            {allow ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Switch checked={d.rateOn} onCheckedChange={(v) => set({ rateOn: v })} aria-label="Limit calls per minute" />
                    <span className="text-[13px] font-medium">Limit calls per minute</span>
                  </div>
                  {d.rateOn ? (
                    <Field id="pol-rate" label="Calls per minute (1 to 100000)" hint="Per gateway, agent and target. Calls beyond it are denied as rate_limited.">
                      <Input id="pol-rate" type="number" min={1} max={100000} className="w-32" value={d.rate} onChange={(e) => set({ rate: e.target.value })} />
                    </Field>
                  ) : null}
                </div>
                <div className="flex items-start gap-3">
                  <Switch checked={d.deny_unlisted} onCheckedChange={(v) => set({ deny_unlisted: v })} aria-label="Deny everything not listed" className="mt-0.5" />
                  <div>
                    <span className="text-[13px] font-medium">Deny everything not listed</span>
                    <p className="text-xs text-(--color-text-muted)">The agents this policy selects may use only {d.kind === "model" ? "models" : "tools"} that some allow policy allows them.</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-(--color-text-muted)">Rate limits and deny-unlisted apply to allow policies only.</p>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pol-prio" label="Priority" hint="Higher is read first (-1000000 to 1000000). Ties go by name.">
              <Input id="pol-prio" type="number" className="w-32" value={d.priority} onChange={(e) => set({ priority: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3 self-end pb-2">
              <Switch checked={d.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="Enabled" />
              <span className="text-[13px] font-medium">Enabled</span>
            </div>
          </div>
        </div>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void save()} disabled={act.pending || !d.name.trim()}>
            {act.pending ? "Saving…" : policy ? "Save policy" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
