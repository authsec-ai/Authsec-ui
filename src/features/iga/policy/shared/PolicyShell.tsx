/**
 * The shell every Policy view renders through (SPEC-iga-phase3-policy.md §9):
 * `ConsolePage` plus the secondary views of the one Policy destination —
 * Overview · Findings · Policies · Approvals · Deployments · Setup — and the
 * gate: with the policy product off the view says so in words (never an error,
 * never an empty list), and a route reached against a backend that predates
 * Phase 3 renders "not available".
 *
 * Approvals is offered only while the server has not refused `governance:approve`.
 */

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBanner } from "@/components/console/status";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { usePolicyPermission } from "./policyAccess";
import { usePolicyCapabilities } from "./usePolicyCapabilities";

interface NavItem {
  key: string;
  label: string;
  to: string;
  /** Path prefixes that keep this item current. */
  match: string[];
  needs?: "governance:approve";
}

const NAV: NavItem[] = [
  { key: "overview", label: "Overview", to: "/iga/policy", match: [] },
  { key: "findings", label: "Findings", to: "/iga/policy/findings", match: ["/iga/policy/findings"] },
  { key: "policies", label: "Policies", to: "/iga/policy/policies", match: ["/iga/policy/policies", "/iga/policy/new"] },
  { key: "approvals", label: "Approvals", to: "/iga/policy/approvals", match: ["/iga/policy/approvals", "/iga/policy/reviews"], needs: "governance:approve" },
  { key: "deployments", label: "Deployments", to: "/iga/policy/deployments", match: ["/iga/policy/deployments"] },
  { key: "setup", label: "Setup", to: "/iga/policy/setup", match: ["/iga/policy/setup"] },
];

function currentKey(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/iga/policy") return "overview";
  for (const n of NAV) if (n.match.some((m) => p === m || p.startsWith(`${m}/`))) return n.key;
  return "";
}

export function PolicyNav() {
  const { pathname } = useLocation();
  const approve = usePolicyPermission("governance:approve");
  const active = currentKey(pathname);
  const items = NAV.filter((n) => !n.needs || approve.offered);
  return (
    <nav aria-label="Policy views" className="flex gap-1 overflow-x-auto border-b border-(--color-border-subtle)">
      {items.map((n) => (
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

/** The capability check itself failed: not the same as Policy being off, so no preview or "retired" page is shown in its place. */
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
          The policy product is turned off or still starting here{reason ? ` (${reason})` : ""}. Discovery and Connections are unaffected.
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
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** The secondary-view strip. Off for a focused flow (the new-policy flow, an owner's review page). */
  nav?: boolean;
  children: ReactNode;
}) {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  return (
    <ConsolePage title={title} description={description} actions={caps.state === "on" ? actions : undefined}>
      {nav ? <PolicyNav /> : null}
      {caps.state === "loading" ? (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Checking what this server provides…
        </p>
      ) : caps.state === "on" ? (
        children
      ) : caps.state === "error" ? (
        <PolicyCheckFailed onRetry={caps.refetch} />
      ) : (
        <PolicyUnavailable reason={caps.reason} />
      )}
    </ConsolePage>
  );
}
