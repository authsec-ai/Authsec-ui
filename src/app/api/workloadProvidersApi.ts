import { baseApi } from "./baseApi";

export interface WorkloadIdentityProvider {
  id: string;
  workspace_id: string;
  name: string;
  kind: "spiffe" | "oidc";
  issuer: string;
  jwks_uri?: string;
  trust_domain?: string;
  allowed_audiences: string[];
  subject_claim: string;
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
}

export interface ListWorkloadProvidersResponse {
  items: WorkloadIdentityProvider[];
}

export interface CreateWorkloadProviderRequest {
  name: string;
  kind: "spiffe" | "oidc";
  issuer: string;
  jwks_uri?: string;
  trust_domain?: string;
  allowed_audiences?: string[];
  subject_claim?: string;
}

const workloadProvidersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkloadProviders: builder.query<ListWorkloadProvidersResponse, void>({
      query: () => ({ url: "/authsec/workload-identity-providers" }),
    }),
    createWorkloadProvider: builder.mutation<WorkloadIdentityProvider, CreateWorkloadProviderRequest>({
      query: (body) => ({ url: "/authsec/workload-identity-providers", method: "POST", body }),
    }),
    deleteWorkloadProvider: builder.mutation<{ deleted: string }, string>({
      query: (id) => ({ url: `/authsec/workload-identity-providers/${id}`, method: "DELETE" }),
    }),
  }),
});

export const {
  useListWorkloadProvidersQuery,
  useCreateWorkloadProviderMutation,
  useDeleteWorkloadProviderMutation,
} = workloadProvidersApi;
