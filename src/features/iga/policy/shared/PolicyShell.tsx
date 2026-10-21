/**
 * The shell every Policy view renders through: `ConsolePage` and the capability
 * gate. With the policy product off, or a backend without access policies, the
 * view says so in words (never an error, never an empty list). The AWS-account
 * setup (enforcement, IaC, notifications, settings) now lives on each AWS
 * connection's detail page, so Policy is a single view and carries no tab strip.
 */

import type { ReactNode } from "react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { PageAbout } from "@/components/console/PageAbout";
import { DecisionBanner } from "@/components/console/status";
import { getWorkspaceId } from "@/utils/workspace";

import { usePolicyCapabilities } from "./usePolicyCapabilities";

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
          Policies are turned off or still starting here{reason ? ` (${reason})` : ""}. Discovery and Accounts are unaffected.
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
  requires,
  about,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A feature the view needs beyond the policy product being on. */
  requires?: "access_policies";
  /** The page's one-line "What is this page?", shown whether or not Policy is served here. */
  about?: ReactNode;
  children: ReactNode;
}) {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const served = caps.state === "on" && (!requires || caps.feature(requires));
  return (
    <ConsolePage title={title} description={description} actions={served ? actions : undefined}>
      {about ? <PageAbout>{about}</PageAbout> : null}
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
