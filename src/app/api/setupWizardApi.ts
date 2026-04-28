/**
 * Setup Wizard & Activation API
 *
 * Endpoints for the 6-step RS setup wizard, drift events, manifest status polling,
 * and public-tool management.
 *
 * Base path: /authsec/resource-servers/:id/...
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
    // GET /authsec/resource-servers/:id/setup
    getSetupChecklist: builder.query<SetupChecklistResponse, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/setup`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // GET /authsec/resource-servers/:id/activation-preview
    getActivationPreview: builder.query<ActivationPreviewResponse, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/activation-preview`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // POST /authsec/resource-servers/:id/activate
    activateResourceServer: builder.mutation<ActivateResponse, string>({
      query: (rsId) => ({
        url: `/authsec/resource-servers/${rsId}/activate`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ResourceServer" as const, id: "LIST" },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // POST /authsec/resource-servers/:id/tools/:tool_id/public
    markToolPublic: builder.mutation<
      { tool_id: string; is_public: boolean },
      { rsId: string; toolId: string; body: MarkToolPublicRequest }
    >({
      query: ({ rsId, toolId, body }) => ({
        url: `/authsec/resource-servers/${rsId}/tools/${toolId}/public`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // GET /authsec/resource-servers/:id/sdk-manifest-status
    getSDKManifestStatus: builder.query<SDKManifestStatusResponse, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/sdk-manifest-status`,
    }),

    // GET /authsec/resource-servers/:id/drift-events
    getDriftEvents: builder.query<DriftEventsResponse, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/drift-events`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: `${rsId}-drift` },
      ],
    }),

    // POST /authsec/resource-servers/:id/drift-events/:event_id/dismiss
    dismissDriftEvent: builder.mutation<
      { status: string },
      { rsId: string; eventId: string }
    >({
      query: ({ rsId, eventId }) => ({
        url: `/authsec/resource-servers/${rsId}/drift-events/${eventId}/dismiss`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-drift` },
      ],
    }),

    // POST /authsec/resource-servers/:id/test-login
    testLogin: builder.mutation<TestLoginResponse, string>({
      query: (rsId) => ({
        url: `/authsec/resource-servers/${rsId}/test-login`,
        method: "POST",
      }),
    }),

    // POST /authsec/resource-servers/:id/rescan
    // Authenticated-scan: pass a one-shot bearer token in the body so the
    // backend forwards it to the MCP server's tools/list. The token must be
    // in the body, not the Authorization header (which is reserved for the
    // admin's JWT). The token is never persisted.
    scanWithMCPToken: builder.mutation<
      { status?: string; result?: unknown; last_scan_status?: string },
      { rsId: string; mcpToken?: string }
    >({
      query: ({ rsId, mcpToken }) => ({
        url: `/authsec/resource-servers/${rsId}/rescan`,
        method: "POST",
        body: mcpToken ? { mcp_token: mcpToken } : {},
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: rsId },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // GET /authsec/resource-servers/:id/roles
    listRSRoles: builder.query<{ roles: RSRole[] }, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/roles`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
      ],
    }),

    // GET /authsec/resource-servers/:id/bindings
    listRSBindings: builder.query<{ bindings: RSBinding[] }, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/bindings`,
      providesTags: (_result, _error, rsId) => [
        { type: "ResourceServer" as const, id: `${rsId}-bindings` },
      ],
    }),

    // POST /authsec/resource-servers/:id/bindings
    createRSBinding: builder.mutation<
      { id: string; user_id: string; role_id: string; role_name: string },
      { rsId: string; userId: string; roleId: string }
    >({
      query: ({ rsId, userId, roleId }) => ({
        url: `/authsec/resource-servers/${rsId}/bindings`,
        method: "POST",
        body: { user_id: userId, role_id: roleId },
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-bindings` },
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
      ],
    }),

    // DELETE /authsec/resource-servers/:id/bindings/:binding_id
    deleteRSBinding: builder.mutation<{ status: string }, { rsId: string; bindingId: string }>({
      query: ({ rsId, bindingId }) => ({
        url: `/authsec/resource-servers/${rsId}/bindings/${bindingId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ResourceServer" as const, id: `${rsId}-bindings` },
        { type: "ResourceServer" as const, id: `${rsId}-roles` },
      ],
    }),

    // GET /authsec/resource-servers/:id/eligible-users
    listEligibleUsers: builder.query<{ users: EligibleUser[] }, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/eligible-users`,
    }),

    // POST /authsec/resource-servers/:id/tools
    // Manual tool entry — wizard "Path C" escape hatch. inventory_source is
    // forced to 'manual' on the backend; admin override of mcp_scan or
    // sdk_manifest tools is not allowed through this route.
    createManualTool: builder.mutation<
      { tool_id: string; name: string; inventory_source: string },
      { rsId: string; name: string; description?: string }
    >({
      query: ({ rsId, name, description }) => ({
        url: `/authsec/resource-servers/${rsId}/tools`,
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
} = setupWizardApi;
