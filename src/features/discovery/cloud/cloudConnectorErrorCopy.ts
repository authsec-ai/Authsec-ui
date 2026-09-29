/**
 * Copy for a connector's persisted failure, keyed on the backend's stable
 * `last_error_code` (services/cloud_connector_error_code.go, migration 039).
 *
 * The codes are provider-neutral on purpose: "the role could not be assumed"
 * and "the workload identity pool does not match" are one problem in two
 * vendors' words, and an operator reading a mixed AWS/GCP list should not have
 * to learn both. An unknown or absent code falls back to the backend's own
 * prose — never an invented cause.
 */

/** Short enough for a table cell. The full prose stays available on hover. */
const SUMMARY: Record<string, string> = {
  auth_refused: "Access refused by the account",
  throttled: "Rate limited by the provider",
  timeout: "Provider did not respond",
  policy_blocked: "Blocked by a policy",
  deployment_misconfigured: "AuthSec configuration problem",
  external_id_not_issued: "External ID does not match",
  credential_invalid: "Credential is unusable",
  scope_invalid: "Connection settings are invalid",
};

/**
 * The phrase to show for a connector error, or `undefined` when there is no
 * error at all. Falls back to `lastError` when the code is missing or unknown,
 * so a newly-added backend sentinel degrades to prose rather than to silence.
 *
 * `lastError` is what decides whether there is anything to show. The code only
 * CLASSIFIES that prose, so a row carrying a code with no prose is stale data,
 * not a failure — and showing "Access refused by the account" against a working
 * connector is a worse answer than showing nothing.
 */
export function cloudConnectorErrorSummary(
  lastErrorCode: string | undefined,
  lastError: string | undefined,
): string | undefined {
  const raw = lastError?.trim();
  if (!raw) return undefined;
  const code = lastErrorCode?.trim();
  if (code && SUMMARY[code]) return SUMMARY[code];
  return raw;
}
