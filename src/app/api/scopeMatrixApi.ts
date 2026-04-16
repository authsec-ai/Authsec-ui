/**
 * Scope Matrix & Tool Discovery API
 *
 * Endpoints for OAuth scope registry, MCP tool discovery, and scope-tool mapping.
 * Base Paths:
 *   - /authsec/resource-servers/:id/scope-matrix
 *   - /authsec/resource-servers/:id/scopes
 *   - /authsec/resource-servers/:id/rescan
 *   - /authsec/resource-servers/:id/tool-scope-map
 *   - /authsec/scopes/:scope_id
 */

import { baseApi } from "./baseApi";
import type {
  ScopeMatrixResponse,
  OAuthScope,
  CreateOAuthScopeRequest,
  UpdateOAuthScopeRequest,
  UpdateToolScopeMapRequest,
} from "./types/scopeMatrix";

export const scopeMatrixApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /authsec/resource-servers/:id/scope-matrix
    getScopeMatrix: builder.query<ScopeMatrixResponse, string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/scope-matrix`,
      providesTags: (_result, _error, rsId) => [
        { type: "ScopeMatrix" as const, id: rsId },
        { type: "OAuthScope" as const, id: "LIST" },
      ],
    }),

    // POST /authsec/resource-servers/:id/rescan
    rescanResourceServer: builder.mutation<unknown, string>({
      query: (rsId) => ({
        url: `/authsec/resource-servers/${rsId}/rescan`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, rsId) => [
        { type: "ScopeMatrix" as const, id: rsId },
        { type: "OAuthScope" as const, id: "LIST" },
        { type: "ResourceServer" as const, id: rsId },
      ],
    }),

    // GET /authsec/resource-servers/:id/scopes
    listResourceServerScopes: builder.query<OAuthScope[], string>({
      query: (rsId) => `/authsec/resource-servers/${rsId}/scopes`,
      providesTags: [{ type: "OAuthScope" as const, id: "LIST" }],
    }),

    // POST /authsec/resource-servers/:id/scopes
    createResourceServerScope: builder.mutation<
      OAuthScope,
      { rsId: string; body: CreateOAuthScopeRequest }
    >({
      query: ({ rsId, body }) => ({
        url: `/authsec/resource-servers/${rsId}/scopes`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "OAuthScope" as const, id: "LIST" },
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),

    // PUT /authsec/scopes/:scope_id
    updateScope: builder.mutation<
      OAuthScope,
      { scopeId: string; body: UpdateOAuthScopeRequest }
    >({
      query: ({ scopeId, body }) => ({
        url: `/authsec/scopes/${scopeId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: [
        { type: "OAuthScope" as const, id: "LIST" },
        { type: "ScopeMatrix" as const, id: "LIST" },
      ],
    }),

    // DELETE /authsec/scopes/:scope_id
    deleteScope: builder.mutation<void, string>({
      query: (scopeId) => ({
        url: `/authsec/scopes/${scopeId}`,
        method: "DELETE",
      }),
      invalidatesTags: [
        { type: "OAuthScope" as const, id: "LIST" },
        { type: "ScopeMatrix" as const, id: "LIST" },
      ],
    }),

    // PUT /authsec/resource-servers/:id/tool-scope-map
    updateToolScopeMap: builder.mutation<
      { status: string },
      { rsId: string; body: UpdateToolScopeMapRequest }
    >({
      query: ({ rsId, body }) => ({
        url: `/authsec/resource-servers/${rsId}/tool-scope-map`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { rsId }) => [
        { type: "ScopeMatrix" as const, id: rsId },
      ],
    }),
  }),
});

export const {
  useGetScopeMatrixQuery,
  useRescanResourceServerMutation,
  useListResourceServerScopesQuery,
  useCreateResourceServerScopeMutation,
  useUpdateScopeMutation,
  useDeleteScopeMutation,
  useUpdateToolScopeMapMutation,
} = scopeMatrixApi;
