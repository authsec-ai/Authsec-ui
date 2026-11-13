/**
 * Model provider usage (SPEC-agent-runtime-provider-usage.md §7): connect an
 * OpenAI or Anthropic organisation with an admin key, list its keys and usage,
 * and the `unaccounted_model_usage` findings. Every shape below was traced from
 * the Go struct the handler serialises (`authsec`, branch `authsec-staging`); a
 * field the backend does not send is not declared. The admin key is write-only:
 * no response carries it.
 *
 * The workspace is always the token's. `ws` on a query argument is a client-only
 * cache key and never reaches the server.
 *
 * Endpoint (all under /api/iga/v1/agent-runtime)  Permission         Go (file:line)
 * ----------------------------------------------  -----------------  -----------------------------------------------
 * POST   /model-providers                          governance:enforce controllers/platform/agent_runtime_provider_controller.go:131 (service model_provider.go:Connect)
 * GET    /model-providers                          discovery:read     agent_runtime_provider_controller.go:155 (List, newest first, revoked included, max 200)
 * GET    /model-providers/:id                      discovery:read     agent_runtime_provider_controller.go:169
 * POST   /model-providers/:id/rotate               governance:enforce agent_runtime_provider_controller.go:196
 * DELETE /model-providers/:id                      governance:enforce agent_runtime_provider_controller.go:225 (revoke: key destroyed in Vault)
 * POST   /model-providers/:id/sync                 governance:enforce agent_runtime_provider_controller.go:250 (202 {queued, next_sync_at})
 * GET    /model-providers/:id/keys                 discovery:read     agent_runtime_provider_controller.go:277
 * GET    /model-providers/:id/usage                discovery:read     agent_runtime_provider_controller.go:318 (?from=&to= RFC 3339, group_by=key|model|project)
 * GET    /findings?kind=unaccounted_model_usage    discovery:read     agent_runtime_controller.go:196 (accepts kind, state, connector_id, cursor, limit only)
 *
 * Writes also need a verified workspace member session (403 `forbidden`).
 * Envelope `{ data, meta }`; errors `{ error: { code, message, detail? } }`.
 * Codes: 400 bad param, 404 unknown or another workspace's connection,
 * 409 model_provider_limit | model_provider_exists | model_provider_revoked |
 * organization_mismatch | model_provider_changed, 422 provider_rejected_key,
 * 502 provider_unavailable, 503 secret_store_unavailable.
 *
 * Backend facts the console must respect:
 *  - /findings has no connection filter; the finding's subject carries
 *    `connection_id`, so the detail page filters on it client-side.
 *  - /usage returns TOTALS per group over [from, to) (default last 7 days, at
 *    most 90 days); there is no time series.
 */

import { baseApi } from "./baseApi";
import { enc, policyQuery } from "./igaPolicyCommon";

const BASE = "/api/iga/v1/agent-runtime";

export type ModelProviderName = "openai" | "anthropic";
export type ModelProviderStatus = "active" | "error" | "revoked";

