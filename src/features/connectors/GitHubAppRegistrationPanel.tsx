/**
 * Register the workspace's GitHub App: App ID + private-key PEM.
 *
 * Workspace-scoped, not connector-scoped — one App serves every GitHub
 * connector in the workspace. Shared by the Connectors dialog and the Discovery
 * setup wizard so the two entry points cannot drift; they did drift before, and
 * the result was one path that worked and one that could only fail.
 *
 * The private key goes straight to Vault. Nothing here ever reads it back —
 * `useGetProviderAppQuery` returns only whether an App is configured and its
 * (non-secret) id.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetGitHubAppMutation } from "@/app/api/connectorsApi";

export function GitHubAppRegistrationPanel({
  registered,
  registeredAppId,
  onRegistered,
}: {
  /** From useGetProviderAppQuery("github") — drives the done state. */
  registered: boolean;
  registeredAppId?: string;
  onRegistered?: () => void;
}) {
  const [setGitHubApp, { isLoading: saving }] = useSetGitHubAppMutation();
  const [appId, setAppId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [keyFileName, setKeyFileName] = useState("");
  const [error, setError] = useState("");

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
      onRegistered?.();
    } catch (err) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        "Could not register the GitHub App.";
      // Inline, not a toast: this is a field-level failure and the user needs it
      // next to the fields they must correct.
      setError(msg);
    }
  };

  return (
    <div className="space-y-2">
      {registered && (
        <p className="flex items-center gap-1.5 rounded-md bg-(--color-success-soft) px-2.5 py-1.5 text-[11.5px] text-(--color-success-text)">
          <Check className="size-3.5 shrink-0" />
          App {registeredAppId} is registered for this workspace. Saving again replaces it.
        </p>
      )}

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

      {/* The App ID and the installation ID are different numbers from different
          pages, and mixing them up is the easiest mistake to make here -- the
          failure surfaces much later, as an unhelpful token-minting error. Say
          plainly where each one lives. */}
      <p className="text-[11px] text-muted-foreground">
        The App ID is on the App&rsquo;s own settings page
        (github.com/settings/apps/&lt;name&gt;), labelled{" "}
        <span className="font-medium">App ID</span>. It is{" "}
        <span className="font-medium">not</span> the number in the installation URL — that
        one comes next.
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
        {/* Reads the .pem in the browser and fills the field above. The file is
            never uploaded anywhere — it leaves in the same request body a paste
            would produce — which keeps handling identical while removing a
            copy-paste step people get wrong (a truncated key, or a missing
            BEGIN/END line, fails much later and unhelpfully at token-minting
            time). */}
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

      {error && (
        <p className="rounded-md bg-(--color-danger-soft) px-2.5 py-1.5 text-[11px] text-(--color-danger-text)">
          {error}
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={() => void submit()}
        disabled={saving || !appId.trim() || !privateKey.trim()}
      >
        {saving ? "Saving…" : registered ? "Replace GitHub App" : "Save GitHub App"}
      </Button>
    </div>
  );
}
