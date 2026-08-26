/**
 * Step 1: the ONE GitHub App this workspace owns.
 *
 * Workspace-level, not per-organisation. One App is installed on as many
 * organisations as the customer likes, and each installation becomes its own
 * discovery source — which is why this step disappears entirely on every run
 * after the first.
 *
 * The private key goes straight to Vault. Nothing here ever reads it back:
 * `useGetGitHubAppQuery` returns only whether an App is configured and its
 * (non-secret) id.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Building2, Check, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDeleteGitHubAppMutation,
  useDescribeGitHubAppQuery,
  useListDiscoverySourcesQuery,
  useSetGitHubAppMutation,
} from "@/app/api/discoveryApi";
import { GitHubAppManifestButton } from "./GitHubAppManifestButton";

export function GitHubAppPanel({
  registered,
  registeredAppId,
  onChanged,
}: {
  registered: boolean;
  registeredAppId?: string;
  onChanged?: () => void;
}) {
  const [setGitHubApp, { isLoading: saving }] = useSetGitHubAppMutation();
  const [deleteGitHubApp, { isLoading: deleting }] = useDeleteGitHubAppMutation();
  const [appId, setAppId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [keyFileName, setKeyFileName] = useState("");
  const [error, setError] = useState("");
  // Manual entry is the fallback, not the default -- see the manifest button.
  const [showManual, setShowManual] = useState(false);
  // Offered in the registered state too: an App's owner is fixed at creation, so
  // moving from a personal App to an organisation's App means creating another.
  const [showCreate, setShowCreate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Who will OWN the App. This is not a preference: GitHub decides the owner
  // from the URL the manifest is POSTed to, and a private App can only be
  // installed on the account that owns it. An App created under a personal
  // account can therefore never scan an organisation — the organisation list
  // stays empty forever, with nothing on screen explaining why.
  const [owner, setOwner] = useState<"org" | "personal">("org");
  const [orgSlug, setOrgSlug] = useState("");
  // GitHub calls this "public". Off means the App installs only on its owner,
  // which is the right default. On is what lets one App cover several
  // organisations, which is what the "Install on another organisation" action
  // in the next step needs in order to do anything.
  const [allowOtherAccounts, setAllowOtherAccounts] = useState(false);

  const orgSlugValid = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(orgSlug.trim());

  // What GitHub says the stored App actually is. Turns a blind form into a
  // confirmed one: a wrong App ID is visible here, at the moment of entry,
  // instead of surfacing later as an opaque token-minting failure.
  const { data: appInfo } = useDescribeGitHubAppQuery(undefined, { skip: !registered });

  // How many organisations are bound to the CURRENT App. The server refuses to
  // swap the App while any exist; knowing that here means the operator is
  // stopped before creating an App on GitHub we would then decline to store,
  // which would leave them an orphan App to clean up by hand.
  const { data: sources } = useListDiscoverySourcesQuery({ kind: "repo_scan" }, {
    skip: !registered,
  });
  const boundOrganisations = (sources ?? []).map((src) => src.display_name);
  const appChangeBlocked = registered && boundOrganisations.length > 0;

  const submit = async () => {
    if (!appId.trim() || !privateKey.trim()) {
      setError("App ID and private key are both required.");
      return;
    }
    setError("");
    try {
      await setGitHubApp({ app_id: appId.trim(), private_key: privateKey.trim() }).unwrap();
      toast.success("GitHub App registered for this workspace.");
      // Clear the key material from component state the moment it is stored;
      // there is no reason to keep a private key in a React tree.
      setPrivateKey("");
      setKeyFileName("");
      setShowManual(false);
      setShowCreate(false);
      onChanged?.();
    } catch (err) {
      // Inline, not a toast: this is a field-level failure and the operator
      // needs it next to the fields they must correct.
      setError(
        (err as { data?: { error?: string } })?.data?.error ??
          "Could not register the GitHub App.",
      );
    }
  };

  const remove = async () => {
    try {
      await deleteGitHubApp().unwrap();
      toast.success("GitHub App removed from this workspace.");
      setConfirmRemove(false);
      onChanged?.();
    } catch (err) {
      const data = (err as { data?: { error?: string } })?.data;
      setConfirmRemove(false);
      setError(data?.error ?? "Could not remove the GitHub App.");
    }
  };

  return (
    <div className="space-y-3">
      {registered && (
        <div className="rounded-md bg-(--color-success-soft) px-2.5 py-2 text-[11.5px] text-(--color-success-text)">
          <p className="flex items-center gap-1.5 font-medium">
            <Check className="size-3.5 shrink-0" />
            {appInfo?.name ?? `App ${registeredAppId}`} is registered
          </p>
          {appInfo && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3" />
                {appInfo.owner}
              </span>
              <span>·</span>
              <span>App {appInfo.app_id}</span>
              <span>·</span>
              <span>
                {Object.entries(appInfo.permissions)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              </span>
            </p>
          )}
        </div>
      )}

      {(!registered || showCreate) && (
        <div className="space-y-3 rounded-md border px-3 py-3">
          <div>
            <p className="text-[12px] font-medium">Create the App automatically</p>
            <p className="text-[11px] text-muted-foreground">
              GitHub shows you a pre-filled confirmation screen with the right permissions
              already set — read-only access to repository contents, no webhook. Approving
              it sends the App&rsquo;s credentials straight here. Nothing to copy.
            </p>
          </div>

          {/* The choice that decides whether organisations can be scanned at
              all. It has to be made HERE, before the App exists, because GitHub
              takes the owner from the URL this form posts to and an App's owner
              cannot be changed afterwards. */}
          <div className="space-y-2">
            <p className="text-[11.5px] font-medium">Who should own the App?</p>
            <RadioGroup
              value={owner}
              onValueChange={(v) => setOwner(v as "org" | "personal")}
              className="gap-1.5"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="org" id="owner-org" className="mt-0.5" />
                <Label htmlFor="owner-org" className="cursor-pointer text-[11.5px] font-normal">
                  A GitHub organisation
                  <span className="block text-[11px] text-muted-foreground">
                    Choose this to scan an organisation&rsquo;s repositories. You need owner
                    rights on it.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="personal" id="owner-personal" className="mt-0.5" />
                <Label
                  htmlFor="owner-personal"
                  className="cursor-pointer text-[11.5px] font-normal"
                >
                  My personal account
                  <span className="block text-[11px] text-muted-foreground">
                    Only your own repositories. No organisation can be scanned by an App
                    owned personally.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {owner === "org" && (
            <div className="space-y-1">
              <Input
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="organisation name, e.g. acme-corp"
                className="h-9 text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              {/* The slug, not the display name. github.com/orgs/<this>. We
                  cannot look it up for them: there is no App yet, so there is
                  nothing to authenticate a lookup with. A wrong slug fails on
                  GitHub's own page, which at least fails visibly and early. */}
              <p className="text-[11px] text-muted-foreground">
                As it appears in the URL — <span className="font-mono">github.com/orgs/</span>
                <span className="font-medium">&lt;this&gt;</span>.
              </p>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={allowOtherAccounts}
              onCheckedChange={(v) => setAllowOtherAccounts(v === true)}
              className="mt-0.5"
            />
            <span className="text-[11px]">
              Allow installing this App on other organisations too
              {/* Worth stating both ways round. Left off, "Install on another
                  organisation" in the next step cannot work and looks broken.
                  Turned on, the App becomes public on GitHub, and anyone who
                  finds it could install it on an account they control -- which
                  would put their installation in this workspace's list. */}
              <span className="block text-muted-foreground">
                Needed to cover more than one account with a single App. It also makes the
                App public on GitHub, so anyone who finds it could install it on their own
                organisation and have it appear in your list. Leave off if one account is
                enough.
              </span>
            </span>
          </label>

          <GitHubAppManifestButton
            orgSlug={owner === "org" ? orgSlug : null}
            allowOtherAccounts={allowOtherAccounts}
            disabled={(owner === "org" && !orgSlugValid) || appChangeBlocked}
          />
          {owner === "org" && orgSlug.trim() !== "" && !orgSlugValid && (
            <p className="text-[11px] text-(--color-danger-text)">
              That does not look like a GitHub organisation name — letters, numbers and
              hyphens only.
            </p>
          )}
          {owner === "org" && orgSlug.trim() === "" && (
            <p className="text-[11px] text-muted-foreground">
              Enter the organisation name to continue.
            </p>
          )}
          {appChangeBlocked ? (
            /* Blocked HERE rather than after the round trip. Refusing on the way
               back would mean they had already created the App on GitHub and now
               have an orphan to delete by hand. */
            <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-[11px] text-(--color-warning-text)">
              Remove {boundOrganisations.join(", ")} first. Each was installed on App{" "}
              {registeredAppId ?? "the current App"} and cannot be read by a different one,
              so replacing the App now would break them.
            </p>
          ) : (
            registered && (
              <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-[11px] text-(--color-warning-text)">
                This replaces the App registered above. Nothing is using it yet, so nothing
                breaks.
              </p>
            )
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md bg-(--color-danger-soft) px-2.5 py-1.5 text-[11px] text-(--color-danger-text)">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {registered && !showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            Create a new App for an organisation
          </button>
        )}
        {!showManual && (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            {registered ? "Register a different App by hand" : "Or register an existing App by hand"}
          </button>
        )}
        {registered && (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2"
          >
            <Trash2 className="size-3" />
            Remove this App
          </button>
        )}
      </div>

      {showManual && (
        <div className="space-y-2 rounded-md border px-3 py-3">
          <p className="text-[11px] text-muted-foreground">
            One-time per workspace.{" "}
            <a
              href="https://github.com/settings/apps/new"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Create a GitHub App
            </a>{" "}
            with <span className="font-medium">Contents: Read-only</span>, generate a private
            key, then paste both below. The key goes straight to AuthSec&rsquo;s vault.
          </p>

          {/* The App ID and the installation ID are different numbers from
              different pages, and mixing them up is the easiest mistake to make
              here -- the failure surfaces much later, as an unhelpful
              token-minting error. Say plainly where each one lives. */}
          <p className="text-[11px] text-muted-foreground">
            The App ID is on the App&rsquo;s own settings page
            (github.com/settings/apps/&lt;name&gt;), labelled{" "}
            <span className="font-medium">App ID</span>. It is{" "}
            <span className="font-medium">not</span> the number in an installation URL.
          </p>

          <Input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="App ID (e.g. 123456)"
            className="h-9 font-mono text-xs"
            autoComplete="off"
          />
          <textarea
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY----- (or upload the .pem below)"
            rows={3}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px]"
            spellCheck={false}
          />

          <div className="flex flex-wrap items-center gap-2">
            {/* Reads the .pem in the browser and fills the field above. The file
                is never uploaded anywhere — it leaves in the same request body a
                paste would produce — which keeps handling identical while
                removing a copy-paste step people get wrong (a truncated key, or
                a missing BEGIN/END line, fails much later and unhelpfully at
                token-minting time). */}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/50">
              <Upload className="size-3.5" />
              Upload .pem
              <input
                type="file"
                accept=".pem,.key,application/x-pem-file,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const text = String(reader.result ?? "").trim();
                    if (!text.includes("PRIVATE KEY")) {
                      toast.error(
                        "That file does not look like a PEM private key — no BEGIN PRIVATE KEY line.",
                      );
                      return;
                    }
                    setPrivateKey(text);
                    setKeyFileName(file.name);
                  };
                  reader.onerror = () => toast.error("Could not read that file.");
                  reader.readAsText(file);
                  // Reset so re-picking the same file fires onChange again.
                  e.target.value = "";
                }}
              />
            </label>
            {keyFileName && (
              <span className="text-[11px] text-muted-foreground">loaded {keyFileName}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void submit()}
              disabled={saving || !appId.trim() || !privateKey.trim()}
            >
              {saving ? "Saving…" : registered ? "Replace GitHub App" : "Save GitHub App"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowManual(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this GitHub App?</DialogTitle>
            {/* Both halves matter. The first is what breaks here; the second is
                what does NOT happen, and is the reason removing an App can look
                like it failed — the App is still listed on github.com
                afterwards, because only its owner can delete it there. */}
            <DialogDescription>
              AuthSec forgets this App and its private key. You can register one again
              later, but that means running the App step from the start.
              <br />
              <br />
              The App itself is not deleted from GitHub. If you want it gone there too,
              delete it from your GitHub account or organisation settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove App"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
