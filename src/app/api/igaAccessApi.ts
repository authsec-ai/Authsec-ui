/**
 * IGA Access governance API — RTK Query endpoints for access requests and leases.
 *
 * Batch 10 — Access & ITDR UI (U32-U36).
 *
 * Backend contract:
 *  - List requests:  GET  /api/iga/v2/access-requests           -> {data: AccessRequest[]}
 *  - Get request:    GET  /api/iga/v2/access-requests/:id        -> AccessRequest
 *  - Create request: POST /api/iga/v2/access-requests            -> AccessRequest
 *  - Approve:        POST /api/iga/v2/access-requests/:id/approve -> {lease_id}
 *  - Deny:           POST /api/iga/v2/access-requests/:id/deny    -> void
 *  - Get lease:      GET  /api/iga/v2/access-leases/:id          -> AccessLease
 *  - Redeem lease:   POST /api/iga/v2/access-leases/:id/redeem   -> void
 *  - Revoke lease:   POST /api/iga/v2/access-leases/:id/revoke   -> void
 */

import { baseApi } from "@/app/api/baseApi";

// ── Types ────────────────────────────────────────────────────────────────────

export type AccessRequestState =
  | "pending"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired";

export type LeaseState =
  | "issued"
  | "active"
  | "consumed"
  | "expired"
  | "revoked";

export interface AccessRequest {
  id: string;
  workspace_id: string;
  requester_id: string;
  subject_id: string;
  resource_id: string;
  action: string;
  reason: string;
  state: AccessRequestState;
  expires_at: string;
  decided_by?: string;
  decided_at?: string;
  decision_reason?: string;
  lease_id?: string;
  created_at: string;
}

export interface AccessLease {
  id: string;
  workspace_id: string;
  request_id: string;
  subject_id: string;
  resource_id: string;
  action: string;
  state: LeaseState;
  not_before: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  policy_revision: string;
  created_at: string;
}

// ── Request types ────────────────────────────────────────────────────────────

export interface CreateAccessRequestBody {
  subject_id: string;
  resource_id: string;
  action: string;
  reason: string;
}

export interface DecisionBody {
  id: string;
  reason: string;
}

export interface RedeemLeaseBody {
  id: string;
  operation_id: string;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

const BASE_REQUESTS = "/api/iga/v2/access-requests";
const BASE_LEASES = "/api/iga/v2/access-leases";

export const igaAccessApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ── Reads ──────────────────────────────────────────────────────────────

    listIgaAccessRequests: builder.query<AccessRequest[], void>({
      query: () => ({ url: BASE_REQUESTS, method: "GET" }),
      transformResponse: (raw: { data: AccessRequest[] }) => raw.data ?? [],
      providesTags: ["IgaAccessRequest"],
    }),

    getIgaAccessRequest: builder.query<AccessRequest, string>({
      query: (id) => ({ url: `${BASE_REQUESTS}/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "IgaAccessRequest" as const, id }],
    }),

    getIgaLease: builder.query<AccessLease, string>({
      query: (id) => ({ url: `${BASE_LEASES}/${id}`, method: "GET" }),
    }),

    // ── Mutations ──────────────────────────────────────────────────────────

    createIgaAccessRequest: builder.mutation<AccessRequest, CreateAccessRequestBody>({
      query: (body) => ({ url: BASE_REQUESTS, method: "POST", body }),
      invalidatesTags: ["IgaAccessRequest"],
    }),

    approveIgaRequest: builder.mutation<{ lease_id: string }, DecisionBody>({
      query: ({ id, ...body }) => ({
        url: `${BASE_REQUESTS}/${id}/approve`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "IgaAccessRequest", id }, "IgaAccessRequest"],
    }),

    denyIgaRequest: builder.mutation<void, DecisionBody>({
      query: ({ id, ...body }) => ({
        url: `${BASE_REQUESTS}/${id}/deny`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "IgaAccessRequest", id }, "IgaAccessRequest"],
    }),

    redeemIgaLease: builder.mutation<void, RedeemLeaseBody>({
      query: ({ id, ...body }) => ({
        url: `${BASE_LEASES}/${id}/redeem`,
        method: "POST",
        body,
      }),
    }),

    revokeIgaLease: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({
        url: `${BASE_LEASES}/${id}/revoke`,
        method: "POST",
      }),
    }),
  }),
});

export const {
  useListIgaAccessRequestsQuery,
  useGetIgaAccessRequestQuery,
  useGetIgaLeaseQuery,
  useCreateIgaAccessRequestMutation,
  useApproveIgaRequestMutation,
  useDenyIgaRequestMutation,
  useRedeemIgaLeaseMutation,
  useRevokeIgaLeaseMutation,
} = igaAccessApi;
