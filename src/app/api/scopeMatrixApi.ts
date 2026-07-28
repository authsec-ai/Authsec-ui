/**
 * Scope Matrix & Tool Discovery API
 *
 * Endpoints for OAuth scope registry, MCP tool discovery, and scope-tool mapping.
 * Base Paths:
 *   - /authsec/applications/:id/scope-matrix
 *   - /authsec/applications/:id/scopes
 *   - /authsec/applications/:id/rescan
 *   - /authsec/applications/:id/tool-scope-map
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
    // GET /authsec/applications/:id/scope-matrix
    getScopeMatrix: builder.query<ScopeMatrixResponse, string>({
      query: (rsId) => `/authsec/applications/${rsId}/scope-matrix`,
      providesTags: (_result, _error, rsId) => [
        { type: "ScopeMatrix" as const, id: rsId },
        { type: "OAuthScope" as const, id: "LIST" },
      ],
    }),

    // POST /authsec/applications/:id/rescan
    rescanResourceServer: builder.mutation<
      unknown,
      string | { rsId: string; mcpToken: string }
    >({
      query: (arg) => {
        const rsId = typeof arg === "string" ? arg : arg.rsId;
        const mcpToken = typeof arg === "string" ? undefined : arg.mcpToken;
        return {
          url: `/authsec/applications/${rsId}/rescan`,
          method: "POST",
          body: mcpToken ? { mcp_token: mcpToken } : {},
        };
      },
      invalidatesTags: (_result, _error, arg) => {
        const rsId = typeof arg === "string" ? arg : arg.rsId;
        return [
          { type: "ScopeMatrix" as const, id: rsId },
          { type: "OAuthScope" as const, id: "LIST" },
          { type: "ResourceServer" as const, id: rsId },
        ];
      },
    }),

    // GET /authsec/applications/:id/scopes
    listResourceServerScopes: builder.query<OAuthScope[], string>({
      query: (rsId) => `/authsec/applications/${rsId}/scopes`,
      providesTags: [{ type: "OAuthScope" as const, id: "LIST" }],
    }),

    // POST /authsec/applications/:id/scopes
    createResourceServerScope: builder.mutation<
      OAuthScope,
      { rsId: string; body: CreateOAuthScopeRequest }
    >({
      query: ({ rsId, body }) => ({
        url: `/authsec/applications/${rsId}/scopes`,
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

    // PUT /authsec/applications/:id/tool-scope-map
    updateToolScopeMap: builder.mutation<
      { status: string },
      { rsId: string; body: UpdateToolScopeMapRequest }
    >({
      query: ({ rsId, body }) => ({
        url: `/authsec/applications/${rsId}/tool-scope-map`,
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
