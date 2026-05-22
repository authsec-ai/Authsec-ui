/**
 * PERMISSION RESOURCES API
 *
 * Endpoints for fetching unique resources from permissions
 * - Admin: GET /uflow/admin/permissions/resources
 */

import { baseApi } from './baseApi';

// ============================================================================
// TYPES
// ============================================================================

export interface PermissionResource {
    name: string;
}

interface PermissionResourcesResponse {
    resources: string[];
}

// ============================================================================
// API
// ============================================================================

export const permissionsResourcesApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        // GET /uflow/admin/permissions/resources - List unique resources for admin
        getAdminPermissionResources: builder.query<string[], void>({
            query: () => '/authsec/uflow/admin/permissions/resources',
            transformResponse: (response: PermissionResourcesResponse) => response.resources || [],
            providesTags: ['AdminRBACResource'],
        }),

        // Compatibility hook: route through the consolidated admin surface.
        getEndUserPermissionResources: builder.query<string[], string>({
            query: () => '/authsec/uflow/admin/permissions/resources',
            transformResponse: (response: PermissionResourcesResponse) => response.resources || [],
            providesTags: ['EndUserRBACResource'],
        }),
    }),
});

export const {
    useGetAdminPermissionResourcesQuery,
    useGetEndUserPermissionResourcesQuery,
} = permissionsResourcesApi;
