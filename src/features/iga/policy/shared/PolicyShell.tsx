/**
 * The shell every Policy view renders through: `ConsolePage`, the two views of
 * the Policy destination (Policies · AWS access) and the gate. With the policy
 * product off, or a backend without access policies, the view says so in words
 * (never an error, never an empty list).
 */

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBanner } from "@/components/console/status";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { usePolicyCapabilities } from "./usePolicyCapabilities";

const NAV = [
  { key: "policies", label: "Policies", to: "/iga/policy" },
  { key: "setup", label: "AWS access", to: "/iga/policy/setup" },
];

export function PolicyNav() {
  const { pathname } = useLocation();
  const active = pathname.startsWith("/iga/policy/setup") ? "setup" : "policies";
  return (
    <nav aria-label="Policy views" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-(--color-border-subtle)">
      {NAV.map((n) => (
        <Link
          key={n.key}
          to={n.to}
          aria-current={n.key === active ? "page" : undefined}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            n.key === active
              ? "border-(--color-primary) text-(--color-text)"
              : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
          )}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** The capability check itself failed: not the same as Policy being off. */
export function PolicyCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <DecisionBanner
      tone="danger"
      title="Could not check whether Policy is available"
      body="The request failed. This is not the same as Policy being off."
      actionLabel="Retry"
      onAction={onRetry}
    />
  );
}

export function PolicyUnavailable({ reason }: { reason?: string | null }) {
  return (
    <DecisionBanner
      tone="warning"
      title="Policy is not available on this server"
      body={
        <>
          Policies are turned off or still starting here{reason ? ` (${reason})` : ""}. Discovery and Connections are unaffected.
        </>
      }
      actionLabel="Open Discovery"
      actionHref="/iga/discovery"
    />
  );
}

export function PolicyShell({
  title,
  description,
  actions,
  nav = true,
  requires,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** The Policies · AWS access strip. Off for a focused flow (create, edit). */
  nav?: boolean;
  /** A feature the view needs beyond the policy product being on. */
  requires?: "access_policies";
  children: ReactNode;
}) {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const served = caps.state === "on" && (!requires || caps.feature(requires));
  return (
    <ConsolePage title={title} description={description} actions={served ? actions : undefined}>
      {nav ? <PolicyNav /> : null}
      {caps.state === "loading" ? (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Checking what this server provides…
        </p>
      ) : served ? (
        children
      ) : caps.state === "error" ? (
        <PolicyCheckFailed onRetry={caps.refetch} />
      ) : (
        <PolicyUnavailable reason={caps.state === "on" && requires ? caps.featureReason(requires) : caps.reason} />
      )}
    </ConsolePage>
  );
}
