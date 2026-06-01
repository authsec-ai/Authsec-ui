import { baseApi, withSessionData } from "./baseApi";

// RBAC Audience type
export type RbacAudience = "admin" | "endUser";

// Request/Response types
export interface ScopeBinding {
  id?: string;
  type?: string;
}

export interface CreateBindingRequest {
  user_id: string;
  role_id: string;
  scope?: ScopeBinding;
  conditions?: Record<string, any>;
  audience?: RbacAudience;
}

export interface BindingResponse {
  id: string;
  role_name: string;
  scope_description?: string;
  status: string;
}

// List bindings query parameters
export interface ListBindingsParams {
  user_id?: string;
  role_id?: string;
  scope_type?: string;
  audience: RbacAudience;
}

// Role binding interface for list response
export interface RoleBinding {
  id: string;
  user_id?: string;
  username?: string;
  email?: string;
  role_id: string;
  role_name: string;
  scope_id?: string;
  scope_type?: string;
  service_account_id?: string;
  conditions?: Record<string, any>;
  created_at: string;
  expires_at?: string;
  source?: string;
  user?: { id: string; email?: string; name?: string };
  role?: { id: string; name: string; label?: string };
  application?: { id: string; name: string; resource_uri?: string };
}

/**
 * Bindings API
 * Handles role binding assignments (user + role + scope)
 * Uses the operator/admin RBAC surface.
 */
export const bindingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // List all role bindings with optional filters
    listBindings: builder.query<RoleBinding[], ListBindingsParams>({
      query: (params) => {
        const { audience: _audience, ...restParams } = params;
        const queryParams = new URLSearchParams();

        if (restParams.user_id) queryParams.append("user_id", restParams.user_id);
        if (restParams.role_id) queryParams.append("role_id", restParams.role_id);
        if (restParams.scope_type) queryParams.append("scope_type", restParams.scope_type);

        const queryString = queryParams.toString();

        return {
          url: `/authsec/uflow/admin/bindings${queryString ? `?${queryString}` : ""}`,
          method: "GET",
        };
      },
      providesTags: ["AdminUser", "AdminRBACRole", "AdminRBACScope"],
    }),

    createBinding: builder.mutation<BindingResponse, CreateBindingRequest>({
      query: ({ audience: _audience, ...data }) => ({
        url: "/authsec/uflow/admin/bindings",
        method: "POST",
        body: withSessionData(data),
      }),
      // Invalidate every surface that derives from role bindings. Without this,
      // the End Users detail panel shows stale roles/scopes after a grant —
      // which read as "the assign didn't work" even though the backend wrote it.
      invalidatesTags: [
        "AdminUser",
        "AdminRBACRole",
        "AdminRBACScope",
        "RoleBinding",
        "EffectiveAccess",
        "TenantEndUserState",
      ],
    }),

    deleteBinding: builder.mutation<void, string>({
      query: (bindingId) => ({
        url: `/authsec/uflow/admin/bindings/${bindingId}`,
        method: "DELETE",
      }),
      // Same fan-out as create: any view that reads a user's roles/scopes
      // (Assignments table, End Users panel, Effective Access page) must
      // refetch so the row disappears immediately. Previously this only
      // invalidated "RoleBinding" → other panels stayed stale.
      invalidatesTags: [
        "AdminUser",
        "AdminRBACRole",
        "AdminRBACScope",
        "RoleBinding",
        "EffectiveAccess",
        "TenantEndUserState",
      ],
    }),
  }),
});

export const {
  useListBindingsQuery,
  useCreateBindingMutation,
  useDeleteBindingMutation,
} = bindingsApi;
