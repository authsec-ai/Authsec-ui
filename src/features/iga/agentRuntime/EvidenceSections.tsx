/**
 * Evidence other than scanned model calls, shown in the AI workload drawer:
 * live calls from the event stream, DNS lookups of model API hosts
 * (ai_network_traffic, SPEC-agent-runtime-visibility.md §11) and
 * configuration hints (ai_config_hint). Shapes traced from
 * services/agent_runtime_dns.go (dnsTrafficDoc) and
 * services/agent_runtime_config_hints.go (configHintDraft).
 */

import type { AIFindingRef, AIWorkload } from "@/app/api/igaAgentRuntimeApi";
import { DetailGrid, DetailRow, DrawerSection } from "@/components/console/detail";

import { shortTime, topEntries } from "./model";
import { Mono } from "./parts";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

const HOW_TEXT: Record<string, string> = {
  srcids_instance: "the instance named in the query log record (at lookup time)",
  eni_lambda: "the Lambda network interface holding the address at scan time",
  eni_ecs_task: "the ECS task network interface holding the address at scan time",
  eni_instance: "the instance holding the address at scan time",
  unattributed: "no source found",
};

export function LiveEvidence({ ai }: { ai: AIWorkload }) {
  if (!ai.seen_live && !ai.live?.calls && !ai.live?.denied) return null;
  return (
    <DrawerSection label="Live calls (event stream, since the last scan)">
      <DetailGrid>
        <DetailRow label="Calls" value={ai.live.calls} />
        <DetailRow label="Refused" value={ai.live.denied} />
        <DetailRow label="Last call" value={shortTime(ai.live.last_call_at)} />
        <DetailRow label="Models" value={topEntries(ai.live.models).map(([m, n]) => `${m} (${n})`).join(", ") || "none named"} full />
      </DetailGrid>
      <p className="mt-2 text-xs text-muted-foreground">Counted from streamed CloudTrail events; the next scan replaces these with exact totals.</p>
    </DrawerSection>
  );
}

function NetworkFinding({ f }: { f: AIFindingRef }) {
  const ev = f.evidence;
  const att = rec(ev.attribution);
  const lookupTime = str(att.confidence) === "query_time";
  const domains = arr(ev.domains).map(rec);
  return (
    <div className="space-y-2 rounded-md border border-(--color-border) p-3 text-[13px]">
      <p>
        <span className="font-medium">{arr(ev.providers).map(String).join(", ") || "model provider"}</span>{" "}
        <span className="text-xs text-muted-foreground">
          {String(ev.queries ?? 0)} lookups, {shortTime(str(ev.first_seen))} to {shortTime(str(ev.last_seen))}
        </span>
      </p>
      <p className={`rounded px-2 py-1 text-xs ${lookupTime ? "bg-muted text-muted-foreground" : "border border-(--color-warning) bg-(--color-warning-soft) text-(--color-warning-text)"}`}>
        Attributed by {HOW_TEXT[str(att.how)] ?? str(att.how)}.
        {lookupTime ? " This is evidence of model use." : " This is a lead, not evidence: the address may have changed hands, so it only makes a possible AI workload."}
        {str(att.note) ? ` ${str(att.note)}.` : ""}
      </p>
      {domains.length ? (
        <ul className="space-y-0.5">
          {domains.slice(0, 8).map((d) => (
            <li key={str(d.domain)} className="flex justify-between gap-3">
              <Mono>{str(d.domain)}</Mono>
              <span className="tabular-nums text-muted-foreground">{String(d.queries ?? 0)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {ev.control_only === true ? <p className="text-xs text-muted-foreground">Only Bedrock runtime lookups (already seen through CloudTrail).</p> : null}
      {ev.partial === true ? <p className="text-xs text-(--color-warning-text)">Part of a window was not read; lookups outside it are unknown, not absent.</p> : null}
    </div>
  );
}

export function NetworkTrafficEvidence({ ai }: { ai: AIWorkload }) {
  if (!ai.network_traffic?.length) return null;
  return (
    <DrawerSection label="Network traffic to model providers (DNS)">
      <p className="mb-2 text-xs text-muted-foreground">From Route 53 Resolver query logs: only lookups of model providers' API hosts are read.</p>
      <div className="space-y-2">
        {ai.network_traffic.map((f) => (
          <NetworkFinding key={f.finding_id} f={f} />
        ))}
      </div>
    </DrawerSection>
  );
}

export function ConfigHintEvidence({ ai }: { ai: AIWorkload }) {
  if (!ai.config_hints?.length) return null;
  return (
    <DrawerSection label="Configuration hints (names only)">
      <p className="mb-2 text-xs text-muted-foreground">Names never make an AI workload on their own; they make it possible.</p>
      <ul className="space-y-2 text-[13px]">
        {ai.config_hints.map((f) => {
          const ev = f.evidence;
          const envs = arr(ev.env_var_names).map(String);
          const layers = arr(ev.layer_names).map(String);
          const keys = arr(ev.readable_model_keys).map((k) => str(rec(k).name));
          return (
            <li key={f.finding_id} className="space-y-0.5">
              <p className="font-medium">{str(rec(f.subject).name) || "workload"}</p>
              <p>
                <span className="text-xs text-muted-foreground">Environment variable names: </span>
                {envs.length ? envs.join(", ") : ev.env_vars_unread === true ? "not readable" : "none of interest"}
              </p>
              {layers.length ? (
                <p>
                  <span className="text-xs text-muted-foreground">Layers: </span>
                  {layers.join(", ")}
                </p>
              ) : null}
              {keys.length ? (
                <p>
                  <span className="text-xs text-muted-foreground">Model-key secrets it may read ({str(ev.readable_basis) || "declared grants"}): </span>
                  {keys.join(", ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </DrawerSection>
  );
}
