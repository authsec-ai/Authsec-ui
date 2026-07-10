import { useState } from "react";
import { toast } from "react-hot-toast";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useListConnectorProvidersQuery,
  useCreateConnectorMutation,
  useStartConnectorOAuthMutation,
} from "@/app/api/connectorsApi";
import {
  useSetGitHubAppMutation,
  useConnectGitHubAppMutation,
} from "@/app/api/connectorsApi";
import { ConnectorBadge } from "./ConnectorBadge";
import { ProviderAppForm } from "./ProviderAppForm";
import { providerMeta } from "./providerMeta";

type Step = "provider" | "connect";

export function AddConnectorDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const {
    data: providers,
    isLoading: providersLoading,
    isError: providersError,
    refetch: refetchProviders,
  } = useListConnectorProvidersQuery();
  const [createConnector, { isLoading: creating }] = useCreateConnectorMutation();
  const [startOAuth, { isLoading: connecting }] = useStartConnectorOAuthMutation();
  const [setGitHubApp, { isLoading: savingApp }] = useSetGitHubAppMutation();
  const [connectGitHubApp, { isLoading: connectingApp }] = useConnectGitHubAppMutation();

  const [step, setStep] = useState<Step>("provider");
  const [providerKey, setProviderKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [agentAccessible, setAgentAccessible] = useState(false);
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [showAppForm, setShowAppForm] = useState(false);
  const [scopes, setScopes] = useState<string[]>([]);
  // GitHub-App path (F1/D2).
  const [ghShowRegister, setGhShowRegister] = useState(false);
  const [ghAppId, setGhAppId] = useState("");
  const [ghPrivateKey, setGhPrivateKey] = useState("");
  const [ghInstallationId, setGhInstallationId] = useState("");
  const [ghOrgName, setGhOrgName] = useState("");

  const selectedProvider = providers?.find((p) => p.key === providerKey) ?? null;

  const reset = () => {
    setStep("provider");
    setProviderKey(null);
    setName("");
    setAgentAccessible(false);
    setConnectorId(null);
    setScopes([]);
    setShowAppForm(false);
    setGhShowRegister(false);
    setGhAppId("");
    setGhPrivateKey("");
    setGhInstallationId("");
    setGhOrgName("");
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const toggleScope = (scope: string) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  const handleContinue = async () => {
    if (!selectedProvider) {
      toast.error("Choose a provider to continue.");
      return;
    }
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    try {
      const connector = await createConnector({
        provider_key: selectedProvider.key,
        name: name.trim(),
        enabled: true,
        agent_accessible: agentAccessible,
      }).unwrap();
      setConnectorId(connector.id);
      setScopes(selectedProvider.oauth_default_scopes ?? []);
      setStep("connect");
      onCreated();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create connector.");
    }
  };

  const handleConnect = async () => {
    if (!connectorId) return;
    try {
      const { authorize_url } = await startOAuth({
        connectorId,
        scopes,
        redirect_after: window.location.href,
      }).unwrap();
      window.location.href = authorize_url;
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't start the OAuth connection.");
    }
  };

  const isGitHub = selectedProvider?.key === "github";
  const supportsOAuth = selectedProvider?.supported_auth_methods.includes("oauth2") ?? false;

  const handleRegisterGitHubApp = async () => {
    if (!ghAppId.trim() || !ghPrivateKey.trim()) {
      toast.error("App ID and private key are required.");
      return;
    }
    try {
      await setGitHubApp({ app_id: ghAppId.trim(), private_key: ghPrivateKey.trim() }).unwrap();
      toast.success("GitHub App registered for this workspace.");
      setGhShowRegister(false);
      setGhPrivateKey("");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't register the GitHub App.");
    }
  };

  const handleConnectGitHubApp = async () => {
    if (!connectorId) return;
    if (!ghInstallationId.trim()) {
      toast.error("Installation ID is required.");
      return;
    }
    try {
      await connectGitHubApp({
        connectorId,
        installation_id: ghInstallationId.trim(),
        ...(ghOrgName.trim() ? { org_name: ghOrgName.trim() } : {}),
      }).unwrap();
      toast.success("GitHub connected.");
      close();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't connect the GitHub App.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add connector</DialogTitle>
          <DialogDescription>
            {step === "provider"
              ? "Pick a provider and name this connector. You can connect a credential now or later."
              : `Choose the permissions to request, then connect to ${selectedProvider?.display_name ?? "the provider"}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "provider" ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              {providersLoading ? (
                <p className="col-span-3 py-6 text-center text-sm text-muted-foreground">
                  Loading providers…
                </p>
              ) : providersError ? (
                <div className="col-span-3 flex flex-col items-center gap-2 py-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Couldn't load providers
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    You may not have permission to view the connector catalog. Ask a workspace
                    admin to grant <span className="font-mono">connector:read</span>, or try again.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void refetchProviders()}>
                    <RefreshCw className="mr-1.5 size-3.5" />
                    Retry
                  </Button>
                </div>
              ) : !providers?.length ? (
                <p className="col-span-3 py-6 text-center text-sm text-muted-foreground">
                  No providers are available in this workspace.
                </p>
              ) : (
                providers.map((p) => {
                  const hasActions = providerMeta(p.key).actions.length > 0;
                  const selected = providerKey === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setProviderKey(p.key)}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-[var(--component-button-primary-bg)] bg-blue-50/40"
                          : "border-border hover:border-[var(--color-border-strong)]",
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        <ConnectorBadge providerKey={p.key} size="size-7" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {p.display_name}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          hasActions
                            ? "bg-(--color-success-soft) text-(--color-success-text)"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {hasActions ? "1 action" : "Catalog only"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="connector-name">Name</Label>
              <Input
                id="connector-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="eng-notifications"
                autoComplete="off"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">Unique within this workspace.</p>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div className="min-w-0 pr-4">
                <p className="text-[13px] font-medium text-foreground">Agent access</p>
                <p className="text-[11px] text-muted-foreground">
                  Allow agents and MCP clients to execute this connector's actions.
                </p>
              </div>
              <Switch checked={agentAccessible} onCheckedChange={setAgentAccessible} />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleContinue()}
                disabled={!providerKey || !name.trim() || creating}
                className="text-[length:var(--text-sm)] text-white"
              >
                {creating ? "Creating…" : "Continue"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {isGitHub ? (
              <>
                <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                  GitHub connects as an <span className="font-medium">installed GitHub App</span> — a
                  bot identity scoped to selected repos, not tied to any person. It survives anyone
                  leaving the org. One connector per GitHub organization.
                </div>

                <div className="rounded-md border">
                  <button
                    type="button"
                    onClick={() => setGhShowRegister((v) => !v)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-[12.5px] font-medium"
                  >
                    <span>Step 1 · Register this workspace's GitHub App</span>
                    <span className="text-[11px] text-muted-foreground">
                      {ghShowRegister ? "Hide" : "Set up"}
                    </span>
                  </button>
                  {ghShowRegister && (
                    <div className="space-y-2 border-t px-3 py-3">
                      <p className="text-[11px] text-muted-foreground">
                        One-time per workspace. Create a GitHub App in your org, then paste its App ID
                        and a generated private key (PEM). The key is stored in AuthSec's vault.
                      </p>
                      <Input
                        value={ghAppId}
                        onChange={(e) => setGhAppId(e.target.value)}
                        placeholder="App ID (e.g. 123456)"
                        className="h-9 font-mono text-xs"
                        autoComplete="off"
                      />
                      <textarea
                        value={ghPrivateKey}
                        onChange={(e) => setGhPrivateKey(e.target.value)}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----"
                        rows={3}
                        className="w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px]"
                        spellCheck={false}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRegisterGitHubApp()}
                        disabled={savingApp || !ghAppId.trim() || !ghPrivateKey.trim()}
                      >
                        {savingApp ? "Saving…" : "Save GitHub App"}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-md border px-3 py-3">
                  <p className="text-[12.5px] font-medium">Step 2 · Install on your org &amp; connect</p>
                  <p className="text-[11px] text-muted-foreground">
                    Install the App on the GitHub organization (selecting repos there), then paste the
                    installation ID from the install URL.
                  </p>
                  <Input
                    value={ghOrgName}
                    onChange={(e) => setGhOrgName(e.target.value)}
                    placeholder="Organization (e.g. acme-eng)"
                    className="h-9 text-xs"
                    autoComplete="off"
                  />
                  <Input
                    value={ghInstallationId}
                    onChange={(e) => setGhInstallationId(e.target.value)}
                    placeholder="Installation ID (e.g. 45678901)"
                    className="h-9 font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => void handleConnectGitHubApp()}
                    disabled={connectingApp || !ghInstallationId.trim()}
                    className="w-full text-[length:var(--text-sm)] text-white"
                  >
                    <ExternalLink className="mr-1.5 size-3.5" />
                    {connectingApp ? "Connecting…" : "Connect GitHub"}
                  </Button>
                </div>
              </>
            ) : supportsOAuth ? (
              <>
                <div>
                  <p className="mb-2 text-[13px] font-medium text-foreground">Permissions to request</p>
                  <div className="space-y-1.5">
                    {(selectedProvider?.oauth_scopes_supported ?? []).map((scope) => (
                      <label
                        key={scope}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[12.5px]"
                      >
                        <input
                          type="checkbox"
                          checked={scopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                          className="size-3.5 accent-(--color-primary)"
                        />
                        <span className="font-mono text-xs">{scope}</span>
                        {(selectedProvider?.oauth_default_scopes ?? []).includes(scope) && (
                          <span className="ml-auto text-[10px] text-muted-foreground">default</span>
                        )}
                      </label>
                    ))}
                    {!selectedProvider?.oauth_scopes_supported?.length && (
                      <p className="text-xs text-muted-foreground">
                        This provider doesn't declare optional scopes — default access will be requested.
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  onClick={() => void handleConnect()}
                  disabled={connecting}
                  className="w-full text-[length:var(--text-sm)] text-white"
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  {connecting ? "Redirecting…" : `Connect to ${selectedProvider?.display_name}`}
                </Button>

                <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                  You'll approve access on {selectedProvider?.display_name}'s own consent screen.
                  AuthSec stores the credential in its vault and refreshes it automatically — no one
                  in this workspace ever sees it.
                </div>

                <div className="rounded-md border px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAppForm((v) => !v)}
                    className="text-[12px] font-medium text-(--color-primary-text)"
                  >
                    {showAppForm ? "Hide workspace OAuth app setup" : "Connect failing? Configure this workspace's own OAuth app"}
                  </button>
                  {showAppForm && selectedProvider && (
                    <div className="mt-3">
                      <ProviderAppForm
                        providerKey={selectedProvider.key}
                        providerName={selectedProvider.display_name}
                        onSaved={() => setShowAppForm(false)}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This provider doesn't support an OAuth connect flow yet. You can add a static
                credential later from the connector's detail panel.
              </p>
            )}

            <DialogFooter className="pt-2">
              {supportsOAuth || isGitHub ? (
                <Button variant="ghost" onClick={close}>
                  Skip — connect later
                </Button>
              ) : (
                <Button onClick={close} className="text-[length:var(--text-sm)] text-white">
                  Done
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
