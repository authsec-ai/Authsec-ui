/**
 * Decision log: GET /gateway-decisions (agent_gateway_controller.go:445,
 * governance:read). Metadata only: the backend stores the agent id, the MCP
 * server and tool or the provider and model, a SHA-256 digest of the arguments,
 * the decision, latency, HTTP status and token counts. Never prompts,
 * completions or argument values. Filters are exactly those the API takes;
 * paging is by cursor (limit 1..200, default 50).
 */

import { useState } from "react";

import { useListAgentGatewaysQuery, useListGatewayDecisionsQuery, useListToolPoliciesQuery, type GatewayDecision, type GatewayDecisionsArgs } from "@/app/api/igaAgentGatewayApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";

import { chipButtonClass, shortTime } from "../model";
import { ReadFailure, Mono } from "../parts";
import { classifyAr } from "../model";
import { KIND_TEXT, SOURCE_TEXT, reasonText } from "./gatewayModel";

type Filters = Omit<GatewayDecisionsArgs, "ws" | "cursor" | "limit">;
const PAGE = 50;
const sel = "h-8 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-xs";

/** A `datetime-local` value is local time; the API wants RFC 3339. */
const toRfc = (v: string) => (v ? new Date(v).toISOString() : undefined);

function Row({ d, gateway, policy }: { d: GatewayDecision; gateway: string; policy: string }) {
  const usage = d.usage && Object.keys(d.usage).length ? JSON.stringify(d.usage) : "";
  return (
    <li className="space-y-0.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={d.decision === "allow" ? "success" : "danger"}>{d.decision === "allow" ? "Allow" : "Deny"}</StatusBadge>
        {d.record_type === "outcome" ? <StatusBadge>Outcome</StatusBadge> : null}
        <span className="text-[13px] font-medium">
          <Mono title={d.subject_id}>{d.subject_id}</Mono> → <Mono title={d.resource_id}>{d.resource_id}</Mono>
        </span>
        <span className="text-xs text-(--color-text-muted)">{KIND_TEXT[d.kind] ?? d.kind}</span>
        <span className="ml-auto text-xs text-(--color-text-muted)">{shortTime(d.decided_at)}</span>
      </div>
      <p className="text-xs text-(--color-text-secondary)">
        {reasonText(d.reason)}
        {policy ? ` · policy ${policy}` : ""} · {SOURCE_TEXT[d.source] ?? d.source} · gateway {gateway}
        {d.latency_ms != null ? ` · ${d.latency_ms.toFixed(1)} ms` : ""}
        {d.upstream_status ? ` · upstream HTTP ${d.upstream_status}` : ""}
      </p>
      {d.args_digest || usage || d.request_id ? (
        <p className="break-all text-xs text-(--color-text-muted)">
          {d.args_digest ? <>arguments digest <Mono>{d.args_digest}</Mono> </> : null}
          {usage ? <>usage <Mono>{usage}</Mono> </> : null}
          {d.request_id ? <>request <Mono>{d.request_id}</Mono></> : null}
        </p>
      ) : null}
    </li>
  );
}

export function DecisionsTab({ ws }: { ws: string }) {
  const [filters, setFilters] = useState<Filters>({});
  const [subject, setSubject] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [cursors, setCursors] = useState<string[]>([]); // cursors used so far; page 0 has none
  const cursor = cursors[cursors.length - 1];
  const q = useListGatewayDecisionsQuery({ ws, ...filters, cursor, limit: PAGE });
  const gateways = useListAgentGatewaysQuery({ ws }).data?.data ?? [];
  const policies = useListToolPoliciesQuery({ ws }).data?.data ?? [];
  const failure = classifyAr(q.error);
  const rows = q.data?.data ?? [];
  const next = q.data?.meta.next_cursor ?? null;

  const apply = (patch: Filters) => {
    setFilters((f) => ({ ...f, ...patch }));
    setCursors([]);
  };
  const applyText = () => apply({ subject_id: subject.trim() || undefined, since: toRfc(since), until: toRfc(until) });
  const gwName = (id: string) => gateways.find((g) => g.id === id)?.name ?? id.slice(0, 8);
  const polName = (id?: string) => (id ? policies.find((p) => p.id === id)?.name ?? id.slice(0, 8) : "");
  const chip = <K extends keyof Filters>(key: K, label: string, options: [Filters[K], string][]) => (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
      <span className="text-xs text-(--color-text-muted)">{label}</span>
      {options.map(([v, l]) => (
        <button key={String(v ?? "all")} type="button" role="radio" aria-checked={filters[key] === v} onClick={() => apply({ [key]: v } as Filters)} className={chipButtonClass(filters[key] === v)}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <Panel title="Decisions" description="Metadata only: who asked for what, the answer and why. AuthSec never stores prompts, completions or argument values, only a digest of the arguments." count={q.data ? `${rows.length} on this page` : undefined}>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {chip("decision", "Decision", [[undefined, "All"], ["allow", "Allow"], ["deny", "Deny"]])}
          {chip("kind", "Kind", [[undefined, "All"], ["mcp_tool", "MCP tool"], ["model", "Model"]])}
          {chip("record_type", "Record", [[undefined, "All"], ["decision", "Decisions"], ["outcome", "Outcomes"]])}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Source
            <select className={sel} value={filters.source ?? ""} onChange={(e) => apply({ source: e.target.value || undefined })}>
              <option value="">Any</option>
              {Object.entries(SOURCE_TEXT).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Gateway
            <select className={sel} value={filters.gateway_id ?? ""} onChange={(e) => apply({ gateway_id: e.target.value || undefined })}>
              <option value="">Any</option>
              {gateways.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Agent id (exact)
            <Input className="h-8 w-44" value={subject} onChange={(e) => setSubject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyText()} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            From
            <Input className="h-8 w-48" type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--color-text-muted)">
            Until
            <Input className="h-8 w-48" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <Button variant="outline" size="sm" onClick={applyText}>
            Apply
          </Button>
          {Object.values(filters).some(Boolean) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({});
                setSubject("");
                setSince("");
                setUntil("");
                setCursors([]);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {failure && !q.data ? <ReadFailure failure={failure} subject="decisions" onRetry={() => void q.refetch()} /> : null}
      {q.isLoading ? <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading decisions" /> : null}
      {q.data && rows.length === 0 ? (
        <p className="text-[13px] text-(--color-text-muted)">
          {Object.values(filters).some(Boolean) ? "No decision matches these filters." : "No decision recorded yet. Decisions appear once a registered gateway asks AuthSec about a call. Older rows are removed after the retention set under Settings."}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {rows.map((d) => (
            <Row key={d.id} d={d} gateway={gwName(d.gateway_id)} policy={polName(d.policy_id)} />
          ))}
        </ul>
      ) : null}
      {q.data && (cursors.length > 0 || next) ? (
        <div className="mt-3 flex items-center justify-between border-t border-(--color-border-subtle) pt-3">
          <Button variant="outline" size="sm" disabled={cursors.length === 0 || q.isFetching} onClick={() => setCursors((c) => c.slice(0, -1))}>
            Previous
          </Button>
          <span className="text-xs text-(--color-text-muted)">Page {cursors.length + 1}</span>
          <Button variant="outline" size="sm" disabled={!next || q.isFetching} onClick={() => next && setCursors((c) => [...c, next])}>
            Next
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
