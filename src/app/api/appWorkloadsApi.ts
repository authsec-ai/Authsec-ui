import { baseApi } from "./baseApi";

export interface AppWorkload {
  workload_id: string;
  spiffe_id: string;
  service_account_id?: string;
  service_account_name?: string;
  status: string;
  platform: string;
  selectors?: Record<string, string>;
  last_attested_at?: string;
  last_token_issued_at?: string;
  last_error?: string;
  last_error_at?: string;
  created_at: string;
  revoked_at?: string;
}

export interface CreateWorkloadRequest {
  service_account_id?: string;
  service_account_name?: string;
  description?: string;
  role_id: string;
  platform?: string;
  selectors?: Record<string, string>;
}

export interface CreateFederatedWorkloadRequest {
  provider_id: string;
  external_spiffe_id: string;
  role_id: string;
  service_account_id?: string;
  service_account_name?: string;
  description?: string;
}

export interface CreateWorkloadResponse {
  workload_id: string;
  spiffe_id: string;
  service_account_id: string;
  service_account_name: string;
  client_id: string;
  role_id: string;
  role_name: string;
  assignment_id: string;
  status: string;
  platform: string;
  selectors: Record<string, string>;
  install_snippet: string;
  token_endpoint: string;
}

const appWorkloadsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listAppWorkloads: builder.query<{ items: AppWorkload[] }, string>({
      query: (rsId) => ({ url: `/authsec/applications/${rsId}/workloads` }),
      providesTags: (_r, _e, rsId) => [{ type: "Workload" as const, id: rsId }],
    }),

    createAppWorkload: builder.mutation<CreateWorkloadResponse, { rsId: string } & CreateWorkloadRequest>({
      query: ({ rsId, ...body }) => ({
        url: `/authsec/applications/${rsId}/machine-access/workload`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { rsId }) => [{ type: "Workload" as const, id: rsId }],
    }),

    createFederatedWorkload: builder.mutation<CreateWorkloadResponse, { rsId: string } & CreateFederatedWorkloadRequest>({
      query: ({ rsId, ...body }) => ({
        url: `/authsec/applications/${rsId}/access/federated-workload`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { rsId }) => [{ type: "Workload" as const, id: rsId }],
    }),

    revokeAppWorkload: builder.mutation<{ status: string }, { rsId: string; wid: string }>({
      query: ({ rsId, wid }) => ({
        url: `/authsec/applications/${rsId}/workloads/${wid}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { rsId }) => [{ type: "Workload" as const, id: rsId }],
    }),
  }),
});

export const {
  useListAppWorkloadsQuery,
  useCreateAppWorkloadMutation,
  useCreateFederatedWorkloadMutation,
  useRevokeAppWorkloadMutation,
} = appWorkloadsApi;
