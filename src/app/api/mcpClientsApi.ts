import { baseApi } from "./baseApi";

export interface WorkspaceClientItem {
  client_id: string;
  client_name: string;
  client_kind: "human_app" | "agent" | "m2m" | "cli";
  registration_type: "dcr" | "prereg" | "cimd";
  software_id?: string;
  software_version?: string;
  status: string; // "approved" | "revoked" | "pending_approval"
  sync_status: string; // "active" | "sync_error" | "pending_delete"
  resource_server_id: string;
  resource_server_name: string;
  redirect_uris: string[];
  tags: string[];
  last_token_issued_at?: string; // ISO timestamp or null
  adopted_elsewhere: boolean; // true when the client's home workspace is a different tenant
  created_at: string;
}

export const mcpClientsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaceClients: builder.query<
      WorkspaceClientItem[],
      { resourceServerId?: string } | void
    >({
      query: (arg) => ({
        url: arg?.resourceServerId
          ? `/authsec/clients?resource_server_id=${encodeURIComponent(arg.resourceServerId)}`
          : "/authsec/clients",
        method: "GET",
      }),
      providesTags: (_result, _error, arg) => [
        { type: "MCPClient" as const, id: "LIST" },
        ...(arg?.resourceServerId
          ? [{ type: "MCPClient" as const, id: `RS:${arg.resourceServerId}` }]
          : []),
      ],
    }),

    revokeWorkspaceClient: builder.mutation<
      { status: string },
      { rsId: string; clientId: string }
    >({
      query: ({ rsId, clientId }) => ({
        url: `/authsec/applications/${encodeURIComponent(rsId)}/connections/${encodeURIComponent(clientId)}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "MCPClient" as const, id: "LIST" }],
    }),

    /** Approves a pending_approval registration — created when a client from
     *  another workspace attempted a lazy bind against one of our apps. */
    approveWorkspaceClient: builder.mutation<
      { status: string },
      { rsId: string; clientId: string }
    >({
      query: ({ rsId, clientId }) => ({
        url: `/authsec/applications/${encodeURIComponent(rsId)}/connections/${encodeURIComponent(clientId)}/approve`,
        method: "PUT",
      }),
      invalidatesTags: [{ type: "MCPClient" as const, id: "LIST" }],
    }),
  }),
});

export const {
  useListWorkspaceClientsQuery,
  useRevokeWorkspaceClientMutation,
  useApproveWorkspaceClientMutation,
} = mcpClientsApi;
