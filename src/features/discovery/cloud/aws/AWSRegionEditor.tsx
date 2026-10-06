/**
 * Which regions an account's scans read (SPEC-iga-phase2-graph.md §5.3,
 * T7.9). The choices are the regions enabled in the account, read through
 * the discovery role; a change applies from the next scan. A region taken out
 * of scope is "not selected" in coverage — its earlier results are kept and
 * marked stale, never shown as removed.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";

import { markAdminDenied } from "@/features/iga/connections/permissions";
import {
  useGetAwsConnectorRegionsQuery,
  useUpdateAwsConnectorRegionsMutation,
  type AWSConnectorRegions,
  type AWSRegionsFailure,
} from "@/app/api/cloudDiscoveryApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EXTERNAL_ID_UNREADABLE_PROSE } from "@/features/discovery/cloud/cloudConnectorErrorCopy";

/**
 * The commercial regions whose opt-in status is `opt-in-not-required`: AWS
 * enables them in every account and they cannot be disabled, so they are safe
 * to offer before the account has answered. The live read (seconds: it
 * assumes the discovery role and calls ec2:DescribeRegions) only ADDS the
 * opt-in regions this account has enabled. The server still validates a save.
 */
export const DEFAULT_AWS_REGIONS = [
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ca-central-1",
  "eu-central-1",
  "eu-north-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
] as const;

/** What the checklist shows while the account is being asked: the always-enabled regions, plus today's selection. */
function provisional(current: string[]): AWSConnectorRegions {
  const names = [...new Set([...DEFAULT_AWS_REGIONS, ...current])].sort();
  return {
    data: names.map((name) => ({ name, opt_in_status: null, enabled: true, selected: current.includes(name) })),
    meta: { as_of: "", error: null, template: { deployed: null, current: "", outdated: null } },
  };
}

/** Why the account could not be asked which regions it has enabled. */
function failureText(f: Pick<AWSRegionsFailure, "code" | "api">): string {
  switch (f.code) {
    case "role_not_assumable":
      return "AuthSec could not assume the discovery role in this account.";
    case "aws_access_denied":
      return `The discovery role is not allowed to call ${f.api ?? "ec2:DescribeRegions"}. Update the role from the current template.`;
    case "aws_throttled":
      return "AWS throttled the request. Try again in a moment.";
    case "aws_timeout":
      return "AWS did not answer in time. Try again.";
    default:
      return "AWS returned an error when asked for the account's regions.";
  }
}

/** Why the regions read itself failed, from the error envelope, in plain words. */
function readFailureText(error: unknown): string {
  const status = (error as { status?: number } | undefined)?.status;
  const body = (error as { data?: { error?: { code?: string; message?: string } } } | undefined)?.data?.error;
  if (body?.code === "external_id_unreadable") return `${EXTERNAL_ID_UNREADABLE_PROSE}.`;
  if (body?.code === "connector_revoked") return "This account's connection has been revoked.";
  if (body?.code === "authsec_misconfigured") return "This is an AuthSec configuration problem, not yours. Contact support.";
  if (status === 403) return "Your role cannot read this account's regions.";
  return "AuthSec could not read the regions enabled in this account.";
}

