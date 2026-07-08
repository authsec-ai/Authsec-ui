import { useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetProviderAppMutation } from "@/app/api/connectorsApi";
import config from "@/config";

/**
 * "Bring your own OAuth app" — configures this workspace's own OAuth
 * application for a provider (POST /authsec/connectors/providers/:key/app).
 * Write-only by design: the backend has no read endpoint for it (the secret
 * lives in Vault), so fields always start blank and saving overwrites.
 * Falls back to the deployment-wide env app when a workspace has none.
 */
export function ProviderAppForm({
  providerKey,
  providerName,
  onSaved,
}: {
  providerKey: string;
  providerName: string;
  onSaved?: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    `${config.VITE_API_URL}/authsec/connector-oauth/callback`,
  );
  const [setProviderApp, { isLoading }] = useSetProviderAppMutation();

  const submit = async () => {
    if (!clientId.trim() || !redirectUri.trim()) {
      toast.error("Client ID and redirect URI are required.");
      return;
    }
    try {
      await setProviderApp({
        providerKey,
        client_id: clientId.trim(),
        ...(clientSecret.trim() ? { client_secret: clientSecret.trim() } : {}),
        redirect_uri: redirectUri.trim(),
      }).unwrap();
      toast.success(`${providerName} OAuth app configured for this workspace.`);
      setClientId("");
      setClientSecret("");
      onSaved?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't save the OAuth app.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-muted-foreground">
        Register an OAuth app in your {providerName} account, then paste its credentials
        here. The secret is stored in AuthSec's vault and never shown again. Set the
        app's callback URL to the redirect URI below.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`pa-client-${providerKey}`}>Client ID</Label>
        <Input
          id={`pa-client-${providerKey}`}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Ov23li…"
          autoComplete="off"
          className="h-9 font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pa-secret-${providerKey}`}>Client secret</Label>
        <Input
          id={`pa-secret-${providerKey}`}
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="•••••••• (write-only)"
          autoComplete="new-password"
          className="h-9 font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`pa-redirect-${providerKey}`}>Redirect URI</Label>
        <Input
          id={`pa-redirect-${providerKey}`}
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          autoComplete="off"
          className="h-9 font-mono text-xs"
        />
      </div>
      <Button
        size="sm"
        onClick={() => void submit()}
        disabled={isLoading || !clientId.trim() || !redirectUri.trim()}
        className="w-full text-[length:var(--text-sm)] text-white"
      >
        {isLoading ? "Saving…" : "Save OAuth app"}
      </Button>
    </div>
  );
}
