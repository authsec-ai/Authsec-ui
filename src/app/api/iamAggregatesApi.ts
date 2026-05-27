import type {
  ApplicationAccessUsersResponse,
  ApplicationEffectiveAccessResponse,
} from "./accessApi";
import { baseApi } from "./baseApi";
import type { RSBinding } from "./setupWizardApi";
import type { OAuthScope, ScopeMatrixResponse } from "./types/scopeMatrix";

export interface AggregateListParams {
  q?: string;
  limit?: number;
  cursor?: string;
  sort?: string;
  direction?: "asc" | "desc";
  risk?: string;
  status?: string;
}

export interface AggregateListEnvelope<T> {
  items?: T[];
  applied_filters?: Record<string, unknown>;
  next_cursor?: string | null;
}

export interface PostureSummaryResponse {
  workspace_id: string;
  generated_at: string;
  summary: {
    applications: number;
    launched: number;
    tools: number;
    unmapped_tools: number;
    public_tools: number;
    risky_scopes: number;
    access_assignments: number;
    users_with_access: number;
    recommended_actions: number;
  };
  action_queue: Array<{
    application_id: string;
    application: string;
    type: string;
    severity: string;
    label: string;
    action: string;
    href: string;
  }>;
  applied_filters?: Record<string, unknown>;
  next_cursor?: string | null;
}

export interface ScopeImpactResponse {
  scope_id: string;
  application_id: string;
  impact: {
    tools_unlocked: number;
    roles_using: number;
    users_affected: number;
    active_consent_grants: number;
  };
}

export interface AccessSimulationRequest {
  user_id: string;
  client_id?: string;
  tool_id?: string;
  tool_name?: string;
  request_id?: string;
  at?: string;
}

export interface AccessSimulationResponse {
  verdict: "allowed" | "denied";
  failed_condition?: string;
  safest_fix?: string;
  reason?: string;
  application: {
    id: string;
    name: string;
    launched: boolean;
  };
  user: {
    id: string;
    active: boolean;
  };
  tool?: {
    id: string;
    name: string;
    public: boolean;
  };
  access_path: string[];
  decision_trace: Array<{
    check: string;
    state: "passed" | "failed";
    detail: string;
  }>;
}

export interface AccessChangePreviewResponse {
  application_id: string;
  change_type: string;
  impact: {
    bindings: number;
    users_affected: number;
    scopes_affected: number;
  };
}

export interface EvidenceExportResponse {
  status: string;
  export_type: string;
  requested_at: string;
  evidence: {
    application_id: string;
    tools: number;
    scopes: number;
    bindings: number;
    consent_grants: number;
  };
}

