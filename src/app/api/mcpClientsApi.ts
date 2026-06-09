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
  created_at: string;
}

export const mcpClientsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkspaceClients: builder.query<WorkspaceClientItem[], void>({
      query: () => ({
        url: "/authsec/clients",
        method: "GET",
      }),
      providesTags: [{ type: "MCPClient" as const, id: "LIST" }],
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
  }),
});

export const {
  useListWorkspaceClientsQuery,
  useRevokeWorkspaceClientMutation,
} = mcpClientsApi;
