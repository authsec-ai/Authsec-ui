/**
 * `/iga/policy`: the Overview when the policy product is on, the reference
 * preview (SPEC-console-revamp.md, "Policy — reserved destination") while it is
 * off or the backend predates it. A failed capability check is its own banner
 * with Retry, never the preview: a network error is not "Policy is off".
 */

import { ConsolePage } from "@/components/console/ConsolePage";
import { getWorkspaceId } from "@/utils/workspace";

import PolicyPreviewPage from "./PolicyPage";
import PolicyOverviewPage from "./overview/PolicyOverviewPage";
import { PolicyCheckFailed, usePolicyCapabilities } from "./shared";

export default function PolicyHome() {
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");
  if (caps.state === "loading") {
    return (
      <ConsolePage title="Policy" description="Decisions about what discovered identities may do.">
        <p role="status" className="text-sm text-(--color-text-muted)">
          Checking what this server provides…
        </p>
      </ConsolePage>
    );
  }
  if (caps.state === "error") {
    return (
      <ConsolePage title="Policy" description="Decisions about what discovered identities may do.">
        <PolicyCheckFailed onRetry={caps.refetch} />
      </ConsolePage>
    );
  }
  return caps.state === "on" ? <PolicyOverviewPage /> : <PolicyPreviewPage />;
}
