/**
 * Discovery API — wired to the real backend on `/authsec/discovery/*`.
 *
 * Types mirror `models/discovery.go` exactly. Response envelopes are
 * `{sources: […]}` and `{agents: […], total: n}`.
 *
 * Live: sources CRUD, agents list/get/update/delete, claim, quarantine, coverage.
 * Still mocked: Identities — the backend has no identity endpoint, so that page
 * keeps its fixtures and says so.
 *
 * RBAC: reads need `discovery:read`, source writes `discovery:admin`,
 * `discovery:claim` and `discovery:quarantine` are separate permissions. A 403
 * means the role is missing the permission, not that the feature is broken.
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

/** discovery_sources — per-workspace channel configuration. */
export interface DiscoverySource {
  id: string;
  workspace_id: string;
  kind: DiscoverySourceKind;
  display_name: string;
  /** Config never holds raw secrets — a Vault reference, resolved at runtime. */
  config: Record<string, unknown>;
  enabled: boolean;
  /** omitempty on the wire — absent, not null, when never synced. */
  last_sync_at?: string;
  /** Free text from the connector; "" when never run. Not an enum. */
  last_status: string;
  last_error: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Moves forward only; never returns to unregistered. */
export type DiscoveredAgentStatus =
  | "unregistered"
  | "registered"
  | "quarantined"
  | "ignored";

/** A manually run agent is the higher-risk, harder-to-attribute case. */
export type DeploymentOrigin = "manual" | "automated" | "unknown";

/** Where the agent's authority comes from. "" until known. */
export type AgentArchetype = "" | "autonomous" | "user_delegated" | "hybrid";

/** discovered_agents — one row per distinct sighting, deduped by fingerprint. */
export interface DiscoveredAgent {
  id: string;
  workspace_id: string;
  source: DiscoverySourceKind;
  discovery_source_id?: string;
  fingerprint: string;
  display_name: string;
  metadata: Record<string, unknown>;
  deployment_origin: DeploymentOrigin;
  archetype: AgentArchetype;
  /** mcp_oauth_clients.id — set by claim. */
  matched_client_id?: string;
  /** The accountable human — set by claim. */
  owner_user_id?: string;
  status: DiscoveredAgentStatus;
  claimed_by?: string;
  claimed_at?: string;
  quarantined_by?: string;
  quarantined_at?: string;
  quarantine_reason: string;
  first_seen_at: string;
  last_seen_at: string;
  sighting_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Headline governance KPI: registered ÷ total, segmented by origin. */
export interface CoverageBucket {
  total: number;
  registered: number;
  coverage_percent: number;
}

export interface AgentCoverage {
  workspace_id: string;
  total: number;
  registered: number;
  unregistered: number;
  quarantined: number;
  ignored: number;
  coverage_percent: number;
  unowned_agents: number;
  by_origin: Record<string, CoverageBucket>;
  by_source: Record<string, number>;
  generated_at: string;
}

export const STATUS_LABELS: Record<DiscoveredAgentStatus, string> = {
  unregistered: "Unregistered",
  registered: "Registered",
  quarantined: "Quarantined",
  ignored: "Ignored",
};

export const ORIGIN_LABELS: Record<DeploymentOrigin, string> = {
  manual: "Manual",
  automated: "Automated",
  unknown: "Unknown",
};

export const ARCHETYPE_LABELS: Record<AgentArchetype, string> = {
  "": "Not classified",
  autonomous: "Autonomous",
  user_delegated: "User-delegated",
  hybrid: "Hybrid",
};

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

// ── Endpoints — live on /authsec/discovery/* ─────────────────────────────────

interface SourcesEnvelope { sources: DiscoverySource[] }
interface AgentsEnvelope { agents: DiscoveredAgent[]; total: number }

export interface AgentFilters {
  status?: DiscoveredAgentStatus;
  deployment_origin?: DeploymentOrigin;
  source?: DiscoverySourceKind;
  archetype?: Exclude<AgentArchetype, "">;
  /** Registered agents with no owner — should be impossible, so worth surfacing. */
  unowned?: boolean;
  limit?: number;
  offset?: number;
}

export const discoveryApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Sources ───────────────────────────────────────────────────────────
    listDiscoverySources: builder.query<DiscoverySource[], { kind?: DiscoverySourceKind } | void>({
      query: (args) => ({
        url: "/authsec/discovery/sources",
        method: "GET",
        params: args?.kind ? { kind: args.kind } : undefined,
      }),
      transformResponse: (r: SourcesEnvelope) => r.sources ?? [],
      providesTags: ["DiscoverySource"],
    }),

