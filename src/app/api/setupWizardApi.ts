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
} = setupWizardApi;
