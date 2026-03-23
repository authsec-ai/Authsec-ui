import { baseApi, withSessionData } from "./baseApi";
import { unsupportedApiError } from "./unsupported";

// New K8s-style selectors object
export interface K8sSelectors {
  "k8s:namespace"?: string;
  "k8s:pod"?: string;
  "k8s:pod-name"?: string;
  "k8s:service-account"?: string;
  "k8s:sa"?: string;
  [key: string]: string | undefined;
}

// Legacy selector interface (keeping for backward compatibility)
export interface WorkloadSelector {
  type?: string;
  value?: string;
  match?: string;
  [key: string]: unknown;
}

// Updated workload record to match API structure
export interface WorkloadRecord {
  id?: string;
  workload_id?: string;
  tenant_id?: string;
  spiffe_id?: string;
  spiffeId?: string;
  type?: string;
  selectors?: K8sSelectors | Array<string | WorkloadSelector>;
  vault_role?: string;
  status?: string;
  attestation_type?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// Request for creating a new workload
export interface RegisterWorkloadRequest {
  tenant_id?: string;
  selectors: K8sSelectors;
  vault_role?: string;
  status?: string;
  attestation_type?: string;
  // Legacy fields (optional)
  spiffe_id?: string;
  parent_id?: string;
  type?: string;
  register_with_spire?: boolean;
  metadata?: Record<string, unknown>;
}

// Request for updating an existing workload
export interface UpdateWorkloadRequest {
  workload_id: string;
  tenant_id?: string;
  selectors?: K8sSelectors;
  vault_role?: string;
  status?: string;
  attestation_type?: string;
}

// Request for deleting a workload
export interface DeleteWorkloadRequest {
  workload_id: string;
  tenant_id?: string;
}

// Request for listing workloads
export interface ListWorkloadsRequest {
  tenant_id?: string;
}

export interface WorkloadEnvelope {
  workload?: WorkloadRecord;
  data?: WorkloadRecord;
  message?: string;
  [key: string]: unknown;
}

export type RegisterWorkloadResponse = WorkloadRecord;
export type UpdateWorkloadResponse = WorkloadRecord;
export interface DeleteWorkloadResponse {
  message?: string;
  workload_id?: string;
  [key: string]: unknown;
}

export interface ListWorkloadsResponse {
  workloads: WorkloadRecord[];
  count: number;
}

export interface ListWorkloadsEnvelope {
  workloads?: WorkloadRecord[];
  count?: number;
  message?: string;
  data?:
    | WorkloadRecord[]
    | {
        workloads?: WorkloadRecord[];
        items?: WorkloadRecord[];
        [key: string]: unknown;
      };
  [key: string]: unknown;
}

// Entry interfaces
export interface EntryRecord {
  id: string;
  spiffe_id: string;
  parent_id: string;
  selectors: Record<string, string>;
  ttl: number;
  admin?: boolean;
  downstream?: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegisterEntryRequest {
  tenant_id?: string;
  spiffe_id: string;
  parent_id: string;
  selectors: Record<string, string>;
  ttl: number;
  admin?: boolean;
  downstream?: boolean;
}

export interface UpdateEntryRequest {
  entry_id: string;
  tenant_id?: string;
  spiffe_id: string;
  parent_id: string;
  selectors: Record<string, string>;
  ttl: number;
  admin?: boolean;
  downstream?: boolean;
}

export interface DeleteEntryRequest {
  entry_id: string;
  tenant_id?: string;
}

export interface DeleteEntryResponse {
  message?: string;
  id?: string;
}

// Agent interfaces
export interface AgentRecord {
  id: string;
  spiffe_id: string;
  node_id: string;
  attestation_type: string;
  status: string;
  last_seen: string;
  created_at: string;
}

export interface ListAgentsResponse {
  agents: AgentRecord[];
  count: number;
}

const extractWorkloads = (
  response: ListWorkloadsEnvelope | WorkloadRecord[] | undefined
): WorkloadRecord[] => {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.workloads)) return response.workloads;
  if (response.data) {
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data.workloads)) return response.data.workloads;
    if (Array.isArray(response.data.items)) return response.data.items;
  }
  return [];
};

const extractWorkloadRecord = (
  response: WorkloadEnvelope | WorkloadRecord | undefined
): WorkloadRecord | null => {
  if (!response) return null;
  if (Array.isArray(response)) return null;
  if (
    (response as WorkloadRecord).id ||
    (response as WorkloadRecord).workload_id ||
    (response as WorkloadRecord).spiffe_id
  ) {
    return response as WorkloadRecord;
  }
  if ((response as WorkloadEnvelope).data) {
    const data = (response as WorkloadEnvelope).data as
      | Record<string, unknown>
      | WorkloadRecord;
    if (
      (data as WorkloadRecord).id ||
      (data as WorkloadRecord).workload_id ||
      (data as WorkloadRecord).spiffe_id
    ) {
      return data as WorkloadRecord;
    }
    if ((data as { workload?: WorkloadRecord }).workload) {
      return (data as { workload: WorkloadRecord }).workload;
    }
  }
  if ((response as WorkloadEnvelope).workload) {
    return (response as WorkloadEnvelope).workload as WorkloadRecord;
  }
  return null;
};