    getDiscoverySource: builder.query<DiscoverySource, string>({
      query: (id) => ({ url: `/authsec/discovery/sources/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "DiscoverySource", id }],
    }),

    createDiscoverySource: builder.mutation<
      DiscoverySource,
      { kind: DiscoverySourceKind; display_name: string; config?: Record<string, unknown>; enabled?: boolean }
    >({
      query: (body) => ({ url: "/authsec/discovery/sources", method: "POST", body }),
      invalidatesTags: ["DiscoverySource"],
    }),

    updateDiscoverySource: builder.mutation<
      DiscoverySource,
      { id: string; display_name?: string; config?: Record<string, unknown>; enabled?: boolean }
    >({
      query: ({ id, ...body }) => ({
        url: `/authsec/discovery/sources/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "DiscoverySource", id }, "DiscoverySource"],
    }),

    deleteDiscoverySource: builder.mutation<void, string>({
      query: (id) => ({ url: `/authsec/discovery/sources/${id}`, method: "DELETE" }),
      invalidatesTags: ["DiscoverySource", "DiscoveredAgent"],
    }),

    // ── Inventory ─────────────────────────────────────────────────────────
    listDiscoveredAgents: builder.query<AgentsEnvelope, AgentFilters | void>({
      query: (f) => ({
        url: "/authsec/discovery/agents",
        method: "GET",
        params: {
          ...(f?.status ? { status: f.status } : {}),
          ...(f?.deployment_origin ? { deployment_origin: f.deployment_origin } : {}),
          ...(f?.source ? { source: f.source } : {}),
          ...(f?.archetype ? { archetype: f.archetype } : {}),
          ...(f?.unowned ? { unowned: "true" } : {}),
          ...(f?.limit ? { limit: f.limit } : {}),
          ...(f?.offset ? { offset: f.offset } : {}),
        },
      }),
      transformResponse: (r: AgentsEnvelope) => ({ agents: r.agents ?? [], total: r.total ?? 0 }),
      providesTags: ["DiscoveredAgent"],
    }),

