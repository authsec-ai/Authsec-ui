/**
 * AWS Quick Create onboarding — "Launch in AWS".
 *
 * Built against the backend contract in
 * `controllers/platform/cloud_aws_controller.go` (StartOnboardingSession,
 * GetOnboardingSession) and `services/cloud_aws_quickcreate.go`
 * (AWSOnboardingSessionView). Injected into the shared baseApi from here so
 * the AWS-only surface stays in the AWS folder.
 *
 * The flow: POST a session with the AWS Region(s) to scan → open its
 * quick_create_url → poll the session until the stack's callback has been
 * verified server-side. Nothing is pasted back.
 */

import { baseApi } from "@/app/api/baseApi";

/** GET /aws/onboarding's `automatic` block. `enabled: false` means the
 * deployment has no Quick Create infrastructure: show the manual flow. */
export interface AWSAutomaticBlock {
  enabled: boolean;
  supported_deployment_regions?: string[];
  default_deployment_region?: string;
  /** Opt-in regions this deployment can scan (enabled on AuthSec's side). */
  optin_scan_regions?: string[];
}

export type AWSOnboardingSessionStatus = "pending" | "verifying" | "connected" | "failed";

export interface AWSRegionProbe {
  status: "connected" | "not_reachable";
  /** timeout | region_disabled | blocked | error */
  reason?: string;
}

/** services.AWSOnboardingSessionView */
export interface AWSOnboardingSession {
  id: string;
  status: AWSOnboardingSessionStatus;
  /** Stable aws_onb_* code, present when status is failed. */
  code?: string;
  message?: string;
  /** Not a secret (AWS treats it as a confused-deputy guard). Needed for the
   * "paste Role ARN instead" fallback, which reuses this session's value. */
  external_id: string;
  regions: string[];
  deployment_region: string;
  stack_name: string;
  role_name: string;
  quick_create_url: string;
  account_id?: string;
  role_arn?: string;
  /** Set when this launch replaced a role the account was already connected
   * through. The old role is no longer used; cleaning it up is the customer's. */
  previous_role_arn?: string;
  connector_id?: string;
  region_status?: Record<string, AWSRegionProbe>;
  /** AuthSec could not deliver its answer to CloudFormation: the stack will
   * time out and roll back even though the connection was proven. */
  response_put_failed?: boolean;
  created_at: string;
  expires_at: string;
}

export interface StartAWSOnboardingSessionRequest {
  regions: string[];
  deployment_region?: string;
}

/** Error body of the session endpoints: `{error, code}`. */
export interface AWSQuickCreateApiError {
  error: string;
  code?: string;
}

export const awsQuickCreateApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    startAwsOnboardingSession: builder.mutation<AWSOnboardingSession, StartAWSOnboardingSessionRequest>({
      query: (body) => ({ url: "/authsec/discovery/aws/onboarding/sessions", method: "POST", body }),
      transformResponse: (r: { data: AWSOnboardingSession }) => r.data,
    }),
    getAwsOnboardingSession: builder.query<AWSOnboardingSession, string>({
      query: (id) => ({ url: `/authsec/discovery/aws/onboarding/sessions/${id}`, method: "GET" }),
      transformResponse: (r: { data: AWSOnboardingSession }) => r.data,
    }),
  }),
});

export const { useStartAwsOnboardingSessionMutation, useGetAwsOnboardingSessionQuery } = awsQuickCreateApi;

export function isTerminalSession(s: AWSOnboardingSession | undefined): boolean {
  return s?.status === "connected" || s?.status === "failed";
}
