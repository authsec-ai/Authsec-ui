// scimConnectionsApi — workspace-scoped SCIM connection management.
// Mint tokens, list connections, revoke tokens.

import { baseApi } from "./baseApi";

export interface ScimConnection {
  id: string;
  workspace_id: string;
  identity_provider_id?: string;
  status: "active" | "revoked" | "disabled";
  created_at: string;
  revoked_at?: string;
}

export interface CreateScimConnectionResponse {
  connection: ScimConnection;
  token: string; // plaintext token — shown ONCE
  endpoint: string; // SCIM endpoint URL
}

export const scimConnectionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listScimConnections: builder.query<ScimConnection[], void>({
      query: () => "/authsec/scim-connections",
      providesTags: ["SyncConfig"],
    }),

    createScimConnection: builder.mutation<
      CreateScimConnectionResponse,
      { identity_provider_id?: string }
    >({
      query: (body) => ({
        url: "/authsec/scim-connections",
        method: "POST",
        body,
      }),
      invalidatesTags: ["SyncConfig"],
    }),

    revokeScimConnection: builder.mutation<void, string>({
      query: (id) => ({
        url: `/authsec/scim-connections/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["SyncConfig"],
    }),
  }),
});

export const {
  useListScimConnectionsQuery,
  useCreateScimConnectionMutation,
  useRevokeScimConnectionMutation,
} = scimConnectionsApi;
