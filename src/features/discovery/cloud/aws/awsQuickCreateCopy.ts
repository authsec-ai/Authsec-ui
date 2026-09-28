/**
 * Copy for the Quick Create flow, keyed on the backend's stable aws_onb_*
 * codes (services/cloud_aws_quickcreate.go). One entry per code so the
 * console, the CloudFormation stack event the customer reads, and the logs all
 * describe the same failure the same way. An unknown code falls back to the
 * backend's own message — never an invented cause.
 */

export interface QuickCreateCopy {
  title: string;
  body: string;
  /** Whether "Start over" (a new session) is the right next step. */
  restart: boolean;
}

const COPY: Record<string, QuickCreateCopy> = {
  aws_onb_not_configured: {
    title: "Automatic setup isn't available on this deployment",
    body: "Use manual setup instead.",
    restart: false,
  },
  aws_onb_invalid_regions: {
    title: "Check the AWS Regions you selected",
    body: "",
    restart: false,
  },
  aws_onb_session_store_unavailable: {
    title: "Automatic setup is temporarily unavailable",
    body: "This is on AuthSec's side, not yours. Try again in a moment, or use manual setup.",
    restart: false,
  },
  aws_onb_template_missing: {
    title: "The AuthSec template isn't available right now",
    body: "This is on AuthSec's side, not yours. Use manual setup, or try again later.",
    restart: false,
  },
  aws_onb_unknown_link: {
    title: "This launch link expired or was changed",
    body: "The stack reached AuthSec with values that don't match a live launch. Values AuthSec fills in must not be edited. Start again — the stack rolled back and removed its role.",
    restart: true,
  },
  aws_onb_wrong_workspace: {
    title: "This launch link isn't valid",
    body: "Start again from this workspace.",
    restart: true,
  },
  aws_onb_region_mismatch: {
    title: "The stack was created in a different AWS Region",
    body: "Don't switch Regions in the AWS console after opening the link. Start again.",
    restart: true,
  },
  aws_onb_account_mismatch: {
    title: "The role and the stack are in different AWS accounts",
    body: "Start again, signed in to the account you want to connect.",
    restart: true,
  },
  aws_onb_invalid_request: {
    title: "The stack sent AuthSec an invalid role",
    body: "Start again without editing the stack's parameters.",
    restart: true,
  },
  aws_onb_link_used: {
    title: "This launch link was already used",
    body: "Each link connects one account once. Start again for another launch.",
    restart: true,
  },
  aws_onb_too_many_attempts: {
    title: "Too many attempts for this launch link",
    body: "Start again.",
    restart: true,
  },
  aws_onb_assume_denied: {
    title: "AuthSec couldn't assume the role",
    body: "AWS refused the connection. Check that the stack's ExternalId and the AuthSec principal weren't changed, and that no SCP blocks sts:AssumeRole. The stack rolled back; start again.",
    restart: true,
  },
  aws_onb_authsec_unavailable: {
    title: "AuthSec couldn't finish setup",
    body: "This is on AuthSec's side, not yours. The stack rolled back; start again in a few minutes.",
    restart: true,
  },
};

export function quickCreateErrorCopy(code: string | undefined, message: string | undefined): QuickCreateCopy {
  const known = code ? COPY[code] : undefined;
  if (!known) {
    return { title: "Something went wrong", body: message ?? "Start again, or use manual setup.", restart: true };
  }
  // Region errors carry the specific region in the backend's message.
  return known.body ? known : { ...known, body: message ?? "" };
}

/** Why one scan region is not reachable, in words. */
export function regionProbeCopy(reason: string | undefined): string {
  switch (reason) {
    case "region_disabled":
      return "Not enabled in your AWS account — enable this Region, or remove it from scope.";
    case "blocked":
      return "Blocked — an SCP or permissions boundary denies access in this Region.";
    case "timeout":
      return "Couldn't check in time — the next scan will try again.";
    default:
      return "Couldn't be checked — the next scan will try again.";
  }
}

/** Old stack name derived from a replaced role, when AuthSec named both. */
export function previousStackHint(previousRoleArn: string): string {
  const name = previousRoleArn.split("/").pop() ?? "";
  const m = /^AuthSecCloudDiscovery-([a-z2-7]{8})$/.exec(name);
  return m
    ? `delete its stack, AuthSec-Discovery-${m[1]}`
    : "delete the CloudFormation stack you created for it";
}
