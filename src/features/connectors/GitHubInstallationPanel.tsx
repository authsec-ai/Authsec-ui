/**
 * Bind a connector to an installed GitHub App on an organisation.
 *
 * Connector-scoped, and dependent on the workspace App from
 * GitHubAppRegistrationPanel — the backend refuses outright without it. Shared
 * by the Connectors dialog and the Discovery setup wizard.
 *
 * Worth knowing: the backend VERIFIES this installation by minting a real token
 * against GitHub before it stores anything. That makes this the step most likely
 * to fail, and the failure is informative (wrong id, App not installed there,
 * GitHub unreachable) — so the error is rendered inline rather than as a toast
 * that disappears before it can be acted on.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConnectGitHubAppMutation } from "@/app/api/connectorsApi";

export function GitHubInstallationPanel({
  connectorId,
  appRegistered,
  onConnected,
}: {
  /** Null until the connector exists; the bind cannot run without it. */
  connectorId: string | null;
  appRegistered: boolean;
  onConnected?: () => void;
}) {
  const [connectGitHubApp, { isLoading: connecting }] = useConnectGitHubAppMutation();
  const [installationId, setInstallationId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!connectorId || !installationId.trim()) return;
    setError("");
    try {
      await connectGitHubApp({
        connectorId,
        installation_id: installationId.trim(),
        ...(orgName.trim() ? { org_name: orgName.trim() } : {}),
      }).unwrap();
      toast.success("GitHub connected.");
      onConnected?.();
    } catch (err) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        "Could not connect that installation.";
      setError(msg);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          Install the App
        </a>{" "}
        on your organisation, choosing which repositories it may read. After installing you
        land on <span className="font-mono">github.com/settings/installations/</span>
        <span className="font-medium">&lt;number&gt;</span> — that trailing number is the
        installation ID.
      </p>

      {!appRegistered && (
        <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-[11px] text-(--color-warning-text)">
          Register the GitHub App first — connecting needs its private key, and without it
          this will fail.
        </p>
      )}

      <Input
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        placeholder="Organisation (optional, e.g. acme-eng)"
        className="h-9 text-xs"
        autoComplete="off"
      />
      <Input
        value={installationId}
        onChange={(e) => setInstallationId(e.target.value)}
        placeholder="Installation ID (e.g. 45678901)"
        className="h-9 font-mono text-xs"
        autoComplete="off"
      />

      {error && (
        <p className="rounded-md bg-(--color-danger-soft) px-2.5 py-1.5 text-[11px] text-(--color-danger-text)">
          {error}
        </p>
      )}

      <Button
        onClick={() => void submit()}
        disabled={connecting || !installationId.trim() || !appRegistered || !connectorId}
        className="w-full text-[length:var(--text-sm)] text-white"
      >
        <ExternalLink className="mr-1.5 size-3.5" />
        {connecting ? "Verifying with GitHub…" : "Connect GitHub"}
      </Button>
    </div>
  );
}
