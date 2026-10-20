/**
 * END-USER USERS API
 *
 * Endpoints for listing and managing end-users (customers/external users)
 * Authentication: Requires AuthMiddleware
 * Base Path: /uflow/enduser
 *
 * Available Endpoints:
 * - POST /uflow/enduser/list - List all end-users for a tenant
 * - POST /uflow/enduser/delete - Delete end-user
 * - POST /uflow/enduser/active - Activate/deactivate end-user
 */

import { baseApi, withSessionData } from '../baseApi';

// ============================================================================
// TYPES
// ============================================================================

export interface UsersQueryParams {
  page?: number;
  limit?: number;
  searchQuery?: string;
  active?: boolean;
  provider?: string;
  mfaEnabled?: boolean;
  mfaMethod?: string;
  email?: string;
  name?: string;
  roles?: string[];
  groups?: string[];
  createdAfter?: string;
  createdBefore?: string;
  lastLoginAfter?: string;
  lastLoginBefore?: string;
  client_id?: string;
  workspace_id?: string;
}

export interface ConfigStatus {
  configured: boolean;
  last_sync?: string;
  user_count?: number;
  status?: 'active' | 'error' | 'pending';
  error?: string;
}

// ============================================================================
// API
// ============================================================================

export const endUserUsersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({

    // POST /uflow/enduser/list
    // Get end-users from AuthSec API
    getEndUsers: builder.query<any, UsersQueryParams>({
      query: (params = {}) => {
        console.log("[ENDUSER API] 🟢 getEndUsers called - THIS SHOULD BE CALLED FROM USERS PAGE", {
          page: params.page,
          limit: params.limit,
          searchQuery: params.searchQuery,
          provider: params.provider,
          timestamp: new Date().toISOString(),
          currentPath: window.location.pathname,
          stack: new Error().stack
        });

        const body: any = {
          page: params.page || 1,
          limit: params.limit || 50,
        };

        // Search filters
        if (params.searchQuery) {
          body.email = params.searchQuery;
          body.name = params.searchQuery;
        }
        if (params.email) body.email = params.email;
        if (params.name) body.name = params.name;

        // Status filters
        if (params.active !== undefined) body.active = params.active;

        // Provider filters
        if (params.provider) body.provider = params.provider;

        // MFA filters
        if (params.mfaEnabled !== undefined) body.MFAEnabled = params.mfaEnabled;
        if (params.mfaMethod) body.MFAMethod = params.mfaMethod;

        // Role and group filters
        if (params.roles && params.roles.length > 0) body.roles = params.roles;
        if (params.groups && params.groups.length > 0) body.groups = params.groups;

        // Date filters
        if (params.createdAfter) body.created_after = params.createdAfter;
        if (params.createdBefore) body.created_before = params.createdBefore;
        if (params.lastLoginAfter) body.last_login_after = params.lastLoginAfter;
        if (params.lastLoginBefore) body.last_login_before = params.lastLoginBefore;

        // Client filter
        if (params.client_id !== undefined) body.client_id = params.client_id;
        if (params.workspace_id) body.workspace_id = params.workspace_id;

        const payload = withSessionData(body);

        // Preserve explicit "all clients" intent by forcing blank client_id.
        if (params.client_id === "" || params.client_id === undefined || params.client_id === null) {
          payload.client_id = "";
        }

        return {
          url: '/authsec/uflow/admin/enduser/list',
          method: 'POST',
          body: payload,
        };
      },
      providesTags: ['EndUser'],
    }),

    // POST /uflow/admin/enduser/ad/status
    // Check Active Directory configuration status for end users
    checkADConfigStatus: builder.query<ConfigStatus, void>({
      query: () => ({
        url: '/authsec/uflow/admin/enduser/ad/status',
        method: 'POST',
        body: withSessionData({}),
      }),
      providesTags: ['EndUser'],
    }),

    // POST /uflow/admin/enduser/entra/status
    // Check Azure Entra ID configuration status for end users
    checkEntraConfigStatus: builder.query<ConfigStatus, void>({
      query: () => ({
        url: '/authsec/uflow/admin/enduser/entra/status',
        method: 'POST',
        body: withSessionData({}),
      }),
      providesTags: ['EndUser'],
    }),

    // Admin Actions

    // DELETE /uflow/user/enduser/:workspace_id/:user_id
    // Soft delete end user
    deleteUser: builder.mutation<any, { workspace_id: string; user_id: string }>({
      query: ({ workspace_id, user_id }) => ({
        url: `/authsec/uflow/user/enduser/${workspace_id}/${user_id}`,
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      invalidatesTags: ['EndUser'],
    }),

    // POST /authsec/uflow/admin/enduser/active
    // Activate/Deactivate user. Body: { user_id, active }; the workspace comes
    // from the token.
    setUserActive: builder.mutation<any, { user_id: string; active: boolean }>({
      query: ({ user_id, active }) => ({
        url: '/authsec/uflow/admin/enduser/active',
        method: 'POST',
        body: withSessionData({
          user_id,
          active: active.toString()
        }),
      }),
      invalidatesTags: ['EndUser'],
    }),

    // POST /authsec/uflow/user/admin/reset-password
    // Reset user password (admin). Body: { workspace_id, email | user_id, send_email }
    resetUserPassword: builder.mutation<any, { email: string; send_email?: boolean }>({
      query: ({ email, send_email = true }) => ({
        url: '/authsec/uflow/user/admin/reset-password',
        method: 'POST',
        body: withSessionData({
          email,
          send_email
        }),
      }),
      invalidatesTags: (result, error, { email }) => [
        { type: 'EndUser', id: email }
      ],
    }),

    // POST /authsec/uflow/user/admin/change-password
    // Change user password (admin). Body: { workspace_id, email | user_id, new_password }
    changeUserPassword: builder.mutation<any, { email: string; new_password: string }>({
      query: ({ email, new_password }) => ({
        url: '/authsec/uflow/user/admin/change-password',
        method: 'POST',
        body: withSessionData({
          email,
          new_password
        }),
      }),
      invalidatesTags: (result, error, { email }) => [
        { type: 'EndUser', id: email }
      ],
    }),

  }),
});

export const {
  useGetEndUsersQuery,
  useCheckADConfigStatusQuery,
  useCheckEntraConfigStatusQuery,
  useDeleteUserMutation,
  useSetUserActiveMutation,
  useResetUserPasswordMutation,
  useChangeUserPasswordMutation,
} = endUserUsersApi;
