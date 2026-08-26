/**
 * Bind a connector to an installed GitHub App.
 *
 * Previously this asked for an installation ID typed by hand — a number the
 * operator had to find in a browser URL on github.com, easily confused with the
 * App ID, and wrong in a way that only surfaced much later as an opaque
 * token-minting failure. GitHub already knows every installation of this App, so
 * it is asked directly and the answer rendered as a list to click.
 *
 * The manual field survives only as a fallback for the case the list cannot
 * cover: an App installed on an organisation this workspace's App cannot
 * enumerate.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Building2, ExternalLink, RefreshCw, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useConnectGitHubAppMutation,
  useDescribeGitHubAppQuery,
  useListGitHubInstallationsQuery,
} from "@/app/api/connectorsApi";

export function GitHubInstallationPanel({
  connectorId,
  appRegistered,
  onConnected,
}: {
  connectorId: string | null;
  appRegistered: boolean;
  onConnected?: () => void;
}) {
  const [connectGitHubApp, { isLoading: connecting }] = useConnectGitHubAppMutation();
  const { data: appInfo } = useDescribeGitHubAppQuery(undefined, { skip: !appRegistered });
  const {
    data: installations = [],
    isFetching,
    refetch,
  } = useListGitHubInstallationsQuery(undefined, { skip: !appRegistered });

  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  const bind = async (installationId: string, orgName?: string) => {
    if (!connectorId || !installationId) return;
    setError("");
    setPending(installationId);
    try {
      await connectGitHubApp({
        connectorId,
        installation_id: installationId,
        ...(orgName ? { org_name: orgName } : {}),
      }).unwrap();
      toast.success("GitHub connected.");
      onConnected?.();
    } catch (err) {
      setError(
        (err as { data?: { error?: string } })?.data?.error ??
          "Could not connect that installation.",
      );
    } finally {
      setPending("");
    }
  };

  if (!appRegistered) {
    return (
      <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-[11px] text-(--color-warning-text)">
        Register the GitHub App first — connecting needs its private key.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {installations.length === 0 ? (
        <div className="space-y-2 rounded-md border border-dashed px-3 py-3">
          <p className="text-[12px] font-medium">Not installed anywhere yet</p>
          <p className="text-[11px] text-muted-foreground">
            Install <span className="font-medium">{appInfo?.name ?? "the App"}</span> on the
            account or organisation whose repositories you want scanned, choosing which
            repositories it may read. Then come back and refresh.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {appInfo?.install_url && (
              <Button asChild size="sm">
                <a href={appInfo.install_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 size-3.5" />
                  Install on GitHub
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Checking…" : "I've installed it"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            Pick the account this integration should read from.
          </p>
          <div className="space-y-1.5">
            {installations.map((i) => (
              <button
                key={i.installation_id}
                type="button"
                disabled={connecting}
                onClick={() => void bind(i.installation_id, i.account)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {i.account_type === "Organization" ? (
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <User className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.account}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {i.repository_selection === "all"
                        ? "all repositories"
                        : "selected repositories"}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {pending === i.installation_id ? "Connecting…" : "Connect"}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {appInfo?.install_url && (
              <Button asChild size="sm" variant="ghost">
                <a href={appInfo.install_url} target="_blank" rel="noreferrer">
                  Add another organisation
                  <ExternalLink className="ml-1.5 size-3" />
                </a>
              </Button>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="rounded-md bg-(--color-danger-soft) px-2.5 py-1.5 text-[11px] text-(--color-danger-text)">
          {error}
        </p>
      )}

      {/* Escape hatch, deliberately de-emphasised: needed only when the App is
          installed somewhere this workspace's credentials cannot enumerate. */}
      {!showManual ? (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="text-[11px] text-muted-foreground underline underline-offset-2"
        >
          Enter an installation ID manually
        </button>
      ) : (
        <div className="space-y-1.5 rounded-md border px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            The number at the end of{" "}
            <span className="font-mono">github.com/settings/installations/</span>
            <span className="font-medium">&lt;number&gt;</span>.
          </p>
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. 45678901"
            className="h-9 font-mono text-xs"
            autoComplete="off"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void bind(manual.trim())}
            disabled={connecting || !manual.trim() || !connectorId}
          >
            {connecting ? "Verifying with GitHub…" : "Connect"}
          </Button>
        </div>
      )}
    </div>
  );
}
