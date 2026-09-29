import { describe, expect, it } from "vitest";

import { cloudConnectorErrorSummary } from "./cloudConnectorErrorCopy";

/**
 * The codes are a contract with the backend, which stamps them in
 * `services/cloud_connector_error_code.go` (pinned there by
 * TestConnectorErrorCodeWireValues). Nothing at build time connects the two
 * files, so a rename on either side degrades silently to raw prose rather than
 * failing — which is exactly the outcome the column was added to remove. These
 * tests are the tripwire.
 */
const BACKEND_CODES = [
  "auth_refused",
  "throttled",
  "timeout",
  "policy_blocked",
  "deployment_misconfigured",
  "external_id_not_issued",
  "credential_invalid",
  "scope_invalid",
] as const;

describe("cloudConnectorErrorSummary", () => {
  it.each(BACKEND_CODES)("maps %s to a phrase, not the raw prose", (code) => {
    const prose = "the role could not be assumed: User: arn:aws:iam::123:user/x is not authorized";
    const got = cloudConnectorErrorSummary(code, prose);
    expect(got).toBeDefined();
    expect(got).not.toBe(prose);
    // Short enough for a table cell — the whole point of having a code.
    expect(got!.length).toBeLessThan(45);
  });

  it("returns nothing when there is no error, whatever the code says", () => {
    // A code with no prose is stale data (a re-onboard clears last_error).
    // Showing "Access refused by the account" against a working connector is
    // worse than showing nothing at all.
    expect(cloudConnectorErrorSummary("auth_refused", "")).toBeUndefined();
    expect(cloudConnectorErrorSummary("auth_refused", undefined)).toBeUndefined();
    expect(cloudConnectorErrorSummary("auth_refused", "   ")).toBeUndefined();
    expect(cloudConnectorErrorSummary(undefined, undefined)).toBeUndefined();
  });

  it("falls back to the backend's prose for an unknown or absent code", () => {
    const prose = "something the console has never heard of";
    // A code this build does not know must degrade to the provider's own
    // words, never to silence — the backend may ship a sentinel first.
    expect(cloudConnectorErrorSummary("brand_new_code", prose)).toBe(prose);
    expect(cloudConnectorErrorSummary(undefined, prose)).toBe(prose);
    expect(cloudConnectorErrorSummary("", prose)).toBe(prose);
  });

  it("trims prose so whitespace never counts as an error", () => {
    expect(cloudConnectorErrorSummary(undefined, "  boom  ")).toBe("boom");
  });
});
