/**
 * Which regions an account's scans read (SPEC-iga-phase2-graph.md §5.3,
 * T7.9). The choices are the regions enabled in the account, read through
 * the discovery role; a change applies from the next scan. A region taken out
 * of scope is "not selected" in coverage — its earlier results are kept and
 * marked stale, never shown as removed.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import {
  useGetAwsConnectorRegionsQuery,
  useUpdateAwsConnectorRegionsMutation,
  type AWSRegionsFailure,
} from "@/app/api/cloudDiscoveryApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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

export function AWSRegionEditor({ connectorId, onDone }: { connectorId: string; onDone: () => void }) {
  const q = useGetAwsConnectorRegionsQuery(connectorId);
  const [save, { isLoading: saving }] = useUpdateAwsConnectorRegionsMutation();
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (q.isLoading) return <p className="text-xs text-muted-foreground">Reading the regions enabled in this account…</p>;
  if (q.error || !q.data) {
    return (
      <p className="text-xs text-(--color-danger-text)">
        Could not read the account's enabled regions.{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Retry
        </button>
      </p>
    );
  }

  const { data: regions, meta } = q.data;
  const templateNote = meta.template.outdated ? (
    <p className="text-[11px] text-(--color-warning-text)">
      This account's discovery role was deployed from template {meta.template.deployed ?? "an earlier version"}; the
      current one is {meta.template.current}.
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
        <Button variant="outline" size="sm" onClick={onDone}>
          Close
        </Button>
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
      toast.success("Regions saved. They apply from the next scan.");
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
                ? "Your role is missing the discovery:admin permission."
                : "Could not save the regions. Try again.",
      );
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {enabled.map((r) => (
          <label key={r.name} className="flex items-center gap-2 text-xs">
            <Checkbox checked={selected.has(r.name)} onCheckedChange={(v) => toggle(r.name, v === true)} />
            <span className="font-mono">{r.name}</span>
            {r.opt_in_status === "opted-in" ? <span className="text-muted-foreground">opt-in</span> : null}
          </label>
        ))}
      </div>
      {orphaned.length ? (
        <p className="text-[11px] text-(--color-warning-text)">
          {orphaned.join(", ")} {orphaned.length === 1 ? "is" : "are"} selected but no longer enabled in this account.
          Saving removes {orphaned.length === 1 ? "it" : "them"} from the scan scope.
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        A region you remove is reported as not selected. Its earlier results are kept and marked stale.
      </p>
      {templateNote}
      {problem ? (
        <p className="text-xs text-(--color-danger-text)" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={saving || selected.size === 0}>
          {saving ? "Saving…" : "Save regions"}
        </Button>
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
