/**
 * Setup Wizard & Activation API
 *
 * Endpoints for the 6-step RS setup wizard, drift events, manifest status polling,
 * and public-tool management.
 *
 * Base path: /authsec/applications/:id/...
 */

import { baseApi } from "./baseApi";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RSState = "pending_scan" | "needs_setup" | "ready" | "scan_failed";

export interface ChecklistStep {
  step: number;
  name: string;
  complete: boolean;
  detail?: string;
}

export interface SetupChecklistResponse {
  steps: ChecklistStep[];
  can_activate: boolean;
}

export interface ActivationPreviewTools {
  total: number;
  public: number;
  mapped: number;
  unmapped: number;
}

export interface ScopeInfo {
  scope_string: string;
  display_name: string;
  tool_count: number;
}

export interface ActivationPreviewResponse {
  tools: ActivationPreviewTools;
  scopes: ScopeInfo[];
  scope_count: number;
  default_role: string;
  viewer_scopes: string[];
  public_tool_names: string[];
  first_time_user_grant: string[];
  can_activate: boolean;
}

export interface ActivateResponse {
  status: string;
}

export interface ActivationGateError {
  error: string;
  failed: string[];
}

export interface DriftEvent {
  id: string;
  rs_id: string;
  event_type: string;
  event_payload?: unknown;
  occurred_at: string;
  occurred_by?: string;
}

export interface DriftEventsResponse {
  events: DriftEvent[];
}

export interface ManifestAttempt {
  id: string;
  rs_id: string;
  attempted_at: string;
  status: string;
  reason?: string;
  tool_count?: number;
  manifest_version?: string;
  sdk_build_id?: string;
}

export interface SDKManifestStatusResponse {
  last_attempt: ManifestAttempt | null;
  last_success: ManifestAttempt | null;
  never_seen: boolean;
}

export interface MarkToolPublicRequest {
  is_public: boolean;
  confirmation_token?: string;
}

export interface RSRole {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  permissions: number;
  bindings: number;
}

export interface RSBinding {
  id: string;
  user_id: string;
  username: string;
  user_email: string;
  role_id: string;
  role_name: string;
  scope_type?: string | null;
  scope_id?: string | null;
  created_at: string;
  assignment_source?: string;
}

export interface EligibleUser {
  id: string;
  email: string;
  name: string;
}

export interface TestLoginResponse {
  resource_server: {
    id: string;
    name: string;
    state: RSState;
    status: string;
  };
  oauth: {
    state: RSState;
    ready_since?: string;
  };
  sdk_enforcement: {
    sdk_policy_state: string;
    tool_count: number;
    unmapped_tools: number;
  };
}

// ── API Slice ──────────────────────────────────────────────────────────────────

