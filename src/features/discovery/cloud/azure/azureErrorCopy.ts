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

/**
 * A coverage surface's or a scan run's raw failure text, made safe for a
 * non-technical reader. The backend writes these straight from the Microsoft
 * Graph / ARM response (an HTTP status line, a raw permission name), so the
 * same few shapes repeat across every tenant: a missing licence, a missing
 * admin consent, and Microsoft's own 5xx. Anything else falls back to one
 * generic "Microsoft could not answer" sentence rather than the raw string,
 * because a raw `http 403 Forbidden: …` reads as a crash to someone who is
 * not debugging the integration. The raw text is never discarded — callers
 * that want it (e.g. a "technical details" disclosure) still have the
 * original string beside this one.
 */
export function azureSurfaceErrorProse(raw: string | undefined | null): string | undefined {
  const text = (raw ?? "").trim();
  if (!text) return undefined;
  if (/licen[cs]e/i.test(text)) {
    return "This tenant does not have the Microsoft licence this needs, so AuthSec cannot read it.";
  }
  if (/\b403\b|forbidden|\.read\.all\b|is not granted|admin consent|consent is required/i.test(text)) {
    return "AuthSec does not have permission for this yet. An administrator needs to grant consent in Azure.";
  }
  if (/\b5\d\d\b|internal server error|service unavailable|bad gateway|gateway timeout/i.test(text)) {
    return "Microsoft had a temporary problem answering this request. AuthSec will retry automatically on the next scan.";
  }
  if (/\b401\b|unauthori[sz]ed/i.test(text)) {
    return "AuthSec's sign-in to this account was refused. Verify the connection again.";
  }
  if (/\b429\b|throttl|too many requests/i.test(text)) {
    return "Microsoft slowed down these requests. AuthSec will retry automatically.";
  }
  // Strip a leading "http 403 Forbidden:" / "azure foundry: http 500:" style
  // prefix even when none of the specific cases above matched, so a raw
  // status line is never the first thing shown.
  const stripped = text.replace(/^[\w .-]*?\bhttp\s+\d{3}\b[^:]*:\s*/i, "").trim();
  return stripped || "Microsoft could not answer this request.";
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
