/**
 * Agent Identity API — Wave 1
 *
 * Endpoints for access-assignments, access-requests, connections,
 * machine-access credential wizard, and token-test/simulate.
 *
 * Base path: /authsec/applications/:id/...
 */

import { baseApi } from "./baseApi";

// ── Types ──────────────────────────────────────────────────────────────────────

export type IdentityType = "user" | "service_account";

export interface AccessAssignment {
  id: string;
  identity_type: IdentityType;
  identity_id: string;
  identity_name: string;
  role_id: string;
  role_name: string;
  effective_scopes: string[];
  status: string;
  created_at: string;
}

export interface AccessAssignmentsResponse {
  items: AccessAssignment[];
}

export interface ActingUser {
  id: string;
  email: string;
  name?: string;
}

export interface AccessRequest {
  request_id: string;
  request_type: string;
  status: "pending" | "approved" | "denied";
  requester_client_id: string;
  requester_name: string;
  acting_user?: ActingUser;
  source_workspace?: string;
  requested_scopes: string[];
  created_at: string;
  expires_at?: string;
}

export interface AccessRequestsResponse {
  items: AccessRequest[];
}

export interface ConnectionAuthority {
  type: "user" | "service_account";
  id: string;
  name: string;
}

export interface ConnectionGrantedThrough {
  role_id: string;
  role_name: string;
  scopes: string[];
}

export interface AgentConnection {
  // connection_id is the public client_id — the identifier revoke/approve/deny
  // resolve by. (The backend returns connection_id + status, NOT reg_id/reg_status.)
  connection_id: string;
  status: string;
  client_id: string;
  client_name: string;
  client_kind?: string;
  registration_type?: string;
  access_method: "m2m" | "xaa" | string;
  authority?: ConnectionAuthority;
  granted_through?: ConnectionGrantedThrough;
  created_at: string;
}

export interface ConnectionsResponse {
  items: AgentConnection[];
}

export interface SimulateCheck {
  name: string;
  status: "pass" | "fail";
  reason?: string;
}

export interface SimulateTokenResponse {
  would_mint: boolean;
  subject_type: string;
  effective_scopes: string[];
  expires_in: number;
  checks: SimulateCheck[];
  /** Paste-ready Slack/Jira summary of the first failing check (empty if would_mint). */
  failure_bundle?: string;
}

