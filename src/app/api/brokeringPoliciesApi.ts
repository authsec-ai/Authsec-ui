import { baseApi } from "./baseApi";

export interface BrokeringPolicy {
  id: string;
  workspace_id: string;
  side: "issuance" | "redemption";
  effect: "permit" | "deny";
  client_id?: string;
  resource_server_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ListBrokeringPoliciesResponse {
  items: BrokeringPolicy[];
}

export interface CreateBrokeringPolicyRequest {
  side: "issuance" | "redemption";
  effect: "permit" | "deny";
  client_id?: string;
  resource_server_id?: string;
}

const brokeringPoliciesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listBrokeringPolicies: builder.query<ListBrokeringPoliciesResponse, void>({
      query: () => ({ url: "/authsec/brokering-policies" }),
    }),
    createBrokeringPolicy: builder.mutation<BrokeringPolicy, CreateBrokeringPolicyRequest>({
      query: (body) => ({ url: "/authsec/brokering-policies", method: "POST", body }),
    }),
    deleteBrokeringPolicy: builder.mutation<{ deleted: string }, string>({
      query: (id) => ({ url: `/authsec/brokering-policies/${id}`, method: "DELETE" }),
    }),
  }),
});

export const {
  useListBrokeringPoliciesQuery,
  useCreateBrokeringPolicyMutation,
  useDeleteBrokeringPolicyMutation,
} = brokeringPoliciesApi;
