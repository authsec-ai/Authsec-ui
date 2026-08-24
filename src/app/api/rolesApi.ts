import { baseApi, withSessionData } from './baseApi';
import type {
  Role,
  RoleWithStats,
  RoleFilters,
  RoleAnalytics,
  RolePermission,
  BulkUpdateResult,
  BulkDeleteResult,
  ListParams
} from '@/types/database';

// AuthSec API types
interface AuthSecRole {
  id: string;
  name: string;
  description?: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
  permissions_count?: number;
  users_assigned?: number;
  user_ids?: string[];
  usernames?: string[];
  group_ids?: string[];
}

export interface AuthSecRoleDetail {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  granted_scopes?: string[];
  user_ids?: string[];
  usernames?: string[];
}

interface UserDefinedRoleRequest {
  workspace_id: string;
  name: string;
  description?: string;
  permission_ids?: string[];
  permission_strings?: string[];
  audience?: 'admin' | 'endUser';
}

interface CreateUserDefinedRoleResponse extends Partial<AuthSecRole> {
  roles?: AuthSecRole[];
  message?: string;
  success?: boolean;
}

interface DeleteRolesRequest {
  workspace_id: string;
  role_ids: string[];
  audience?: 'admin' | 'endUser';
}

interface MapRolesRequest {
  workspace_id: string;
  project_id?: string;
  client_id?: string;
  role_ids: string[];
}

