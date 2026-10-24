/**
 * The AWS-account setup tabs on a connection's detail page: Enforcement, IaC
 * sources, Notifications and Settings. These used to live under Policy › AWS
 * access as one workspace-wide page; they now sit on the account they configure.
 *
 * Enforcement and IaC sources are scoped to THIS connection's AWS account.
 * Notifications and Settings are workspace-wide by nature (one Slack channel,
 * one enforcement mode for the whole workspace), so they render the full
 * section under a note that says the scope plainly.
 *
 * Every tab needs the policy product to be on. When it is off the tab says so in
 * words rather than an empty panel, so a reader is never left guessing.
 */

import type { ReactNode } from "react";

import type { Connection } from "@/app/api/connectionsApi";
import { useListDiscoveryConnectionsQuery } from "@/app/api/connectionsApi";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyUnavailable, usePolicyCapabilities } from "../policy/shared";
import { AccountEnforcement } from "../policy/setup/EnforcementSection";
import { AccountSources, SupportedForms } from "../policy/setup/IacSection";
import NotificationsSection from "../policy/setup/NotificationsSection";
import SettingsSection from "../policy/setup/SettingsSection";
import { githubConnections } from "../policy/setup/enforcementModel";
import { useSlackReturn } from "../policy/setup/slackModel";

/** One quiet line saying a tab's settings reach the whole workspace, not just this account. */
function WorkspaceScopeNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text-muted)">
      {children}
    </p>
  );
}

/** Policy-product gate shared by every setup tab. */
function Gate({ children }: { children: ReactNode }) {
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");
  if (caps.state === "loading") {
    return (
      <p role="status" className="text-sm text-(--color-text-muted)">
        Checking what this server provides…
      </p>
    );
  }
  if (caps.state !== "on") {
    return <PolicyUnavailable reason={caps.reason} />;
  }
  return <>{children}</>;
}

export function EnforcementTab({ c }: { c: Connection }) {
  return (
    <Gate>
      <AccountEnforcement connection={c} />
    </Gate>
  );
}

export function IacTab({ c }: { c: Connection }) {
  const github = githubConnections(useListDiscoveryConnectionsQuery().data);
  return (
    <Gate>
      <div className="space-y-4">
        <SupportedForms />
        <AccountSources account={c} githubList={github} />
      </div>
    </Gate>
  );
}

export function NotificationsTab() {
  const slack = useSlackReturn();
  return (
    <Gate>
      <div className="space-y-4">
        <WorkspaceScopeNote>
          Notifications are set once for the whole workspace — the same Slack channel and delivery targets apply to every connection.
        </WorkspaceScopeNote>
        <NotificationsSection slackReturn={slack.value} onHandled={slack.consume} />
      </div>
    </Gate>
  );
}

export function SettingsTab() {
  return (
    <Gate>
      <div className="space-y-4">
        <WorkspaceScopeNote>
          These settings apply to the whole workspace — the enforcement mode and deadlines are shared across every AWS account.
        </WorkspaceScopeNote>
        <SettingsSection />
      </div>
    </Gate>
  );
}