export const workloadsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listWorkloads: builder.query<ListWorkloadsResponse, void>({
      query: () => ({
        url: "spire/registry/workloads",
        method: "GET",
      }),
      transformResponse: (
        response: ListWorkloadsEnvelope | WorkloadRecord[]
      ) => {
        const workloads = extractWorkloads(response);
        const count =
          (response as ListWorkloadsEnvelope).count ?? workloads.length;
        return { workloads, count };
      },
      providesTags: (result) =>
        result && result.workloads && result.workloads.length
          ? [
              ...result.workloads.map((workload) => ({
                type: "Workload" as const,
                id:
                  workload.id ??
                  workload.workload_id ??
                  workload.spiffe_id ??
                  workload.spiffeId ??
                  "UNKNOWN",
              })),
              { type: "Workload" as const, id: "LIST" },
            ]
          : [{ type: "Workload" as const, id: "LIST" }],
    }),
    registerWorkload: builder.mutation<
      RegisterWorkloadResponse,
      RegisterWorkloadRequest
    >({
      query: (body) => ({
        url: "spire/registry/workloads",
        method: "POST",
        body: withSessionData(body),
      }),
      invalidatesTags: (result, _error, _arg) => [
        {
          type: "Workload",
          id: result?.id || result?.workload_id || "UNKNOWN",
        },
        { type: "Workload", id: "LIST" },
      ],
    }),
    updateWorkload: builder.mutation<
      UpdateWorkloadResponse,
      UpdateWorkloadRequest
    >({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE workload updates are not exposed by the backend route contract.",
        ) as any,
      }),
      invalidatesTags: (result, error, arg) => [
        { type: "Workload", id: arg.workload_id },
        { type: "Workload", id: "LIST" },
      ],
    }),
    deleteWorkload: builder.mutation<
      DeleteWorkloadResponse,
      DeleteWorkloadRequest
    >({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE workload deletion is not exposed by the backend route contract.",
        ) as any,
      }),
      invalidatesTags: [{ type: "Workload", id: "LIST" }],
    }),
    getWorkload: builder.query<WorkloadRecord | null, { workload_id: string }>({
      async queryFn({ workload_id }, _api, _extraOptions, baseQuery) {
        const result = await baseQuery({
          url: "spire/registry/workloads",
          method: "GET",
        });

        if (result.error) {
          return { error: result.error as any };
        }

        const workloads = extractWorkloads(
          result.data as ListWorkloadsEnvelope | WorkloadRecord[] | undefined,
        );
        const workload =
          workloads.find(
            (candidate) =>
              candidate.id === workload_id ||
              candidate.workload_id === workload_id ||
              candidate.spiffe_id === workload_id ||
              candidate.spiffeId === workload_id,
          ) ?? null;

        if (!workload) {
          return {
            error: {
              status: 404,
              data: { message: "Workload not found" },
            } as any,
          };
        }

        return { data: workload };
      },
      providesTags: (result, error, arg) => [
        { type: "Workload", id: arg.workload_id },
      ],
    }),
    registerEntry: builder.mutation<EntryRecord, RegisterEntryRequest>({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE entry management is not exposed by the backend.",
        ) as any,
      }),
      invalidatesTags: [{ type: "Entry", id: "LIST" }],
    }),
    updateEntry: builder.mutation<EntryRecord, UpdateEntryRequest>({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE entry management is not exposed by the backend.",
        ) as any,
      }),
      invalidatesTags: (result, error, arg) => [
        { type: "Entry", id: arg.entry_id },
        { type: "Entry", id: "LIST" },
      ],
    }),
    deleteEntry: builder.mutation<DeleteEntryResponse, DeleteEntryRequest>({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE entry management is not exposed by the backend.",
        ) as any,
      }),
      invalidatesTags: (result, error, arg) => [
        { type: "Entry", id: arg.entry_id },
        { type: "Entry", id: "LIST" },
      ],
    }),
    listEntries: builder.query<
      EntryRecord[],
      {
        tenant_id?: string;
        limit?: number;
        offset?: number;
        spiffe_id?: string;
      }
    >({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE entry management is not exposed by the backend.",
        ) as any,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((entry) => ({
                type: "Entry" as const,
                id: entry.id,
              })),
              { type: "Entry" as const, id: "LIST" },
            ]
          : [{ type: "Entry" as const, id: "LIST" }],
    }),
    getEntry: builder.query<
      EntryRecord | null,
      { entry_id: string; tenant_id?: string }
    >({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE entry management is not exposed by the backend.",
        ) as any,
      }),
      providesTags: (result, _error, arg) => [
        { type: "Entry", id: arg.entry_id },
      ],
    }),
    listAgents: builder.query<AgentRecord[], void>({
      queryFn: async () => ({
        error: unsupportedApiError(
          "SPIRE agent inventory is not exposed by the backend.",
        ) as any,
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((agent) => ({
                type: "Agent" as const,
                id: agent.id,
              })),
              { type: "Agent" as const, id: "LIST" },
            ]
          : [{ type: "Agent" as const, id: "LIST" }],
    }),
  }),
});

export const {
  useListWorkloadsQuery,
  useRegisterWorkloadMutation,
  useUpdateWorkloadMutation,
  useDeleteWorkloadMutation,
  useGetWorkloadQuery,
  useRegisterEntryMutation,
  useUpdateEntryMutation,
  useDeleteEntryMutation,
  useListEntriesQuery,
  useGetEntryQuery,
  useListAgentsQuery,
} = workloadsApi;