export const setupWizardApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /authsec/applications/:id/setup
    getSetupChecklist: builder.query<SetupChecklistResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/setup`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // GET /authsec/applications/:id/activation-preview
    getActivationPreview: builder.query<ActivationPreviewResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/activation-preview`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/activate
    activateResourceServer: builder.mutation<ActivateResponse, string>({
      query: (rsId) => ({
        url: `/authsec/applications/${rsId}/activate`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ResourceServer" as const, id: "LIST" },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/tools/:tool_id/public
    markToolPublic: builder.mutation<
      { tool_id: string; is_public: boolean },
      { rsId: string; toolId: string; body: MarkToolPublicRequest }
    >({
      query: ({ rsId, toolId, body }) => ({
        url: `/authsec/applications/${rsId}/tools/${toolId}/public`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // GET /authsec/applications/:id/sdk-manifest-status
    getSDKManifestStatus: builder.query<SDKManifestStatusResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/sdk-manifest-status`,
    }),

    // GET /authsec/applications/:id/drift-events
    getDriftEvents: builder.query<DriftEventsResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/drift-events`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: `${rsId}-drift` },
      ],
    }),

    // POST /authsec/applications/:id/drift-events/:event_id/dismiss
    dismissDriftEvent: builder.mutation<
      { status: string },
      { rsId: string; eventId: string }
    >({
      query: ({ rsId, eventId }) => ({
        url: `/authsec/applications/${rsId}/drift-events/${eventId}/dismiss`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-drift` },
      ],
    }),

    // POST /authsec/applications/:id/test-login
    testLogin: builder.mutation<TestLoginResponse, string>({
      query: (rsId) => ({
        url: `/authsec/applications/${rsId}/test-login`,
        method: "POST",
      }),
    }),

    // POST /authsec/applications/:id/rescan
    // Authenticated-scan: pass a one-shot bearer token in the body so the
    // backend forwards it to the MCP server's tools/list. The token must be
    // in the body, not the Authorization header (which is reserved for the
    // admin's JWT). The token is never persisted.
    scanWithMCPToken: builder.mutation<
      { status?: string; result?: unknown; last_scan_status?: string },
      { rsId: string; mcpToken?: string }
    >({
      query: ({ rsId, mcpToken }) => ({
        url: `/authsec/applications/${rsId}/rescan`,
        method: "POST",
        body: mcpToken ? { mcp_token: mcpToken } : {},
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // GET /authsec/applications/:id/roles
    listRSRoles: builder.query<{ roles: RSRole[] }, string>({
      query: (rsId) => `/authsec/applications/${rsId}/roles`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
      ],
    }),

    // GET /authsec/applications/:id/bindings
    listRSBindings: builder.query<{ bindings: RSBinding[] }, string>({
      query: (rsId) => `/authsec/applications/${rsId}/bindings`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: `${rsId}-bindings` },
      ],
    }),

    // POST /authsec/applications/:id/bindings
    createRSBinding: builder.mutation<
      { id: string; user_id: string; role_id: string; role_name: string },
      { rsId: string; userId: string; roleId: string }
    >({
      query: ({ rsId, userId, roleId }) => ({
        url: `/authsec/applications/${rsId}/bindings`,
        method: "POST",
        body: { user_id: userId, role_id: roleId },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-bindings` },
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
      ],
    }),

    // DELETE /authsec/applications/:id/bindings/:binding_id
    deleteRSBinding: builder.mutation<{ status: string }, { rsId: string; bindingId: string }>({
      query: ({ rsId, bindingId }) => ({
        url: `/authsec/applications/${rsId}/bindings/${bindingId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-bindings` },
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
      ],
    }),

    // GET /authsec/applications/:id/eligible-users
    listEligibleUsers: builder.query<{ users: EligibleUser[] }, string>({
      query: (rsId) => `/authsec/applications/${rsId}/eligible-users`,
    }),

    // POST /authsec/applications/:id/roles
    createApplicationRole: builder.mutation<
      RSRole,
      { rsId: string; name: string; description?: string; scope_ids?: string[] }
    >({
      query: ({ rsId, name, description, scope_ids }) => ({
        url: `/authsec/applications/${rsId}/roles`,
        method: "POST",
        body: { name, description, scope_ids: scope_ids ?? [] },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // POST /authsec/applications/:id/tools
    // Manual tool entry — wizard "Path C" escape hatch. inventory_source is
    // forced to 'manual' on the backend; admin override of mcp_scan or
    // sdk_manifest tools is not allowed through this route.
    createManualTool: builder.mutation<
      { tool_id: string; name: string; inventory_source: string },
      { rsId: string; name: string; description?: string }
    >({
      query: ({ rsId, name, description }) => ({
        url: `/authsec/applications/${rsId}/tools`,
        method: "POST",
        body: {
          name,
          description: description ?? "",
          inventory_source: "manual",
        },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),
  }),
});

export const {
  useGetSetupChecklistQuery,
  useGetActivationPreviewQuery,
  useActivateResourceServerMutation,
  useMarkToolPublicMutation,
  useGetSDKManifestStatusQuery,
  useGetDriftEventsQuery,
  useDismissDriftEventMutation,
  useTestLoginMutation,
  useScanWithMCPTokenMutation,
  useCreateManualToolMutation,
  useListRSRolesQuery,
  useListRSBindingsQuery,
  useCreateRSBindingMutation,
  useDeleteRSBindingMutation,
  useListEligibleUsersQuery,
  useCreateApplicationRoleMutation,
} = setupWizardApi;
