/**
 * The cells the Entra Agent ID views share, so an agent identity or blueprint
 * reads the same in every one: its name over where it came from, and its status.
 */

import { Link } from "react-router-dom";

import type { AzureIdentity } from "@/app/api/cloudDiscoveryApi";
import { StatusBadge } from "@/components/console/status";

import { agentDisplayName, agentOrigin, agentPageHref } from "./azureAgentSource";

/** The readable name (a link to its page; the full Azure name on hover) over where it came from. */
export function AgentNameCell({ identity, noun, strong = true }: { identity: AzureIdentity; noun: "blueprint" | "identity"; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <Link
        to={agentPageHref(identity)}
        onClick={(e) => e.stopPropagation()}
        title={identity.name}
        className={`block truncate text-(--color-text) hover:underline ${strong ? "font-medium" : ""}`}
      >
        {agentDisplayName(identity)}
      </Link>
      <p className="mt-0.5 truncate text-xs text-(--color-text-muted)">{agentOrigin(identity, noun)}</p>
    </div>
  );
}

export function AgentStatus({ enabled }: { enabled: boolean }) {
  return <StatusBadge tone={enabled ? "success" : "neutral"}>{enabled ? "Active" : "Disabled"}</StatusBadge>;
}
