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
 *
 * WHO OWNS THE APP IS DECIDED BY THE POST URL, not by anything on GitHub's
 * screen. That is the whole reason `orgSlug` exists: without it every App is
 * created under the operator's personal account, and since a private App can
 * only be installed on the account that owns it, no organisation can ever be
 * scanned. It is not a preference — it decides whether the flow can work at all.
 */

import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GitHubAppManifestButton({
  /** Personal account when empty; an org slug creates the App under that org. */
  orgSlug,
  /**
   * Whether the App may be installed on accounts other than its owner.
   *
   * GitHub calls this "public". A private App installs ONLY on the account that
   * owns it, which is the right default — but it also means one App cannot cover
   * several organisations. Opting in is what makes that possible.
   */
  allowOtherAccounts = false,
  label = "Create GitHub App",
  disabled = false,
}: {
  orgSlug?: string | null;
  allowOtherAccounts?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  // Return to wherever the operator started, not a hardcoded route. The wizard
  // opens from more than one place, and sending everyone to a fixed path drops
  // them somewhere they did not begin — losing the step they were on.
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;

  // GitHub App names are GLOBALLY unique, across all of github.com — not unique
  // per account. A fixed name works exactly once and then fails for every
  // customer after the first, with an error that reads as our bug. The owner
  // suffix is what keeps one customer's name from colliding with another's.
  const scope = orgSlug?.trim() || window.location.hostname;
  const appName = `AuthSec Discovery (${scope})`;

  // Only what discovery actually needs: read repository contents and metadata.
  // No webhook, since nothing consumes deliveries yet -- requesting permissions
  // or events we do not use is exactly what makes a security buyer say no.
  const manifest = {
    name: appName,
    url: window.location.origin,
    description:
      "Discovers AI agents declared in your repositories — CI/CD workflows, agent manifests, MCP configuration, containers and infrastructure code. Read-only.",
    public: allowOtherAccounts,
    redirect_url: redirectUrl,
    default_permissions: { contents: "read", metadata: "read" },
    default_events: [] as string[],
  };

  const slug = orgSlug?.trim();
  const action = slug
    ? `https://github.com/organizations/${encodeURIComponent(slug)}/settings/apps/new`
    : "https://github.com/settings/apps/new";

  return (
    <form method="post" action={action} target="_self">
      <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
      <Button
        type="submit"
        disabled={disabled}
        className="text-[length:var(--text-sm)] text-white"
      >
        <Github className="mr-1.5 size-3.5" />
        {label}
      </Button>
    </form>
  );
}
