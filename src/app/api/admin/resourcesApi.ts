/**
 * ADMIN RESOURCES API
 *
 * Endpoints for admin-only resource management operations (GLOBAL resources)
 * Authentication: Requires AdminAuthMiddleware (admin role in JWT)
 * Base Path: /uflow/admin/resources
 *
 * Documentation Reference: New RBAC System - Admin Resource Management
 *
 * Available Endpoints:
 * - GET    /uflow/admin/resources                    - List all admin resources (global)
 * - GET    /uflow/admin/resources/:resource_id       - Get specific admin resource
 * - POST   /uflow/admin/resources                    - Create admin resource (global)
 * - PUT    /uflow/admin/resources/:resource_id       - Update admin resource
 * - DELETE /uflow/admin/resources/:resource_id       - Delete admin resource
 */

import { baseApi, withSessionData } from "../baseApi";
import { unsupportedApiError } from "../unsupported";

// ============================================================================
// TYPES
// ============================================================================

export interface AdminResource {
  id: string;
  tenant_id: null;  // Global resources have NULL tenant_id
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateResourceInput {
  name: string;
  description?: string;
}

export interface CreateResourcesResponse {
  resources: AdminResource[];
}

export interface UpdateResourceRequest {
  name: string;
  description?: string;
}

export interface ApiResponse {
  message?: string;
}

// ============================================================================
// API
// ============================================================================

export const adminResourcesApi = baseApi.injectEndpoints({
  endpoints: (builder) => {
    const BASE_PATH = "uflow/admin/resources";

    return {
      // GET /admin/resources - List all global admin resources
      getAdminResources: builder.query<AdminResource[], void>({
        queryFn: async () => ({
          error: unsupportedApiError(
            "Admin resources management is not exposed by the backend.",
          ) as any,
        }),
        providesTags: ["AdminRBACResource"],
      }),

      // GET /admin/resources/:resource_id - Get specific admin resource
      getAdminResource: builder.query<AdminResource, string>({
        queryFn: async () => ({
          error: unsupportedApiError(
            "Admin resources management is not exposed by the backend.",
          ) as any,
        }),
        providesTags: (result, error, id) => [{ type: "AdminRBACResource", id }],
      }),

      // POST /admin/resources - Create admin resource
      createAdminResource: builder.mutation<CreateResourcesResponse, CreateResourceInput>({
        queryFn: async () => ({
          error: unsupportedApiError(
            "Admin resources management is not exposed by the backend.",
          ) as any,
        }),
        invalidatesTags: ["AdminRBACResource"],
      }),

      // PUT /admin/resources/:resource_id - Update admin resource
      updateAdminResource: builder.mutation<
        ApiResponse,
        { id: string; data: UpdateResourceRequest }
      >({
        queryFn: async () => ({
          error: unsupportedApiError(
            "Admin resources management is not exposed by the backend.",
          ) as any,
        }),
        invalidatesTags: (result, error, { id }) => [
          { type: "AdminRBACResource", id },
          "AdminRBACResource",
        ],
      }),

      // DELETE /admin/resources/:resource_id - Delete admin resource
      deleteAdminResource: builder.mutation<ApiResponse, string>({
        queryFn: async () => ({
          error: unsupportedApiError(
            "Admin resources management is not exposed by the backend.",
          ) as any,
        }),
        invalidatesTags: ["AdminRBACResource"],
      }),
    };
  },
});

export const {
  useGetAdminResourcesQuery,
  useLazyGetAdminResourcesQuery,
  useGetAdminResourceQuery,
  useCreateAdminResourceMutation,
  useUpdateAdminResourceMutation,
  useDeleteAdminResourceMutation,
} = adminResourcesApi;
