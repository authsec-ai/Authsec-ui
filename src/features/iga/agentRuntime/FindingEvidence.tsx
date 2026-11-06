/** One finding's subject and evidence, per kind (agent_runtime_findings.go:222). */

import { Link } from "react-router-dom";

import type { AgentFinding } from "@/app/api/igaAgentRuntimeApi";
import { DetailGrid, DetailRow } from "@/components/console/detail";

import { coverageText, shortTime, topEntries } from "./model";
import { Mono } from "./parts";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export function FindingEvidence({ finding }: { finding: AgentFinding }) {
  const subject = rec(finding.subject);
  const ev = rec(finding.evidence);
  const calls = rec(ev.model_calls);
  const window = rec(calls.window);
  return (
    <div className="space-y-3 text-[13px]">
      <DetailGrid>
        <DetailRow label="Subject" value={str(subject.name) || str(subject.arn) || finding.subject_key} full />
        {str(subject.arn) ? <DetailRow label="ARN" value={<Mono>{str(subject.arn)}</Mono>} full /> : null}
        <DetailRow label="First seen" value={shortTime(finding.first_seen)} />
        <DetailRow label="Last seen" value={shortTime(finding.last_seen)} />
      </DetailGrid>

      {finding.kind === "shared_role" ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">{str(ev.candidates)} workloads run as this role. Model calls cannot be tied to one of them.</p>
          <ul className="space-y-1">
            {arr(subject.workloads).map((w, i) => (
              <li key={str(w.cloud_workload_id) || i}>
                {str(w.name)} <span className="text-xs text-muted-foreground">{str(w.runtime_kind)} {str(w.region)}</span>
              </li>
            ))}
            {Array.isArray(subject.k8s_service_accounts) && (subject.k8s_service_accounts as unknown[]).length ? (
              <li className="text-xs text-muted-foreground">Kubernetes service accounts: {(subject.k8s_service_accounts as unknown[]).map(String).join(", ")}</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {finding.kind === "long_lived_key" ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">An IAM user called a model. Access key ids and ages only; no secret is read.</p>
          <ul className="space-y-1">
            {arr(ev.access_keys).map((k, i) => (
              <li key={str(k.cloud_secret_id) || i}>
                <Mono>{str(k.access_key_id)}</Mono> <span className="text-xs text-muted-foreground">{str(k.status)}{k.age_days != null ? `, ${str(k.age_days)} days old` : ""}{k.last_used_at ? `, last used ${shortTime(str(k.last_used_at))}` : ""}</span>
              </li>
            ))}
            {arr(ev.access_keys).length === 0 ? <li className="text-xs text-muted-foreground">No access keys were collected for this user.</li> : null}
          </ul>
        </div>
      ) : null}

      {finding.kind === "human_credentials" ? (
        <p className="text-xs text-muted-foreground">A human session ({str(ev.session).replace(/_/g, " ")}) called a model.</p>
      ) : null}

      {finding.kind === "model_key_secret" ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Matched by name only; its value is not read. Readers are {str(ev.readers_basis) || "declared allow grants"}.
          </p>
          <ul className="space-y-1">
            {arr(ev.readers).map((r, i) => (
              <li key={str(r.identity_id) || i}>
                <Mono>{str(r.identity_id)}</Mono> {r.ai_workload === true ? <span className="text-xs text-muted-foreground">(an AI workload)</span> : null}
              </li>
            ))}
            {arr(ev.readers).length === 0 ? <li className="text-xs text-muted-foreground">No identity is granted read.</li> : null}
          </ul>
        </div>
      ) : null}

      {finding.kind === "ai_config_hint" ? (
        <p className="text-xs text-muted-foreground">
          Names only ({arr(ev.env_var_names).length ? (ev.env_var_names as unknown[]).map(String).join(", ") : "no variable names of interest"}). A hint makes a possible AI workload, never an AI workload or a suggestion.
        </p>
      ) : null}

      {finding.kind === "ai_network_traffic" ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {str(ev.queries)} DNS lookups of {Array.isArray(ev.providers) ? (ev.providers as unknown[]).map(String).join(", ") : "model providers"}, attributed by{" "}
            {str(rec(ev.attribution).how).replace(/_/g, " ") || "unknown"} ({str(rec(ev.attribution).confidence) === "query_time" ? "at lookup time: evidence" : "at scan time: a lead only"}).
          </p>
          <ul className="space-y-0.5">
            {arr(ev.domains).slice(0, 8).map((d, i) => (
              <li key={str(d.domain) || i} className="flex justify-between gap-3">
                <Mono>{str(d.domain)}</Mono>
                <span className="text-xs tabular-nums text-muted-foreground">{str(d.queries)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {finding.kind === "unaccounted_model_usage" ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {str(subject.provider)} key <Mono>{str(subject.key_name) || str(subject.provider_key_id)}</Mono>
            {str(subject.project_name) ? ` in project ${str(subject.project_name)}` : ""}: {str(ev.requests)} requests in {str(ev.window_days)} days, last used {shortTime(str(ev.last_used_at))}.
          </p>
          <p className="text-xs text-muted-foreground">Weak: no AWS secret or Lambda variable name in this workspace contains the key or project name ({str(ev.names_checked)} names checked). The key's value is never read.</p>
          {str(subject.connection_id) ? (
            <Link to={`/iga/agent-runtime/model-providers/${str(subject.connection_id)}`} className="text-xs font-medium text-(--color-primary-text) hover:underline">
              Open {str(subject.connection_name) || "the connection"}
            </Link>
          ) : null}
        </div>
      ) : null}

      {Object.keys(calls).length ? (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            Model calls: {str(calls.calls)} ({str(calls.denied)} refused, {str(calls.errors)} errors). Window {coverageText({ from: str(window.from) || null, to: str(window.to) || null, partial: window.partial === true })}.
          </p>
          {topEntries(calls.models as Record<string, number>).length ? <p className="text-xs">{topEntries(calls.models as Record<string, number>).map(([m, n]) => `${m} (${n})`).join(", ")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
