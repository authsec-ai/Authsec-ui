/**
 * Policy demo (`/api/policy-demo/v1`): a time-boxed S3 access policy for an
 * agent. The backend stores and lists these and shows the AWS documents such a
 * policy would produce; nothing is deployed to AWS.
 *
 *   GET    /policies?q&phase&resource   list
 *   POST   /policies                    create
 *   POST   /policies/preview            what a draft would produce (stores nothing)
 *   POST   /policies/seed               three sample policies into an empty workspace
 *   GET    /policies/:id                one policy with its documents
 *   PUT    /policies/:id                edit
 *   POST   /policies/:id/pause | resume
 *   DELETE /policies/:id
 *
 * Every answer is `{ data }`; a refusal is `{ error: { code, message, field? } }`.
 */

import { baseApi } from "./baseApi";

const BASE = "/api/policy-demo/v1";

export type PolicyDemoAction = "read" | "write" | "delete";
export type PolicyDemoPhase = "scheduled" | "active" | "expired" | "paused";

export interface PolicyDemoGenerated {
  attach_to: string;
  summary: string[];
  warnings: string[];
  role_policy: Record<string, unknown>;
  bucket_policy_statements: Record<string, unknown>[];
}

export interface PolicyDemo {
  id: string;
  name: string;
  description: string;
  agent: string;
  identity: string;
  resource_type: "s3";
  resource: string;
  prefix: string;
  actions: PolicyDemoAction[];
  protect_bucket: boolean;
  require_tls: boolean;
  start_time: string | null;
  end_time: string | null;
  paused: boolean;
  phase: PolicyDemoPhase;
  created_at: string;
  updated_at: string;
  /** On a single read, a create, an edit and a preview; not on the list. */
  generated?: PolicyDemoGenerated;
}

/** The body of create, edit and preview. Times are RFC 3339. */
export interface PolicyDemoInput {
  name: string;
  description: string;
  agent: string;
  identity: string;
  resource_type: "s3";
  resource: string;
  prefix: string;
  actions: PolicyDemoAction[];
  protect_bucket: boolean;
  require_tls: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface PolicyDemoListArgs {
  q?: string;
  phase?: PolicyDemoPhase;
  resource?: string;
}

/** A refusal from the demo routes, as the form needs it. */
export interface PolicyDemoError {
  message: string;
  field?: string;
}

export function policyDemoError(e: unknown): PolicyDemoError {
  const body = (e as { data?: { error?: { message?: string; field?: string } } } | undefined)?.data?.error;
  if (body?.message) return { message: body.message, field: body.field };
  return { message: "Something went wrong. Try again." };
}

export const policyDemoApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    listPolicyDemo: b.query<PolicyDemo[], PolicyDemoListArgs | void>({
      query: (args) => {
        const p = new URLSearchParams();
        if (args?.q) p.set("q", args.q);
        if (args?.phase) p.set("phase", args.phase);
        if (args?.resource) p.set("resource", args.resource);
        const qs = p.toString();
        return { url: `${BASE}/policies${qs ? `?${qs}` : ""}` };
      },
      transformResponse: (res: { data: PolicyDemo[] }) => res.data,
      providesTags: [{ type: "PolicyDemo", id: "LIST" }],
    }),
    getPolicyDemo: b.query<PolicyDemo, string>({
      query: (id) => ({ url: `${BASE}/policies/${encodeURIComponent(id)}` }),
      transformResponse: (res: { data: PolicyDemo }) => res.data,
      providesTags: (_r, _e, id) => [{ type: "PolicyDemo", id }],
    }),
    createPolicyDemo: b.mutation<PolicyDemo, PolicyDemoInput>({
      query: (body) => ({ url: `${BASE}/policies`, method: "POST", body }),
      transformResponse: (res: { data: PolicyDemo }) => res.data,
      invalidatesTags: [{ type: "PolicyDemo", id: "LIST" }],
    }),
    updatePolicyDemo: b.mutation<PolicyDemo, { id: string; body: PolicyDemoInput }>({
      query: ({ id, body }) => ({ url: `${BASE}/policies/${encodeURIComponent(id)}`, method: "PUT", body }),
      transformResponse: (res: { data: PolicyDemo }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: "PolicyDemo", id: "LIST" }, { type: "PolicyDemo", id }],
    }),
    previewPolicyDemo: b.mutation<PolicyDemo, PolicyDemoInput>({
      query: (body) => ({ url: `${BASE}/policies/preview`, method: "POST", body }),
      transformResponse: (res: { data: PolicyDemo }) => res.data,
    }),
    pausePolicyDemo: b.mutation<PolicyDemo, { id: string; paused: boolean }>({
      query: ({ id, paused }) => ({ url: `${BASE}/policies/${encodeURIComponent(id)}/${paused ? "pause" : "resume"}`, method: "POST" }),
      transformResponse: (res: { data: PolicyDemo }) => res.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: "PolicyDemo", id: "LIST" }, { type: "PolicyDemo", id }],
    }),
    deletePolicyDemo: b.mutation<{ id: string }, string>({
      query: (id) => ({ url: `${BASE}/policies/${encodeURIComponent(id)}`, method: "DELETE" }),
      invalidatesTags: [{ type: "PolicyDemo", id: "LIST" }],
    }),
    seedPolicyDemo: b.mutation<PolicyDemo[], void>({
      query: () => ({ url: `${BASE}/policies/seed`, method: "POST" }),
      transformResponse: (res: { data: PolicyDemo[] }) => res.data,
      invalidatesTags: [{ type: "PolicyDemo", id: "LIST" }],
    }),
  }),
});

export const {
  useListPolicyDemoQuery,
  useGetPolicyDemoQuery,
  useCreatePolicyDemoMutation,
  useUpdatePolicyDemoMutation,
  usePreviewPolicyDemoMutation,
  usePausePolicyDemoMutation,
  useDeletePolicyDemoMutation,
  useSeedPolicyDemoMutation,
} = policyDemoApi;
