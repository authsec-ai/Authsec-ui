/**
 * END-USER RESOURCES API
 *
 * Endpoints for end-user resource management operations (TENANT-SPECIFIC resources)
 * Authentication: Requires AuthMiddleware (user ID and tenant ID extracted from JWT)
 * Base Path: /admin/endusers/:workspace_id/resources
 *
 * Documentation Reference: New RBAC System - End-User Resource Management
 *
 * Available Endpoints:
 * - GET    /admin/endusers/:workspace_id/resources                    - List tenant resources
 * - GET    /admin/endusers/:workspace_id/resources/:resource_id       - Get specific resource
 * - POST   /admin/endusers/:workspace_id/resources                    - Create tenant resource
 * - PUT    /admin/endusers/:workspace_id/resources/:resource_id       - Update resource
 * - DELETE /admin/endusers/:workspace_id/resources/:resource_id       - Delete resource
 */

import { baseApi, withSessionData } from '../baseApi';

// ============================================================================
// TYPES
// ============================================================================

export interface EndUserResource {
  id: string;
  workspace_id: string;
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
  resources: EndUserResource[];
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

export const endUserResourcesApi = baseApi.injectEndpoints({
  endpoints: (builder) => {
    const buildPath = (workspace_id: string, suffix = "") =>
      `uflow/admin/endusers/${workspace_id}/resources${suffix}`;

    return {
      // GET /admin/endusers/:workspace_id/resources - List all tenant resources
      getEndUserResources: builder.query<EndUserResource[], string>({
        query: (workspace_id) => buildPath(workspace_id),
        transformResponse: (response: { resources: EndUserResource[] }) => response.resources,
        providesTags: ["EndUserRBACResource"],
      }),

      // GET /admin/endusers/:workspace_id/resources/:resource_id - Get specific resource
      getEndUserResource: builder.query<
        EndUserResource,
        { workspace_id: string; resource_id: string }
      >({
        query: ({ workspace_id, resource_id }) => buildPath(workspace_id, `/${resource_id}`),
        providesTags: (result, error, { resource_id }) => [
          { type: "EndUserRBACResource", id: resource_id },
        ],
      }),

      // POST /admin/endusers/:workspace_id/resources - Create tenant resource
      createEndUserResource: builder.mutation<
        CreateResourcesResponse,
        { workspace_id: string; data: CreateResourceInput }
      >({
        query: ({ workspace_id, data }) => ({
          url: buildPath(workspace_id),
          method: "POST",
          body: withSessionData(data),
        }),
        invalidatesTags: ["EndUserRBACResource"],
      }),

      // PUT /admin/endusers/:workspace_id/resources/:resource_id - Update resource
      updateEndUserResource: builder.mutation<
        ApiResponse,
        { workspace_id: string; id: string; data: UpdateResourceRequest }
      >({
        query: ({ workspace_id, id, data }) => ({
          url: buildPath(workspace_id, `/${id}`),
          method: "PUT",
          body: withSessionData(data),
        }),
        invalidatesTags: (result, error, { id }) => [
          { type: "EndUserRBACResource", id },
          "EndUserRBACResource",
        ],
      }),

      // DELETE /admin/endusers/:workspace_id/resources/:resource_id - Delete resource
      deleteEndUserResource: builder.mutation<
        ApiResponse,
        { workspace_id: string; resource_id: string }
      >({
        query: ({ workspace_id, resource_id }) => ({
          url: buildPath(workspace_id, `/${resource_id}`),
          method: "DELETE",
        }),
        invalidatesTags: ["EndUserRBACResource"],
      }),
    };
  },
});

export const {
  useGetEndUserResourcesQuery,
  useLazyGetEndUserResourcesQuery,
  useGetEndUserResourceQuery,
  useCreateEndUserResourceMutation,
  useUpdateEndUserResourceMutation,
  useDeleteEndUserResourceMutation,
} = endUserResourcesApi;
