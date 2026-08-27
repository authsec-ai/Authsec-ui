/**
 * Discovery API — wired to the real backend on `/authsec/discovery/*`.
 *
 * Types mirror `models/discovery.go` exactly. Response envelopes are
 * `{sources: […]}` and `{agents: […], total: n}`.
 *
 * Live: sources CRUD, agents list/get/update/delete, claim, quarantine,
 * coverage, and the GitHub channel (source-from-connector, repository
 * selection, scan).
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
  // ── Agent self-registration + heartbeat (the iga-agent identifies itself) ──
  /** Registration key, "k8s:<cluster.name>". */
  instance_id: string;
  cluster_name: string;
  /** "" unless the chart was installed with cluster.readUID=true. */
  cluster_uid: string;
  agent_version: string;
  last_heartbeat_at?: string;
  /** false = the row was created by hand in the console, not by an agent. */
  self_registered: boolean;
  /** Last runtime snapshot the agent reported. Opaque json blob. */
  runtime: unknown;
  /** null = actuation is not enabled here; quarantine is advisory in this cluster. */
  actuation_enabled_at?: string;
  /** DERIVED at read time (heartbeat within ~5 min), not stored. Read it; don't recompute. */
  connected: boolean;
  seconds_since_heartbeat?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** How many agents this integration has produced. Computed server-side. */
  agent_count: number;
}

/** Moves forward only; never returns to unregistered. */
export type DiscoveredAgentStatus =
  | "unregistered"
  | "registered"
  | "quarantined"
  | "ignored";

/**
 * The OBSERVED axis, independent of `status` (the DECIDED axis). Moves both ways:
 * running ⇄ stopped → gone, or unknown. An agent can be registered + gone, or
 * unregistered + running — never collapse the two into one column.
 */
export type RuntimeStatus = "running" | "stopped" | "gone" | "unknown";

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
  // ── The OBSERVED axis — what was seen, not what a human decided. ──
  runtime_status: RuntimeStatus;
  runtime_reason: string;
  runtime_observed_at?: string;
  terminated_at?: string;
  /** Attributed principal, "" when the channel could not attribute it. */
  terminated_by: string;
  // ── Decision vs enforcement. quarantined_at is when someone DECIDED;
  //    quarantine_enforced_at is when a NetworkPolicy actually LANDED. First set
  //    without the second = quarantined on paper, running with full access. ──
  quarantine_enforced_at?: string;
  quarantine_enforcement_error: string;
  // ── Release. quarantined_at/by/reason SURVIVE a release as history, so the
  //    presence of quarantined_at does NOT mean currently quarantined. Read
  //    `status`; quarantine_released_at is what marks it historical. ──
  quarantine_released_at?: string;
  quarantine_released_by?: string;
  // ── Identity verification — what the pods ACTUALLY run as. ──
  observed_service_account: string;
  identity_verified_at?: string;
  first_seen_at: string;
  last_seen_at: string;
  sighting_count: number;
  /** Present once the backend distinguishes declared from observed evidence. */
  evidence_mode?: EvidenceMode;
  /** "we saw it RUN at this time" — absent forever on declared findings. */
  last_observed_running_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** GET /authsec/discovery/agents/:id/events → { events, total } */
export interface DiscoveredAgentEvent {
  id: string;
  workspace_id: string;
  discovered_agent_id?: string;
  discovery_source_id?: string;
  source: string;
  fingerprint: string;
  event: "observed" | "deleted" | "pod_terminated" | "absent" | "reappeared";
  runtime_status: string;
  reason: string;
  /** "" when the channel could not attribute it (e.g. an `absent` resync sweep). */
  actor: string;
  /** admission | resync | … */
  channel: string;
  cluster_name: string;
  metadata: unknown;
  observed_at: string;
  created_at: string;
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
  /** Counts keyed by RuntimeStatus. */
  by_runtime_status: Record<string, number>;
  /** The ACTIONABLE count: unregistered AND still live. Use this as the KPI. */
  live_unregistered: number;
  generated_at: string;
}

// ── GitHub discovery ────────────────────────────────────────────────────────
// GitHub arrives as a `repo_scan` source built from an existing GitHub App
// connector (registered under Connectors → GitHub). The App's private key never
// passes through this API — the connector holds a Vault reference.

