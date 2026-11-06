/**
 * Evaluate: POST /tool-policies/evaluate (agent_gateway_controller.go:406,
 * governance:read). A dry run with the same rules a gateway's call gets: it
 * records nothing and takes no rate token. Shows the decision, the policy that
 * decided and every policy's part (subject, target, window, outcome).
 */

import { useState } from "react";

import {
  useEvaluateToolPoliciesMutation,
  useListAgentGatewaysQuery,
  type EvaluateRequest,
  type EvaluateResult,
  type PolicyKind,
} from "@/app/api/igaAgentGatewayApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkspaceId } from "@/utils/workspace";
import { Panel } from "@/features/iga/shared/components/Panel";

import { chipButtonClass, shortTime } from "../model";
import { ActionError, Mono } from "../parts";
import { KIND_TEXT, reasonText } from "./gatewayModel";
import { useGwAction } from "./useGwAction";

const OPERATIONS = ["", "chat.completions", "responses", "embeddings", "messages"];
const yn = (b: boolean) => (b ? "yes" : "no");

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function EvaluatePanel() {
  const [kind, setKind] = useState<PolicyKind>("mcp_tool");
  const [f, setF] = useState({ subject: "", labels: "", identity: "", workload: "", server: "", tool: "", url: "", provider: "", model: "", op: "", gateway: "" });
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [evaluate] = useEvaluateToolPoliciesMutation();
  const gateways = useListAgentGatewaysQuery({ ws: getWorkspaceId() ?? "" }).data?.data ?? [];
  const act = useGwAction();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const ready = f.subject.trim() && (kind === "mcp_tool" ? f.server.trim() && f.tool.trim() : f.provider.trim() && f.model.trim());

  const run = async () => {
    const labels = f.labels.split(",").map((l) => l.trim()).filter(Boolean);
    const props = { identity_id: f.identity.trim() || undefined, workload_id: f.workload.trim() || undefined, labels: labels.length ? labels : undefined };
    const subject: EvaluateRequest["subject"] = { type: "agent", id: f.subject.trim(), ...(Object.values(props).some(Boolean) ? { properties: props } : {}) };
    const body: EvaluateRequest =
      kind === "mcp_tool"
        ? { subject, action: { name: "tools/call" }, resource: { type: "mcp_tool", id: `${f.server.trim()}/${f.tool.trim()}`, properties: { server: f.server.trim(), tool: f.tool.trim(), server_url: f.url.trim() || undefined } } }
        : {
            subject,
            action: { name: "model/invoke", ...(f.op ? { properties: { operation: f.op } } : {}) },
            resource: { type: "model", id: `${f.provider.trim().toLowerCase()}/${f.model.trim()}`, properties: { provider: f.provider.trim().toLowerCase(), model: f.model.trim() } },
          };
    if (f.gateway) body.gateway_id = f.gateway;
    setResult(null);
    const res = await act.run(() => evaluate(body));
    if (res) setResult(res.data);
  };

  return (
    <Panel title="Evaluate" description="Try a call against the policies as they are now. Nothing is recorded and no rate-limit token is used.">
      <div className="space-y-3">
        <div role="radiogroup" aria-label="What is called" className="flex gap-1.5">
          {(["mcp_tool", "model"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={chipButtonClass(kind === k)}>
              {KIND_TEXT[k]} call
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="ev-subject" label="Agent id (client id or SPIFFE id)">
            <Input id="ev-subject" value={f.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="billing-agent" autoComplete="off" />
          </Field>
          <Field id="ev-labels" label="Agent labels (comma separated)">
            <Input id="ev-labels" value={f.labels} onChange={(e) => set({ labels: e.target.value })} placeholder="prod, billing" autoComplete="off" />
          </Field>
          <Field id="ev-gw" label="As gateway (optional)">
            <select id="ev-gw" value={f.gateway} onChange={(e) => set({ gateway: e.target.value })} className="h-9 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-sm">
              <option value="">No gateway</option>
              {gateways.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="ev-ident" label="Identity id (UUID, optional)">
            <Input id="ev-ident" value={f.identity} onChange={(e) => set({ identity: e.target.value })} autoComplete="off" />
          </Field>
          <Field id="ev-work" label="Workload id (UUID, optional)">
            <Input id="ev-work" value={f.workload} onChange={(e) => set({ workload: e.target.value })} autoComplete="off" />
          </Field>
        </div>
        {kind === "mcp_tool" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="ev-server" label="MCP server">
              <Input id="ev-server" value={f.server} onChange={(e) => set({ server: e.target.value })} placeholder="github" autoComplete="off" />
            </Field>
            <Field id="ev-tool" label="Tool">
              <Input id="ev-tool" value={f.tool} onChange={(e) => set({ tool: e.target.value })} placeholder="create_issue" autoComplete="off" />
            </Field>
            <Field id="ev-url" label="Server URL (optional)">
              <Input id="ev-url" value={f.url} onChange={(e) => set({ url: e.target.value })} autoComplete="off" />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="ev-prov" label="Provider">
              <Input id="ev-prov" value={f.provider} onChange={(e) => set({ provider: e.target.value })} placeholder="openai" autoComplete="off" />
            </Field>
            <Field id="ev-model" label="Model">
              <Input id="ev-model" value={f.model} onChange={(e) => set({ model: e.target.value })} placeholder="gpt-4o" autoComplete="off" />
            </Field>
            <Field id="ev-op" label="Operation (optional)">
              <select id="ev-op" value={f.op} onChange={(e) => set({ op: e.target.value })} className="h-9 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-sm">
                {OPERATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o || "Any"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <ActionError failure={act.failure} />
        <Button className="text-white" onClick={() => void run()} disabled={act.pending || !ready}>
          {act.pending ? "Evaluating…" : "Evaluate"}
        </Button>

        {result ? (
          <div className="space-y-3" aria-live="polite">
            <DecisionBanner
              tone={result.decision ? "success" : "danger"}
              title={result.decision ? "Allowed" : "Denied"}
              body={
                <>
                  {reasonText(result.reason)}
                  {result.policy_name ? <> by policy <strong>{result.policy_name}</strong></> : null}.
                  {result.mode === "observe" && result.reason === "default_allow" ? " The workspace is in observe mode." : ""}
                  {result.ttl_seconds ? ` A gateway may cache this for ${result.ttl_seconds}s.` : " A gateway will not cache this."}
                </>
              }
            />
            <p className="text-xs text-(--color-text-muted)">
              Resource <Mono>{result.request.resource_id}</Mono> · mode {result.mode} · evaluated {shortTime(result.evaluated_at)}
            </p>
            <div className="overflow-x-auto rounded-md border border-(--color-border-subtle)">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Every policy's part in this decision, in evaluation order</caption>
                <thead className="bg-(--color-surface-subtle) text-(--color-text-muted)">
                  <tr>
                    <th scope="col" className="px-2.5 py-1.5">Policy</th>
                    <th scope="col" className="px-2.5 py-1.5">Effect</th>
                    <th scope="col" className="px-2.5 py-1.5">Enabled</th>
                    <th scope="col" className="px-2.5 py-1.5">Agent matches</th>
                    <th scope="col" className="px-2.5 py-1.5">Target matches</th>
                    <th scope="col" className="px-2.5 py-1.5">Window open</th>
                    <th scope="col" className="px-2.5 py-1.5">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border-subtle)">
                  {(result.policies ?? []).map((t) => (
                    <tr key={t.policy_id}>
                      <td className="px-2.5 py-1.5 font-medium">{t.name}</td>
                      <td className="px-2.5 py-1.5">{t.effect}</td>
                      <td className="px-2.5 py-1.5">{yn(t.enabled)}</td>
                      <td className="px-2.5 py-1.5">{yn(t.subject_match)}</td>
                      <td className="px-2.5 py-1.5">{yn(t.target_match)}</td>
                      <td className="px-2.5 py-1.5">{yn(t.window_active)}</td>
                      <td className="px-2.5 py-1.5">
                        <StatusBadge tone={t.outcome === "decided" ? (result.decision ? "success" : "danger") : "neutral"}>{t.outcome.replace(/_/g, " ")}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                  {!result.policies?.length ? (
                    <tr>
                      <td colSpan={7} className="px-2.5 py-3 text-(--color-text-muted)">
                        There are no policies: the workspace mode decided.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
