import type { CloudOnboardingApiError } from "@/app/api/cloudDiscoveryApi";

/**
 * Turns an Azure onboarding or connector-action error into title and body copy.
 *
 * Keyed on the backend's own `fault` classification (the Azure error mapper in
 * controllers/platform/cloud_azure_controller.go): "customer_account",
 * "azure" or "authsec". A plain rejection carries no `fault` and is shown as
 * written. The hint is always kept, because it says what to do next.
 *
 * Shared by AzureOnboardingWizard (connect) and the Connections screens
 * (verify, rescan, revoke), as awsErrorCopy is for AWS.
 */
export function azureErrorCopy(
  apiErr: CloudOnboardingApiError | undefined,
  fallback: string,
): { title: string; body: string } {
  if (!apiErr) return { title: "Couldn't connect the tenant", body: fallback };
  if (apiErr.timeout) {
    return {
      title: "The request timed out",
      body:
        apiErr.hint ??
        "AuthSec was still waiting on Microsoft when the request timed out, so nothing was proven either way. " +
          "Check the connections list, because the connection may have completed, and try again if nothing appears.",
    };
  }
  const fault = (apiErr as { fault?: string }).fault;
  switch (fault) {
    case "customer_account":
      return { title: "Microsoft refused the connection", body: joined(apiErr) };
    case "azure":
      return { title: "Microsoft returned an error", body: joined(apiErr) };
    case "authsec":
      return { title: "This is an AuthSec deployment problem, not yours", body: joined(apiErr) };
    default:
      return { title: "Check what was entered", body: joined(apiErr) || fallback };
  }
}

/** What went wrong, then what to do, as sentences. */
function joined(apiErr: CloudOnboardingApiError): string {
  return [apiErr.error, apiErr.hint]
    .filter((x): x is string => !!x && x.trim() !== "")
    .map((x) => (/[.!?]$/.test(x.trim()) ? x.trim() : `${x.trim()}.`))
    .join(" ");
}

/** The wizard and the action handlers hold the raw RTK error; this reads its body. */
export function azureErrorOf(err: unknown): CloudOnboardingApiError | undefined {
  const e = err as { status?: number | string; data?: unknown } | undefined;
  if (e?.status === "TIMEOUT_ERROR") return { error: "", timeout: true };
  const data = e?.data;
  return data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
    ? (data as CloudOnboardingApiError)
    : undefined;
}
