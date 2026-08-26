/**
 * Step 2: pick the organisation to scan. The only real decision in the flow.
 *
 * This list is read live from GitHub through the workspace's App, never from
 * our tables — which is why an organisation can appear here with nothing on the
 * AuthSec side at all, and why deleting things here never makes one disappear.
 * That surprised people, so the panel says it rather than leaving it to be
 * inferred.
 *
 * Rows are annotated with `already_added` server-side. Without it a connected
 * organisation is indistinguishable from a new one, and clicking it either
 * duplicates the source or fails with a uniqueness error that explains nothing.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import {
  Building2,
  Check,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useAddGitHubOrganisationMutation,
  useDescribeGitHubAppQuery,
  useListGitHubInstallationsQuery,
} from "@/app/api/discoveryApi";

export function GitHubOrganisationPanel({
  appRegistered,
  onAdded,
  onOpenExisting,
}: {
  appRegistered: boolean;
  /** Called with the new source id once an organisation is connected. */
  onAdded: (sourceId: string) => void;
  /** Called instead when the organisation was already connected. */
  onOpenExisting: (sourceId: string) => void;
}) {
  const { data: appInfo } = useDescribeGitHubAppQuery(undefined, { skip: !appRegistered });
  const {
    data,
    isFetching,
    refetch,
  } = useListGitHubInstallationsQuery(undefined, { skip: !appRegistered });
  const [addOrganisation] = useAddGitHubOrganisationMutation();

  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  const installations = data?.installations ?? [];

  const add = async (installationId: string) => {
    if (!installationId) return;
    setError("");
    setPending(installationId);
    try {
      const res = await addOrganisation({ installation_id: installationId }).unwrap();
      if (res.already_existed) {
        toast("That organisation was already connected — opening it.");
        onOpenExisting(res.source.id);
        return;
      }
      toast.success(`${res.source.display_name} connected.`);
      onAdded(res.source.id);
    } catch (err) {
      setError(
        (err as { data?: { error?: string } })?.data?.error ??
          "Could not connect that organisation.",
      );
    } finally {
      setPending("");
    }
  };

  if (!appRegistered) {
    return (
      <p className="rounded-md bg-(--color-warning-soft) px-2.5 py-1.5 text-[11px] text-(--color-warning-text)">
        Register the GitHub App first — reading your organisations needs its private key.
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
              <Button asChild size="sm" className="text-[length:var(--text-sm)] text-white">
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
            Pick the organisation to scan. We&rsquo;ll set everything up and take you
            straight to choosing repositories.
          </p>
          <div className="space-y-1.5">
            {installations.map((i) => {
              const busy = pending === i.installation_id;
              return (
                <button
                  key={i.installation_id}
                  type="button"
                  disabled={pending !== ""}
                  onClick={() =>
                    i.already_added && i.source_id
                      ? onOpenExisting(i.source_id)
                      : void add(i.installation_id)
                  }
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block cursor-help truncate text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2">
                            {i.repository_selection === "all"
                              ? "all repositories"
                              : "selected repositories"}
                          </span>
                        </TooltipTrigger>
                        {/* The distinction people get wrong: "all" is all we
                            were GRANTED, not all the organisation has, and a
                            repository we cannot read contributes no evidence
                            either way. Saying it here stops a partial scan from
                            being read as a clean bill of health. */}
                        <TooltipContent className="max-w-[280px]">
                          {i.repository_selection === "all"
                            ? "The App can read every repository in this account, including ones added later."
                            : "The App can read only the repositories chosen during install. We cannot see the rest — and not seeing an agent in a repository we cannot read is not evidence there isn't one."}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {busy ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" />
                        Connecting…
                      </span>
                    ) : i.already_added ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-help items-center gap-1 text-(--color-success-text)">
                            <Check className="size-3" />
                            Already added
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px]">
                          This organisation is already set up here. Opens it instead of
                          adding a second copy.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      "Add"
                    )}
                  </span>
                </button>
              );
            })}
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
                  Install on another organisation
                  <ExternalLink className="ml-1.5 size-3" />
                </a>
              </Button>
            )}
          </div>
        </>
      )}

      {/* Where this list comes from. Not a detail: people deleted things here
          and were confused that the organisation was still offered. It is still
          offered because the App is still installed on GitHub, and only its
          owner can change that. */}
      {data?.note && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" />
          <span>{data.note}</span>
        </p>
      )}

      {error && (
        <p className="rounded-md bg-(--color-danger-soft) px-2.5 py-1.5 text-[11px] text-(--color-danger-text)">
          {error}
        </p>
      )}

      {/* Escape hatch, deliberately de-emphasised: needed only when the App is
          installed somewhere this workspace's credentials cannot enumerate. The
          server still refuses an id it cannot confirm, so this is a shortcut
          past the list, not past the check. */}
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
            onClick={() => void add(manual.trim())}
            disabled={pending !== "" || !manual.trim()}
          >
            {pending !== "" ? "Verifying with GitHub…" : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}