function toQueryString(params?: AggregateListParams) {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "" || value === "all") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export const iamAggregatesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWorkspaceApplicationPostureSummary: builder.query<
      PostureSummaryResponse,
      { workspaceId: string; params?: AggregateListParams }
    >({
      query: ({ workspaceId, params }) => ({
        url: `/authsec/v1/workspaces/${workspaceId}/applications/posture-summary${toQueryString(params)}`,
        method: "GET",
      }),
      providesTags: [{ type: "Dashboard", id: "APPLICATION_POSTURE" }],
    }),

    getApplicationToolExposure: builder.query<
      ScopeMatrixResponse,
      { applicationId: string; params?: AggregateListParams }
    >({
      query: ({ applicationId, params }) => ({
        url: `/authsec/v1/applications/${applicationId}/tool-exposure${toQueryString(params)}`,
        method: "GET",
      }),
      providesTags: (_result, _error, { applicationId }) => [
        { type: "ScopeMatrix", id: applicationId },
        { type: "MCPTool", id: "LIST" },
      ],
    }),

    getApplicationAggregateScopes: builder.query<
      OAuthScope[],
      { applicationId: string; params?: AggregateListParams }
    >({
      query: ({ applicationId, params }) => ({
        url: `/authsec/v1/applications/${applicationId}/scopes${toQueryString(params)}`,
        method: "GET",
      }),
      providesTags: [{ type: "OAuthScope", id: "LIST" }],
    }),

    getApplicationScopeImpact: builder.query<
      ScopeImpactResponse,
      { applicationId: string; scopeId: string }
    >({
      query: ({ applicationId, scopeId }) => ({
        url: `/authsec/v1/applications/${applicationId}/scopes/${scopeId}/impact`,
        method: "GET",
      }),
      providesTags: (_result, _error, { applicationId, scopeId }) => [
        { type: "OAuthScope", id: scopeId },
        { type: "ApplicationAccess", id: applicationId },
      ],
    }),

    getApplicationAccessAssignmentsV1: builder.query<
      { bindings: RSBinding[] },
      { applicationId: string; params?: AggregateListParams }
    >({
      query: ({ applicationId, params }) => ({
        url: `/authsec/v1/applications/${applicationId}/access-assignments${toQueryString(params)}`,
        method: "GET",
      }),
      providesTags: (_result, _error, { applicationId }) => [
        { type: "ResourceServer", id: `${applicationId}-bindings` },
        { type: "ApplicationAccess", id: applicationId },
      ],
    }),

    getApplicationEndUserAccessSummary: builder.query<
      ApplicationAccessUsersResponse,
      { applicationId: string; params?: AggregateListParams }
    >({
      query: ({ applicationId, params }) => ({
        url: `/authsec/v1/applications/${applicationId}/end-user-access-summary${toQueryString(params)}`,
        method: "GET",
      }),
      providesTags: (_result, _error, { applicationId }) => [
        { type: "ApplicationAccess", id: applicationId },
      ],
    }),

    getApplicationEffectiveAccessV1: builder.query<
      ApplicationEffectiveAccessResponse,
      { applicationId: string; userId: string; clientId?: string; toolId?: string }
    >({
      query: ({ applicationId, userId, clientId, toolId }) => {
        const params = new URLSearchParams({ user_id: userId });
        if (clientId) params.set("client_id", clientId);
        if (toolId) params.set("tool_id", toolId);
        return {
          url: `/authsec/v1/applications/${applicationId}/effective-access?${params.toString()}`,
          method: "GET",
        };
      },
      providesTags: (_result, _error, { applicationId, userId }) => [
        { type: "EffectiveAccess", id: `${applicationId}:${userId}` },
      ],
    }),

    runAccessSimulation: builder.mutation<
      AccessSimulationResponse,
      { applicationId: string; body: AccessSimulationRequest }
    >({
      query: ({ applicationId, body }) => ({
        url: `/authsec/v1/applications/${applicationId}/access-simulations`,
        method: "POST",
        body,
      }),
    }),

    previewAccessChange: builder.mutation<
      AccessChangePreviewResponse,
      { applicationId: string; body: Record<string, unknown> }
    >({
      query: ({ applicationId, body }) => ({
        url: `/authsec/v1/applications/${applicationId}/access-change-previews`,
        method: "POST",
        body,
      }),
    }),

    createEvidenceExport: builder.mutation<
      EvidenceExportResponse,
      { applicationId: string; body?: Record<string, unknown> }
    >({
      query: ({ applicationId, body }) => ({
        url: `/authsec/v1/applications/${applicationId}/evidence-exports`,
        method: "POST",
        body: body ?? {},
      }),
    }),
  }),
});

export const {
  useGetWorkspaceApplicationPostureSummaryQuery,
  useGetApplicationToolExposureQuery,
  useGetApplicationAggregateScopesQuery,
  useGetApplicationScopeImpactQuery,
  useGetApplicationAccessAssignmentsV1Query,
  useGetApplicationEndUserAccessSummaryQuery,
  useGetApplicationEffectiveAccessV1Query,
  useRunAccessSimulationMutation,
  usePreviewAccessChangeMutation,
  useCreateEvidenceExportMutation,
} = iamAggregatesApi;
