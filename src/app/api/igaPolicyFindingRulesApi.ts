/**
 * Finding exceptions and finding rules (SPEC-iga-phase3-policy.md §7.1, added to
 * the backend by review fix R1a P2). All under `POLICY_BASE`, all
 * `governance:author`. Shapes are the Go structs that are serialised
 * (services/iga_gov_finding_rules.go), not the spec.
 *
 *   POST   /findings/:id/exception   {until, reason}   GovFindingExceptionView   iga_gov_finding_rules.go:400
 *   DELETE /findings/:id/exception   {reason?}         GovFindingExceptionView
 *   GET    /finding-rules?cursor&limit                 GovFindingRuleView[]      iga_gov_finding_rules.go:124
 *   POST   /finding-rules            {kind, scope?, params?, enabled?}   201
 *   PATCH  /finding-rules/:id        {scope?, params?, enabled?}         (kind is immutable)
 *   DELETE /finding-rules/:id                          {id, deleted: true}
 *
 * A rule changes nothing until the next evaluation; an exception is time-bound
 * (`until` must be in the future and at most 365 days ahead).
 */

import { baseApi } from "./baseApi";
import { POLICY_BASE, enc, policyQuery } from "./igaPolicyCommon";
import type { PageArgs, PolicyEnvelope, WsArg } from "./igaPolicyCommon";

export const GOV_MAX_EXCEPTION_DAYS = 365;
/** igagov.MinWindowDays / MaxWindowDays. */
export const GOV_RULE_WINDOW_DAYS = { min: 30, max: 400 } as const;

export type GovFindingRuleKind = "require_review_date" | "unused_window";
/** Runtime kinds AWS discovery writes (models/cloud_discovery.go "Runtime kinds AWS discovery writes"). A rule matches these names exactly. */
export const GOV_RULE_RUNTIME_KINDS = [
  "lambda_function",
  "ecs_task_definition",
  "ec2_instance",
  "bedrock_agent",
  "bedrock_agentcore_runtime",
  "bedrock_agentcore_gateway",
] as const;
export const GOV_RULE_STAGES = ["production", "non_production", "unknown"] as const;
export const GOV_RULE_CLASSIFICATIONS = ["unclassified", "provider_native_agent", "classified_agent"] as const;

/** Each list is optional; an empty list matches anything. */
export interface GovFindingRuleScope {
  runtime_kinds?: string[];
  stages?: string[];
  classifications?: string[];
}

export interface GovFindingRuleView {
  id: string;
  kind: GovFindingRuleKind | (string & {});
  scope: GovFindingRuleScope | null;
  params: { window_days?: number } | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
}

export interface GovFindingRuleBody {
  kind: GovFindingRuleKind;
  scope?: GovFindingRuleScope;
  params?: { window_days: number };
  enabled?: boolean;
}

export interface GovFindingRulePatch {
  scope?: GovFindingRuleScope;
  params?: { window_days: number };
  enabled?: boolean;
}

/** What an exception change returns: the finding's workflow state now. */
export interface GovFindingExceptionView {
  id: string;
  kind: string;
  status: string;
  excepted_until: string | null;
  exception_reason: string;
  status_changed_at: string;
}

type Meta = { next_cursor?: string | null };

export const igaPolicyFindingRulesApi = baseApi.injectEndpoints({
  overrideExisting: false,
  endpoints: (b) => ({
    listGovFindingRules: b.query<PolicyEnvelope<GovFindingRuleView[], Meta>, WsArg & PageArgs>({
      query: (args) => ({ url: `${POLICY_BASE}/finding-rules${policyQuery(args)}` }),
      providesTags: [{ type: "IgaGovFinding", id: "RULES" }],
    }),
    createGovFindingRule: b.mutation<GovFindingRuleView, GovFindingRuleBody>({
      query: (body) => ({ url: `${POLICY_BASE}/finding-rules`, method: "POST", body }),
      transformResponse: (r: PolicyEnvelope<GovFindingRuleView, Record<string, never>>) => r.data,
      invalidatesTags: [{ type: "IgaGovFinding", id: "RULES" }, { type: "IgaGovEvent", id: "ALL" }],
    }),
    updateGovFindingRule: b.mutation<GovFindingRuleView, { id: string } & GovFindingRulePatch>({
      query: ({ id, ...body }) => ({ url: `${POLICY_BASE}/finding-rules/${enc(id)}`, method: "PATCH", body }),
      transformResponse: (r: PolicyEnvelope<GovFindingRuleView, Record<string, never>>) => r.data,
      invalidatesTags: [{ type: "IgaGovFinding", id: "RULES" }, { type: "IgaGovEvent", id: "ALL" }],
    }),
    deleteGovFindingRule: b.mutation<{ id: string; deleted: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `${POLICY_BASE}/finding-rules/${enc(id)}`, method: "DELETE" }),
      transformResponse: (r: PolicyEnvelope<{ id: string; deleted: boolean }, Record<string, never>>) => r.data,
      invalidatesTags: [{ type: "IgaGovFinding", id: "RULES" }, { type: "IgaGovEvent", id: "ALL" }],
    }),

    /** `until` is RFC 3339. 409 `finding_not_exceptable` when the finding is not open, reopened or already excepted. */
    exceptGovFinding: b.mutation<GovFindingExceptionView, { id: string; until: string; reason: string }>({
      query: ({ id, until, reason }) => ({ url: `${POLICY_BASE}/findings/${enc(id)}/exception`, method: "POST", body: { until, reason } }),
      transformResponse: (r: PolicyEnvelope<GovFindingExceptionView, Record<string, never>>) => r.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovFinding", id },
        { type: "IgaGovFinding", id: "ALL" },
        { type: "IgaGovReadiness", id: "ALL" },
        { type: "IgaGovEvent", id: "ALL" },
      ],
    }),
    /** 409 `finding_not_excepted` when there is no exception to clear. The finding is open again. */
    clearGovFindingException: b.mutation<GovFindingExceptionView, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `${POLICY_BASE}/findings/${enc(id)}/exception`,
        method: "DELETE",
        body: reason?.trim() ? { reason: reason.trim() } : undefined,
      }),
      transformResponse: (r: PolicyEnvelope<GovFindingExceptionView, Record<string, never>>) => r.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "IgaGovFinding", id },
        { type: "IgaGovFinding", id: "ALL" },
        { type: "IgaGovReadiness", id: "ALL" },
        { type: "IgaGovEvent", id: "ALL" },
      ],
    }),
  }),
});

export const {
  useListGovFindingRulesQuery,
  useCreateGovFindingRuleMutation,
  useUpdateGovFindingRuleMutation,
  useDeleteGovFindingRuleMutation,
  useExceptGovFindingMutation,
  useClearGovFindingExceptionMutation,
} = igaPolicyFindingRulesApi;
