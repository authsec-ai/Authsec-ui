/** Whether AuthSec can change IAM in the workspace's AWS accounts, in words. */

import { useGetAccessReadinessQuery } from "@/app/api/igaAccessPoliciesApi";

import { classifyPolicyError } from "../shared";

/** Why an account is not ready, in words (readiness `reason` codes). */
const READINESS_WORDS: Record<string, string> = {
  binding_missing: "AWS access is not set up",
  binding_not_verified: "AWS access setup has not finished: the CloudFormation stack has not reported back or its self-test has not passed",
  binding_template_v1: "the AWS access stack is an older version and must be updated",
  binding_capability_missing: "the AWS access self-test is missing a check access policies need",
};

export function readinessWords(reason: string): string {
  return READINESS_WORDS[reason] ?? (reason ? reason.replace(/_/g, " ") : "AWS access is not ready");
}

/** The readiness of the workspace's AWS accounts, for one account when `accountId` is given. */
export function useAccessReadiness(ws: string, accountId?: string) {
  const q = useGetAccessReadinessQuery({ ws });
  const r = q.data?.data;
  const accounts = r ? (accountId ? r.accounts.filter((a) => a.account_id === accountId) : r.accounts) : [];
  const notReady = accounts.filter((a) => !a.ready);
  return {
    loading: q.isLoading,
    failed: q.isError && classifyPolicyError(q.error)?.kind !== "unavailable",
    available: r?.available ?? false,
    reason: r?.reason ?? "",
    accounts,
    notReady,
    ready: !!r && r.available && accounts.length > 0 && notReady.length === 0,
    refetch: () => void q.refetch(),
  };
}
