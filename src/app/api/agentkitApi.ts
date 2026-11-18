/**
 * AuthSec Agent Kit (authsec-cli) — the console side of machines.
 *
 * A machine running the daemon is a discovery source of kind `vm_sensor`; its
 * agents are ordinary discovered agents (metadata.machine). This slice adds
 * what the daemon reports beyond sightings and the policies machines pull:
 *
 *   GET  /authsec/discovery/agentkit/events                    logs (discovery:read)
 *   GET  /authsec/discovery/agentkit/access                    latest access summaries
 *   GET  /authsec/discovery/agentkit/policies                  latest policy per agent
 *   GET  /authsec/discovery/agentkit/policies/:agent/versions  history
 *   PUT  /authsec/discovery/agentkit/policies/:agent           save (discovery:admin)
 *   POST /authsec/discovery/agentkit/policies/:agent/block     right-click "block"
 */

import { baseApi } from "./baseApi";

export type AgentKitEventType =
  | "decision"
  | "detection"
  | "agent_started"
  | "agent_stopped"
  | "sensor"
  | "access";

/** One record a machine's daemon reported. `record` is the daemon's own log line plus `tags` and `host`. */
export interface AgentKitEvent {
  id: string;
  discovery_source_id: string;
  observed_at: string;
  received_at: string;
  type: AgentKitEventType;
  kind: string;
  action: string;
  rule: string;
  severity: "" | "high" | "medium" | "low";
  enforced: boolean;
  agent_id: string;
  agent_name: string;
  agent_pid: number;
  record: AgentKitRecord;
}

export interface AgentKitRecord {
  ts?: string;
  type?: string;
  host?: string;
  tags?: string[];
  note?: string;
  path?: string;
  access?: string;
  sensitive?: boolean;
  comm?: string;
  exe?: string;
  args?: string[];
  dst?: {
    ip?: string;
    port?: number;
    host?: string;
    service?: string;
    llm?: boolean;
  };
  evidence?: string[];
  source?: string;
  [k: string]: unknown;
}

export interface AgentKitEventFilters {
  discovery_source_id?: string;
  type?: AgentKitEventType[];
  agent_id?: string;
  severity?: string;
  action?: string;
  tag?: string;
  enforced?: boolean;
  since?: string;
  before?: string;
  limit?: number;
}

/** What one agent reached in the last hour (authsec-cli access.Summary). */
export interface AccessSummary {
  id: string;
  name: string;
  pids?: number[];
  users?: string[];
  running?: boolean;
  threat?: boolean;
  files?: {
    path: string;
    access: string;
    sensitive?: boolean;
    count: number;
    last: string;
  }[];
  destinations?: {
    host?: string;
    ip?: string;
    port: number;
    service?: string;
    category?: string;
    llm?: boolean;
    count: number;
    last: string;
  }[];
  services?: string[];
  commands?: {
    program?: string;
    command?: string;
    example?: string[];
    count: number;
    last: string;
  }[];
}

export interface AgentKitAccess {
  discovery_source_id: string;
  agent_id: string;
  agent_name: string;
  observed_at: string;
  record: { summary?: AccessSummary; host?: string };
}

export interface AgentKitPolicy {
  id: string;
  agent_id: string;
  version: number;
  document: string;
  sha256: string;
  comment: string;
  created_by?: string;
  created_at: string;
}

export type BlockType = "host" | "cidr" | "path" | "command" | "mcp";

export interface BlockRequest {
  type: BlockType;
  value: string;
  port?: number;
}

export interface BlockResult {
  policy: AgentKitPolicy;
  created: boolean;
  from: "own" | "default" | "new";
  enforced: boolean;
}

export const agentkitApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAgentKitEvents: builder.query<
      { events: AgentKitEvent[]; next_cursor: string | null },
      AgentKitEventFilters
    >({
      query: (f) => ({
        url: "/authsec/discovery/agentkit/events",
        method: "GET",
        params: {
          ...(f.discovery_source_id
            ? { discovery_source_id: f.discovery_source_id }
            : {}),
          ...(f.type?.length ? { type: f.type.join(",") } : {}),
          ...(f.agent_id ? { agent_id: f.agent_id } : {}),
          ...(f.severity ? { severity: f.severity } : {}),
          ...(f.action ? { action: f.action } : {}),
          ...(f.tag ? { tag: f.tag } : {}),
          ...(f.enforced ? { enforced: "true" } : {}),
          ...(f.since ? { since: f.since } : {}),
          ...(f.before ? { before: f.before } : {}),
          ...(f.limit ? { limit: f.limit } : {}),
        },
      }),
      transformResponse: (r: {
        events?: AgentKitEvent[];
        next_cursor?: string | null;
      }) => ({
        events: r.events ?? [],
        next_cursor: r.next_cursor ?? null,
      }),
      providesTags: ["AgentKitEvent"],
    }),
    listAgentKitAccess: builder.query<
      AgentKitAccess[],
      { discovery_source_id?: string; agent_id?: string } | void
    >({
      query: (f) => ({
        url: "/authsec/discovery/agentkit/access",
        method: "GET",
        params: {
          ...(f?.discovery_source_id
            ? { discovery_source_id: f.discovery_source_id }
            : {}),
          ...(f?.agent_id ? { agent_id: f.agent_id } : {}),
        },
      }),
      transformResponse: (r: { access?: AgentKitAccess[] }) => r.access ?? [],
      providesTags: ["AgentKitEvent"],
    }),
    listAgentKitPolicies: builder.query<AgentKitPolicy[], void>({
      query: () => ({
        url: "/authsec/discovery/agentkit/policies",
        method: "GET",
      }),
      transformResponse: (r: { policies?: AgentKitPolicy[] }) =>
        r.policies ?? [],
      providesTags: ["AgentKitPolicy"],
    }),
    listAgentKitPolicyVersions: builder.query<AgentKitPolicy[], string>({
      query: (agent) => ({
        url: `/authsec/discovery/agentkit/policies/${encodeURIComponent(agent)}/versions`,
        method: "GET",
      }),
      transformResponse: (r: { versions?: AgentKitPolicy[] }) =>
        r.versions ?? [],
      providesTags: (_r, _e, agent) => [{ type: "AgentKitPolicy", id: agent }],
    }),
    putAgentKitPolicy: builder.mutation<
      { policy: AgentKitPolicy; created: boolean },
      {
        agent: string;
        document: string;
        comment?: string;
        base_version: number;
      }
    >({
      query: ({ agent, ...body }) => ({
        url: `/authsec/discovery/agentkit/policies/${encodeURIComponent(agent)}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { agent }) => [
        "AgentKitPolicy",
        { type: "AgentKitPolicy", id: agent },
      ],
    }),
    blockAgentKitResource: builder.mutation<
      BlockResult,
      { agent: string } & BlockRequest
    >({
      query: ({ agent, ...body }) => ({
        url: `/authsec/discovery/agentkit/policies/${encodeURIComponent(agent)}/block`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { agent }) => [
        "AgentKitPolicy",
        { type: "AgentKitPolicy", id: agent },
      ],
    }),
  }),
});

export const {
  useListAgentKitEventsQuery,
  useListAgentKitAccessQuery,
  useListAgentKitPoliciesQuery,
  useListAgentKitPolicyVersionsQuery,
  usePutAgentKitPolicyMutation,
  useBlockAgentKitResourceMutation,
} = agentkitApi;
