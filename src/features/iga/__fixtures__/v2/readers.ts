/**
 * Fixture bodies shaped like authsec 6a7becc. See ./README.md.
 * Identifiers are synthetic. No credentials.
 */

export const FIXTURE_SOURCE = "authsec@6a7beccbb4042e1f7a89bfae8c474a1dd9e0a69c";

export const IDS = {
  workload: "11111111-1111-4111-8111-111111111111",
  identity: "22222222-2222-4222-8222-222222222222",
  adIdentity: "33333333-3333-4333-8333-333333333333",
  resource: "44444444-4444-4444-8444-444444444444",
  runtime: "55555555-5555-4555-8555-555555555555",
  k8sIdentity: "66666666-6666-4666-8666-666666666666",
  collector: "77777777-7777-4777-8777-777777777777",
  integration: "88888888-8888-4888-8888-888888888888",
  observed: "99999999-9999-4999-8999-999999999999",
  grant: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
} as const;

const listMeta = {
  rev: 7,
  published_at: "2026-09-26T12:00:00Z",
  graph_state: "published" as const,
  next_cursor: null,
  limit: 100,
  total_known: false,
  coverage: [],
  graph_revision: 7,
};

export const capabilitiesV2 = {
  data: {
    graph_projection: "on" as const,
    reason: null,
    features: {
      workloads: true,
      identities: true,
      resources: true,
      graph: true,
      evidence: true,
      changes: true,
      classification: true,
      coverage: true,
    },
    graph_v2: {
      opt_in: "graph=v2",
      available: true,
      providers: ["ad", "aws", "kubernetes", "linux"],
    },
    schema_head: "042",
  },
};

export const capabilitiesV1 = {
  data: {
    graph_projection: "on" as const,
    reason: null,
    features: capabilitiesV2.data.features,
    schema_head: "036",
  },
};

export const observedEdge = {
  claim: `observed_access:${IDS.observed}`,
  kind: "observed_access" as const,
  from: `workload:${IDS.workload}`,
  to: `resource:${IDS.resource}`,
  state: "current" as const,
  basis: "observed" as const,
  access_class: "observed" as const,
  outcome: "success",
  closes_cycle: false,
  crosses_account: false,
  last_confirmed_at: "2026-09-26T12:04:00Z",
  limitations: [{ code: "effective_access_not_evaluated" as const }],
};

export const deniedObservedEdge = {
  ...observedEdge,
  claim: "observed_access:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  outcome: "denied",
};

export const attemptObservedEdge = {
  ...observedEdge,
  claim: "observed_access:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  outcome: "attempt",
};

export const directoryBackingEdge = {
  claim: "relationship:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  kind: "backed_by_directory" as const,
  from: `identity:${IDS.identity}`,
  to: `identity:${IDS.adIdentity}`,
  state: "current" as const,
  basis: "derived" as const,
  access_class: "declared" as const,
  meaning: "directory_backing" as const,
  closes_cycle: false,
  crosses_account: false,
  last_confirmed_at: "2026-09-26T12:00:00Z",
  limitations: [{ code: "effective_access_not_evaluated" as const }],
};

export const k8sGrantEdge = {
  claim: `grant:${IDS.grant}`,
  kind: "grant" as const,
  from: `identity:${IDS.k8sIdentity}`,
  to: `resource:${IDS.resource}`,
  state: "current" as const,
  basis: "declared" as const,
  access_class: "declared" as const,
  calculation_state: "partial",
  effective_conclusion: "unknown",
  policy: "view",
  closes_cycle: false,
  crosses_account: false,
  last_confirmed_at: "2026-09-26T12:00:00Z",
  limitations: [{ code: "effective_access_not_evaluated" as const }],
};

export const runtimeInstancesLive = {
  data: [
    {
      ref: `runtime_instance:${IDS.runtime}`,
      runtime_key: "boot-a/host/824/93401",
      runtime_kind: "process",
      started_at: "2026-09-26T11:00:00Z",
      ended_at: null,
      last_observed_at: "2026-09-26T12:04:00Z",
      ttl_basis: null,
    },
  ],
  meta: listMeta,
};

export const runtimeInstancesEnded = {
  data: [
    {
      ...runtimeInstancesLive.data[0],
      ended_at: "2026-09-26T12:10:00Z",
      ttl_basis: "runtime_unobserved",
    },
  ],
  meta: listMeta,
};

