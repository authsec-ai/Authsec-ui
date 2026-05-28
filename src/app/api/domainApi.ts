import { baseApi, withSessionData } from "./baseApi";

// ============================================================================
// Domain Management API Types
// ============================================================================

export interface CustomDomain {
  id: string;
  workspace_id: string;
  domain: string;
  kind: "custom" | "platform";
  is_primary: boolean;
  is_verified: boolean;
  verification_method: "dns_txt";
  verification_token: string;
  verification_txt_name: string;
  verification_txt_value: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDomainRequest {
  workspace_id: string;
  domain: string;
  is_primary?: boolean;
}

export interface CreateDomainResponse {
  success: boolean;
  domain: CustomDomain;
  verification: {
    method: "dns_txt";
    txt_name: string;
    txt_value: string;
    token: string;
  };
}

export interface VerifyDomainResponse {
  success: boolean;
  message: string;
  domain: CustomDomain;
}

export interface SetPrimaryDomainResponse {
  success: boolean;
  message: string;
  domain: CustomDomain;
}

export interface DeleteDomainResponse {
  success: boolean;
  message: string;
}

export interface ListDomainsResponse {
  success: boolean;
  domains: CustomDomain[];
  count: number;
}

// ============================================================================
// Domain Management API Endpoints
// ============================================================================

export const domainApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * List all domains for a tenant
     */
    listDomains: builder.query<CustomDomain[], { workspace_id: string }>({
      query: ({ workspace_id }) => `/authsec/uflow/admin/tenants/${workspace_id}/domains`,
      transformResponse: (response: ListDomainsResponse) => {
        return response.domains || [];
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({
                type: "CustomDomain" as const,
                id,
              })),
              { type: "CustomDomain", id: "LIST" },
            ]
          : [{ type: "CustomDomain", id: "LIST" }],
    }),

    /**
     * Get a single domain by ID
     */
    getDomain: builder.query<
      CustomDomain,
      { workspace_id: string; domain_id: string }
    >({
      query: ({ workspace_id, domain_id }) =>
        `/authsec/uflow/admin/tenants/${workspace_id}/domains/${domain_id}`,
      transformResponse: (response: {
        success: boolean;
        domain: CustomDomain;
      }) => {
        return response.domain;
      },
      providesTags: (_result, _error, { domain_id }) => [
        { type: "CustomDomain", id: domain_id },
      ],
    }),

    /**
     * Create a new domain (pending verification)
     */
    createDomain: builder.mutation<CreateDomainResponse, CreateDomainRequest>({
      query: (data) => ({
        url: `/authsec/uflow/admin/tenants/${data.workspace_id}/domains`,
        method: "POST",
        body: {
          domain: data.domain,
          is_primary: data.is_primary || false,
        },
      }),
      invalidatesTags: [{ type: "CustomDomain", id: "LIST" }],
    }),

    /**
     * Verify domain DNS records
     */
    verifyDomain: builder.mutation<
      VerifyDomainResponse,
      { workspace_id: string; domain_id: string }
    >({
      query: ({ workspace_id, domain_id }) => ({
        url: `/authsec/uflow/admin/tenants/${workspace_id}/domains/${domain_id}/verify`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { domain_id }) => [
        { type: "CustomDomain", id: domain_id },
        { type: "CustomDomain", id: "LIST" },
      ],
    }),

    /**
     * Set domain as primary
     */
    setPrimaryDomain: builder.mutation<
      SetPrimaryDomainResponse,
      { workspace_id: string; domain_id: string }
    >({
      query: ({ workspace_id, domain_id }) => ({
        url: `/authsec/uflow/admin/tenants/${workspace_id}/domains/${domain_id}/set-primary`,
        method: "POST",
      }),
      // Invalidate entire list since we need to update the old primary too
      invalidatesTags: [{ type: "CustomDomain", id: "LIST" }],
    }),

    /**
     * Delete a domain
     */
    deleteDomain: builder.mutation<
      DeleteDomainResponse,
      { workspace_id: string; domain_id: string }
    >({
      query: ({ workspace_id, domain_id }) => ({
        url: `/authsec/uflow/admin/tenants/${workspace_id}/domains/${domain_id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { domain_id }) => [
        { type: "CustomDomain", id: domain_id },
        { type: "CustomDomain", id: "LIST" },
      ],
    }),
  }),
});

// Export auto-generated hooks
export const {
  useListDomainsQuery,
  useGetDomainQuery,
  useCreateDomainMutation,
  useVerifyDomainMutation,
  useSetPrimaryDomainMutation,
  useDeleteDomainMutation,
} = domainApi;
