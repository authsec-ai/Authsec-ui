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
  /** F5: group ids allowed to be the on-behalf-of subject of a delegated action. */
  allowed_subject_groups: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ConnectionBinding = "workspace" | "user";
export type ConnectionStatus = "active" | "expired" | "error" | "revoked" | "disconnected";
export type ConnectionAuthMethod = "api_key" | "oauth2" | "github_app";

export interface ConnectorConnection {
  id: string;
  workspace_id: string;
  connector_id: string;
  binding_type: ConnectionBinding;
  subject_user_id?: string | null;
  status: ConnectionStatus;
  auth_method: ConnectionAuthMethod;
  scopes_granted: string[];
  // Non-secret external-account metadata (F2 — reconnect awareness).
  external_account_id?: string;
  external_account_name?: string;
  external_org_id?: string;
  external_org_name?: string;
  connected_by?: string;
  access_expires_at?: string | null;
  refresh_expires_at?: string | null;
  refresh_token_present: boolean;
  last_refresh_at?: string | null;
  last_refresh_error?: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ConnectorAssignment {
  id: string;
  workspace_id: string;
  connector_id: string;
  client_id: string;
  action_key: string | null;
  /** F3: optional per-assignment predicate over action inputs. */
  input_constraints?: Record<string, unknown> | null;
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
  /** F3: optional per-assignment input predicate, e.g. {"owner":{"equals":"acme-eng"}}. */
  input_constraints?: Record<string, unknown> | null;
}

/** One row per broker action attempt — the accountability record: who
 * (subject), which agent (actor), which token, what, and the F8 outcome quad
 * (authorized vs. what the provider actually returned). */
export interface ConnectorActionAudit {
  id: string;
  workspace_id: string;
  connector_id?: string;
  action_key: string;
  authz_outcome: "allow" | "deny";
  broker_status?: number;
  provider_status?: number | null;
  action_outcome?: "success" | "provider_error" | "policy_deny";
  deny_reason?: string;
  subject_type?: string;
  subject_id?: string;
  actor_client_id?: string;
  actor_spiffe_id?: string;
  owner_email?: string;
  owner_team?: string;
  token_family?: string;
  token_jti?: string;
  latency_ms?: number;
  created_at: string;
}

export interface SetProviderAppRequest {
  providerKey: string;
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
}

/** F1: register a workspace's GitHub App (app id + private-key PEM → Vault). */
export interface SetGitHubAppRequest {
  app_id: string;
  private_key: string;
}

/** F1: bind a connector to an installed GitHub App on an org. */
export interface ConnectGitHubAppRequest {
  connectorId: string;
  installation_id: string;
  org_name?: string;
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

    // F1 — register the workspace's GitHub App (write-only; PEM → Vault).
    setGitHubApp: builder.mutation<
      { status: string; provider: string; app_kind: string },
      SetGitHubAppRequest
    >({
      query: (body) => ({
        url: `/authsec/connectors/providers/github/app-github`,
        method: "POST",
        body,
      }),
    }),

    // F1 — bind a connector to an installed GitHub App on an org.
    connectGitHubApp: builder.mutation<
      { status: string; connector_id: string; installation_id: string },
      ConnectGitHubAppRequest
    >({
      query: ({ connectorId, ...body }) => ({
        url: `/authsec/connectors/${connectorId}/connections/github-app`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { connectorId }) => [{ type: "ExternalService", id: connectorId }],
    }),

    // F5 — set the groups allowed to be the on-behalf-of subject.
    setConnectorSubjectGroups: builder.mutation<
      { connector_id: string; allowed_subject_groups: string[] },
      { connectorId: string; group_ids: string[] }
    >({
      query: ({ connectorId, group_ids }) => ({
        url: `/authsec/connectors/${connectorId}/subject-groups`,
        method: "PUT",
        body: { group_ids },
      }),
      invalidatesTags: (_r, _e, { connectorId }) => [{ type: "ExternalService", id: connectorId }],
    }),

    // R4 — end user starts connecting THEIR own account for a connector.
    startUserConnect: builder.mutation<StartOAuthResponse, StartOAuthRequest>({
      query: ({ connectorId, ...body }) => ({
        url: `/authsec/connectors/${connectorId}/connections/user/oauth/start`,
        method: "POST",
        body,
      }),
    }),

    // R4 — the caller's own connected accounts across the workspace.
    listMyConnections: builder.query<ConnectorConnection[], void>({
      query: () => "/authsec/connectors/connections/me",
      transformResponse: (res: { connections: ConnectorConnection[] }) => res.connections ?? [],
      providesTags: [{ type: "ExternalService", id: "MY_CONNECTIONS" }],
    }),

    // R4 — the caller disconnects their own account for a connector.
    revokeMyConnection: builder.mutation<unknown, { connectorId: string }>({
      query: ({ connectorId }) => ({
        url: `/authsec/connectors/${connectorId}/connections/me`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ExternalService", id: "MY_CONNECTIONS" }],
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
  useSetGitHubAppMutation,
  useConnectGitHubAppMutation,
  useSetConnectorSubjectGroupsMutation,
  useStartUserConnectMutation,
  useListMyConnectionsQuery,
  useRevokeMyConnectionMutation,
} = connectorsApi;
