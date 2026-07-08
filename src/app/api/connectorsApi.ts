import { baseApi } from "./baseApi";

/**
 * Connectors — the outbound action broker admin control plane.
 *
 * Endpoints live under /authsec/connectors/*. Secrets are never returned by
 * any of these calls: `Connector` and `ConnectorConnection` never carry
 * vault_path or raw credential material — only non-secret config and
 * connection *lifecycle* metadata (status, expiry, refresh state).
 */

export interface ConnectorProvider {
  key: string;
  display_name: string;
  component_type: string;
  config_schema: Record<string, unknown>;
  secret_keys: string[];
  supported_auth_methods: string[];
  oauth_authorize_url: string;
  oauth_token_url: string;
  oauth_scopes_supported: string[];
  oauth_default_scopes: string[];
  created_at: string;
  updated_at: string;
}

export interface Connector {
  id: string;
  workspace_id: string;
  provider_key: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  subscriptions: unknown[];
  agent_accessible: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ConnectionScope = "workspace" | "user";
export type ConnectionStatus = "active" | "expired" | "error" | "revoked";
export type ConnectionAuthType = "api_key" | "oauth2";

export interface ConnectorConnection {
  id: string;
  connector_id: string;
  scope: ConnectionScope;
  subject_user_id: string | null;
  status: ConnectionStatus;
  auth_type: ConnectionAuthType;
  scopes_granted: string[];
  access_expires_at: string | null;
  refresh_token_present: boolean;
  last_refresh_at: string | null;
  last_refresh_error: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectorAssignment {
  id: string;
  workspace_id: string;
  connector_id: string;
  client_id: string;
  action_key: string | null;
  created_by: string;
  created_at: string;
}

export interface CreateConnectorRequest {
  provider_key: string;
  name: string;
  enabled: boolean;
  agent_accessible: boolean;
  config?: Record<string, unknown>;
  subscriptions?: unknown[];
  secrets?: Record<string, string>;
}

export interface UpdateConnectorRequest {
  id: string;
  name?: string;
  enabled?: boolean;
  agent_accessible?: boolean;
  config?: Record<string, unknown>;
  subscriptions?: unknown[];
  secrets?: Record<string, string>;
}

export interface StartOAuthRequest {
  connectorId: string;
  scopes?: string[];
  redirect_after?: string;
}

export interface StartOAuthResponse {
  authorize_url: string;
  state: string;
}

export interface CreateAssignmentRequest {
  connectorId: string;
  client_id: string;
  action_key?: string | null;
}

/** One row per broker action attempt (allow or deny) — the accountability
 * record: who (subject), which agent (actor), which token, what, outcome. */
export interface ConnectorActionAudit {
  id: string;
  workspace_id: string;
  connector_id?: string;
  action_key: string;
  outcome: "allow" | "deny";
  deny_reason?: string;
  subject_type?: string;
  subject_id?: string;
  actor_client_id?: string;
  actor_spiffe_id?: string;
  token_family?: string;
  token_jti?: string;
  http_status?: number;
  latency_ms?: number;
  created_at: string;
}

export interface SetProviderAppRequest {
  providerKey: string;
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
}

export const connectorsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listConnectorProviders: builder.query<ConnectorProvider[], void>({
      query: () => "/authsec/connectors/providers",
      transformResponse: (res: { providers: ConnectorProvider[] }) => res.providers,
      providesTags: [{ type: "ExternalService", id: "PROVIDER_LIST" }],
    }),

    listConnectors: builder.query<Connector[], void>({
      query: () => "/authsec/connectors",
      transformResponse: (res: { connectors: Connector[] }) => res.connectors,
      providesTags: (result) =>
        result
          ? [
              ...result.map((c) => ({ type: "ExternalService" as const, id: c.id })),
              { type: "ExternalService" as const, id: "LIST" },
            ]
          : [{ type: "ExternalService" as const, id: "LIST" }],
    }),

    getConnector: builder.query<
      { connector: Connector; connections: ConnectorConnection[] },
      string
    >({
      query: (id) => `/authsec/connectors/${id}`,
      providesTags: (_result, _error, id) => [{ type: "ExternalService", id }],
    }),

    createConnector: builder.mutation<Connector, CreateConnectorRequest>({
      query: (body) => ({
        url: "/authsec/connectors",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "ExternalService", id: "LIST" }],
    }),

    updateConnector: builder.mutation<Connector, UpdateConnectorRequest>({
      query: ({ id, ...body }) => ({
        url: `/authsec/connectors/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "ExternalService", id },
        { type: "ExternalService", id: "LIST" },
      ],
    }),

    deleteConnector: builder.mutation<void, string>({
      query: (id) => ({
        url: `/authsec/connectors/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "ExternalService", id },
        { type: "ExternalService", id: "LIST" },
      ],
    }),

    startConnectorOAuth: builder.mutation<StartOAuthResponse, StartOAuthRequest>({
      query: ({ connectorId, ...body }) => ({
        url: `/authsec/connectors/${connectorId}/connections/oauth/start`,
        method: "POST",
        body,
      }),
    }),

    listConnectorAssignments: builder.query<ConnectorAssignment[], string>({
      query: (connectorId) => `/authsec/connectors/${connectorId}/assignments`,
      transformResponse: (res: { assignments: ConnectorAssignment[] }) => res.assignments,
      providesTags: (_result, _error, connectorId) => [
        { type: "ExternalService", id: `${connectorId}:assignments` },
      ],
    }),

    createConnectorAssignment: builder.mutation<ConnectorAssignment, CreateAssignmentRequest>({
      query: ({ connectorId, ...body }) => ({
        url: `/authsec/connectors/${connectorId}/assignments`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { connectorId }) => [
        { type: "ExternalService", id: `${connectorId}:assignments` },
      ],
    }),

    deleteConnectorAssignment: builder.mutation<
      void,
      { connectorId: string; assignmentId: string }
    >({
      query: ({ connectorId, assignmentId }) => ({
        url: `/authsec/connectors/${connectorId}/assignments/${assignmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { connectorId }) => [
        { type: "ExternalService", id: `${connectorId}:assignments` },
      ],
    }),

    getConnectorAudit: builder.query<
      ConnectorActionAudit[],
      { connectorId: string; limit?: number }
    >({
      query: ({ connectorId, limit = 100 }) =>
        `/authsec/connectors/${connectorId}/audit?limit=${limit}`,
      transformResponse: (res: { audit: ConnectorActionAudit[] }) => res.audit ?? [],
      providesTags: (_result, _error, { connectorId }) => [
        { type: "ExternalService", id: `${connectorId}:audit` },
      ],
    }),

    // Write-only by design: there is no GET for a workspace's provider app
    // (the secret lives in Vault; client_id/redirect are set-and-forget).
    setProviderApp: builder.mutation<
      { status: string; provider: string },
      SetProviderAppRequest
    >({
      query: ({ providerKey, ...body }) => ({
        url: `/authsec/connectors/providers/${providerKey}/app`,
        method: "POST",
        body,
      }),
    }),
  }),
});

export const {
  useListConnectorProvidersQuery,
  useListConnectorsQuery,
  useGetConnectorQuery,
  useCreateConnectorMutation,
  useUpdateConnectorMutation,
  useDeleteConnectorMutation,
  useStartConnectorOAuthMutation,
  useListConnectorAssignmentsQuery,
  useCreateConnectorAssignmentMutation,
  useDeleteConnectorAssignmentMutation,
  useGetConnectorAuditQuery,
  useSetProviderAppMutation,
} = connectorsApi;