export function AWSRegionEditor({
  connectorId,
  onDone,
  current = [],
  inline = false,
  onSaved,
}: {
  connectorId: string;
  onDone: () => void;
  /**
   * Always on the page (the Scope tab, 2026-10-06 design): the checklist is the
   * view, and Discard / Save and scan appear only once something changed.
   */
  inline?: boolean;
  /**
   * After a successful save: the Scope tab starts a scan, so results reflect the
   * new regions. Resolves true when the scan was requested; the message says
   * what actually happened.
   */
  onSaved?: () => Promise<boolean>;
  /** The regions scanned today, kept on screen when the enabled list cannot be read. */
  current?: string[];
}) {
  const q = useGetAwsConnectorRegionsQuery(connectorId);
  const [save, { isLoading: saving }] = useUpdateAwsConnectorRegionsMutation();
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Never block on the live read: the always-enabled regions render at once.
  const checking = !q.data && !q.error;
  if (q.error && !q.data) {
    // The selection cannot be edited without the enabled list, but what is
    // scanned today is still known: keep it on screen, say why editing is
    // unavailable, and let the operator back out.
    return (
      <div className="space-y-3">
        <p className="text-xs">
          <span className="text-(--color-text-muted)">Scanned: </span>
          <span className="font-mono">{current.length ? current.join(", ") : "No regions recorded"}</span>
        </p>
        <p role="alert" className="text-xs text-(--color-danger-text)">
          {readFailureText(q.error)} The regions scanned stay as they are.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? "Retrying…" : "Retry"}
          </Button>
          {inline ? null : (
            <Button variant="ghost" size="sm" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { data: regions, meta } = q.data ?? provisional(current);
  const templateNote = meta.template.outdated ? (
    <p className="text-xs text-(--color-warning-text)">
      Discovery role template {meta.template.deployed ?? "is outdated"}; current is {meta.template.current}.
    </p>
  ) : null;

  // AWS could not be asked, so which regions are enabled is unknown. Show the
  // current selection as it stands and do not offer a save the server would
  // refuse — the selection is kept, never cleared for want of an answer.
  if (meta.error) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-(--color-warning-text)" role="alert">
          {failureText(meta.error)} The regions scanned stay as they are:{" "}
          <span className="font-mono">{regions.map((r) => r.name).join(", ") || "none recorded"}</span>.{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </p>
        {templateNote}
        {inline ? null : (
          <Button variant="outline" size="sm" onClick={onDone}>
            Close
          </Button>
        )}
      </div>
    );
  }

  const enabled = regions.filter((r) => r.enabled === true);
  // Only regions still enabled in the account can be scanned; a selected
  // region the account has since disabled is named below and dropped on save,
  // rather than sent back as a region the server must refuse.
  const orphaned = regions.filter((r) => r.selected && r.enabled === false).map((r) => r.name);
  const selected = chosen ?? new Set(regions.filter((r) => r.selected && r.enabled === true).map((r) => r.name));
  const toggle = (region: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(region);
    else next.delete(region);
    setChosen(next);
  };

  const submit = async () => {
    setProblem(null);
    try {
      await save({ id: connectorId, regions: [...selected].sort() }).unwrap();
      // Keep the new ticks on screen until the regions are read back: clearing
      // them now would show the old selection for the seconds AWS takes.
      await q.refetch();
      setChosen(null);
      if (onSaved) {
        // A requested scan announces itself; only say so here when it was not.
        const scanned = await onSaved();
        if (!scanned) toast.success("Regions saved. They apply from the next scan.");
      } else {
        toast.success("Regions saved. They apply from the next scan.");
      }
      onDone();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const err = (
        e as {
          data?: {
            error?: { code?: string; regions?: string[]; reason?: string; failure?: AWSRegionsFailure["code"]; api?: string | null };
          };
        }
      ).data?.error;
      setProblem(
        err?.code === "invalid_region"
          ? err.regions?.length
            ? `${err.regions.join(", ")}: ${err.reason ?? "not enabled in this AWS account"}.`
            : "Select at least one region to scan."
          : err?.code === "regions_unavailable" && err.failure
            ? `${failureText({ code: err.failure, api: err.api ?? null })} The selection was not changed.`
            : err?.code === "connector_revoked"
              ? "This account's connection has been revoked."
              : status === 403
                ? "Your role cannot do this."
                : "Could not save the regions. Try again.",
      );
      if (status === 403) markAdminDenied();
    }
  };

  const initial = new Set(regions.filter((r) => r.selected && r.enabled === true).map((r) => r.name));
  // A region still selected but no longer enabled is dropped on save, so it is a change to save.
  const dirty = orphaned.length > 0 || selected.size !== initial.size || [...selected].some((r) => !initial.has(r));

  return (
    <div className="space-y-3">
      {inline ? (
        <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-(--color-text-muted)" aria-live="polite">
          <span>
            {selected.size} of {enabled.length} regions selected
          </span>
          {checking ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Checking opt-in regions
            </span>
          ) : null}
        </p>
      ) : null}
      <div className={inline ? "grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4" : "grid grid-cols-2 gap-1.5"}>
        {enabled.map((r) => (
          <label key={r.name} className="flex min-h-7 cursor-pointer items-center gap-2 rounded px-1 -mx-1 text-xs hover:bg-(--color-surface-subtle)">
            <Checkbox checked={selected.has(r.name)} onCheckedChange={(v) => toggle(r.name, v === true)} />
            <span className="font-mono">{r.name}</span>
            {r.opt_in_status === "opted-in" ? <span className="text-muted-foreground">opt-in</span> : null}
          </label>
        ))}
      </div>
      {orphaned.length ? (
        <p className="text-xs text-(--color-warning-text)">
          {orphaned.join(", ")} {orphaned.length === 1 ? "is" : "are"} selected but no longer enabled in this account.
          Saving removes {orphaned.length === 1 ? "it" : "them"} from the scan scope.
        </p>
      ) : null}
      <p className="text-xs text-(--color-text-muted)">
        Removed regions keep their results, marked stale. IAM is account-wide and not affected.
      </p>
      {templateNote}
      {problem ? (
        <p className="text-xs text-(--color-danger-text)" role="alert">
          {problem}
        </p>
      ) : null}
      {inline ? (
        dirty ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border-subtle) pt-3">
            <span className="mr-auto text-xs text-(--color-text-muted)">Changes apply from the next scan.</span>
            <Button variant="outline" size="sm" onClick={() => setChosen(null)} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" className="text-white" onClick={() => void submit()} disabled={saving || selected.size === 0}>
              {saving ? "Saving…" : onSaved ? "Save and scan" : "Save regions"}
            </Button>
          </div>
        ) : null
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void submit()} disabled={saving || selected.size === 0}>
            {saving ? "Saving…" : "Save regions"}
          </Button>
          <Button variant="outline" size="sm" onClick={onDone}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
