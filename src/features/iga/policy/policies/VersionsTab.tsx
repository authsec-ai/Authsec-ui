/**
 * Policy › detail › Versions (SPEC-iga-phase3-policy.md §9.3 S5): every version
 * of the policy, newest first, who wrote it and when its status last changed,
 * what one version does, and a readable difference between any two. `?version=`
 * opens one. A diff says only what the intents say: it never claims a service
 * is narrower, only that it is removed, kept or excluded.
 */

import { getWorkspaceId } from "@/utils/workspace";

import { ExportPanel } from "../plans/ExportPanel";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { GovVersionView } from "@/app/api/igaPolicyAuthoringApi";
import { Button } from "@/components/ui/button";
import { CopyValue, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { StateChip, plural, shortHash, versionStatus } from "../shared";
import { diffIntents, intentLines, type IntentChange } from "./intentDiff";
import { policyHref } from "./policyModel";

const selectClass =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

const MARK: Record<IntentChange["kind"], string> = { added: "Added", removed: "Removed", changed: "Changed" };

export function VersionsTab({
  policyId,
  versions,
  currentNo,
  approvedNo,
  nameOf,
}: {
  policyId: string;
  /** Newest first. */
  versions: GovVersionView[];
  currentNo: number | undefined;
  approvedNo: number | undefined;
  nameOf: (id: string) => string;
}) {
  const [params, setParams] = useSearchParams();
  const byNo = useMemo(() => new Map(versions.map((v) => [v.no, v])), [versions]);
  const asked = Number(params.get("version"));
  const selected = byNo.get(asked) ?? byNo.get(currentNo ?? -1) ?? versions[0];
  const askedMissing = params.has("version") && !byNo.has(asked);

  // Compare the viewed version with another: by default, the one before it.
  const fromParam = Number(params.get("from"));
  const earlier = versions.filter((v) => v.no < (selected?.no ?? 0));
  const from = byNo.get(fromParam) && fromParam !== selected?.no ? byNo.get(fromParam) : earlier[0];

  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  if (versions.length === 0) return <p className="text-sm text-(--color-text-muted)">This policy has no version yet.</p>;
  if (!selected) return null;

  const changes = from ? diffIntents(from.intent, selected.intent) : [];

  return (
    <div className="space-y-4">
      {askedMissing ? <p role="status" className="text-xs text-(--color-warning-text)">Version {asked} does not exist for this policy. Showing version {selected.no}.</p> : null}

      <Panel title="Versions" count={plural(versions.length, "version")} flush>
        <ul className="divide-y divide-(--color-border-subtle)">
          {versions.map((v) => {
            const on = v.no === selected.no;
            return (
              <li key={v.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 ${on ? "bg-(--color-surface-subtle)" : ""}`}>
                <span className="w-24 text-[13px] font-medium text-(--color-text)">Version {v.no}</span>
                <StateChip state={versionStatus(v.status)} />
                {v.no === currentNo ? <span className="text-xs text-(--color-text-muted)">Current</span> : null}
                {v.no === approvedNo ? <span className="text-xs text-(--color-success-text)">Approved</span> : null}
                <span className="min-w-0 text-xs text-(--color-text-muted)">
                  {nameOf(v.created_by) || "Unknown author"} · written <Timestamp iso={v.created_at} />
                  {v.status_changed_at !== v.created_at ? (
                    <>
                      {" "}
                      · {versionStatus(v.status).label.toLowerCase()} <Timestamp iso={v.status_changed_at} />
                    </>
                  ) : null}
                </span>
                <span className="ml-auto">
                  {on ? (
                    <span className="text-xs font-medium text-(--color-text)" aria-current="true">
                      Viewing
                    </span>
                  ) : (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={policyHref(policyId, "versions", `version=${v.no}`)}>View</Link>
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title={`Version ${selected.no}`} description={`${plural(selected.targets.length, "role")} · evidence revision ${selected.evidence_rev}`}>
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-(--color-text)">
          {intentLines(selected.intent).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-(--color-text-muted) hover:text-(--color-text)">Hashes</summary>
          <div className="mt-2 space-y-1">
            <p className="text-(--color-text-muted)">Intent {shortHash(selected.intent_hash)}</p>
            <CopyValue value={selected.intent_hash} what="Intent hash" />
          </div>
        </details>
      </Panel>

      {selected.no === approvedNo || selected.status === "approved" ? <ExportPanel ws={getWorkspaceId() ?? ""} policyId={policyId} versionNo={selected.no} /> : null}

      <Panel
        title="Compare"
        description="What the viewed version does differently from another."
        actions={
          earlier.length > 0 || versions.length > 1 ? (
            <label className="flex items-center gap-2 text-xs text-(--color-text-muted)">
              With
              <select value={from?.no ?? ""} onChange={(e) => set("from", e.target.value || null)} className={selectClass} aria-label="Compare with version">
                {versions
                  .filter((v) => v.no !== selected.no)
                  .map((v) => (
                    <option key={v.id} value={v.no}>
                      Version {v.no}
                    </option>
                  ))}
              </select>
            </label>
          ) : undefined
        }
      >
        {!from ? (
          <Meta>This is the only version, so there is nothing to compare it with.</Meta>
        ) : changes.length === 0 ? (
          <p className="text-[13px] text-(--color-text)">Version {selected.no} does the same as version {from.no}.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-(--color-text-muted)">
              Version {selected.no} compared with version {from.no}
            </p>
            <ul className="space-y-1">
              {changes.map((c, i) => (
                <li key={`${c.text}-${i}`} className="flex gap-2 text-[13px] text-(--color-text)">
                  <span className="w-16 shrink-0 text-xs font-semibold text-(--color-text-muted)">{MARK[c.kind]}</span>
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
