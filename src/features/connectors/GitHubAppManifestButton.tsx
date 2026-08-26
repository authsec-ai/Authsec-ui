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

import { useRef } from "react";
import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Where GitHub sends the operator back to. Must be an absolute URL. */
export const MANIFEST_REDIRECT_PATH = "/iga/integrations";

export function GitHubAppManifestButton({
  /** Personal account when null; an org slug creates the App under that org. */
  orgSlug,
  label = "Create GitHub App",
}: {
  orgSlug?: string | null;
  label?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const redirectUrl = `${window.location.origin}${MANIFEST_REDIRECT_PATH}`;

  // Only what discovery actually needs: read repository contents and metadata.
  // No webhook, since nothing consumes deliveries yet -- requesting permissions
  // or events we do not use is exactly what makes a security buyer say no.
  const manifest = {
    name: `AuthSec Discovery (${window.location.hostname})`,
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
    <form ref={formRef} method="post" action={action} target="_self">
      <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
      <Button type="submit" className="text-[length:var(--text-sm)] text-white">
        <Github className="mr-1.5 size-3.5" />
        {label}
      </Button>
    </form>
  );
}
