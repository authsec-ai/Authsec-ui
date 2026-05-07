/**
 * `computeNextBestAction` — pure mapping from Application + Readiness
 * to the contextual NBA card displayed on Overview (and per-row "Next
 * action" column on the Applications list).
 *
 * The order matters: we walk the gates in priority order and return the
 * first non-OK gate's action. If every gate is OK and the application
 * isn't active yet → "Launch application". If active → "Open".
 */

import type { Application, NextBestAction, Readiness } from "../types";
import { isLaunched } from "./computeReadiness";

export function computeNextBestAction(
  application: Pick<Application, "id" | "state" | "setup_completed_at">,
  readiness: Readiness,
): NextBestAction {
  const launched = isLaunched(application);
  // Setup not started yet
  if (application.state === "needs_setup") {
    return {
      key: "install-protection",
      headline: "Install protection",
      body:
        "Add the AuthSec SDK so this application blocks unauthenticated calls and publishes its tool manifest.",
      primary: "Install protection",
      secondary: "Copy install prompt",
      noopConsequence:
        "If you do nothing, this application is unprotected — unauthenticated requests still reach your handler.",
    };
  }

  // Protection failed or not run yet
  if (readiness.protection.state === "err" || readiness.protection.state === "warn") {
    return {
      key: "run-protection-check",
      headline: "Run a protection check",
      body:
        "Once your SDK is deployed, prove AuthSec is blocking unauthenticated calls and that the manifest is publishing tools.",
      primary: "Run protection check",
      secondary: "View setup steps",
      noopConsequence:
        "If you do nothing, you can't trust that protection is actually live.",
    };
  }

  // Tools waiting for review
  if (readiness.tools.state === "warn" || readiness.tools.state === "err") {
    return {
      key: "review-tools",
      headline: "Review tools",
      body:
        "AuthSec discovered tools from the SDK manifest. New tools are private and denied by default. Review them to decide which access labels grant access.",
      primary: "Review tools",
      secondary: "Keep all risky tools blocked",
      noopConsequence:
        "If you do nothing, all discovered tools stay denied — launch stays blocked.",
    };
  }

  // Access not configured
  if (readiness.access.state === "warn" || readiness.access.state === "err") {
    return {
      key: "roll-out-access",
      headline: "Roll out access",
      body:
        "Choose what first-time users get by default. Once mapped, you can add exceptions for pilots, admins, or temporary access.",
      primary: "Roll out access",
      secondary: "Keep no default",
      noopConsequence:
        "If you do nothing, no first-time user has access — only role-assigned users can call any tool.",
    };
  }

  // Clients pending
  if (readiness.clients.state === "warn" || readiness.clients.state === "err") {
    return {
      key: "approve-client",
      headline: "Approve a client",
      body:
        "Clients that need to call this application are waiting on redirect approval or registration.",
      primary: "Open Clients",
      secondary: "Allow dynamic registration",
      noopConsequence:
        "If you do nothing, pending clients can't connect at all.",
    };
  }

  // Test not run
  if (readiness.test.state === "warn" || readiness.test.state === "err") {
    return {
      key: "test-access",
      headline: "Run protection test",
      body:
        "Run the backend test-login check to verify OAuth wiring, SDK policy state, and unmapped tool count.",
      primary: "Test access",
      noopConsequence:
        "If you do nothing, SDK or OAuth wiring issues may surface only after launch.",
    };
  }

  // Ready to launch
  if (!launched && readiness.launch.state !== "err") {
    return {
      key: "launch-application",
      headline: "Launch application",
      body:
        "All gates pass. Publish runtime policy and start enforcing access.",
      primary: "Launch application",
      secondary: "Re-run final checks",
    };
  }

  // Launch blocked despite passing top-level gates
  if (readiness.launch.state === "err") {
    return {
      key: "open-launch",
      headline: "Resolve launch blockers",
      body: readiness.launch.detail ?? "Open the Launch page to see remaining blockers.",
      primary: "Open Launch",
    };
  }

  // Active and healthy → keep an eye on activity
  return {
    key: "open",
    headline: "Application is live",
    body: "Watch Activity for post-launch drift events.",
    primary: "View activity",
    secondary: "Open application",
  };
}

/** Short label used in the Applications list table "Next action" column. */
export function nextActionLabel(nba: NextBestAction): string {
  return nba.primary;
}

/** Route this NBA's primary CTA navigates to. */
export function nextActionHref(
  applicationId: string,
  nba: NextBestAction,
): string {
  switch (nba.key) {
    case "install-protection":
    case "run-protection-check":
      return `/applications/${applicationId}/setup`;
    case "review-tools":
    case "review-new-tools":
      return `/applications/${applicationId}/tools`;
    case "roll-out-access":
      return `/applications/${applicationId}/access`;
    case "approve-client":
      return `/applications/${applicationId}/clients`;
    case "test-access":
      return `/applications/${applicationId}/test`;
    case "launch-application":
    case "open-launch":
      return `/applications/${applicationId}/launch`;
    case "open":
    default:
      return `/applications/${applicationId}/overview`;
  }
}
