/**
 * Words and helpers for the activity timeline (SPEC-agent-runtime-activity.md).
 * The backend stores no prompt or completion text, and nothing here renders
 * one: only the whitelisted facts below are read from `attrs`.
 */

import { useCallback, useState } from "react";

import { igaAgentActivityApi, useListAgentActivityQuery, type ActivityListArgs, type AgentActivity } from "@/app/api/igaAgentActivityApi";
import type { ConsoleTone } from "@/components/console/status";

import { classifyAr } from "../model";

export const SOURCE_TEXT: Record<string, string> = {
  cloudtrail: "CloudTrail",
  cloudtrail_data: "CloudTrail data events",
  agentcore_span: "AgentCore spans",
  otlp: "OpenTelemetry (OTLP)",
  authsec_decision: "AuthSec decision",
};

export const KIND_TEXT: Record<string, string> = {
  model_call: "Model call",
  tool_call: "Tool call",
  agent_step: "Agent step",
  cloud_action: "Cloud action",
  data_access: "Data access",
  sign_in: "Sign-in",
  decision: "Decision",
};

export const OUTCOME: Record<string, { label: string; tone: ConsoleTone }> = {
  success: { label: "Succeeded", tone: "success" },
  denied: { label: "Denied", tone: "warning" },
  error: { label: "Error", tone: "danger" },
};

export const sourceText = (s: string) => SOURCE_TEXT[s] ?? s;
export const kindText = (k: string) => KIND_TEXT[k] ?? k.replace(/_/g, " ");

/** attrs["attribution.how"] (agent_runtime_activity.go:162): how the row was tied to an identity or workload. */
const HOW_TEXT: Record<string, string> = {
  session_issuer: "the role that issued the session",
  principal_arn: "the calling principal ARN",
  "authsec.identity_arn": "the identity ARN the span stated",
  "authsec.workload_id": "the workload id the span stated",
  "cloud.resource_id": "the cloud resource id the span stated",
};

export function attributionHow(a: AgentActivity): string | null {
  const v = a.attrs?.["attribution.how"];
  return typeof v === "string" && v ? v : null;
}

/** A sentence on how the row was attributed; says so plainly when it was not. */
export function attributionText(a: AgentActivity): string {
  if (!a.identity_id && !a.workload_id) return "Not attributed to a known identity or workload";
  const how = attributionHow(a);
  if (!how) return "Attributed (basis not recorded)";
  const asserted = a.source === "otlp" ? " (asserted by the sender, not verified)" : "";
  return `Matched by ${HOW_TEXT[how] ?? how}${asserted}`;
}

/** The only attribute keys shown, with a label. Never a prompt, completion or message body. */
const FACTS: [string, string][] = [
  ["gen_ai.request.model", "Model"],
  ["gen_ai.response.model", "Response model"],
  ["gen_ai.tool.name", "Tool"],
  ["gen_ai.agent.name", "Agent"],
  ["gen_ai.usage.input_tokens", "Input tokens"],
  ["gen_ai.usage.output_tokens", "Output tokens"],
];

export function activityFacts(a: AgentActivity): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const [key, label] of FACTS) {
    const v = a.attrs?.[key];
    if (typeof v === "string" || typeof v === "number") out.push({ label, value: String(v) });
  }
  return out;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "";
}

export function timeText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s.trim());

export const traceHref = (traceId: string) => `/iga/agent-runtime/activity/traces/${encodeURIComponent(traceId)}`;
export const ACTIVITY_HREF = "/iga/agent-runtime/activity";

/**
 * The newest-first feed with keyset "load more": the first page is a cached query, later pages are
 * fetched with the previous page's `next_cursor` and appended. A different filter starts over.
 */
export function useActivityFeed(args: ActivityListArgs, skip = false) {
  const key = JSON.stringify({ ...args, cursor: undefined });
  const first = useListAgentActivityQuery(args, { skip });
  const [fetchPage] = igaAgentActivityApi.useLazyListAgentActivityQuery();
  const [more, setMore] = useState<{ key: string; rows: AgentActivity[]; next: string | null; busy: boolean; failed: boolean }>({ key, rows: [], next: null, busy: false, failed: false });
  const cur = more.key === key ? more : { key, rows: [], next: null, busy: false, failed: false };

  const firstRows = first.data?.data ?? [];
  const seen = new Set(firstRows.map((r) => r.id));
  const rows = [...firstRows, ...cur.rows.filter((r) => !seen.has(r.id))];
  const next = (cur.rows.length ? cur.next : first.data?.meta.next_cursor) || null;

  const loadMore = useCallback(async () => {
    if (!next) return;
    setMore({ ...cur, busy: true, failed: false });
    try {
      const page = await fetchPage({ ...args, cursor: next }).unwrap();
      setMore({ key, rows: [...cur.rows, ...page.data], next: page.meta.next_cursor || null, busy: false, failed: false });
    } catch {
      setMore({ ...cur, busy: false, failed: true });
    }
    // `args` is captured by value through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, cur, key, fetchPage]);

  return {
    rows,
    hasMore: !!next,
    loadMore,
    loadingMore: cur.busy,
    loadMoreFailed: cur.failed,
    loading: first.isLoading,
    failure: classifyAr(first.error),
    hasData: !!first.data,
    refetch: () => void first.refetch(),
  };
}
