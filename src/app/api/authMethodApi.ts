// authMethodApi — workspace-scoped Identity Provider API (v4)
//
// Single canonical endpoint at /authsec/identity-providers handles both OIDC
// and SAML by dispatching on `provider_type`. Application-level whitelisting
// happens via /authsec/applications/:id/identity-providers (default-allow).
//
// Legacy /oocmgr/* IDP endpoints have been removed from the backend; the only
// surfaces below are v4.

import { baseApi } from "./baseApi";
import type {
  AuthMethod,
  AuthMethodFilters,
  AuthMethodAnalytics,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Identity Provider (workspace-scoped) — shared core types
// ---------------------------------------------------------------------------

export type IdentityProviderType = "oidc" | "saml" | "ad" | "entra" | "scim";
export type IdentityProviderStatus = "configured" | "disabled";

/** Row stored in identity_providers; protocol-specific config is referenced
 *  by config_ref (UUID of the underlying oidc_providers / saml_providers row). */
export interface IdentityProvider {
  id: string;
  workspace_id: string;
  provider_type: IdentityProviderType;
  display_name: string;
  config_ref: string;
  status: IdentityProviderStatus;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

/** Payload posted when creating an OIDC IDP. The client_secret is sent to the
 *  backend in plaintext; it is written to Vault and never persisted in the DB. */
export interface CreateOIDCIdentityProviderConfig {
  provider_name: string; // 'google' | 'github' | 'microsoft' | custom slug
  authorization_url: string;
  token_url: string;
  userinfo_url: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes?: string; // space-delimited, e.g. "openid email profile"
  icon_url?: string;
}

/** Payload posted when creating a SAML IDP. */
export interface CreateSAMLIdentityProviderConfig {
  provider_name: string;
  entity_id: string;
  sso_url: string;
  slo_url?: string;
  certificate: string;
  name_id_format?: string;
  attribute_mapping?: Record<string, string>;
}

export type CreateIdentityProviderRequest =
  | {
      provider_type: "oidc";
      display_name: string;
      config: CreateOIDCIdentityProviderConfig;
    }
  | {
      provider_type: "saml";
      display_name: string;
      config: CreateSAMLIdentityProviderConfig;
    };

export interface UpdateIdentityProviderStatusRequest {
  id: string;
  status: IdentityProviderStatus;
}

// ---------------------------------------------------------------------------
// Application IDP policies (Application↔IDP whitelist; default-allow)
// ---------------------------------------------------------------------------

export interface ApplicationIDPPolicy {
  id: string;
  workspace_id: string;
  application_id: string;
  identity_provider_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddApplicationIDPPolicyRequest {
  applicationId: string;
  identity_provider_id: string;
  enabled?: boolean;
}

export interface RemoveApplicationIDPPolicyRequest {
  applicationId: string;
  identityProviderId: string;
}

export interface ShowAuthProvidersRequest {
  workspace_id: string;
  client_id?: string;
}

export interface ShowAuthProvidersResponse {
  success: boolean;
  message: string;
  data: {
    workspace_id: string;
    client_id?: string;
    count: number;
    providers: Array<{
      provider_name: string;
      display_name: string;
      client_id?: string;
      client_ids?: string;
      provider_type?: string;
      callback_url?: string;
      is_active: boolean;
      sort_order: number;
      status?: string;
    }>;
  };
  timestamp: string;
}

export interface EditClientAuthProviderRequest {
  workspace_id: string;
  client_id: string;
  provider_name: string;
  display_name: string;
  is_active: boolean;
  callback_url?: string;
  provider_config?: {
    auth_url?: string;
    token_url?: string;
    user_info_url?: string;
  };
  updated_by?: string;
}

export interface UpdateProviderRequest {
  workspace_id: string;
  org_id?: string;
  provider_name: string;
  display_name: string;
  client_id?: string;
  client_secret?: string;
  auth_url?: string;
  token_url?: string;
  user_info_url?: string;
  scopes?: string[];
  is_active?: boolean;
  updated_by?: string;
}

export interface DeleteProviderRequest {
  workspace_id: string;
  client_id?: string;
  provider_name: string;
}

// ---------------------------------------------------------------------------
// Callback URL helper — the workspace OIDC callback is always at this path
// ---------------------------------------------------------------------------

/** Compute the OIDC redirect URI to paste into Google Cloud Console / GitHub
 *  / Microsoft Entra. The backend serves the callback at this exact path. */
export const oidcCallbackUrl = (): string =>
  `${window.location.origin}/authsec/uflow/oidc/callback`;

// ---------------------------------------------------------------------------
// RTK Query slice
// ---------------------------------------------------------------------------

export const authMethodApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ----- Auth methods (legacy/unrelated, kept for other pages) ----------
    getAuthMethods: builder.query<AuthMethod[], AuthMethodFilters>({
      query: (params = {}) => {
        const searchParams = new URLSearchParams();
        if (params.search) searchParams.append("search", params.search);
        if (params.status) searchParams.append("status", params.status);
        if (params.method_type)
          searchParams.append("method_type", params.method_type);
        if (params.limit) searchParams.append("limit", params.limit.toString());
        if (params.offset)
          searchParams.append("offset", params.offset.toString());
        return `/authsec/auth-methods?${searchParams.toString()}`;
      },
      providesTags: ["AuthMethod"],
    }),
    getAuthMethod: builder.query<AuthMethod, string>({
      query: (id) => `/authsec/auth-methods/${id}`,
      providesTags: (result, error, id) => [{ type: "AuthMethod", id }],
    }),
    createAuthMethod: builder.mutation<AuthMethod, Partial<AuthMethod>>({
      query: (data) => ({
        url: "/authsec/auth-methods",
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["AuthMethod"],
    }),
    updateAuthMethod: builder.mutation<
      AuthMethod,
      { id: string; data: Partial<AuthMethod> }
    >({
      query: ({ id, data }) => ({
        url: `/authsec/auth-methods/${id}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: "AuthMethod", id }],
    }),
    deleteAuthMethod: builder.mutation<void, string>({
      query: (id) => ({
        url: `/authsec/auth-methods/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["AuthMethod"],
    }),
    getAuthMethodStats: builder.query<any, string>({
      query: (projectId) =>
        `/authsec/auth-methods/stats?project_id=${projectId}`,
      providesTags: ["AuthMethod"],
    }),
    getAuthMethodAnalytics: builder.query<AuthMethodAnalytics, string>({
      query: (projectId) =>
        `/authsec/auth-methods/analytics?project_id=${projectId}`,
      providesTags: ["AuthMethod"],
    }),
    toggleAuthMethodStatus: builder.mutation<AuthMethod, string>({
      query: (id) => ({
        url: `/authsec/auth-methods/${id}/toggle-status`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "AuthMethod", id },
        "AuthMethod",
      ],
    }),
    getAuthMethodsByProject: builder.query<AuthMethod[], string>({
      query: (projectId) => `/authsec/projects/${projectId}/auth-methods`,
      providesTags: ["AuthMethod"],
    }),

    showAuthProviders: builder.query<ShowAuthProvidersResponse, ShowAuthProvidersRequest>({
      query: () => "/authsec/identity-providers?provider_type=oidc",
      transformResponse: (providers: IdentityProvider[], _meta, arg) => ({
        success: true,
        message: "Identity providers loaded",
        data: {
          workspace_id: arg.workspace_id,
          client_id: arg.client_id,
          count: providers.length,
          providers: providers.map((provider, index) => ({
            provider_name: provider.display_name.toLowerCase().replace(/\s+/g, "-"),
            display_name: provider.display_name,
            client_id: provider.config_ref,
            client_ids: provider.config_ref,
            provider_type: provider.provider_type,
            is_active: provider.status === "configured",
            sort_order: index,
            status: provider.status === "configured" ? "active" : "inactive",
          })),
        },
        timestamp: new Date().toISOString(),
      }),
      providesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    editClientAuthProvider: builder.mutation<{ success: boolean }, EditClientAuthProviderRequest>({
      query: ({ provider_name, is_active }) => ({
        url: `/authsec/identity-providers/${provider_name}/status`,
        method: "PUT",
        body: { status: is_active ? "configured" : "disabled" },
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    updateProvider: builder.mutation<{ success: boolean }, UpdateProviderRequest>({
      query: ({ provider_name, is_active }) => ({
        url: `/authsec/identity-providers/${provider_name}/status`,
        method: "PUT",
        body: { status: is_active === false ? "disabled" : "configured" },
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    deleteProvider: builder.mutation<{ success: boolean }, DeleteProviderRequest>({
      query: ({ provider_name }) => ({
        url: `/authsec/identity-providers/${provider_name}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    // ----- Identity Providers (workspace IDP CRUD) ------------------------

    /** GET /authsec/identity-providers — list all IDPs in the workspace. */
    listIdentityProviders: builder.query<
      IdentityProvider[],
      { provider_type?: IdentityProviderType } | void
    >({
      query: (params) => {
        const qs =
          params && params.provider_type
            ? `?provider_type=${encodeURIComponent(params.provider_type)}`
            : "";
        return `/authsec/identity-providers${qs}`;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map((p) => ({
                type: "IdentityProvider" as const,
                id: p.id,
              })),
              { type: "IdentityProvider" as const, id: "LIST" },
            ]
          : [{ type: "IdentityProvider" as const, id: "LIST" }],
    }),

    /** GET /authsec/identity-providers/:id */
    getIdentityProvider: builder.query<IdentityProvider, string>({
      query: (id) => `/authsec/identity-providers/${id}`,
      providesTags: (_r, _e, id) => [{ type: "IdentityProvider", id }],
    }),

    /** POST /authsec/identity-providers — dispatches on provider_type. */
    createIdentityProvider: builder.mutation<
      IdentityProvider,
      CreateIdentityProviderRequest
    >({
      query: (body) => ({
        url: "/authsec/identity-providers",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    /** PUT /authsec/identity-providers/:id/status — 'configured' | 'disabled'. */
    updateIdentityProviderStatus: builder.mutation<
      { status: IdentityProviderStatus },
      UpdateIdentityProviderStatusRequest
    >({
      query: ({ id, status }) => ({
        url: `/authsec/identity-providers/${id}/status`,
        method: "PUT",
        body: { status },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IdentityProvider", id },
        { type: "IdentityProvider", id: "LIST" },
      ],
    }),

    /** DELETE /authsec/identity-providers/:id — also removes the underlying
     *  oidc_providers/saml_providers row and the Vault secret. */
    deleteIdentityProvider: builder.mutation<{ status: string }, string>({
      query: (id) => ({
        url: `/authsec/identity-providers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    // ----- Application IDP policies (optional whitelist) ------------------

    listApplicationIDPPolicies: builder.query<
      ApplicationIDPPolicy[],
      string /* applicationId */
    >({
      query: (applicationId) =>
        `/authsec/applications/${applicationId}/identity-providers`,
      providesTags: (_r, _e, applicationId) => [
        { type: "ApplicationIDPPolicy", id: applicationId },
      ],
    }),

    addApplicationIDPPolicy: builder.mutation<
      ApplicationIDPPolicy,
      AddApplicationIDPPolicyRequest
    >({
      query: ({ applicationId, ...body }) => ({
        url: `/authsec/applications/${applicationId}/identity-providers`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { applicationId }) => [
        { type: "ApplicationIDPPolicy", id: applicationId },
      ],
    }),

    removeApplicationIDPPolicy: builder.mutation<
      { status: string },
      RemoveApplicationIDPPolicyRequest
    >({
      query: ({ applicationId, identityProviderId }) => ({
        url: `/authsec/applications/${applicationId}/identity-providers/${identityProviderId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { applicationId }) => [
        { type: "ApplicationIDPPolicy", id: applicationId },
      ],
    }),
  }),
});

export const {
  // Generic auth methods
  useGetAuthMethodsQuery,
  useGetAuthMethodQuery,
  useCreateAuthMethodMutation,
  useUpdateAuthMethodMutation,
  useDeleteAuthMethodMutation,
  useGetAuthMethodStatsQuery,
  useGetAuthMethodAnalyticsQuery,
  useToggleAuthMethodStatusMutation,
  useGetAuthMethodsByProjectQuery,
  useShowAuthProvidersQuery,
  useEditClientAuthProviderMutation,
  useUpdateProviderMutation,
  useDeleteProviderMutation,
  // Identity provider CRUD
  useListIdentityProvidersQuery,
  useGetIdentityProviderQuery,
  useCreateIdentityProviderMutation,
  useUpdateIdentityProviderStatusMutation,
  useDeleteIdentityProviderMutation,
  // Application IDP policies
  useListApplicationIDPPoliciesQuery,
  useAddApplicationIDPPolicyMutation,
  useRemoveApplicationIDPPolicyMutation,
} = authMethodApi;