/**
 * Whether a finding was seen RUNNING or only WRITTEN DOWN.
 *
 * The inventory's original contract was "a sighting means it is running", which
 * a repository declaration cannot support: a workflow file might run tonight,
 * or be dead code from two years ago. Until the backend carries an explicit
 * column, derive it from the source — see `evidenceModeOf`.
 */
export type EvidenceMode = "observed" | "declared" | "inferred";

export const EVIDENCE_LABELS: Record<EvidenceMode, string> = {
  observed: "Observed running",
  declared: "Declared in code",
  inferred: "Inferred",
};

/**
 * Source → evidence mode. Runtime channels observe; repository scans only ever
 * read a declaration. Prefer an explicit `evidence_mode` from the server once it
 * exists, so this mapping can retire without touching call sites.
 */
export function evidenceModeOf(
  agent: Pick<DiscoveredAgent, "source"> & { evidence_mode?: EvidenceMode },
): EvidenceMode {
  if (agent.evidence_mode) return agent.evidence_mode;
  return agent.source === "repo_scan" ? "declared" : "observed";
}

/** One repository the installation exposes, with its current selection state. */
export interface GitHubRepoChoice {
  native_id: string;
  full_name: string;
  default_branch: string;
  selected: boolean;
}

/** `all` means everything the INSTALLATION exposes — not the whole org. */
export interface RepoSelection {
  mode: "all" | "selected";
  /** owner/name entries; used when mode is "selected". */
  include?: string[];
  /**
   * How far past the default branch to look. Omitted means "default", so a
   * caller that knows nothing about branches keeps its previous behaviour.
   */
  branch_mode?: "default" | "all";
  /**
   * Cap on refs per repository when branch_mode is "all". Branches beyond it
   * are counted and force the run incomplete — never dropped in silence.
   */
  max_branches_per_repo?: number;
}

/**
 * Scan outcome. Four per-repository outcomes are tracked separately on purpose:
 * choosing not to scan something (`excluded`) is not the same as being unable
 * to (`failed`), and neither is the same as seeing only part of it
 * (`truncated`). Collapsing them would report partial coverage as clean.
 */
/** Terminal statuses are the ones polling stops on. */
export type ScanRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const SCAN_RUN_TERMINAL: ScanRunStatus[] = ["succeeded", "failed", "cancelled"];

export function isScanRunTerminal(status?: string): boolean {
  return SCAN_RUN_TERMINAL.includes(status as ScanRunStatus);
}

/**
 * One scan, from queued to finished.
 *
 * This replaced a synchronous result body. The scan used to run inside the HTTP
 * request, so an organisation-wide scan outlived the proxy timeout and died
 * half-finished, and the outcome existed only in that response — a refresh lost
 * it for good. A run is a durable row: it is the queue, the live progress, the
 * report, and the resume cursor.
 *
 * Counters advance WHILE running, so every number here is a partial truth until
 * `status` is terminal. Nothing may be presented as a result before then.
 */
export interface ScanRun {
  id: string;
  source_id: string;
  status: ScanRunStatus;
  selection_mode: string;
  /** "default" | "all" — how far beyond the default branch this run reached. */
  branch_mode: string;
  max_branches: number;

  repos_selected: number;
  repos_scanned: number;
  repos_failed: number;
  repos_excluded: number;
  repos_truncated: number;
  branches_scanned: number;
  branches_skipped: number;
  files_fetched: number;
  /**
   * Files that could not be read inside repositories that opened fine.
   *
   * Separate from repos_failed on purpose. A real organisation scan reported
   * "0 failed" beside a hundred and thirty warnings naming unreadable files:
   * both true, and together a lie, because every failure was at file level and
   * repos_failed only counts repositories that would not open. Showing one
   * without the other teaches an operator to distrust the number or ignore the
   * warnings, and the gap in coverage stops being legible either way.
   */
  files_failed: number;
  sightings_new: number;
  sightings_bumped: number;

