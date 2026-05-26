import { baseApi } from "./baseApi";

export interface AccessApplicationRef {
  id: string;
  name: string;
  resource_uri: string;
}

export interface AccessUserRef {
  id: string;
  email: string;
  name: string;
  status?: string;
}

export interface AccessScopeRef {
  id: string;
  scope_string: string;
  display_name: string;
  risk_level: string;
  source?: string;
}

export interface AccessRoleRef {
  id: string;
  name: string;
  label: string;
  source?: string;
  binding_id?: string;
}

export interface ApplicationRole {
  id: string;
  name: string;
  label: string;
  description?: string;
  application: AccessApplicationRef;
  is_default: boolean;
  users_count: number;
  scopes_count: number;
  scopes: AccessScopeRef[];
  source: string;
  updated_at: string;
}

export interface ApplicationRoleListResponse {
  roles: ApplicationRole[];
  count: number;
}

export interface ListApplicationRolesParams {
  q?: string;
  application_id?: string;
  source?: string;
  default?: boolean;
}

export interface CreateApplicationRoleRequest {
  name: string;
  description?: string;
  scope_ids: string[];
  default_role?: boolean;
  assign_user_ids?: string[];
}

export interface ApplicationAccessUser {
  user: AccessUserRef;
  roles: AccessRoleRef[];
  scopes: AccessScopeRef[];
  bindings: Array<{
    id: string;
    user_id: string;
    username?: string;
    user_email?: string;
    role_id: string;
    role_name: string;
    scope_type?: string;
    scope_id?: string;
    created_at: string;
    assignment_source?: string;
  }>;
  first_consent_at?: string;
  last_seen_at?: string;
}

export interface ApplicationAccessUsersResponse {
  users: ApplicationAccessUser[];
  count: number;
}

export interface EffectiveAccessScope {
  id: string;
  scope_string: string;
  display_name: string;
  risk_level: string;
  status: "granted" | "not_granted";
  granted_through?: Array<{
    role_id: string;
    role_name: string;
    binding_id: string;
    source: string;
  }>;
  removable: boolean;
}

export interface ApplicationEffectiveAccessResponse {
  user: AccessUserRef;
  application: AccessApplicationRef;
  roles: AccessRoleRef[];
  scopes: EffectiveAccessScope[];
}

export interface ScopeCatalogEntry {
  id: string;
  kind: "application" | "catalog" | "global";
  key: string;
  scope_string: string;
  display_name: string;
  description: string;
  risk_level: string;
  source: string;
  application?: AccessApplicationRef;
  tools_count: number;
  roles_count: number;
  users_count: number;
  consent_grants_count: number;
  updated_at: string;
}

export interface ScopeCatalogResponse {
  items: ScopeCatalogEntry[];
  count: number;
}

export interface ListScopeCatalogParams {
  q?: string;
  kind?: "application" | "catalog" | "global" | "all";
  risk_level?: string;
  application_id?: string;
}

export interface CreateScopeCatalogEntryRequest {
  key: string;
  display_name?: string;
  description?: string;
  risk_level?: string;
}

function toQueryString(params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "" || value === "all") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export const accessApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listApplicationRoles: builder.query<ApplicationRoleListResponse, ListApplicationRolesParams | void>({
      query: (params) => ({
        url: `/authsec/application-roles${toQueryString(params)}`,
        method: "GET",
      }),
      providesTags: [{ type: "ApplicationRole", id: "LIST" }],
    }),

    createApplicationRole: builder.mutation<
      ApplicationRole,
      { applicationId: string; body: CreateApplicationRoleRequest }
    >({
      query: ({ applicationId, body }) => ({
        url: `/authsec/applications/${applicationId}/roles`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { applicationId }) => [
        { type: "ApplicationRole", id: "LIST" },
        { type: "ApplicationAccess", id: applicationId },
        { type: "ResourceServer", id: `${applicationId}-roles` },
        { type: "ResourceServer", id: `${applicationId}-bindings` },
      ],
    }),

    listApplicationAccessUsers: builder.query<ApplicationAccessUsersResponse, string>({
      query: (applicationId) => ({
        url: `/authsec/applications/${applicationId}/access/users`,
        method: "GET",
      }),
      providesTags: (_result, _error, applicationId) => [
        { type: "ApplicationAccess", id: applicationId },
      ],
    }),

    getApplicationEffectiveAccess: builder.query<
      ApplicationEffectiveAccessResponse,
      { applicationId: string; userId: string }
    >({
      query: ({ applicationId, userId }) => ({
        url: `/authsec/applications/${applicationId}/users/${userId}/effective-access`,
        method: "GET",
      }),
      providesTags: (_result, _error, { applicationId, userId }) => [
        { type: "EffectiveAccess", id: `${applicationId}:${userId}` },
      ],
    }),

    listScopeCatalog: builder.query<ScopeCatalogResponse, ListScopeCatalogParams | void>({
      query: (params) => ({ url: `/authsec/scope-catalog${toQueryString(params)}`, method: "GET" }),
      providesTags: [{ type: "ScopeCatalog", id: "LIST" }],
    }),

    createScopeCatalogEntry: builder.mutation<ScopeCatalogEntry, CreateScopeCatalogEntryRequest>({
      query: (body) => ({ url: "/authsec/scope-catalog", method: "POST", body }),
      invalidatesTags: [{ type: "ScopeCatalog", id: "LIST" }],
    }),

    attachScopeCatalogEntry: builder.mutation<
      unknown,
      { catalogId: string; applicationId: string }
    >({
      query: ({ catalogId, applicationId }) => ({
        url: `/authsec/scope-catalog/${catalogId}/applications/${applicationId}`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { applicationId }) => [
        { type: "ScopeCatalog", id: "LIST" },
        { type: "OAuthScope", id: "LIST" },
        { type: "ScopeMatrix", id: applicationId },
      ],
    }),
  }),
});

export const {
  useListApplicationRolesQuery,
  useCreateApplicationRoleMutation,
  useListApplicationAccessUsersQuery,
  useGetApplicationEffectiveAccessQuery,
  useListScopeCatalogQuery,
  useCreateScopeCatalogEntryMutation,
  useAttachScopeCatalogEntryMutation,
} = accessApi;
