/**
 * An old bookmark of a retired governance screen (SPEC-console-revamp.md
 * §Removal contract): with the policy product on it lands on its replacement
 * (SPEC-iga-phase3-policy.md §9.2), with it off on the retirement state.
 * The query string is carried, never dropped.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { getWorkspaceId } from "@/utils/workspace";

import { ConsolePage } from "@/components/console/ConsolePage";

import { PolicyCheckFailed, usePolicyCapabilities } from "./shared";

export default function GatedRedirect({ to, retired }: { to: string; retired: ReactNode }) {
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");
  const { search } = useLocation();
  if (caps.state === "loading") return null;
  if (caps.state === "error") {
    return (
      <ConsolePage title="Policy" description="This page has moved.">
        <PolicyCheckFailed onRetry={caps.refetch} />
      </ConsolePage>
    );
  }
  if (caps.state === "on") {
    // The replacement's own query (attention=1) wins over what the old URL carried.
    const [path, own = ""] = to.split("?");
    const merged = new URLSearchParams(search);
    for (const [k, v] of new URLSearchParams(own)) merged.set(k, v);
    const qs = merged.toString();
    return <Navigate to={qs ? `${path}?${qs}` : path} replace />;
  }
  return <>{retired}</>;
}
