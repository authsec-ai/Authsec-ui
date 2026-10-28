/**
 * Agent Inventory API — RTK Query endpoints for /authsec/discovery/agents.
 *
 * Provides the All Agents inventory (Batch 17, UI01-UI12): full filter/pagination
 * support for discovery agents, their instances, effective policy, and enforcement
 * binding endpoints.
 *
 * Types model the expanded response shape per API01-API06.
 */

import { baseApi } from "./baseApi";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PolicySummary {
  policy_count: number;
  published_count: number;
  draft_count: number;
}

export interface EnforcementSummary {
  backend: "authsec" | "openshell" | "none";
  state: string;
  coverage_pct: number;
}

export type RuntimeKind = "linux" | "kubernetes";

export type IdentityState =
  | "pending"
  | "attested"
  | "verified"
  | "disabled"
  | "revoked"
  | "unregistered"
  | "registered"
  | "quarantined"
  | "ignored";

export type IdentityMode = "" | "spiffe" | "enrolled_mtls";

export interface DiscoveryAgent {
  id: string;
  workspace_id: string;
  workload_id: string;
  workload_name: string;
  runtime_kind: RuntimeKind;
  owner_user_id: string | null;
  identity_state: IdentityState;
  spiffe_id: string | null;
  identity_mode: IdentityMode;
  policy_summary: PolicySummary | null;
  enforcement_summary: EnforcementSummary | null;
  /** Observed runtime, when the row came from a discovery sighting. */
  runtime_status?: string;
  /** Other sightings of the same logical agent, when a second source attached. */
  also_seen?: string[];
  last_seen_at: string | null;
  created_at: string;
}

export interface AgentListResponse {
  agents: DiscoveryAgent[];
  total: number;
  next_cursor: string | null;
}

export interface AgentListParams {
  cursor?: string;
  limit?: number;
  search?: string;
  runtime_kind?: RuntimeKind;
  identity_state?: IdentityState;
  enforcement_backend?: string;
  policy_id?: string;
}

export interface AgentInstanceRow {
  id: string;
  agent_id: string;
  workload_id: string;
  execution_id: string;
  principal: string;
  backend: string;
  binding_id: string | null;
  policy_digest: string;
  status: string;
  last_seen_at: string | null;
}

export interface EffectivePolicyRevision {
  policy_id: string;
  policy_name: string;
  revision: number;
  content_hash: string;
  format: string;
  state: string;
}

export interface PrimitiveCoverage {
  primitive_id: string;
  discovery_status: string;
  enforcement_status: string;
  backend?: string;
  profile?: string;
}

export interface AgentEffectivePolicy {
  contributing_revisions: EffectivePolicyRevision[];
  primitive_coverage: PrimitiveCoverage[];
}

// ── RTK Query endpoints ──────────────────────────────────────────────────────

const BASE = "/authsec/discovery/agents";

/** Sighting row from GET /authsec/discovery/agents. Not the SPIRE agent record. */
interface SightingRow {
  id?: string;
  workspace_id?: string;
  display_name?: string;
  source?: string;
  status?: string;
  runtime_status?: string;
  owner_user_id?: string | null;
  last_seen_at?: string | null;
  created_at?: string;
  /** Adopted iga_workload id. Empty when this sighting has no workload. */
  workload_id?: string;
  metadata?: {
    sources?: Array<{
      source?: string;
      kind?: string;
      display_name?: string;
      fingerprint?: string;
    }>;
  };
}

function runtimeKindOf(source: string | undefined): RuntimeKind {
  if (!source || source.includes("k8s")) return "kubernetes";
  if (source.includes("linux") || source === "vm_sensor") return "linux";
  return "kubernetes";
}

function alsoSeenOf(row: SightingRow): string[] | undefined {
  const sources = row.metadata?.sources;
  if (!Array.isArray(sources) || sources.length === 0) return undefined;
  const names = sources
    .map((s) => s.display_name || s.kind || s.source || "")
    .filter((name) => name.length > 0);
  return names.length > 0 ? names : undefined;
}

function identityStateOf(status: string | undefined): IdentityState {
  switch (status) {
    case "registered":
    case "quarantined":
    case "ignored":
    case "unregistered":
    case "pending":
    case "attested":
    case "verified":
    case "disabled":
    case "revoked":
      return status;
    default:
      return "unregistered";
  }
}