  /**
   * Every selected repository was fully inspected. Only ever true on a finished
   * run — the server reserves it with a CHECK constraint.
   */
  complete_for_selected_scope: boolean;
  /**
   * Something was denied, truncated or failed at ANY point in this run's life,
   * including an earlier attempt that was later resumed. Monotonic: once set it
   * never clears.
   *
   * It exists because `complete` cannot be written mid-run, so a scan that hit a
   * 403, got interrupted, then resumed cleanly would otherwise finish claiming
   * coverage it never had. A run can be complete AND degraded, and that
   * combination must never render as an all-clear.
   */
  degraded: boolean;

  excluded_repositories?: string[];
  warnings?: string[];
  error?: string;

  attempts: number;
  max_attempts: number;
  requested_by: string;
  queued_at: string;
  started_at?: string;
  finished_at?: string;
  heartbeat_at?: string;
}

export const STATUS_LABELS: Record<DiscoveredAgentStatus, string> = {
  unregistered: "Unregistered",
  registered: "Registered",
  quarantined: "Quarantined",
  ignored: "Ignored",
};

export const RUNTIME_STATUS_LABELS: Record<RuntimeStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  gone: "Gone",
  unknown: "Unknown",
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
  /**
   * Excludes long-gone agents that need no decision. The Discovered Agents queue
   * defaults this to true so the queue is what still needs a human.
   */
  live?: boolean;
  runtime_status?: RuntimeStatus;
  limit?: number;
  offset?: number;
}

/** What GitHub says the workspace's registered App is. */
export interface GitHubAppInfo {
  app_id: string;
  name: string;
  slug: string;
  owner: string;
  permissions: Record<string, string>;
  /**
   * "User" or "Organization", and GitHub's "any account may install" flag.
   *
   * Together they decide where this App can be installed at all: a private App
   * installs ONLY on the account that owns it. A private, personally-owned App
   * can therefore never reach an organisation, which is the one explanation an
   * empty organisation list cannot give on its own.
   */
  owner_type: string;
  public: boolean;
  /** Canonical install page, derived from the slug — lets the UI offer a button. */
  install_url: string;
}

/**
 * One place this App is installed, as GitHub reports it.
 *
 * `already_added` is ours, not GitHub's: it says whether this workspace has
 * already turned this installation into a discovery source. Without it an
 * organisation that is already connected is indistinguishable from a new one.
 */
export interface GitHubInstallation {
  installation_id: string;
  account: string;
  account_type: string;
  /** "all" or "selected" — how much of the account the App was granted. */
  repository_selection: string;
  already_added: boolean;
  source_id?: string;
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
      // Deleting a repo_scan source also deletes the integration binding it
      // owns, which frees the organisation to be added again — so the
      // installation list's already_added annotations are now stale too.
      invalidatesTags: ["DiscoverySource", "DiscoveredAgent", "GitHubInstallation"],
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
          ...(f?.live ? { live: "true" } : {}),
          ...(f?.runtime_status ? { runtime_status: f.runtime_status } : {}),
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
    // Claim needs an OWNER. The identity is optional: omit it and the backend
    // mints a governed identity from the sighting, named after the workload.
    //
    // A DB CHECK still forbids a registered agent without both, but satisfying
    // that is the platform's job — most discovered agents are workloads that
    // never authenticate to AuthSec (no SVID, no client secret), so asking an
    // operator to pick a credential-holder for them blocked the claim on
    // information they did not have.
    claimAgent: builder.mutation<
      DiscoveredAgent,
      {
        id: string;
        matched_client_id?: string;
        owner_user_id: string;
        archetype?: Exclude<AgentArchetype, "">;
      }
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

    // Releasing a quarantine. No request body. Same permission as quarantine on
    // purpose. The status it returns to is DERIVED by the backend, not chosen —
    // render what came back rather than predicting it (an agent whose owner was
    // deleted comes back `unregistered`). A release may commit without being
    // enforced: quarantine_enforcement_error then carries the leftover-policy
    // kubectl. Invalidates ProvisioningInstruction because a release queues one.
    unquarantineAgent: builder.mutation<DiscoveredAgent, { id: string }>({
      query: ({ id }) => ({
        url: `/authsec/discovery/agents/${id}/unquarantine`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "DiscoveredAgent", id },
        "DiscoveredAgent",
        "AgentCoverage",
        "ProvisioningInstruction",
      ],
    }),