export interface WorkspaceServiceAccount {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  status: string; // "active" | "disabled"
  oauth_client_id?: string;
  spiffe_id?: string;
  external_subject?: string;
  owner_email?: string;
  owner_team?: string;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceAccountAccessItem {
  resource_server_id: string;
  resource_server_name: string;
  resource_uri: string;
  role_id: string;
  role_name: string;
  effective_scopes: string[];
}

export interface ServiceAccountAccessResponse {
  service_account_id: string;
  service_account_name: string;
  items: ServiceAccountAccessItem[];
}

export interface GrantWorkloadAccessResponse {
  service_account_id: string;
  service_account_name: string;
  client_id: string;
  role_id: string;
  role_name: string;
  assignment_id: string;
  effective_scopes: string[];
  resource: string;
}

export interface CreateAPICredentialRequest {
  service_account_name?: string;
  service_account_id?: string;
  role_id: string;
  // Backend contract (applications_machine_access_controller.go): exactly one
  // credential path — use_client_secret ⇒ client_secret_basic (secret shown
  // once), or jwks_uri / jwks ⇒ private_key_jwt. There is NO credential_type
  // field on the backend.
  use_client_secret?: boolean;
  jwks_uri?: string;
  jwks?: string;
}

export interface CreateAPICredentialResponse {
  service_account_id: string;
  service_account_name: string;
  client_id: string;
  client_secret?: string;
  role_id: string;
  role_name: string;
  token_endpoint: string;
  resource: string;
}

// ── API slice ──────────────────────────────────────────────────────────────────

const agentIdentityApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /authsec/applications/:id/access-assignments
    listAccessAssignments: builder.query<AccessAssignmentsResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/access-assignments`,
      providesTags: (_result, _error, rsId) => [
        { type: "AccessAssignment" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/access-assignments/users
    createUserAssignment: builder.mutation<
      { id: string },
      { rsId: string; userId: string; roleId: string }
    >({
      query: ({ rsId, userId, roleId }) => ({
        url: `/authsec/applications/${rsId}/access-assignments/users`,
        method: "POST",
        body: { user_id: userId, role_id: roleId },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AccessAssignment" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/access-assignments/service-accounts
    createSAAssignment: builder.mutation<
      { id: string },
      { rsId: string; serviceAccountId: string; roleId: string }
    >({
      query: ({ rsId, serviceAccountId, roleId }) => ({
        url: `/authsec/applications/${rsId}/access-assignments/service-accounts`,
        method: "POST",
        body: { service_account_id: serviceAccountId, role_id: roleId },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AccessAssignment" as const, id: rsId },
      ],
    }),

    // DELETE /authsec/applications/:id/access-assignments/:assignment_id
    deleteAssignment: builder.mutation<
      { status: string },
      { rsId: string; assignmentId: string }
    >({
      query: ({ rsId, assignmentId }) => ({
        url: `/authsec/applications/${rsId}/access-assignments/${assignmentId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AccessAssignment" as const, id: rsId },
      ],
    }),

    // GET /authsec/applications/:id/requests
    listAccessRequests: builder.query<AccessRequestsResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/requests`,
      providesTags: (_result, _error, rsId) => [
        { type: "AgentRequest" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/requests/:rid/approve
    approveRequest: builder.mutation<
      { status: string; connection_id?: string; assignment_id?: string },
      { rsId: string; requestId: string; roleId: string }
    >({
      query: ({ rsId, requestId, roleId }) => ({
        url: `/authsec/applications/${rsId}/requests/${requestId}/approve`,
        method: "POST",
        body: { role_id: roleId },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AgentRequest" as const, id: rsId },
        { type: "AgentConnection" as const, id: rsId },
        { type: "AccessAssignment" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/requests/:rid/deny
    denyRequest: builder.mutation<
      { status: string },
      { rsId: string; requestId: string; reason?: string }
    >({
      query: ({ rsId, requestId, reason }) => ({
        url: `/authsec/applications/${rsId}/requests/${requestId}/deny`,
        method: "POST",
        body: reason ? { reason } : {},
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AgentRequest" as const, id: rsId },
      ],
    }),

    // GET /authsec/applications/:id/connections
    listConnections: builder.query<ConnectionsResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/connections`,
      providesTags: (_result, _error, rsId) => [
        { type: "AgentConnection" as const, id: rsId },
      ],
    }),

    // DELETE /authsec/applications/:id/connections/:cid
    revokeConnection: builder.mutation<
      { status: string },
      { rsId: string; connectionId: string }
    >({
      query: ({ rsId, connectionId }) => ({
        url: `/authsec/applications/${rsId}/connections/${connectionId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AgentConnection" as const, id: rsId },
        { type: "AgentRequest" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/machine-access/api-credential
    createAPICredential: builder.mutation<
      CreateAPICredentialResponse,
      { rsId: string } & CreateAPICredentialRequest
    >({
      query: ({ rsId, ...body }) => ({
        url: `/authsec/applications/${rsId}/machine-access/api-credential`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "AccessAssignment" as const, id: rsId },
        { type: "AgentConnection" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/token-test/simulate
    simulateToken: builder.mutation<
      SimulateTokenResponse,
      {
        rsId: string;
        service_account_id?: string;
        role_id?: string;
        assignment_id?: string;
        requested_scopes?: string[];
        /** "config" (default) | "paste_svid" | "live" — debugger depth. */
        mode?: "config" | "paste_svid" | "live";
        /** Required when mode is "paste_svid" or "live": the JWT-SVID. */
        svid?: string;
      }
    >({
      query: ({ rsId, ...body }) => ({
        url: `/authsec/applications/${rsId}/token-test/simulate`,
        method: "POST",
        body,
      }),
    }),

    // POST /authsec/applications/:id/token-test/simulate-xaa — cross-workspace
    // (A2A / ID-JAG) debug: §19 same-domain, registration approval, brokering.
    simulateXaa: builder.mutation<
      SimulateTokenResponse,
      { rsId: string; client_id: string }
    >({
      query: ({ rsId, ...body }) => ({
        url: `/authsec/applications/${rsId}/token-test/simulate-xaa`,
        method: "POST",
        body,
      }),
    }),

    // GET /authsec/applications/:id/access-assignments/summary
    getAccessSummary: builder.query<
      {
        total_assignments: number;
        user_assignments: number;
        service_account_assignments: number;
        workload_assignments: number;
        pending_requests: number;
        active_connections: number;
      },
      string
    >({
      query: (rsId) => `/authsec/applications/${rsId}/access-assignments/summary`,
      providesTags: (_r, _e, rsId) => [
        { type: "AccessAssignment" as const, id: rsId },
        { type: "AgentRequest" as const, id: rsId },
      ],
    }),

    // GET /authsec/uflow/admin/service-accounts — workspace-level workload list.
    listWorkspaceServiceAccounts: builder.query<WorkspaceServiceAccount[], void>({
      query: () => `/authsec/uflow/admin/service-accounts`,
    }),

    // POST /authsec/uflow/admin/service-accounts — create a workspace-level
    // workload identity (no server grant; access is granted separately).
    createWorkspaceServiceAccount: builder.mutation<
      WorkspaceServiceAccount,
      { name: string; description?: string }
    >({
      query: (body) => ({ url: `/authsec/uflow/admin/service-accounts`, method: "POST", body }),
    }),

    // PUT /authsec/uflow/admin/service-accounts/:sa_id — rename / re-describe.
    updateWorkspaceServiceAccount: builder.mutation<
      WorkspaceServiceAccount,
      { saId: string; name?: string; description?: string }
    >({
      query: ({ saId, ...body }) => ({
        url: `/authsec/uflow/admin/service-accounts/${saId}`,
        method: "PUT",
        body,
      }),
    }),

    // DELETE /authsec/uflow/admin/service-accounts/:sa_id — remove the service account.
    deleteWorkspaceServiceAccount: builder.mutation<{ message: string; id: string }, string>({
      query: (saId) => ({
        url: `/authsec/uflow/admin/service-accounts/${saId}`,
        method: "DELETE",
      }),
    }),

    // POST /authsec/agents — mint a confidential A2A agent client
    // (authorization_code + token-exchange + secret) in this workspace.
    registerAgent: builder.mutation<
      { client_id: string; client_secret: string; redirect_uris: string[]; issuer: string },
      { name: string; redirect_uris?: string[] }
    >({
      query: (body) => ({ url: `/authsec/agents`, method: "POST", body }),
    }),

    // POST /authsec/uflow/admin/service-accounts/:sa_id/credentials — provision a
    // credential (client secret shown once, or private_key_jwt via jwks).
    provisionWorkloadCredential: builder.mutation<
      { client_id: string; auth_method: string; client_secret?: string },
      { saId: string; use_client_secret?: boolean; jwks_uri?: string; jwks?: string }
    >({
      query: ({ saId, ...body }) => ({
        url: `/authsec/uflow/admin/service-accounts/${saId}/credentials`,
        method: "POST",
        body,
      }),
    }),

    // GET /authsec/uflow/admin/service-accounts/:sa_id/access — reverse index
    // ("which MCP servers can this workload reach").
    listServiceAccountAccess: builder.query<ServiceAccountAccessResponse, string>({
      query: (saId) => `/authsec/uflow/admin/service-accounts/${saId}/access`,
    }),

    // POST /authsec/applications/:id/access/workloads — grant an EXISTING
    // workload access to this MCP server (never mints/changes identity).
    grantWorkloadAccess: builder.mutation<
      GrantWorkloadAccessResponse,
      {
        rsId: string;
        service_account_id: string;
        role_id: string;
        requested_scopes?: string[];
      }
    >({
      query: ({ rsId, ...body }) => ({
        url: `/authsec/applications/${rsId}/access/workloads`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { rsId }) => [
        { type: "AccessAssignment" as const, id: rsId },
        { type: "AgentConnection" as const, id: rsId },
      ],
    }),
  }),
});

export const {
  useListAccessAssignmentsQuery,
  useCreateUserAssignmentMutation,
  useCreateSAAssignmentMutation,
  useDeleteAssignmentMutation,
  useListAccessRequestsQuery,
  useApproveRequestMutation,
  useDenyRequestMutation,
  useListConnectionsQuery,
  useRevokeConnectionMutation,
  useCreateAPICredentialMutation,
  useSimulateTokenMutation,
  useSimulateXaaMutation,
  useGetAccessSummaryQuery,
  useListWorkspaceServiceAccountsQuery,
  useListServiceAccountAccessQuery,
  useGrantWorkloadAccessMutation,
  useCreateWorkspaceServiceAccountMutation,
  useUpdateWorkspaceServiceAccountMutation,
  useDeleteWorkspaceServiceAccountMutation,
  useProvisionWorkloadCredentialMutation,
  useRegisterAgentMutation,
} = agentIdentityApi;