function asInventoryAgent(row: SightingRow): DiscoveryAgent {
  return {
    id: row.id ?? "",
    workspace_id: row.workspace_id ?? "",
    workload_id: row.workload_id ?? "",
    workload_name: row.display_name || row.id || "Unnamed agent",
    runtime_kind: runtimeKindOf(row.source),
    owner_user_id: row.owner_user_id ?? null,
    identity_state: identityStateOf(row.status),
    spiffe_id: null,
    identity_mode: "",
    policy_summary: null,
    enforcement_summary: null,
    runtime_status: row.runtime_status,
    also_seen: alsoSeenOf(row),
    last_seen_at: row.last_seen_at ?? null,
    created_at: row.created_at ?? "",
  };
}

function sightingList(raw: unknown): { agents: SightingRow[]; total: number } {
  const body = (raw ?? {}) as {
    data?: { agents?: SightingRow[]; total?: number };
    agents?: SightingRow[];
    total?: number;
  };
  const nested = body.data && Array.isArray(body.data.agents) ? body.data : body;
  const agents = Array.isArray(nested.agents) ? nested.agents : [];
  return { agents, total: typeof nested.total === "number" ? nested.total : agents.length };
}

export const agentInventoryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Named apart from workloadsApi.listAgents. That endpoint is the SPIRE
    // list, registered first, and a second listAgents is ignored — the page
    // was calling GET /authsec/spiresvc/v1/agents, which is not a route.
    listInventoryAgents: builder.query<AgentListResponse, AgentListParams | void>({
      query: (params) => {
        const p = params ?? {};
        const qs = new URLSearchParams();
        if (p.cursor) qs.set("cursor", p.cursor);
        if (p.limit) qs.set("limit", String(p.limit));
        if (p.search) qs.set("search", p.search);
        if (p.runtime_kind) qs.set("runtime_kind", p.runtime_kind);
        if (p.identity_state) qs.set("identity_state", p.identity_state);
        if (p.enforcement_backend) qs.set("enforcement_backend", p.enforcement_backend);
        if (p.policy_id) qs.set("policy_id", p.policy_id);
        const query = qs.toString();
        return { url: query ? `${BASE}?${query}` : BASE, method: "GET" };
      },
      transformResponse: (raw: unknown): AgentListResponse => {
        const { agents, total } = sightingList(raw);
        return {
          agents: agents.filter((row) => !!row.id).map(asInventoryAgent),
          total,
          next_cursor: null,
        };
      },
      providesTags: (result) =>
        result
          ? [
              ...result.agents.map((a) => ({
                type: "DiscoveryAgent" as const,
                id: a.id,
              })),
              { type: "DiscoveryAgent" as const, id: "LIST" },
            ]
          : [{ type: "DiscoveryAgent" as const, id: "LIST" }],
    }),

    // ── Get single agent ─────────────────────────────────────────────
    getInventoryAgent: builder.query<DiscoveryAgent, string>({
      query: (id) => ({ url: `${BASE}/${id}`, method: "GET" }),
      transformResponse: (raw: unknown) => {
        const body = (raw ?? {}) as { data?: SightingRow } & SightingRow;
        const row = body.data && typeof body.data === "object" && body.data.id ? body.data : body;
        return asInventoryAgent(row);
      },
      providesTags: (_r, _e, id) => [{ type: "DiscoveryAgent" as const, id }],
    }),

    // ── Agent instances ──────────────────────────────────────────────
    getAgentInstances: builder.query<AgentInstanceRow[], string>({
      query: (agentId) => ({
        url: `${BASE}/${agentId}/instances`,
        method: "GET",
      }),
      transformResponse: (raw: { data: AgentInstanceRow[] }) =>
        raw.data ?? [],
      providesTags: (_r, _e, id) => [
        { type: "DiscoveryAgent" as const, id: `instances-${id}` },
      ],
    }),

    // ── Effective policy ─────────────────────────────────────────────
    getAgentEffectivePolicy: builder.query<AgentEffectivePolicy, string>({
      query: (agentId) => ({
        url: `${BASE}/${agentId}/effective-policy`,
        method: "GET",
      }),
      transformResponse: (raw: { data: AgentEffectivePolicy }) => raw.data,
      providesTags: (_r, _e, id) => [
        { type: "DiscoveryAgent" as const, id: `effective-${id}` },
      ],
    }),
  }),
});

export const {
  useListInventoryAgentsQuery,
  useGetInventoryAgentQuery,
  useGetAgentInstancesQuery,
  useGetAgentEffectivePolicyQuery,
} = agentInventoryApi;