    // Deleting the inventory row destroys the audit trail. This is a cleanup tool
    // for bad data, NOT lifecycle management — deprovision removes access and
    // keeps the record. Guard the UI behind a typed confirmation.
    deleteDiscoveredAgent: builder.mutation<void, string>({
      query: (id) => ({ url: `/authsec/discovery/agents/${id}`, method: "DELETE" }),
      invalidatesTags: ["DiscoveredAgent", "AgentCoverage"],
    }),

    // The lifecycle trail — the only place a user sees WHO deleted an agent and
    // HOW it was noticed. `pod_terminated` is a rollout (routine); `deleted` is
    // attributed admission; `absent` is a resync sweep with no attributable actor.
    getAgentEvents: builder.query<{ events: DiscoveredAgentEvent[]; total: number }, string>({
      query: (id) => ({ url: `/authsec/discovery/agents/${id}/events`, method: "GET" }),
      transformResponse: (r: { events?: DiscoveredAgentEvent[]; total?: number }) => ({
        events: r.events ?? [],
        total: r.total ?? 0,
      }),
      providesTags: (_r, _e, id) => [{ type: "DiscoveredAgent", id }],
    }),

    // ── Headline KPI ──────────────────────────────────────────────────────
    getAgentCoverage: builder.query<AgentCoverage, void>({
      query: () => ({ url: "/authsec/discovery/coverage", method: "GET" }),
      providesTags: ["AgentCoverage"],
    }),

    // ── GitHub discovery ──────────────────────────────────────────────────
    // Discovery owns its GitHub surface end to end. Nothing here calls the
    // connectors API: per SPEC-connectors, Agentic IGA must not depend on that
    // framework. The App private KEY is stored once per workspace and shared
    // with the connector broker on purpose — one key, one place — but that is a
    // backend detail and no connector row is involved.

    /** Is a GitHub App registered for this workspace, and which one. */
    getGitHubApp: builder.query<{ configured: boolean; app_id?: string }, void>({
      query: () => ({ url: "/authsec/discovery/github/app", method: "GET" }),
      providesTags: ["GitHubApp"],
    }),

    /**
     * What GitHub says the stored App actually is.
     *
     * Turns a blind registration into a confirmed one: a wrong App id is
     * visible here, at the moment of entry, instead of surfacing much later as
     * an opaque token-minting failure.
     */
    describeGitHubApp: builder.query<GitHubAppInfo, void>({
      query: () => ({ url: "/authsec/discovery/github/app/describe", method: "GET" }),
      transformResponse: (res: { data: GitHubAppInfo }) => res.data,
      providesTags: ["GitHubApp"],
    }),

    /** Register an existing App by hand — the fallback to the manifest flow. */
    setGitHubApp: builder.mutation<void, { app_id: string; private_key: string }>({
      query: (body) => ({ url: "/authsec/discovery/github/app", method: "POST", body }),
      invalidatesTags: ["GitHubApp", "GitHubInstallation"],
    }),

    /** Remove the workspace App. Refused (409) while any organisation uses it. */
    deleteGitHubApp: builder.mutation<void, void>({
      query: () => ({ url: "/authsec/discovery/github/app", method: "DELETE" }),
      invalidatesTags: ["GitHubApp", "GitHubInstallation"],
    }),

    /** Exchange GitHub's single-use manifest code for the App id and key. */
    convertGitHubAppManifest: builder.mutation<GitHubAppInfo, { code: string }>({
      query: (body) => ({
        url: "/authsec/discovery/github/app/manifest/convert",
        method: "POST",
        body,
      }),
      transformResponse: (res: { data: GitHubAppInfo }) => res.data,
      invalidatesTags: ["GitHubApp", "GitHubInstallation"],
    }),

    /**
     * Where this workspace's App is installed.
     *
     * Read live from GitHub, never from our tables, and annotated with
     * `already_added` so a connected organisation cannot be presented as new.
     * The live read is why an organisation can appear here with nothing on our
     * side at all — the App stays installed on GitHub until someone uninstalls
     * it there, which is not something deleting anything here can undo.
     */
    listGitHubInstallations: builder.query<
      { installations: GitHubInstallation[]; note: string },
      void
    >({
      query: () => ({ url: "/authsec/discovery/github/installations", method: "GET" }),
      transformResponse: (res: {
        data?: GitHubInstallation[];
        meta?: { note?: string };
      }) => ({ installations: res.data ?? [], note: res.meta?.note ?? "" }),
      providesTags: ["GitHubInstallation"],
    }),

