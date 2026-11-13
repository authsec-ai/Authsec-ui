/**
 * Which sources feed the timeline and their state (GET /activity/coverage, discovery:read). A state, not a
 * percentage: CloudTrail events arrive with each scan or event stream; AgentCore spans are read per
 * connection and region; OTLP depends on live tokens and whether any collector has used one.
 */

import { useGetAgentActivityCoverageQuery } from "@/app/api/igaAgentActivityApi";
import { StatusBadge } from "@/components/console/status";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { classifyAr, shortTime } from "../model";
import { Mono, ReadFailure } from "../parts";

/** agentactivity.SpanState* (internal/agentactivity/awsspans.go:44-48). */
const STATE_TEXT: Record<string, string> = {
  reached: "Read up to date",
  partial: "Partly read",
  permission_missing: "Permission missing",
  not_configured: "Not configured",
  error: "Error",
};

export function CoveragePanel() {
  const ws = getWorkspaceId() ?? "";
  const q = useGetAgentActivityCoverageQuery({ ws });
  const failure = classifyAr(q.error);
  const c = q.data?.data;
  return (
    <Panel title="Sources" description="Absence of events is only meaningful where a source is reading.">
      {q.isLoading ? <p role="status" className="text-[13px] text-(--color-text-muted)">Loading sources…</p> : null}
      {failure && !c ? <ReadFailure failure={failure} subject="sources" onRetry={() => void q.refetch()} /> : null}
      {c ? (
        <div className="space-y-3 text-[13px]">
          <p>
            Events are kept for <strong>{c.retention_days} days</strong>.
          </p>
          <div>
            <p className="mb-1 font-medium">OpenTelemetry (OTLP)</p>
            <p className="flex flex-wrap items-center gap-2 text-(--color-text-secondary)">
              {c.otlp.live_tokens > 0 ? <StatusBadge tone={c.otlp.last_used_at ? "success" : "warning"}>{c.otlp.last_used_at ? "Receiving" : "Token not used yet"}</StatusBadge> : <StatusBadge tone="neutral">No live token</StatusBadge>}
              {c.otlp.live_tokens} live {c.otlp.live_tokens === 1 ? "token" : "tokens"}
              {c.otlp.last_used_at ? `, last used ${shortTime(c.otlp.last_used_at)}` : ""}
            </p>
          </div>
          <div>
            <p className="mb-1 font-medium">AgentCore spans</p>
            {c.agentcore_spans.length ? (
              <ul className="divide-y divide-(--color-border-subtle)">
                {c.agentcore_spans.map((s) => (
                  <li key={`${s.connector_id}/${s.region}/${s.stream}`} className="space-y-0.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={s.state === "reached" ? "success" : s.state === "partial" || s.state === "not_configured" || s.state === "permission_missing" ? "warning" : s.state === "error" ? "danger" : "neutral"}>{STATE_TEXT[s.state] ?? (s.state || "unknown")}</StatusBadge>
                      <Mono>{s.region || "no region"}</Mono>
                      <span className="text-xs text-(--color-text-muted)">connection {s.connector_id.slice(0, 8)}</span>
                    </div>
                    <p className="text-xs text-(--color-text-secondary)">
                      Read up to {shortTime(s.cursor_at)}, last scan {shortTime(s.last_scan_at)}, {s.rows_written} events written
                    </p>
                    {s.last_error ? <p className="text-xs text-(--color-danger-text)">{s.error_code ? `${s.error_code}: ` : ""}{s.last_error}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-(--color-text-secondary)">No AgentCore span reader has run in this workspace.</p>
            )}
          </div>
          <p className="text-xs text-(--color-text-muted)">
            CloudTrail activity of AI workloads and agents is recorded from scans and the event stream of each connection. Spans follow the OpenTelemetry GenAI conventions ({c.semantic_conventions}).
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
