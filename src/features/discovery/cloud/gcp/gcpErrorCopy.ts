import type { CloudOnboardingApiError } from "@/app/api/cloudDiscoveryApi";

/**
 * Turns a GCP connector error into a title and a body an operator can act on.
 *
 * The GCP equivalent of awsErrorCopy, and separate from it for the same reason
 * the two onboarding flows are separate: the faults mean different things. In
 * particular GCP has a fourth fault class, `constrained`, which the AWS copy
 * has no concept of.
 *
 * The backend already sends a `hint` written for exactly this purpose, so
 * every branch prefers it and only falls back to generic wording when there
 * isn't one. Nothing here re-derives a diagnosis the backend already made.
 */
export function gcpErrorCopy(
  apiErr: CloudOnboardingApiError | undefined,
  fallback: string,
): { title: string; body: string } {
  if (!apiErr) return { title: "Something went wrong", body: fallback };

  // A timeout proved nothing either way, and must never read as a refusal.
  if (apiErr.timeout) {
    return {
      title: "The request timed out",
      body:
        apiErr.hint ??
        "AuthSec was still talking to Google Cloud when the request timed out, so nothing was proven " +
          "either way. Check the connector list and try again if it still looks wrong.",
    };
  }

  switch (apiErr.fault) {
    // The distinction this whole class exists for: a perimeter or an
    // organization policy refused the read BY DESIGN. The reader may hold
    // every permission it needs. Telling someone to grant a role here sends
    // them to make a change that cannot work.
    case "constrained":
      return {
        title: "A policy is blocking this, not a missing permission",
        body:
          apiErr.hint ??
          "A VPC Service Controls perimeter or an organization policy refused this read. Whoever owns " +
            "that policy has to allow AuthSec through it — granting more IAM roles will not change it.",
      };

    case "customer_account":
      return {
        title: "Google Cloud refused the connection",
        body:
          apiErr.hint ??
          "Check that the reader service account still exists, that its role grants are still in place " +
            "at this scope, and that the workload identity pool and provider have not been removed.",
      };

    case "gcp":
      return {
        title: "Google rejected the request",
        body: apiErr.hint ?? "Often transient — try again in a moment.",
      };

    case "authsec":
      return {
        title: "This is an AuthSec-side problem",
        body:
          apiErr.hint ??
          "The deployment's federation issuer is not reachable from Google Cloud. Nothing in the " +
            "customer's project needs changing.",
      };

    default:
      return { title: "Something went wrong", body: apiErr.hint ?? apiErr.error ?? fallback };
  }
}