    /**
     * Add one organisation: creates the verified integration binding AND the
     * discovery source in a single call.
     *
     * One call rather than three because the intermediate states help nobody —
     * a UI that failed between them would leave a pending integration with no
     * source, which reads as broken and cannot be cleared from the console.
     */
    addGitHubOrganisation: builder.mutation<
      { source: DiscoverySource; already_existed?: boolean },
      { installation_id: string }
    >({
      query: (body) => ({
        url: "/authsec/discovery/github/organisations",
        method: "POST",
        body,
      }),
      transformResponse: (res: {
        data: { source: DiscoverySource; already_existed?: boolean };
      }) => res.data,
      invalidatesTags: ["DiscoverySource", "GitHubInstallation"],
    }),

    /**
     * What the installation exposes. Repositories the customer did not grant
     * are absent, and their absence is NOT evidence that they hold no agents —
     * the server returns that disclaimer in `meta.note` and the UI must show it.
     */
    listSourceRepositories: builder.query<
      { repos: GitHubRepoChoice[]; note: string; asOf?: string },
      string
    >({
      query: (id) => ({
        url: `/authsec/discovery/sources/${id}/repositories`,
        method: "GET",
      }),
      transformResponse: (res: {
        data?: GitHubRepoChoice[];
        meta?: { note?: string; as_of?: string };
      }) => ({
        repos: res.data ?? [],
        note: res.meta?.note ?? "",
        asOf: res.meta?.as_of,
      }),
      providesTags: (_r, _e, id) => [{ type: "DiscoverySource", id }],
    }),

    /** Record which repositories this source will scan. */
    setSourceRepositories: builder.mutation<
      RepoSelection,
      { id: string } & RepoSelection
    >({
      query: ({ id, ...body }) => ({
        url: `/authsec/discovery/sources/${id}/repositories`,
        method: "PUT",
        body,
      }),
      transformResponse: (res: { data?: RepoSelection } | RepoSelection) =>
        ("data" in (res as object) ? (res as { data: RepoSelection }).data : res) as RepoSelection,
      invalidatesTags: (_r, _e, { id }) => [{ type: "DiscoverySource", id }],
    }),

    /** Run a scan now. Findings land in the agent inventory as unregistered. */
    /**
     * Queue a scan. Returns 202 and the run — it does NOT return a result.
     *
     * A 409 means one is already queued or running and carries that run in its
     * body; the caller should attach to it rather than surfacing an error, which
     * is what makes a double-click harmless.
     */
    scanGitHubSource: builder.mutation<ScanRun, string>({
      query: (id) => ({
        url: `/authsec/discovery/sources/${id}/scan`,
        method: "POST",
      }),
      transformResponse: (res: { data: ScanRun }) => res.data,
      // A scan writes to the inventory and moves coverage. It also updates the
      // source's own row (last_sync_at, last_status, agent_count) — and that row
      // is held under the id-scoped tag, which the bare "DiscoverySource" tag
      // does not reach, so name both.
      // Queuing changes nothing yet. The inventory and coverage move when the
      // run FINISHES, so those tags are invalidated by the poller on the
      // terminal transition, not here — invalidating now would refetch an
      // inventory that has not changed and show a stale one as fresh.
      invalidatesTags: (_r, _e, id) => [{ type: "ScanRun" as const, id }],
    }),

    /** Poll one run. */
    getScanRun: builder.query<ScanRun, string>({
      query: (runId) => ({ url: `/authsec/discovery/scan-runs/${runId}`, method: "GET" }),
      transformResponse: (res: { data: ScanRun }) => res.data,
      providesTags: (_r, _e, runId) => [{ type: "ScanRun", id: runId }],
    }),

