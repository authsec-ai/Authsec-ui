/**
 * Consent Grants API
 *
 * Endpoints for OAuth consent grant management (remembered consent per user x client x RS).
 * Admin endpoints: /authsec/consent-grants
 * User self-service: /oauth/consent-grants
 */

import { baseApi } from "./baseApi";
import type {
  ConsentGrantsListResponse,
} from "./types/scopeMatrix";

export interface ConsentGrantsFilters {
  user_id?: string;
  client_id?: string;
  rs_id?: string;
}

export const consentGrantsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /authsec/consent-grants (admin)
    listAdminConsentGrants: builder.query<
      ConsentGrantsListResponse,
      ConsentGrantsFilters | void
    >({
      query: (filters) => {
        const params = new URLSearchParams();
        if (filters) {
          if (filters.user_id) params.set("user_id", filters.user_id);
          if (filters.client_id) params.set("client_id", filters.client_id);
          if (filters.rs_id) params.set("rs_id", filters.rs_id);
        }
        const qs = params.toString();
        return `/authsec/consent-grants${qs ? `?${qs}` : ""}`;
      },
      providesTags: [{ type: "ConsentGrant" as const, id: "LIST" }],
    }),

    // DELETE /authsec/consent-grants/:id (admin)
    revokeAdminConsentGrant: builder.mutation<{ status: string }, string>({
      query: (grantId) => ({
        url: `/authsec/consent-grants/${grantId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ConsentGrant" as const, id: "LIST" }],
    }),

    // GET /oauth/consent-grants (user self-service)
    listUserConsentGrants: builder.query<ConsentGrantsListResponse, void>({
      query: () => "/oauth/consent-grants",
      providesTags: [{ type: "ConsentGrant" as const, id: "USER_LIST" }],
    }),

    // DELETE /oauth/consent-grants/:id (user self-service)
    revokeUserConsentGrant: builder.mutation<{ status: string }, string>({
      query: (grantId) => ({
        url: `/oauth/consent-grants/${grantId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ConsentGrant" as const, id: "USER_LIST" }],
    }),
  }),
});

export const {
  useListAdminConsentGrantsQuery,
  useRevokeAdminConsentGrantMutation,
  useListUserConsentGrantsQuery,
  useRevokeUserConsentGrantMutation,
} = consentGrantsApi;
