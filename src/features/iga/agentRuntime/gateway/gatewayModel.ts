/**
 * Words, option lists and the setup snippets of the agent runtime gateway screens
 * (SPEC-agent-runtime-gateway.md; deploy/agent-gateway/{values.yaml,config.example.yaml,README.md}).
 */

import config from "@/config";
import type { ConsoleTone } from "@/components/console/status";
import type { GatewayMode, PolicyEffect, PolicyKind, ToolPolicy, Weekday } from "@/app/api/igaAgentGatewayApi";

export const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

export const KIND_TEXT: Record<PolicyKind, string> = { mcp_tool: "MCP tool", model: "Model" };
export const EFFECT_TONE: Record<PolicyEffect, ConsoleTone> = { allow: "success", deny: "danger" };

/** agentgateway Reason* constants (internal/agentgateway/policy.go:27). */
export const REASON_TEXT: Record<string, string> = {
  policy_deny: "A deny policy matched",
  policy_allow: "An allow policy matched",
  rate_limited: "Over the policy's calls per minute",
  not_allowlisted: "Not on the allow list (deny unlisted)",
  default_allow: "No policy decided; observe mode allows",
  default_deny: "No policy decided; enforce mode denies",
  tool_definition_changed: "The tool definition changed since it was pinned",
  tool_not_pinned: "The tool is not pinned",
  pdp_unavailable: "AuthSec could not be reached",
  upstream_completed: "The upstream call completed",
};
export const reasonText = (r: string) => REASON_TEXT[r] ?? r.replace(/_/g, " ");

/** Decision `source` (services/agent_gateway_decisions.go:36). */
export const SOURCE_TEXT: Record<string, string> = {
  pdp: "AuthSec answered",
  cache: "Gateway cache",
  gateway: "Gateway decided",
  fail_open: "Fail open (AuthSec unreachable)",
  fail_closed: "Fail closed (AuthSec unreachable)",
};

export const MODE_COPY: Record<GatewayMode, { title: string; body: string }> = {
  observe: {
    title: "Observe",
    body: "A call that no policy decides is allowed (default_allow) and logged. Deny policies still deny. Use it to see what agents do before you restrict them.",
  },
  enforce: {
    title: "Enforce",
    body: "A call that no policy decides is denied (default_deny). Only what an allow policy covers gets through, and a gateway that cannot reach AuthSec fails closed.",
  },
};

/** "Every agent" / "Agent label prod-*" ... what a policy selects, in words. */
export function subjectSummary(p: ToolPolicy): string {
  const s = p.subject;
  const parts: string[] = [];
  if (s.agent_label) parts.push(`label ${s.agent_label}`);
  if (s.client_id) parts.push(`client ${s.client_id}`);
  if (s.identity_id) parts.push(`identity ${s.identity_id.slice(0, 8)}`);
  if (s.workload_id) parts.push(`workload ${s.workload_id.slice(0, 8)}`);
  if (s.gateway_id) parts.push(`gateway ${s.gateway_id.slice(0, 8)}`);
  return parts.length ? parts.join(", ") : "Every agent";
}

export function targetSummary(p: ToolPolicy): string {
  const t = p.target;
  if (p.kind === "model") return `${t.provider || "*"} / ${t.model || "*"}`;
  const where = t.server || t.server_url || "*";
  return `${where} / ${t.tool || "*"}`;
}

export function conditionSummary(p: ToolPolicy): string {
  const out: string[] = [];
  const w = p.conditions.time_window;
  if (w) {
    const days = w.days?.length ? w.days.join(", ") : "every day";
    const hours = w.start && w.end ? ` ${w.start}-${w.end}` : "";
    out.push(`${days}${hours} ${w.timezone || "UTC"}`);
  }
  if (p.conditions.max_calls_per_minute) out.push(`${p.conditions.max_calls_per_minute} calls/min`);
  if (p.deny_unlisted) out.push("deny unlisted");
  return out.join(" · ");
}

/* ------------------------------ setup snippets ------------------------------ */

/** deploy/agent-gateway/values.yaml: the Secret the chart reads the credential from (key authsec-credential). */
export const secretSnippet = (credential: string) =>
  `kubectl create secret generic agent-gateway \\
  --from-literal=authsec-credential='${credential}'
# add the other keys values.yaml reads: openai-api-key, anthropic-api-key,
# github-mcp-authorization, admin-token`;

/** deploy/agent-gateway/values.yaml env entry. */
export const HELM_ENV_SNIPPET = `env:
  - name: AUTHSEC_GATEWAY_CREDENTIAL
    valueFrom: { secretKeyRef: { name: agent-gateway, key: authsec-credential } }`;

/** deploy/agent-gateway/config.example.yaml, the authsec block and the part a first run needs. */
/** This console's API base plus /authsec: the PDP is /authsec/pdp/* (routes.go). */
const AUTHSEC_URL = `${config.VITE_API_URL.replace(/\/+$/, "")}/authsec`;

export const CONFIG_SNIPPET = `listen: ":8080"
authsec:
  url: ${AUTHSEC_URL}     # this console's AuthSec API base
  credential_env: AUTHSEC_GATEWAY_CREDENTIAL
  timeout_ms: 300
  hints_interval_s: 60
fail_mode: auto                           # auto | closed | open
agents:
  keys:                                   # agent-gateway gen-key -> sha256 here
    - id: billing-agent
      key_sha256: "<64 hex>"
      labels: [prod, billing]
mcp_servers:
  - name: github
    url: https://api.githubcopilot.com/mcp/
    path_prefix: /mcp/github
llm:
  - provider: openai
    api_key_env: OPENAI_API_KEY`;

export const dockerSnippet = (credential: string) =>
  `docker run -p 8080:8080 \\
  -v $PWD/config.yaml:/etc/agent-gateway/config.yaml:ro \\
  -e AUTHSEC_GATEWAY_CREDENTIAL='${credential}' \\
  authsec/agent-gateway:dev`;
