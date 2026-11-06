/**
 * The span tree of one trace. Route /iga/agent-runtime/activity/traces/:traceId.
 * Needs discovery:read. 404 when this workspace holds no span of the trace; capped at 2000 spans (`truncated`).
 */

import { Link, useParams } from "react-router-dom";

import { useGetAgentActivityTraceQuery, type AgentActivityNode } from "@/app/api/igaAgentActivityApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { StatusBadge } from "@/components/console/status";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { Button } from "@/components/ui/button";
import { getWorkspaceId } from "@/utils/workspace";

import { classifyAr } from "../model";
import { ReadFailure } from "../parts";
import { activityFacts, ACTIVITY_HREF, attributionText, kindText, OUTCOME, shortId, sourceText, timeText } from "./activityModel";

function Node({ n, depth }: { n: AgentActivityNode; depth: number }) {
  const outcome = OUTCOME[n.outcome];
  const facts = activityFacts(n);
  return (
    <li>
      <div className="space-y-1 border-l-2 border-(--color-border-subtle) py-2 pl-3" style={{ marginLeft: Math.min(depth, 8) * 16 }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge tone="neutral">{kindText(n.kind)}</StatusBadge>
          <StatusBadge tone={outcome?.tone ?? "neutral"}>{outcome?.label ?? n.outcome}</StatusBadge>
          <time dateTime={n.occurred_at} className="text-xs tabular-nums text-(--color-text-muted)">
            {timeText(n.occurred_at)}
          </time>
          <span className="text-xs text-(--color-text-muted)">{sourceText(n.source)}</span>
        </div>
        <p className="break-words text-[13px] font-medium">
          {n.action || "(no action recorded)"}
          {n.resource_ref ? <span className="font-normal text-(--color-text-secondary)"> on </span> : null}
          {n.resource_ref ? <span className="break-all font-mono text-xs font-normal">{n.resource_ref}</span> : null}
        </p>
        <p className="text-xs text-(--color-text-secondary)">
          {n.workload_id ? `Workload ${shortId(n.workload_id)} · ` : ""}
          {n.identity_id ? `Identity ${shortId(n.identity_id)} · ` : ""}
          {attributionText(n)}
          {facts.length ? ` · ${facts.map((f) => `${f.label}: ${f.value}`).join(", ")}` : ""}
        </p>
        <p className="font-mono text-[11px] text-(--color-text-muted)">span {n.span_id || "none"}</p>
      </div>
      {n.children.length ? (
        <ul>
          {n.children.map((c) => (
            <Node key={c.id} n={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function ActivityTracePage() {
  const ws = getWorkspaceId() ?? "";
  const { traceId = "" } = useParams<{ traceId: string }>();
  const q = useGetAgentActivityTraceQuery({ ws, traceId }, { skip: !traceId });
  const t = q.data?.data;
  useBreadcrumbTail(traceId ? `${ACTIVITY_HREF}/traces/${traceId}` : null, `Trace ${traceId.slice(0, 8)}`, { label: "Agent activity", href: ACTIVITY_HREF });
  const failure = classifyAr(q.error);
  return (
    <ConsolePage
      title="Trace"
      description={traceId ? `Spans AuthSec recorded for trace ${traceId}.` : undefined}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to={ACTIVITY_HREF}>All activity</Link>
        </Button>
      }
    >
      {q.isLoading ? <p role="status" className="text-sm text-(--color-text-muted)">Loading trace…</p> : null}
      {failure && !t ? <ReadFailure failure={failure} subject="this trace" onRetry={() => void q.refetch()} /> : null}
      {t ? (
        <div className="space-y-3">
          <p className="text-xs text-(--color-text-muted)">
            {t.count} {t.count === 1 ? "span" : "spans"}. Only spans AuthSec received are shown; a span that was never sent, or is past retention, is missing, and its children appear as top-level.
          </p>
          {t.truncated ? (
            <p role="status" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
              This trace has more spans than can be shown; the first {t.count} are listed.
            </p>
          ) : null}
          <ul className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-2">
            {t.spans.map((n) => (
              <Node key={n.id} n={n} depth={0} />
            ))}
          </ul>
        </div>
      ) : null}
    </ConsolePage>
  );
}
