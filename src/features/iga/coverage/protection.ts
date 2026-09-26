/**
 * S12c: a green or "protected" badge only when the server says every required
 * control is verified and current.
 *
 * Desired versus applied receipts arrive with A7. Until a response carries
 * that proof, the badge is unknown or not configured. Missing, unknown and
 * stale are never green.
 */

export type ProtectionTone = "neutral" | "warning" | "success";

export interface RequiredControl {
  required: boolean;
  /** Server state. "verified" is the only state that can contribute to green. */
  state: string;
  /** True only when the server says this control is current for the incarnation. */
  current: boolean;
}

export interface ProtectionBadgeModel {
  tone: ProtectionTone;
  label: "Protected" | "Unknown" | "Not configured";
  /** True only for the verified-and-current case. Tests assert this is false otherwise. */
  green: boolean;
}

const VERIFIED = "verified";

export function protectionBadge(controls: RequiredControl[] | null | undefined): ProtectionBadgeModel {
  const required = (controls ?? []).filter((c) => c.required);
  if (required.length === 0) {
    return { tone: "neutral", label: "Not configured", green: false };
  }
  const allVerified = required.every((c) => c.state === VERIFIED && c.current === true);
  if (allVerified) {
    return { tone: "success", label: "Protected", green: true };
  }
  return { tone: "warning", label: "Unknown", green: false };
}

/**
 * Runtime policy status until A6/A7. The placeholder endpoint returns
 * `not_configured` and no control list. No other status is treated as protected.
 */
export function policyStatusBadge(status: string | null | undefined): ProtectionBadgeModel {
  if (!status || status === "not_configured") {
    return { tone: "neutral", label: "Not configured", green: false };
  }
  if (status === "unknown") {
    return { tone: "warning", label: "Unknown", green: false };
  }
  return { tone: "warning", label: "Unknown", green: false };
}
