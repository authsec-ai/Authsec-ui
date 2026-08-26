/**
 * One-click GitHub App creation via GitHub's App-manifest flow.
 *
 * The manual path asks an operator to create an App by hand, pick the right
 * permissions, generate a private key, download it, then copy an App ID off one
 * page and paste a .pem into a textarea. Every one of those is a chance to get
 * it wrong, and two of them (App ID vs installation ID) fail identically and
 * opaquely much later.
 *
 * The manifest flow deletes all of it: we POST a manifest describing the App we
 * want, GitHub shows a pre-filled confirmation screen, and on approval hands
 * back a single-use code which the backend exchanges for the App id AND its
 * private key. Nothing passes through a clipboard.
 *
 * Mechanics worth knowing: this must be a real form POST to github.com — it is
 * a browser navigation, not an API call — and GitHub returns the operator to
 * `redirect_url` with `?code=`. The code is single-use and expires in an hour.
 */

import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GitHubAppManifestButton({
  /** Personal account when null; an org slug creates the App under that org. */
  orgSlug,
  label = "Create GitHub App",
}: {
  orgSlug?: string | null;
  label?: string;
}) {
  // Return to wherever the operator started, not a hardcoded route. The wizard
  // opens from more than one place, and sending everyone to a fixed path drops
  // them somewhere they did not begin — losing the step they were on.
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;

  // GitHub App names are GLOBALLY unique, across all of github.com — not unique
  // per account. A fixed name works exactly once and then fails for every
  // customer after the first, with an error that reads as our bug. The hostname
  // suffix is what keeps one deployment's name from colliding with another's.
  const appName = `AuthSec Discovery (${window.location.hostname})`;

  // Only what discovery actually needs: read repository contents and metadata.
  // No webhook, since nothing consumes deliveries yet -- requesting permissions
  // or events we do not use is exactly what makes a security buyer say no.
  const manifest = {
    name: appName,
    url: window.location.origin,
    description:
      "Discovers AI agents declared in your repositories — CI/CD workflows, agent manifests, MCP configuration, containers and infrastructure code. Read-only.",
    public: false,
    redirect_url: redirectUrl,
    default_permissions: { contents: "read", metadata: "read" },
    default_events: [] as string[],
  };

  const action = orgSlug
    ? `https://github.com/organizations/${encodeURIComponent(orgSlug)}/settings/apps/new`
    : "https://github.com/settings/apps/new";

  return (
    <form method="post" action={action} target="_self">
      <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
      <Button type="submit" className="text-[length:var(--text-sm)] text-white">
        <Github className="mr-1.5 size-3.5" />
        {label}
      </Button>
    </form>
  );
}