    getDiscoveredAgent: builder.query<DiscoveredAgent, string>({
      query: (id) => ({ url: `/authsec/discovery/agents/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "DiscoveredAgent", id }],
    }),

    updateDiscoveredAgent: builder.mutation<
      DiscoveredAgent,
      {
        id: string;
        display_name?: string;
        metadata?: Record<string, unknown>;
        deployment_origin?: DeploymentOrigin;
        archetype?: Exclude<AgentArchetype, "">;
        status?: DiscoveredAgentStatus;
        owner_user_id?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/authsec/discovery/agents/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "DiscoveredAgent", id }, "DiscoveredAgent"],
    }),

    // ── The two governance decisions ──────────────────────────────────────
    // Claim needs BOTH an identity and an owner: a DB CHECK forbids a
    // registered agent without them, so a partial claim cannot be persisted.
    claimAgent: builder.mutation<
      DiscoveredAgent,
      { id: string; matched_client_id: string; owner_user_id: string; archetype?: Exclude<AgentArchetype, ""> }
    >({
      query: ({ id, ...body }) => ({
        url: `/authsec/discovery/agents/${id}/claim`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["DiscoveredAgent", "AgentCoverage"],
    }),

    quarantineAgent: builder.mutation<DiscoveredAgent, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/authsec/discovery/agents/${id}/quarantine`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["DiscoveredAgent", "AgentCoverage"],
    }),

    // ── Headline KPI ──────────────────────────────────────────────────────
    getAgentCoverage: builder.query<AgentCoverage, void>({
      query: () => ({ url: "/authsec/discovery/coverage", method: "GET" }),
      providesTags: ["AgentCoverage"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useListDiscoverySourcesQuery,
  useGetDiscoverySourceQuery,
  useCreateDiscoverySourceMutation,
  useUpdateDiscoverySourceMutation,
  useDeleteDiscoverySourceMutation,
  useListDiscoveredAgentsQuery,
  useGetDiscoveredAgentQuery,
  useUpdateDiscoveredAgentMutation,
  useClaimAgentMutation,
  useQuarantineAgentMutation,
  useGetAgentCoverageQuery,
} = discoveryApi;
// ── Identities ──────────────────────────────────────────────────────────────
// Generic schema. There is no identity table in the team's discovery doc, so
// this is a provisional shape: the account an agent authenticates as, plus the
// credential posture that determines what revoking it would affect.

export type IdentityKind =
  | "service_principal"
  | "service_account"
  | "iam_role"
  | "oauth_client"
  | "spiffe_id"
  | "api_key"
  | "bot_user"
  | "unknown";

export type CredentialType =
  | "client_secret"
  | "certificate"
  | "federated"
  | "static_key"
  | "none"
  | "unknown";

export type IdentityStatus = "active" | "disabled" | "orphaned" | "unknown";

export interface Identity {
  id: string;
  workspace_id: string;
  kind: IdentityKind;
  /** Native identifier at the source (ARN, object id, SPIFFE URI, client_id…). */
  external_id: string;
  display_name: string;
  /** Discovery channel this identity was seen through. */
  source: DiscoverySourceKind;
  /** Human-readable issuing system, e.g. "Entra ID", "AWS IAM". */
  provider: string;
  /** discovered_agents.id, when an agent is known to authenticate as this. */
  linked_agent_id: string | null;
  credential_type: CredentialType;
  credential_expires_at: string | null;
  last_used_at: string | null;
  status: IdentityStatus;
  first_seen_at: string;
  last_seen_at: string;
}

export const IDENTITY_KIND_LABELS: Record<IdentityKind, string> = {
  service_principal: "Service principal",
  service_account: "Service account",
  iam_role: "IAM role",
  oauth_client: "OAuth client",
  spiffe_id: "SPIFFE identity",
  api_key: "API key",
  bot_user: "Bot user",
  unknown: "Unknown",
};

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  client_secret: "Client secret",
  certificate: "Certificate",
  federated: "Federated",
  static_key: "Static key",
  none: "None",
  unknown: "Unknown",
};

const MOCK_IDENTITIES: Identity[] = [
  {
    id: "id-1", workspace_id: "ws", kind: "service_account",
    external_id: "system:serviceaccount:agents:refund-reviewer-sa",
    display_name: "refund-reviewer-sa", source: "k8s_webhook", provider: "Kubernetes",
    linked_agent_id: "da-1", credential_type: "federated", credential_expires_at: null,
    last_used_at: new Date(Date.now() - 4 * 60_000).toISOString(), status: "active",
    first_seen_at: new Date(Date.now() - 32 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 3 * 60_000).toISOString(),
  },
  {
    id: "id-2", workspace_id: "ws", kind: "iam_role",
    external_id: "arn:aws:iam::123456789012:role/invoice-summariser-exec",
    display_name: "invoice-summariser-exec", source: "aws", provider: "AWS IAM",
    linked_agent_id: "da-3", credential_type: "federated", credential_expires_at: null,
    last_used_at: new Date(Date.now() - 22 * 60_000).toISOString(), status: "active",
    first_seen_at: new Date(Date.now() - 19 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 22 * 60_000).toISOString(),
  },
  {
    id: "id-3", workspace_id: "ws", kind: "service_principal",
    external_id: "8f1ca204-7b3e-4d19-93aa-c0e5f2811d67",
    display_name: "support-triage-mi", source: "azure", provider: "Entra ID",
    linked_agent_id: "da-4", credential_type: "certificate",
    credential_expires_at: new Date(Date.now() + 21 * 86_400_000).toISOString(),
    last_used_at: new Date(Date.now() - 55 * 60_000).toISOString(), status: "active",
    first_seen_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 55 * 60_000).toISOString(),
  },
  {
    id: "id-4", workspace_id: "ws", kind: "oauth_client",
    external_id: "c7f1a0e2-3b44-4a91-9d02-8e5c1f77b310",
    display_name: "reporting-bot-prod", source: "aws", provider: "AuthSec OAuth",
    linked_agent_id: null, credential_type: "client_secret",
    credential_expires_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    last_used_at: new Date(Date.now() - 94 * 86_400_000).toISOString(), status: "orphaned",
    first_seen_at: new Date(Date.now() - 210 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 94 * 86_400_000).toISOString(),
  },
  {
    id: "id-5", workspace_id: "ws", kind: "spiffe_id",
    external_id: "spiffe://acme.internal/ns/ci/sa/deploy",
    display_name: "svc:deploy-ci", source: "k8s_webhook", provider: "SPIRE",
    linked_agent_id: "da-2", credential_type: "federated", credential_expires_at: null,
    last_used_at: new Date(Date.now() - 2 * 60_000).toISOString(), status: "active",
    first_seen_at: new Date(Date.now() - 44 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 2 * 60_000).toISOString(),
  },
  {
    id: "id-6", workspace_id: "ws", kind: "api_key",
    external_id: "sk-proj-…9f2c", display_name: "nightly-embed key",
    source: "vm_sensor", provider: "OpenAI", linked_agent_id: "da-6",
    credential_type: "static_key", credential_expires_at: null,
    last_used_at: new Date(Date.now() - 11 * 3_600_000).toISOString(), status: "unknown",
    first_seen_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    last_seen_at: new Date(Date.now() - 11 * 3_600_000).toISOString(),
  },
];

export const identitiesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listIdentities: builder.query<Identity[], void>({
      query: () => ({ url: "/authsec/discovery/identities", method: "GET" }),
      providesTags: ["DiscoveredIdentity"],
    }),
  }),
  overrideExisting: false,
});

