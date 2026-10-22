/** Whether AuthSec can change the cloud a policy is in, in words. */

import { useGetAccessReadinessQuery, type AccessProvider } from "@/app/api/igaAccessPoliciesApi";

import { classifyPolicyError } from "../shared";

/** Why an account or subscription is not ready, in words (readiness `reason` codes). */
const READINESS_WORDS: Record<string, string> = {
  binding_missing: "AWS access is not set up",
  binding_not_verified: "AWS access setup has not finished: the CloudFormation stack has not reported back or its self-test has not passed",
  binding_template_v1: "the AWS access stack is an older version and must be updated",
  binding_capability_missing: "the AWS access self-test is missing a check access policies need",
  azure_write_access_missing: "AuthSec's Azure app cannot manage role assignments: give it the Role Based Access Control Administrator role on the subscription",
};

export function readinessWords(reason: string): string {
  return READINESS_WORDS[reason] ?? (reason ? reason.replace(/_/g, " ") : "AWS access is not ready");
}

/** The readiness of the workspace's AWS accounts or Azure subscriptions, for one when `scopeId` (an account or subscription id) is given. */
export function useAccessReadiness(ws: string, scopeId?: string, provider: AccessProvider = "aws") {
  const q = useGetAccessReadinessQuery({ ws });
  const r = q.data?.data;
  const all = r
    ? provider === "aws"
      ? r.accounts.map((a) => ({ id: a.account_id, name: a.account_id, ready: a.ready, reason: a.reason }))
      : r.azure_subscriptions.map((s) => ({ id: s.subscription_id, name: s.name || s.subscription_id, ready: s.ready, reason: s.reason }))
    : [];
  const scopes = scopeId ? all.filter((a) => a.id.toLowerCase() === scopeId.toLowerCase()) : all;
  const notReady = scopes.filter((a) => !a.ready);
  return {
    loading: q.isLoading,
    failed: q.isError && classifyPolicyError(q.error)?.kind !== "unavailable",
    available: r?.available ?? false,
    reason: r?.reason ?? "",
    scopes,
    notReady,
    ready: !!r && r.available && scopes.length > 0 && notReady.length === 0,
    refetch: () => void q.refetch(),
  };
}
