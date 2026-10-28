import type { PolicyLifecycle } from "./policyApi";

/** What each runtime-policy status means. Hover copy on the Policies screen. */
export const LIFECYCLE_HELP: Record<PolicyLifecycle, string> = {
  draft:
    "This is a working copy. Edit the rules, approve them, then publish. Nothing is sent until you publish.",
  validated:
    "The draft compiled. It still needs a simulation and an approval before it can be published.",
  simulated: "The draft was simulated. Approve it to sign off, then publish to send it.",
  approved:
    "Approved means these rules are signed off. They are not sent to collectors until you publish. Editing the rules starts a new draft and clears this approval.",
  published:
    "Published means collectors are asked to follow this revision. To change it, edit the rules and save. That starts a new draft. This published copy stays in effect until you approve and publish the new draft.",
  superseded: "A newer revision replaced this one.",
  revoked: "This policy was revoked and is no longer sent.",
};

export function lifecycleHelp(state: string | undefined): string | undefined {
  if (!state) return undefined;
  return LIFECYCLE_HELP[state as PolicyLifecycle];
}