export const { useListIdentitiesQuery } = identitiesApi;

export function useIdentitiesWithFallback() {
  const q = useListIdentitiesQuery();
  return { ...q, data: q.data ?? MOCK_IDENTITIES, usingMock: q.data === undefined };
}

// ── Kubernetes collector ────────────────────────────────────────────────────
// The Kubernetes channel is an in-cluster Deployment the customer installs. The
// control plane never holds cluster credentials: it generates config plus a
// one-time enrollment token, the operator applies it, and the collector dials
// out. Scan config is fetched on heartbeat, so changing it never needs a
// redeploy.

export type NamespaceMode = "all" | "include" | "exclude";

export type WorkloadKind =
  | "Deployment"
  | "StatefulSet"
  | "DaemonSet"
  | "Job"
  | "CronJob"
  | "Pod";

export const WORKLOAD_KINDS: WorkloadKind[] = [
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "Job",
  "CronJob",
  "Pod",
];

/** Which API group each kind lives in, for RBAC generation. */
const KIND_RESOURCE: Record<WorkloadKind, { group: string; resource: string }> = {
  Deployment: { group: "apps", resource: "deployments" },
  StatefulSet: { group: "apps", resource: "statefulsets" },
  DaemonSet: { group: "apps", resource: "daemonsets" },
  Job: { group: "batch", resource: "jobs" },
  CronJob: { group: "batch", resource: "cronjobs" },
  Pod: { group: "", resource: "pods" },
};

export interface DetectionRules {
  labelSelectors: string[];
  imagePatterns: string[];
  envPatterns: string[];
  configPaths: string[];
  /** Report a single weak signal as a low-confidence candidate. */
  reportLowConfidence: boolean;
}

export interface CollectorConfig {
  namespaceMode: NamespaceMode;
  namespaces: string[];
  kinds: WorkloadKind[];
  detection: DetectionRules;
  watchEnabled: boolean;
  resyncMinutes: number;
  heartbeatSeconds: number;
  cpuRequest: string;
  memRequest: string;
  cpuLimit: string;
  memLimit: string;
}

export const DEFAULT_COLLECTOR_CONFIG: CollectorConfig = {
  namespaceMode: "all",
  namespaces: [],
  kinds: ["Deployment", "StatefulSet", "Job", "CronJob"],
  detection: {
    labelSelectors: ["authsec.io/agent=true"],
    imagePatterns: ["*langchain*", "*openai*", "*llama-index*"],
    envPatterns: ["OPENAI_*", "ANTHROPIC_*", "MCP_*"],
    configPaths: ["mcp.json", ".mcp/"],
    reportLowConfidence: true,
  },
  watchEnabled: true,
  resyncMinutes: 60,
  heartbeatSeconds: 60,
  cpuRequest: "50m",
  memRequest: "128Mi",
  cpuLimit: "500m",
  memLimit: "512Mi",
};

/** One RBAC rule the collector asked for, and what it actually got. */
export interface PermissionGrant {
  resource: string;
  verbs: string[];
  /** Namespaces the config asked to cover; empty = cluster-wide. */
  requestedNamespaces: string[];
  /** What SelfSubjectAccessReview reports it can actually read. */
  grantedNamespaces: string[];
  clusterWideRequested: boolean;
  clusterWideGranted: boolean;
}

export type CollectorState = "awaiting_enrollment" | "connected" | "disconnected" | "degraded";

