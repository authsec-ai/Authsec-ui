import { baseApi } from "./baseApi";

export interface TrustedIssuer {
  id: string;
  iss: string;
  jwks_uri: string;
  provider_name: string;
  allowed_algs: string[];
  allowed_auds: string[];
  clock_skew_secs: number;
  workspace_claim_mapping?: string;
  subject_mapping?: string;
  jit_provisioning: boolean;
  status: "active" | "revoked";
  revoked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ListTrustedIssuersResponse {
  items: TrustedIssuer[];
}

export interface CreateTrustedIssuerRequest {
  iss: string;
  jwks_uri: string;
  provider_name: string;
  allowed_algs?: string[];
  allowed_auds?: string[];
  clock_skew_secs?: number;
  workspace_claim_mapping?: string;
  subject_mapping?: string;
  jit_provisioning?: boolean;
}

export interface TestTrustedIssuerRequest {
  assertion: string;
  client_id?: string;
}

export interface TestTrustedIssuerResponse {
  pass: boolean;
  reason?: string;
  iss?: string;
  sub?: string;
  client_id?: string;
  jti?: string;
  issued_at?: string;
  expires_at?: string;
}

const trustedIssuersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTrustedIssuers: builder.query<ListTrustedIssuersResponse, void>({
      query: () => ({ url: "/authsec/trusted-issuers" }),
      providesTags: [{ type: "TrustedIssuer" as const, id: "LIST" }],
    }),

    createTrustedIssuer: builder.mutation<TrustedIssuer, CreateTrustedIssuerRequest>({
      query: (body) => ({
        url: "/authsec/trusted-issuers",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "TrustedIssuer" as const, id: "LIST" }],
    }),

    testTrustedIssuer: builder.mutation<TestTrustedIssuerResponse, TestTrustedIssuerRequest>({
      query: (body) => ({
        url: "/authsec/trusted-issuers/test",
        method: "POST",
        body,
      }),
    }),

    revokeTrustedIssuer: builder.mutation<{ status: string }, string>({
      query: (id) => ({
        url: `/authsec/trusted-issuers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "TrustedIssuer" as const, id: "LIST" }],
    }),
  }),
});

export const {
  useListTrustedIssuersQuery,
  useCreateTrustedIssuerMutation,
  useTestTrustedIssuerMutation,
  useRevokeTrustedIssuerMutation,
} = trustedIssuersApi;