    /**
     * A source's scan history, newest first.
     *
     * This is what makes a finished scan survive a refresh, and the only way to
     * answer "what did the last scan actually see?" after the fact.
     */
    listScanRuns: builder.query<ScanRun[], string>({
      query: (sourceId) => ({
        url: `/authsec/discovery/sources/${sourceId}/scan-runs`,
        method: "GET",
      }),
      transformResponse: (res: { data?: ScanRun[] }) => res.data ?? [],
      providesTags: (_r, _e, sourceId) => [{ type: "ScanRun", id: sourceId }],
    }),

    /** Stop a running scan. For an organisation-wide scan that is overrunning. */
    cancelScanRun: builder.mutation<ScanRun, { runId: string; sourceId: string }>({
      query: ({ runId }) => ({
        url: `/authsec/discovery/scan-runs/${runId}/cancel`,
        method: "POST",
      }),
      transformResponse: (res: { data: ScanRun }) => res.data,
      invalidatesTags: (_r, _e, { runId, sourceId }) => [
        { type: "ScanRun" as const, id: runId },
        { type: "ScanRun" as const, id: sourceId },
      ],
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
  useUnquarantineAgentMutation,
  useDeleteDiscoveredAgentMutation,
  useGetAgentEventsQuery,
  useGetAgentCoverageQuery,
  useGetGitHubAppQuery,
  useDescribeGitHubAppQuery,
  useSetGitHubAppMutation,
  useDeleteGitHubAppMutation,
  useConvertGitHubAppManifestMutation,
  useListGitHubInstallationsQuery,
  useAddGitHubOrganisationMutation,
  useListSourceRepositoriesQuery,
  useSetSourceRepositoriesMutation,
  useScanGitHubSourceMutation,
  useGetScanRunQuery,
  useListScanRunsQuery,
  useCancelScanRunMutation,
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

// There is deliberately NO mock data here. `/authsec/discovery/identities` was
// never built — the request 404s — and seeding a governance console with invented
// identities is exactly the failure mode this whole product exists to prevent. The
// page renders an explicit "not yet available" empty state instead.
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

/**
 * Live connector status, derived from the DiscoverySource row the agent
 * self-registers and heartbeats into — no separate telemetry endpoint. Read
 * `connected` from the source (the backend derives it at read time); do not
 * recompute it from a timestamp. The runtime counters live inside the opaque
 * `runtime` blob and are absent until the agent reports them — never fabricated.
 */
export interface ConnectorStatus {
  connected: boolean;
  agentVersion: string;
  lastHeartbeatAt: string | null;
  secondsSinceHeartbeat: number | null;
  selfRegistered: boolean;
  actuationEnabledAt: string | null;
  /** From the runtime blob, if the agent reported it. */
  namespacesVisible: number | null;
  workloadsScanned: number | null;
  workloadsMatched: number | null;
}

/** Shape of the (opaque) runtime blob we read counters out of, all optional. */
interface RuntimeSnapshot {
  namespaces_visible?: number;
  workloads_scanned?: number;
  workloads_matched?: number;
}

function readRuntime(runtime: unknown): RuntimeSnapshot {
  return runtime && typeof runtime === "object" ? (runtime as RuntimeSnapshot) : {};
}

/** Project a DiscoverySource into the live connector status the detail page renders. */
export function connectorStatusFromSource(source: DiscoverySource): ConnectorStatus {
  const rt = readRuntime(source.runtime);
  return {
    connected: source.connected,
    agentVersion: source.agent_version,
    lastHeartbeatAt: source.last_heartbeat_at ?? null,
    secondsSinceHeartbeat: source.seconds_since_heartbeat ?? null,
    selfRegistered: source.self_registered,
    actuationEnabledAt: source.actuation_enabled_at ?? null,
    namespacesVisible: rt.namespaces_visible ?? null,
    workloadsScanned: rt.workloads_scanned ?? null,
    workloadsMatched: rt.workloads_matched ?? null,
  };
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

/**
 * The install command for the `authsec-iga-agent` Helm chart, generated from
 * the values the chart actually requires. Read off the chart's own
 * `values.yaml` and README, not inferred:
 *
 *   - The release name MUST be the literal `authsec-iga-agent`. It matches the
 *     chart name, so Helm renders resources unprefixed (`authsec-iga-agent`)
 *     rather than `<release>-authsec-iga-agent` — which is what every
 *     troubleshooting command in the chart's NOTES output and the agent docs
 *     assumes. It is NEVER derived from a user-supplied display name.
 *   - `controlPlane.url`, `workspace.id` and `cluster.name` are all required;
 *     the chart refuses to render without workspace.id / cluster.name, by design.
 *   - There is NO token and NO `discovery.sourceId`: the sightings endpoint is
 *     unauthenticated and the agent self-registers by `cluster.name`
 *     (instance id `k8s:<cluster.name>`), so nothing binds the install to a
 *     pre-created source row.
 *   - `chartRef` is caller-supplied because this deployment publishes no fixed
 *     Helm repo URL we can hardcode. It may be a local path
 *     (`./charts/authsec-iga-agent`) or an OCI/HTTP chart reference.
 */
export function helmInstallCommand(opts: {
  controlPlaneUrl: string;
  workspaceId: string;
  clusterName: string;
  /** Whatever chart reference this deployment publishes. Not a hardcoded guess. */
  chartRef: string;
  /** Chart version, e.g. "0.3.0". Optional — omitted means the chart's default. */
  chartVersion?: string;
}): string {
  const lines = [
    // The release name is intentionally the literal chart name. Do not templatise it.
    `helm install authsec-iga-agent ${opts.chartRef} \\`,
    "  --namespace authsec-system --create-namespace \\",
    ...(opts.chartVersion ? [`  --version ${opts.chartVersion} \\`] : []),
    `  --set controlPlane.url=${opts.controlPlaneUrl} \\`,
    `  --set workspace.id=${opts.workspaceId} \\`,
    // cluster.name is part of every agent fingerprint AND the self-registration
    // key, so it must be stable and unique per cluster — a typo silently merges
    // two clusters' inventories.
    `  --set cluster.name=${opts.clusterName}`,
  ];
  return lines.join("\n");
}


// The scan configuration displayed on the integration detail page. The wizard
// writes this into source.config; there is no separate config endpoint, so we
// read it back off the source row (falling back to the defaults for any field
// the row does not carry).
export function collectorConfigFromSource(source: DiscoverySource | undefined): CollectorConfig {
  const cfg = (source?.config ?? {}) as Record<string, unknown>;
  const detection = (cfg.detection ?? {}) as Partial<DetectionRules>;
  return {
    namespaceMode: (cfg.namespace_mode as NamespaceMode) ?? DEFAULT_COLLECTOR_CONFIG.namespaceMode,
    namespaces: Array.isArray(cfg.namespaces) ? (cfg.namespaces as string[]) : DEFAULT_COLLECTOR_CONFIG.namespaces,
    kinds: Array.isArray(cfg.kinds) ? (cfg.kinds as WorkloadKind[]) : DEFAULT_COLLECTOR_CONFIG.kinds,
    detection: {
      labelSelectors: detection.labelSelectors ?? DEFAULT_COLLECTOR_CONFIG.detection.labelSelectors,
      imagePatterns: detection.imagePatterns ?? DEFAULT_COLLECTOR_CONFIG.detection.imagePatterns,
      envPatterns: detection.envPatterns ?? DEFAULT_COLLECTOR_CONFIG.detection.envPatterns,
      configPaths: detection.configPaths ?? DEFAULT_COLLECTOR_CONFIG.detection.configPaths,
      reportLowConfidence:
        detection.reportLowConfidence ?? DEFAULT_COLLECTOR_CONFIG.detection.reportLowConfidence,
    },
    watchEnabled: (cfg.watch as boolean) ?? DEFAULT_COLLECTOR_CONFIG.watchEnabled,
    resyncMinutes: (cfg.resync_minutes as number) ?? DEFAULT_COLLECTOR_CONFIG.resyncMinutes,
    heartbeatSeconds: (cfg.heartbeat_seconds as number) ?? DEFAULT_COLLECTOR_CONFIG.heartbeatSeconds,
    cpuRequest: DEFAULT_COLLECTOR_CONFIG.cpuRequest,
    memRequest: DEFAULT_COLLECTOR_CONFIG.memRequest,
    cpuLimit: DEFAULT_COLLECTOR_CONFIG.cpuLimit,
    memLimit: DEFAULT_COLLECTOR_CONFIG.memLimit,
  };
}
