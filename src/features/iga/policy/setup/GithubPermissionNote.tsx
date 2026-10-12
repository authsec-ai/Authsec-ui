/**
 * The GitHub App permission state of an IaC source (SPEC-iga-phase3-policy.md
 * §7.9, §9.3 S9 "shows the GitHub App permission still needed"): granted, still
 * waiting for the installation's owner to accept, or no App installation at
 * all. The words under `remedy` are the server's; the link is shown only when
 * it is a GitHub address.
 */

import { ExternalLink } from "lucide-react";

import type { GovIaCPermissions } from "@/app/api/igaPolicySetupApi";

import { isGitHubUrl } from "./enforcementModel";

export function GithubPermissionNote({ permissions }: { permissions: GovIaCPermissions }) {
  if (permissions.state === "granted") {
    return <p className="text-(--color-success-text)">The GitHub App can open pull requests in this repository.</p>;
  }
  const missing = permissions.missing ?? [];
  return (
    <div className="space-y-1 rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
      <p className="font-medium">
        {permissions.state === "integration_missing"
          ? "AuthSec cannot open pull requests yet: this GitHub connection has no App installation."
          : "AuthSec cannot open pull requests yet: GitHub still needs to approve the App's permissions."}
      </p>
      {permissions.remedy ? <p>{permissions.remedy}</p> : null}
      {missing.length > 0 ? (
        <p>
          Still needed: <span className="font-mono text-xs">{missing.join(", ")}</span>
        </p>
      ) : null}
      {isGitHubUrl(permissions.url) ? (
        <p>
          <a href={permissions.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
            Open the installation on GitHub
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>
      ) : null}
      <p className="text-xs">Until then a change that would be delivered by pull request waits, or can be delivered by Export.</p>
    </div>
  );
}
