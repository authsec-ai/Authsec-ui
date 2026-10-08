import { baseApi } from "./baseApi";
import type { ExternalService } from "@/types/entities";

// Raw backend service shape (from /exsvc/services endpoints)
export interface RawExternalService {
  id: string;
  name: string;
  type: string; // e.g. "API"
  url: string;
  description?: string;
  tags?: string[];
  resource_id: number;
  auth_type: "oauth2" | "api_key" | "basic_auth" | "bearer_token" | "none" | string;
  auth_config?: string;
  vault_path?: string;
  created_by?: string;
  agent_accessible: boolean;
  secret_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ExternalServiceRequest {
  name: string;
  type?: string; // API default
  url: string;
  description?: string;
  tags?: string[];
  resource_id: number;
  auth_type: "oauth2" | "api_key" | "basic_auth" | "bearer_token" | "none";
  agent_accessible?: boolean;
  secret_data?: Record<string, any>;
}

export interface ExternalServiceUpdateRequest {
  name?: string;
  type?: string;
  url?: string;
  description?: string;
  tags?: string[];
  auth_type?: "oauth2" | "api_key" | "basic_auth" | "bearer_token" | "none";
  agent_accessible?: boolean;
  secret_data?: Record<string, any>;
}

// Map raw backend service to UI ExternalService type
const deriveProviderFromUrl = (url?: string): string => {
  if (!url) return "custom";
  try {
    const host = new URL(url).hostname.toLowerCase();
    const parts = host.split(".").filter((p) => !["api", "www", "dev", "staging", "v1", "v2"].includes(p));
    // Prefer well-known providers if present
    const known = ["google", "microsoft", "salesforce", "slack", "github", "stripe", "dropbox", "box", "aws", "azure"];
    const hit = parts.find((p) => known.includes(p));
    return hit || parts[0] || "custom";
  } catch {
    return "custom";
  }
};

export const mapRawToExternalService = (raw: RawExternalService): ExternalService => {
  const provider = deriveProviderFromUrl(raw.url);
  const status: ExternalService["status"] =
    raw.auth_type === "none"
      ? "needs_consent"
      : raw.auth_type === "oauth2"
      ? "needs_consent"
      : "connected";

  return {
    id: raw.id,
    name: raw.name,
    provider,
    // Use backend type if reasonable; fallback to 'other'
    category: (raw.type || "other").toString().toLowerCase(),
    clientCount: 0,
    userTokenCount: 0,
    status,
    lastSync: raw.updated_at || raw.created_at,
    lastError: undefined,
    createdAt: raw.created_at,
  };
};

export const externalServiceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /exsvc/services - list services (response shape: { services: RawExternalService[] })
    getExternalServices: builder.query<RawExternalService[], void>({
      query: () => ({ url: "/authsec/exsvc/services", method: "GET" }),
      transformResponse: (response: { services: RawExternalService[] }) => {
        const items = Array.isArray((response as any)?.services) ? (response as any).services : [];
        return items;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "ExternalService" as const, id })),
              { type: "ExternalService", id: "LIST" },
            ]
          : [{ type: "ExternalService", id: "LIST" }],
    }),

    // GET /exsvc/services/{id}
    getExternalService: builder.query<ExternalService, string>({
      query: (id) => ({ url: `/authsec/exsvc/services/${id}`, method: "GET" }),
      transformResponse: (raw: RawExternalService) => mapRawToExternalService(raw),
      providesTags: (_res, _err, id) => [{ type: "ExternalService", id }],
    }),

    // GET /exsvc/services/{id}/credentials - fetch service credentials (requires MFA)
    getExternalServiceCredentials: builder.query<Record<string, any>, string>({
      query: (id) => ({ url: `/authsec/exsvc/services/${id}/credentials`, method: "GET" }),
      providesTags: (_res, _err, id) => [{ type: "ExternalService", id: `${id}-credentials` }],
    }),

    // POST /exsvc/services
    // This used to create an RBAC "resource" first through
    // /uflow/admin/endusers/:ws/resources, a route the backend does not have
    // (UI-014). No caller passed a workspace, so that step never ran.
    createExternalService: builder.mutation<ExternalService, ExternalServiceRequest>({
      query: (body) => ({ url: "/authsec/exsvc/services", method: "POST", body }),
      transformResponse: (raw: RawExternalService) => mapRawToExternalService(raw),
      invalidatesTags: [{ type: "ExternalService", id: "LIST" }],
    }),

    // PUT /exsvc/services/{id} (the backend registers PUT, not PATCH)
    updateExternalService: builder.mutation<
      ExternalService,
      { id: string; body: ExternalServiceUpdateRequest }
    >({
      query: ({ id, body }) => ({ url: `/authsec/exsvc/services/${id}`, method: "PUT", body }),
      transformResponse: (raw: RawExternalService) => mapRawToExternalService(raw),
      invalidatesTags: (_r, _e, arg) => [
        { type: "ExternalService", id: arg.id },
        { type: "ExternalService", id: "LIST" },
      ],
    }),

    // DELETE /exsvc/services/{id}
    deleteExternalService: builder.mutation<{ success: boolean; id: string }, string>({
      query: (id) => ({ url: `/authsec/exsvc/services/${id}`, method: "DELETE" }),
      transformResponse: (_raw: unknown, _meta, id) => ({ success: true, id }),
      invalidatesTags: (_r, _e, id) => [
        { type: "ExternalService", id },
        { type: "ExternalService", id: "LIST" },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetExternalServicesQuery,
  useGetExternalServiceQuery,
  useGetExternalServiceCredentialsQuery,
  useLazyGetExternalServiceCredentialsQuery,
  useCreateExternalServiceMutation,
  useUpdateExternalServiceMutation,
  useDeleteExternalServiceMutation,
} = externalServiceApi;
