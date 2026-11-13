/** One timeline event: what happened, to what, by which identity or workload, and how it was matched. */

import { Link } from "react-router-dom";

import type { AgentActivity } from "@/app/api/igaAgentActivityApi";
import { StatusBadge } from "@/components/console/status";

import { activityFacts, attributionText, kindText, OUTCOME, shortId, sourceText, timeText, traceHref } from "./activityModel";

export function ActivityRow({ a, compact = false }: { a: AgentActivity; compact?: boolean }) {
  const outcome = OUTCOME[a.outcome];
  const facts = activityFacts(a);
  return (
    <li className="space-y-1 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <time dateTime={a.occurred_at} className="text-xs tabular-nums text-(--color-text-muted)">
          {timeText(a.occurred_at)}
        </time>
        <StatusBadge tone="neutral">{kindText(a.kind)}</StatusBadge>
        <StatusBadge tone={outcome?.tone ?? "neutral"}>{outcome?.label ?? a.outcome}</StatusBadge>
        {!compact ? <span className="text-xs text-(--color-text-muted)">{sourceText(a.source)}</span> : null}
        {a.trace_id ? (
          <Link to={traceHref(a.trace_id)} className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
            View trace
          </Link>
        ) : null}
      </div>
      <p className="break-words text-[13px] font-medium">
        {a.action || "(no action recorded)"}
        {a.resource_ref ? <span className="font-normal text-(--color-text-secondary)"> on </span> : null}
        {a.resource_ref ? <span className="break-all font-mono text-xs font-normal">{a.resource_ref}</span> : null}
      </p>
      <p className="text-xs text-(--color-text-secondary)">
        {a.workload_id ? <span title={a.workload_id}>Workload {shortId(a.workload_id)}</span> : null}
        {a.workload_id && a.identity_id ? " · " : null}
        {a.identity_id ? <span title={a.identity_id}>Identity {shortId(a.identity_id)}</span> : null}
        {a.workload_id || a.identity_id ? " · " : null}
        {attributionText(a)}
        {a.on_behalf_of ? ` · on behalf of ${a.on_behalf_of} (as stated by the sender)` : ""}
      </p>
      {facts.length ? (
        <p className="text-xs text-(--color-text-muted)">
          {facts.map((f) => `${f.label}: ${f.value}`).join(" · ")}
        </p>
      ) : null}
    </li>
  );
}
