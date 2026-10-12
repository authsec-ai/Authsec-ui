/**
 * The evidence line of step 1: how old the scan is, whether it is trusted and
 * whether resource policies were read. It states the WORST of the selected
 * roles and says how many roles that is, so a single stale role is not hidden
 * behind a trusted majority. An untrusted role gets the reason and the link to
 * the connection's coverage (collection gaps live in Connections).
 */

import { Link } from "react-router-dom";

import { DecisionBanner } from "@/components/console/status";

import { StateChip, plural, trust } from "../shared";
import { coverageWords, hoursAgo, trustReasons } from "./copy";
import type { RoleInfo } from "./flow";

const TRUST_RANK: Record<string, number> = { trusted: 0, partial: 1, untrusted: 2 };
const COVERAGE_RANK: Record<string, number> = { complete: 0, partial: 1, not_collected: 2 };

export function EvidenceLine({ roles, loading }: { roles: RoleInfo[]; loading: boolean }) {
  const ev = roles.map((r) => ({ role: r, e: r.resolved?.evidence ?? null }));
  const known = ev.filter((x) => x.e);
  if (known.length === 0) {
    return (
      <p className="text-xs text-(--color-text-muted)" role={loading ? "status" : undefined}>
        {loading ? "Checking the evidence…" : "AuthSec could not read the current evidence for these roles. The recommendation below was built from the scan when the draft was created."}
      </p>
    );
  }
  const worstTrust = known.reduce((m, x) => (TRUST_RANK[x.e!.trust] > TRUST_RANK[m] ? x.e!.trust : m), "trusted" as string);
  const worstCov = known.reduce((m, x) => (COVERAGE_RANK[x.e!.resource_policy_coverage] > COVERAGE_RANK[m] ? x.e!.resource_policy_coverage : m), "complete" as string);
  const oldest = known.reduce<number | null>((m, x) => (x.e!.freshness_hours === null ? m : m === null || x.e!.freshness_hours > m ? x.e!.freshness_hours : m), null);
  const bad = known.filter((x) => x.e!.trust !== "trusted");
  const first = bad[0];

  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--color-text-muted)">
        <span className="font-medium text-(--color-text)">Evidence</span>
        <span>{hoursAgo(oldest)}</span>
        <span aria-hidden="true">·</span>
        <StateChip state={trust(worstTrust)} />
        <span aria-hidden="true">·</span>
        <span>{coverageWords(worstCov)}</span>
        {roles.length > 1 && bad.length > 0 ? <span>({plural(bad.length, "role")} not fully trusted)</span> : null}
      </p>
      {first ? (
        <DecisionBanner
          tone={worstTrust === "untrusted" ? "danger" : "warning"}
          title={worstTrust === "untrusted" ? "AuthSec cannot propose a change from this evidence" : "Some evidence has gaps an approver must accept"}
          body={
            <>
              {first.role.name}: {trustReasons(first.e!.trust_reasons) || "no reason was recorded"}.{" "}
              {first.role.connectorId ? (
                <Link to={`/iga/connections/${encodeURIComponent(first.role.connectorId)}/coverage`} className="font-medium underline">
                  Open the connection&apos;s coverage
                </Link>
              ) : null}
            </>
          }
        />
      ) : null}
    </div>
  );
}