export const rolesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Roles CRUD
    //
    // NOTE ON THE PATH: the workspace role list lives at /authsec/uflow/admin/roles
    // (routes.go -> authsec > /uflow > /admin > GET /roles -> ListRolesAdmin).
    // /authsec/roles does not exist and returns 404 -- which showed up as an empty
    // Role dropdown in the agent Provision dialog rather than as an error.
    //
    // The handler returns a BARE ARRAY of role summaries ({id, name, description,
    // permissions_count, users_assigned, ...}) and takes no filter params, so the
    // query string is not forwarded.
    getRoles: builder.query<Role[], RoleFilters>({
      query: () => `/authsec/uflow/admin/roles`,
      providesTags: ['Role'],
    }),

    getRole: builder.query<Role, string>({
      query: (id) => `/authsec/roles/${id}`,
      providesTags: (result, error, id) => [{ type: 'Role', id }],
    }),

    createRole: builder.mutation<Role, Partial<Role>>({
      query: (data) => ({
        url: '/authsec/roles',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Role'],
    }),

    updateRole: builder.mutation<Role, { id: string; data: Partial<Role> }>({
      query: ({ id, data }) => ({
        url: `/authsec/roles/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Role', id }],
    }),

    deleteRole: builder.mutation<void, string>({
      query: (id) => ({
        url: `/authsec/roles/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Role'],
    }),

    // Role permissions
    getRolePermissions: builder.query<RolePermission[], string>({
      query: (roleId) => `/authsec/roles/${roleId}/permissions`,
      providesTags: ['RolePermission'],
    }),

    addRolePermission: builder.mutation<RolePermission, { roleId: string; permission: Partial<RolePermission> }>({
      query: ({ roleId, permission }) => ({
        url: `/authsec/roles/${roleId}/permissions`,
        method: 'POST',
        body: permission,
      }),
      invalidatesTags: ['Role', 'RolePermission'],
    }),

    removeRolePermission: builder.mutation<void, { roleId: string; permissionId: string }>({
      query: ({ roleId, permissionId }) => ({
        url: `/authsec/roles/${roleId}/permissions/${permissionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Role', 'RolePermission'],
    }),

    // Bulk operations
    bulkUpdateRoles: builder.mutation<BulkUpdateResult, { ids: string[]; data: Partial<Role> }>({
      query: ({ ids, data }) => ({
        url: '/authsec/roles/bulk-update',
        method: 'POST',
        body: { ids, data },
      }),
      invalidatesTags: ['Role'],
    }),

    bulkDeleteRoles: builder.mutation<BulkDeleteResult, string[]>({
      query: (ids) => ({
        url: '/authsec/roles/bulk-delete',
        method: 'POST',
        body: { ids },
      }),
      invalidatesTags: ['Role'],
    }),

    // Role Analytics
    getRoleAnalytics: builder.query<RoleAnalytics, string>({
      query: (projectId) => `/authsec/roles/analytics?project_id=${projectId}`,
      providesTags: ['Role'],
    }),
  }),
});

export const {
  useGetRolesQuery,
  useGetRoleQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetRolePermissionsQuery,
  useAddRolePermissionMutation,
  useRemoveRolePermissionMutation,
  useBulkUpdateRolesMutation,
  useBulkDeleteRolesMutation,
  useGetRoleAnalyticsQuery,
} = rolesApi;

// AuthSec API endpoints
export const authSecRolesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get user-defined roles for a tenant
    getAuthSecRoles: builder.query<AuthSecRole[], { workspace_id: string; audience?: 'admin' | 'endUser' }>({
      async queryFn(args, _api, _extraOptions, baseQuery) {
        const workspaceId = (args?.workspace_id ?? '').trim();
        const basePath = '/authsec/uflow/admin/roles';

        const candidateEndpoints = [
          workspaceId ? `${basePath}/${encodeURIComponent(workspaceId)}` : null,
          basePath,
        ].filter((endpoint): endpoint is string => Boolean(endpoint));

        let lastError: unknown = null;

        for (const endpoint of candidateEndpoints) {
          const result = await baseQuery(endpoint);

          if (result.error) {
            lastError = result.error;
            continue;
          }

          const response = result.data as any;

          if (!response) {
            return { data: [] };
          }

          // Common shapes: raw array, { roles: [...] }, { data: [...] }
          if (Array.isArray(response)) {
            return { data: response };
          }

          if (Array.isArray(response.roles)) {
            return { data: response.roles };
          }

          if (Array.isArray(response.data)) {
            return { data: response.data };
          }

          return { data: [] };
        }

        return {
          error:
            (lastError as any) ?? {
              status: 'CUSTOM_ERROR',
              error: 'Unable to fetch roles',
            },
        };
      },
      providesTags: ['UnifiedRBACRole'],
    }),

    // Add user-defined roles
    addUserDefinedRoles: builder.mutation<CreateUserDefinedRoleResponse, UserDefinedRoleRequest>({
      query: ({ audience: _audience, ...data }) => ({
        url: '/authsec/uflow/admin/roles',
        method: 'POST',
        body: withSessionData(data),
      }),
      invalidatesTags: ['UnifiedRBACRole'],
    }),

    // Update a role
    getAuthSecRoleDetail: builder.query<AuthSecRoleDetail, string>({
      query: (id) => `/authsec/uflow/admin/roles/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'UnifiedRBACRole', id }],
    }),

    updateUserDefinedRole: builder.mutation<
      { message?: string; success?: boolean },
      {
        id: string;
        data: {
          workspace_id?: string;
          name: string;
          description?: string;
          permission_ids?: string[];
          permission_strings?: string[];
        };
      }
    >({
      query: ({ id, data }) => ({
        url: `/authsec/uflow/admin/roles/${id}`,
        method: 'PUT',
        body: withSessionData(data),
      }),
      invalidatesTags: (_result, _error, { id }) => ['UnifiedRBACRole', { type: 'UnifiedRBACRole', id }],
    }),

    // Delete user-defined roles
    deleteUserDefinedRoles: builder.mutation<{ message?: string; success?: boolean }, DeleteRolesRequest>({
      query: ({ audience: _audience, ...data }) => ({
        url: '/authsec/uflow/admin/roles',
        method: 'DELETE',
        body: withSessionData(data),
      }),
      invalidatesTags: ['UnifiedRBACRole'],
    }),

    // Map roles to client
    mapRolesToClient: builder.mutation<{ message?: string; success?: boolean }, MapRolesRequest>({
      query: (data) => ({
        url: '/authsec/uflow/admin/roles/map',
        method: 'POST',
        body: withSessionData({
          ...data,
          project_id: data.project_id || data.client_id,
        }),
      }),
      invalidatesTags: ['AuthSecClient', 'UnifiedRBACRole'],
    }),
  }),
});

export const {
  useGetAuthSecRolesQuery,
  useGetAuthSecRoleDetailQuery,
  useAddUserDefinedRolesMutation,
  useUpdateUserDefinedRoleMutation,
  useDeleteUserDefinedRolesMutation,
  useMapRolesToClientMutation,
} = authSecRolesApi;
