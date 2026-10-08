import { baseApi } from "./baseApi";

export interface MyWorkspace {
  workspace_id: string;
  name: string;
  workspace_domain: string;
  role: string;
  current: boolean;
}

export interface SwitchWorkspaceResponse {
  access_token: string;
  workspace_id: string;
}

// Workspaces the signed-in user belongs to, and switching between them
// (ADR-0001 §8). The server checks membership; the UI only offers choices.
export const workspaceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMyWorkspaces: builder.query<{ workspaces: MyWorkspace[] }, void>({
      query: () => ({ url: "/authsec/workspaces", method: "GET" }),
    }),
    switchWorkspace: builder.mutation<SwitchWorkspaceResponse, string>({
      query: (workspaceId) => ({
        url: `/authsec/workspaces/${encodeURIComponent(workspaceId)}/switch`,
        method: "POST",
      }),
    }),
  }),
});

export const { useListMyWorkspacesQuery, useSwitchWorkspaceMutation } = workspaceApi;
