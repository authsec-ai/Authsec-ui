/**
 * Discovery API — agent discovery across Kubernetes, cloud, VM and repo channels.
 *
 * PROTOTYPE. Implements the team's discovery design (doc §9.1–9.3): a connector
 * fabric feeding a quarantine-first inventory keyed by a stable fingerprint.
 *
 * The backend for these endpoints does NOT exist yet. Every hook below falls back
 * to `MOCK_*` fixtures so the screens render the intended flow. Delete the fixtures
 * and the `useMock` branches once `/authsec/discovery/*` ships — nothing else in
 * these files depends on them.
 */

import { baseApi } from "./baseApi";

// ── Types (mirror the team's proposed DDL) ──────────────────────────────────

export type DiscoverySourceKind =
  | "k8s_webhook"
  | "aws"
  | "azure"
  | "gcp"
  | "vm_sensor"
  | "repo_scan";

export type DiscoverySourceStatus = "ok" | "degraded" | "failed" | "never_run";

/** discovery_sources — per-workspace channel configuration. */
export interface DiscoverySource {
  id: string;
  workspace_id: string;
  kind: DiscoverySourceKind;
  display_name: string;
  /** Config never holds raw secrets — a Vault reference, resolved at runtime. */
  config: Record<string, unknown>;
  enabled: boolean;
  last_sync_at: string | null;
  last_status: DiscoverySourceStatus | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type DiscoveredAgentStatus = "new" | "registered" | "quarantined";

/** discovered_agents — one row per distinct agent sighting, deduped by fingerprint. */
export interface DiscoveredAgent {
  id: string;
  workspace_id: string;
  source: DiscoverySourceKind;
  discovery_source_id: string | null;
  fingerprint: string;
  display_name: string | null;
  metadata: Record<string, unknown>;
  /** mcp_oauth_clients.id once claimed. */
  matched_client_id: string | null;
  status: DiscoveredAgentStatus;
  first_seen_at: string;
  last_seen_at: string;
}

export const SOURCE_LABELS: Record<DiscoverySourceKind, string> = {
  k8s_webhook: "Kubernetes",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  vm_sensor: "VM / endpoint",
  repo_scan: "CI/CD & IaC",
};

/** Detection cadence per channel, from the team's connector table (doc §9.2). */
export const SOURCE_CADENCE: Record<DiscoverySourceKind, string> = {
  k8s_webhook: "Real-time",
  aws: "Real-time + Scheduled",
  azure: "Real-time + Scheduled",
  gcp: "Real-time + Scheduled",
  vm_sensor: "Periodic",
  repo_scan: "Scheduled",
};

// ── Mock fixtures — remove when the backend lands ───────────────────────────

const MOCK_SOURCES: DiscoverySource[] = [
  {
    id: "ds-1",
    workspace_id: "ws",
    kind: "k8s_webhook",
    display_name: "prod-eks-us-east",
    config: { cluster: "prod-eks-us-east", namespaces: ["default", "ml", "agents"] },
    enabled: true,
    last_sync_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    last_status: "ok",
    last_error: null,
    created_at: new Date(Date.now() - 32 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: "ds-2",
    workspace_id: "ws",
    kind: "aws",
    display_name: "acme-prod (123456789012)",
    config: { account_id: "123456789012", regions: ["us-east-1", "eu-west-1"] },
    enabled: true,
    last_sync_at: new Date(Date.now() - 18 * 60_000).toISOString(),
    last_status: "degraded",
    last_error: "CloudTrail lookup throttled in eu-west-1; scheduled sweep incomplete",
    created_at: new Date(Date.now() - 21 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
  {
    id: "ds-3",
    workspace_id: "ws",
    kind: "azure",
    display_name: "acme-ai-sub",
    config: { subscription_id: "8f1c…a204" },
    enabled: true,
    last_sync_at: new Date(Date.now() - 55 * 60_000).toISOString(),
    last_status: "ok",
    last_error: null,
    created_at: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 55 * 60_000).toISOString(),
  },
  {
    id: "ds-4",
    workspace_id: "ws",
    kind: "vm_sensor",
    display_name: "agent-shield fleet",
    config: { enrolled_hosts: 42 },
    enabled: true,
    last_sync_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    last_status: "ok",
    last_error: null,
    created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
  },
  {
    id: "ds-5",
    workspace_id: "ws",
    kind: "repo_scan",
    display_name: "github.com/acme",
    config: { org: "acme", repos: 118 },
    enabled: false,
    last_sync_at: null,
    last_status: "never_run",
    last_error: null,
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  {
    id: "ds-6",
    workspace_id: "ws",
    kind: "gcp",
    display_name: "acme-vertex-prod",
    config: { project_id: "acme-vertex-prod" },
    enabled: true,
    last_sync_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    last_status: "failed",
    last_error: "Asset Inventory API returned 403 — service account missing cloudasset.assets.searchAllResources",
    created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  },
];

const MOCK_AGENTS: DiscoveredAgent[] = [
  {
    id: "da-1",
    workspace_id: "ws",
    source: "k8s_webhook",
    discovery_source_id: "ds-1",
    fingerprint: "k8s:prod-eks-us-east/agents/Deployment/refund-reviewer",
    display_name: "refund-reviewer",
    metadata: {
      namespace: "agents",
      kind: "Deployment",
      image: "acme/refund-reviewer:2.14.0",
      service_account: "refund-reviewer-sa",
      matched_on: ["authsec.io/agent label", "langchain in image layers"],
      env_refs: ["OPENAI_API_BASE", "MCP_CONFIG_PATH"],
      replicas: 3,
    },
    matched_client_id: null,
    status: "new",
    first_seen_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    last_seen_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: "da-2",
    workspace_id: "ws",
    source: "k8s_webhook",
    discovery_source_id: "ds-1",
    fingerprint: "k8s:prod-eks-us-east/agents/Deployment/refund-reviewer-staging",
    display_name: "refund-reviewer-staging",
    metadata: {
      namespace: "agents",
      kind: "Deployment",
      image: "acme/refund-reviewer:2.15.0-rc1",
      service_account: "refund-reviewer-sa",
      matched_on: ["authsec.io/agent label"],
      replicas: 1,
    },
    matched_client_id: null,
    status: "new",
    first_seen_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    last_seen_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    id: "da-3",
    workspace_id: "ws",
    source: "aws",
    discovery_source_id: "ds-2",
    fingerprint: "aws:123456789012:lambda:us-east-1:invoice-summariser",
    display_name: "invoice-summariser",
    metadata: {
      service: "lambda",
      region: "us-east-1",
      runtime: "python3.12",
      matched_on: ["bedrock:InvokeModel in execution role"],
      role: "arn:aws:iam::123456789012:role/invoice-summariser-exec",
    },
    matched_client_id: "c7f1a0e2-3b44-4a91-9d02-8e5c1f77b310",
    status: "registered",
    first_seen_at: new Date(Date.now() - 19 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 22 * 60_000).toISOString(),
  },
  {
    id: "da-4",
    workspace_id: "ws",
    source: "azure",
    discovery_source_id: "ds-3",
    fingerprint: "azure:acme-ai-sub:containerapp:support-triage",
    display_name: "support-triage",
    metadata: {
      service: "container-apps",
      matched_on: ["Azure OpenAI endpoint in env", "mcp.json mounted"],
      managed_identity: "support-triage-mi",
    },
    matched_client_id: null,
    status: "quarantined",
    first_seen_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 55 * 60_000).toISOString(),
  },
  {
    id: "da-5",
    workspace_id: "ws",
    source: "vm_sensor",
    discovery_source_id: "ds-4",
    fingerprint: "vm:host-eng-114:proc:claude-code",
    display_name: "claude-code (local)",
    metadata: {
      host: "host-eng-114",
      process: "node /usr/local/bin/claude",
      matched_on: ["MCP config in ~/.claude", "known AI client process name"],
      user: "aditya",
      confidence: "medium",
    },
    matched_client_id: null,
    status: "new",
    first_seen_at: new Date(Date.now() - 40 * 60_000).toISOString(),
    last_seen_at: new Date(Date.now() - 40 * 60_000).toISOString(),
  },
  {
    id: "da-6",
    workspace_id: "ws",
    source: "k8s_webhook",
    discovery_source_id: "ds-1",
    fingerprint: "k8s:prod-eks-us-east/ml/Job/nightly-embed",
    display_name: "nightly-embed",
    metadata: {
      namespace: "ml",
      kind: "Job",
      image: "acme/embed-worker:1.4.2",
      service_account: "default",
      matched_on: ["openai in requirements layer"],
      confidence: "low",
    },
    matched_client_id: null,
    status: "new",
    first_seen_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 11 * 3_600_000).toISOString(),
  },
];

// ── Endpoints ───────────────────────────────────────────────────────────────

export const discoveryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listDiscoverySources: builder.query<DiscoverySource[], void>({
      query: () => ({ url: "/authsec/discovery/sources", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "DiscoverySource" as const, id })),
              "DiscoverySource" as const,
            ]
          : ["DiscoverySource" as const],
    }),

    listDiscoveredAgents: builder.query<DiscoveredAgent[], void>({
      query: () => ({ url: "/authsec/discovery/agents", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "DiscoveredAgent" as const, id })),
              "DiscoveredAgent" as const,
            ]
          : ["DiscoveredAgent" as const],
    }),

    setDiscoverySourceEnabled: builder.mutation<
      DiscoverySource,
      { id: string; enabled: boolean }
    >({
      query: ({ id, enabled }) => ({
        url: `/authsec/discovery/sources/${id}`,
        method: "PATCH",
        body: { enabled },
      }),
      invalidatesTags: ["DiscoverySource"],
    }),

    /** provision | quarantine — the decision in doc §9.1. */
    decideDiscoveredAgent: builder.mutation<
      DiscoveredAgent,
      { id: string; decision: "provision" | "quarantine" }
    >({
      query: ({ id, decision }) => ({
        url: `/authsec/discovery/agents/${id}/decision`,
        method: "POST",
        body: { decision },
      }),
      invalidatesTags: ["DiscoveredAgent"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListDiscoverySourcesQuery,
  useListDiscoveredAgentsQuery,
  useSetDiscoverySourceEnabledMutation,
  useDecideDiscoveredAgentMutation,
} = discoveryApi;

/**
 * Until `/authsec/discovery/*` exists every query 404s. These helpers swap in the
 * fixtures so the screens are reviewable. Remove alongside the fixtures.
 */
export function useDiscoverySourcesWithFallback() {
  const q = useListDiscoverySourcesQuery();
  return { ...q, data: q.data ?? MOCK_SOURCES, usingMock: q.data === undefined };
}

export function useDiscoveredAgentsWithFallback() {
  const q = useListDiscoveredAgentsQuery();
  return { ...q, data: q.data ?? MOCK_AGENTS, usingMock: q.data === undefined };
}