export interface CollectorStatus {
  state: CollectorState;
  version: string | null;
  latestVersion: string;
  lastHeartbeatAt: string | null;
  enrolledAt: string | null;
  namespacesVisible: string[];
  namespacesConfigured: string[];
  workloadsScanned: number;
  workloadsMatched: number;
  permissions: PermissionGrant[];
}

/** Minimum RBAC for the selected kinds. Read-only, by construction. */
export function generateClusterRole(config: CollectorConfig, name = "authsec-discovery"): string {
  const byGroup = new Map<string, string[]>();
  for (const kind of config.kinds) {
    const { group, resource } = KIND_RESOURCE[kind];
    byGroup.set(group, [...(byGroup.get(group) ?? []), resource]);
  }
  // Namespaces are always needed to enumerate scope.
  byGroup.set("", [...(byGroup.get("") ?? []), "namespaces"]);

  const scoped = config.namespaceMode === "include" && config.namespaces.length > 0;
  const rules = [...byGroup.entries()]
    .map(
      ([group, resources]) =>
        `  - apiGroups: ["${group}"]\n    resources: [${[...new Set(resources)]
          .map((r) => `"${r}"`)
          .join(", ")}]\n    verbs: ["get", "list", "watch"]`,
    )
    .join("\n");

  if (scoped) {
    return config.namespaces
      .map(
        (ns) =>
          `apiVersion: rbac.authorization.k8s.io/v1\nkind: Role\nmetadata:\n  name: ${name}\n  namespace: ${ns}\nrules:\n${rules}`,
      )
      .join("\n---\n");
  }
  return `apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: ${name}\nrules:\n${rules}`;
}

export function helmInstallCommand(displayName: string, token: string): string {
  const release = displayName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  return [
    "helm repo add authsec https://charts.authsec.ai && \\",
    "helm repo update && \\",
    `helm install ${release || "authsec-discovery"} authsec/discovery-collector \\`,
    "  --namespace authsec-system --create-namespace \\",
    `  --set enrollmentToken=${token} \\`,
    "  --set controlPlane=https://app.authsec.ai",
  ].join("\n");
}

const MOCK_COLLECTOR: CollectorStatus = {
  state: "connected",
  version: "0.4.2",
  latestVersion: "0.5.0",
  lastHeartbeatAt: new Date(Date.now() - 42_000).toISOString(),
  enrolledAt: new Date(Date.now() - 32 * 86_400_000).toISOString(),
  namespacesVisible: ["default", "agents", "ml", "payments"],
  namespacesConfigured: ["default", "agents", "ml", "payments", "platform", "observability"],
  workloadsScanned: 214,
  workloadsMatched: 4,
  permissions: [
    {
      resource: "apps/deployments", verbs: ["get", "list", "watch"],
      requestedNamespaces: [], grantedNamespaces: [],
      clusterWideRequested: true, clusterWideGranted: true,
    },
    {
      resource: "apps/statefulsets", verbs: ["get", "list", "watch"],
      requestedNamespaces: [], grantedNamespaces: [],
      clusterWideRequested: true, clusterWideGranted: true,
    },
    {
      resource: "batch/jobs", verbs: ["get", "list", "watch"],
      requestedNamespaces: [],
      grantedNamespaces: ["default", "agents", "ml", "payments"],
      clusterWideRequested: true, clusterWideGranted: false,
    },
    {
      resource: "batch/cronjobs", verbs: ["get", "list", "watch"],
      requestedNamespaces: [], grantedNamespaces: [],
      clusterWideRequested: true, clusterWideGranted: false,
    },
    {
      resource: "namespaces", verbs: ["get", "list", "watch"],
      requestedNamespaces: [], grantedNamespaces: [],
      clusterWideRequested: true, clusterWideGranted: true,
    },
  ],
};

export function useCollectorStatus(sourceId: string) {
  // No backend. Only the seeded Kubernetes source has a collector.
  const status = sourceId === "ds-1" ? MOCK_COLLECTOR : null;
  return { data: status, usingMock: true };
}

export function useCollectorConfig(sourceId: string) {
  const config =
    sourceId === "ds-1"
      ? { ...DEFAULT_COLLECTOR_CONFIG, namespaceMode: "exclude" as NamespaceMode, namespaces: ["kube-system"] }
      : DEFAULT_COLLECTOR_CONFIG;
  return { data: config, usingMock: true };
}
