import type { CloudOnboardingApiError } from "@/app/api/cloudDiscoveryApi";

/**
 * Turns an AWS onboarding/connector-action error into title+body copy.
 *
 * Keyed on the backend's own `fault` classification
 * (mapAWSOnboardingError, controllers/platform/cloud_aws_controller.go) —
 * "customer_account" | "aws" | "authsec" — never an invented cause. A plain
 * caller-input rejection (bad ARN, bad region, external id not issued to
 * this workspace) carries no `fault` at all and is shown as written.
 *
 * Shared by AWSOnboardingWizard (connect), AWSConnectorDrawer (verify/scan/
 * revoke) and DiscoveryIntegrationsPage (the same row actions, merged into
 * its Integrations table) so the three-way
 * distinction the plan calls for never drifts between them.
 */
export function awsErrorCopy(
  apiErr: CloudOnboardingApiError | undefined,
  fallback: string,
): { title: string; body: string } {
  if (!apiErr) return { title: "Couldn't connect the account", body: fallback };
  // Client-side timeout: no backend verdict ever arrived (a 400 logged
  // server-side for the same request is the aborted call tearing down, not
  // an AWS refusal). Must read as inconclusive, never as a refusal.
  if (apiErr.timeout) {
    return {
      title: "The request timed out",
      body:
        apiErr.hint ??
        "AuthSec was still verifying the role when the request timed out, so nothing was proven either way. " +
          "Check the connectors list — the connection may have completed — and try again if nothing appears.",
    };
  }
  switch (apiErr.fault) {
    case "customer_account":
      return {
        title: "AWS refused the connection",
        body:
          apiErr.hint ??
          "Check the role ARN, the ExternalId in the trust policy, and that the trust policy names the AuthSec principal shown in step 1.",
      };
    case "aws":
      return {
        title: "AWS is throttling this request",
        body: apiErr.hint ?? "Transient — try again in a moment.",
      };
    case "authsec":
      return {
        title: "This is an AuthSec deployment problem, not yours",
        body: apiErr.hint ?? apiErr.error,
      };
    default:
      return { title: "Check what was entered", body: apiErr.hint ?? apiErr.error ?? fallback };
  }
}