/** services.ModelProviderConnection (model_provider.go:128). Never the key. */
export interface ModelProviderConnection {
  id: string;
  provider: ModelProviderName | (string & {});
  display_name: string;
  /** "...abcd sha256:0123456789ab": last 4 characters and a hash prefix. */
  key_fingerprint: string;
  org_id: string;
  org_name: string;
  status: ModelProviderStatus | (string & {});
  last_sync_at: string | null;
  last_sync_attempt_at: string | null;
  next_sync_at: string | null;
  last_error: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

/** services.ModelProviderLink (model_provider_sync.go:395): a weak name match. */
export interface ModelProviderLink {
  strength: string;
  via: "secret_name" | "env_var_name" | (string & {});
  matched: "key_name" | "project_name" | (string & {});
  name: string;
  connector_id: string;
  secret_arn?: string;
  cloud_workload_ids: string[];
  identity_ids: string[];
}

/** services.ModelProviderKeyView (model_provider.go:476). `links` is raw JSON and may be null. */
export interface ModelProviderKey {
  provider_key_id: string;
  name: string;
  key_hint: string;
  project_id: string;
  project_name: string;
  owner_type: string;
  owner_id: string;
  owner_name: string;
  created_at_provider: string | null;
  last_used_at: string | null;
  status: string;
  links: ModelProviderLink[] | null;
  /** null when the provider does not report request counts. */
  requests_7d: number | null;
  input_tokens_7d: number;
  output_tokens_7d: number;
  unaccounted: boolean;
  first_seen: string;
  last_seen: string;
}

export type UsageGroupBy = "key" | "model" | "project";

/** services.ModelProviderUsageRow (model_provider.go:547). `group` is a key id, model or project id. */
export interface ModelProviderUsageRow {
  group: string;
  /** Key name or project name; absent for group_by=model. */
  name?: string;
  requests: number | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  first_bucket: string;
  last_bucket: string;
}

export interface ModelProviderUsageArgs {
  ws: string;
  id: string;
  from?: string;
  to?: string;
  group_by?: UsageGroupBy;
}

/** services.AgentFinding with a model provider's subject and evidence (agent_runtime_findings.go:412; written at model_provider_sync.go:780-807). */
export interface ModelProviderFinding {
  id: string;
  /** Always null on this kind. */
  connector_id: string | null;
  kind: string;
  subject_key: string;
  identity_id: string | null;
  subject: {
    provider?: string;
    connection_id?: string;
    connection_name?: string;
    provider_key_id?: string;
    key_name?: string;
    project_id?: string;
    project_name?: string;
    owner?: { type?: string; id?: string; name?: string };
    key_status?: string;
  };
  evidence: {
    window_days?: number;
    requests?: number | null;
    input_tokens?: number;
    output_tokens?: number;
    models?: string[];
    last_used_at?: string;
    attribution?: string;
    names_checked?: number;
    value_read?: boolean;
    resolved_reason?: string;
  };
  state: "open" | "resolved";
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
}

export interface ModelProviderFindingsArgs {
  ws: string;
  state?: "open" | "resolved";
  limit?: number;
}

export interface ConnectModelProviderArgs {
  provider: ModelProviderName;
  admin_key: string;
  display_name?: string;
}

const tagFor = (id: string) => ({ type: "AgentModelProvider" as const, id });
const LIST = tagFor("LIST");

export const igaAgentModelProvidersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listModelProviders: builder.query<{ data: ModelProviderConnection[] }, { ws: string }>({
      query: () => ({ url: `${BASE}/model-providers` }),
      providesTags: [LIST],
    }),
    getModelProvider: builder.query<{ data: ModelProviderConnection }, { ws: string; id: string }>({
      query: ({ id }) => ({ url: `${BASE}/model-providers/${enc(id)}` }),
      providesTags: (_r, _e, { id }) => [tagFor(id)],
    }),
    connectModelProvider: builder.mutation<{ data: ModelProviderConnection }, ConnectModelProviderArgs>({
      query: (body) => ({ url: `${BASE}/model-providers`, method: "POST", body }),
      invalidatesTags: [LIST],
    }),
    rotateModelProvider: builder.mutation<{ data: ModelProviderConnection }, { id: string; admin_key: string }>({
      query: ({ id, admin_key }) => ({ url: `${BASE}/model-providers/${enc(id)}/rotate`, method: "POST", body: { admin_key } }),
      invalidatesTags: (_r, _e, { id }) => [LIST, tagFor(id), tagFor(`KEYS:${id}`)],
    }),
    revokeModelProvider: builder.mutation<{ data: ModelProviderConnection }, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/model-providers/${enc(id)}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { id }) => [LIST, tagFor(id), tagFor(`KEYS:${id}`), tagFor("FINDINGS"), { type: "AgentRuntime" as const, id: "FINDINGS" }],
    }),
    syncModelProvider: builder.mutation<{ data: { queued: boolean; next_sync_at: string } }, { id: string }>({
      query: ({ id }) => ({ url: `${BASE}/model-providers/${enc(id)}/sync`, method: "POST" }),
      invalidatesTags: (_r, _e, { id }) => [LIST, tagFor(id)],
    }),
    listModelProviderKeys: builder.query<{ data: ModelProviderKey[] }, { ws: string; id: string }>({
      query: ({ id }) => ({ url: `${BASE}/model-providers/${enc(id)}/keys` }),
      providesTags: (_r, _e, { id }) => [tagFor(`KEYS:${id}`)],
    }),
    getModelProviderUsage: builder.query<
      { data: ModelProviderUsageRow[]; meta: { from: string; to: string; group_by: UsageGroupBy } },
      ModelProviderUsageArgs
    >({
      query: ({ id, ...a }) => ({ url: `${BASE}/model-providers/${enc(id)}/usage${policyQuery(a)}` }),
      providesTags: (_r, _e, { id }) => [tagFor(`KEYS:${id}`)],
    }),
    listModelProviderFindings: builder.query<
      { data: ModelProviderFinding[]; meta: { next_cursor?: string | null } },
      ModelProviderFindingsArgs
    >({
      query: (a) => ({ url: `${BASE}/findings${policyQuery({ ...a, kind: "unaccounted_model_usage" })}` }),
      providesTags: [tagFor("FINDINGS")],
    }),
  }),
});

export const {
  useListModelProvidersQuery,
  useGetModelProviderQuery,
  useConnectModelProviderMutation,
  useRotateModelProviderMutation,
  useRevokeModelProviderMutation,
  useSyncModelProviderMutation,
  useListModelProviderKeysQuery,
  useGetModelProviderUsageQuery,
  useListModelProviderFindingsQuery,
} = igaAgentModelProvidersApi;