export const observedAccessAggregate = {
  data: [
    {
      resource: `resource:${IDS.resource}`,
      action: "connect",
      outcome: "success",
      attribution: "kernel_process_credentials",
      count: 4,
      first_observed_at: "2026-09-26T11:10:00Z",
      last_observed_at: "2026-09-26T12:04:00Z",
      access_class: "observed",
    },
    {
      resource: `resource:${IDS.resource}`,
      action: "sql",
      outcome: "success",
      attribution: "database",
      count: 2,
      first_observed_at: "2026-09-26T11:12:00Z",
      last_observed_at: "2026-09-26T12:03:00Z",
      access_class: "observed",
    },
    {
      resource: `resource:${IDS.resource}`,
      action: "open",
      outcome: "denied",
      attribution: "kernel_process_credentials",
      count: 1,
      first_observed_at: "2026-09-26T11:20:00Z",
      last_observed_at: "2026-09-26T11:20:00Z",
      access_class: "observed",
    },
  ],
  meta: { ...listMeta, next_cursor: null },
};

export const observedAccessEvents = {
  data: [
    {
      ref: `observed_access:${IDS.observed}`,
      resource: `resource:${IDS.resource}`,
      runtime_instance: `runtime_instance:${IDS.runtime}`,
      action: "connect",
      outcome: "success",
      attribution: "kernel_process_credentials",
      observed_at: "2026-09-26T12:04:00Z",
      access_class: "observed",
    },
  ],
  meta: { ...listMeta, limit: 50, next_cursor: "cursor-2" },
};

export const runtimePolicyStatus = {
  data: { workload_id: IDS.workload, status: "not_configured" },
  meta: { rev: 7, published_at: listMeta.published_at, graph_state: "published" as const, capabilities: {}, graph_revision: 7 },
};

export const observedUse = {
  data: {
    bindings: [
      {
        ref: "runtime_binding:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        runtime_instance: `runtime_instance:${IDS.runtime}`,
        workload: `workload:${IDS.workload}`,
        binding_kind: "uid",
        basis: "observed",
        valid_from: "2026-09-26T11:00:00Z",
        valid_to: null,
      },
    ],
    observed_access: observedAccessAggregate.data,
  },
  meta: runtimePolicyStatus.meta,
};

export const collectorView = {
  id: IDS.collector,
  kind: "linux",
  status: "active",
  row_version: 3,
  agent_version: "0.9.0",
  health: { status: "active", last_seen_at: "2026-09-26T12:04:00Z" },
  capabilities: {},
  coverage: [
    { object_class: "process", state: "unknown", reason_code: "not_checked" },
    { object_class: "systemd", state: "stale", reason_code: "not_reconfirmed" },
  ],
  desired_revision: null,
  applied_revision: null,
  discovery_source_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  integration_id: IDS.integration,
  estate_id: "12121212-1212-4212-8212-121212121212",
};

export const collectorNotFound = { error: "not_found" };

const surfaceBase = {
  count: null,
  error_code: null,
  api: null,
  error: null,
  items: null,
  truncated: false,
  since: null,
  since_run: null,
  prevents: null,
  fix: null,
  run: "iga_scan_run:13131313-1313-4313-8313-131313131313",
  ref: "coverage:14141414-1414-4414-8414-141414141414",
};

export const coverageV2 = {
  data: [
    {
      integration: `integration:${IDS.integration}`,
      account: null,
      connector_status: "active",
      template: {},
      runs: ["iga_scan_run:13131313-1313-4313-8313-131313131313"],
      surfaces: [
        { ...surfaceBase, surface: "projection", state: "unknown" },
        { ...surfaceBase, surface: "processes", state: "stale" },
      ],
      collector_id: IDS.collector,
    },
  ],
  meta: { rev: 7, published_at: listMeta.published_at, graph_state: "published" as const, capabilities: {}, graph_revision: 7 },
};

export const pipelineV2 = {
  barrier: {
    state: "idle" as const,
    scan_run: null,
    since: null,
    integration: null,
    account_id: null,
    label: null,
    started_at: null,
  },
  accounts: [
    {
      integration: `integration:${IDS.integration}`,
      account_id: "",
      label: "linux/invoice-host",
      connector_status: "active" as const,
      state: "collector" as const,
      latest_run: { ref: "iga_scan_run:13131313-1313-4313-8313-131313131313" },
      projection: { coverage_state: "stale", rev: 7, last_error: null },
      last_published_rev: 7,
      collector_id: IDS.collector,
    },
  ],
  current_rev: 7,
  current_published_at: listMeta.published_at,
};
