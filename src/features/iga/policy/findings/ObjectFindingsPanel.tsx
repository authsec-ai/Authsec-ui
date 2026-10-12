/**
 * "Policy findings" on an identity or workload page (SPEC-iga-phase3-policy.md
 * §9.4): the open findings for it in one line, the first few as rows, the
 * controlling policy when there is one, and a link into Findings filtered to
 * this object. A workload's findings are those of the roles it runs as.
 *
 * Renders nothing while the policy product is off, so Discovery is unchanged
 * on a backend that predates it. A failed read is a banner, never "none".
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useGetGovPolicyQuery } from "@/app/api/igaPolicyAuthoringApi";
import {
  OPEN_FINDING_STATUSES,
  govTargetKeyForObject,
  useListGovFindingsQuery,
  useResolveGovTargetsQuery,
  type GovFinding,
} from "@/app/api/igaPolicyReadsApi";
import { Panel } from "@/features/iga/shared/components/Panel";

import { PolicyLoadFailure, classifyPolicyError, findingKind, plural, usePolicyCapabilities } from "../shared";
import { findingHref, findingsHref, otherHeadline, summarizeUnused } from "./findingModel";

const SHOWN = 4;
const LOOK = 200;

export function ObjectFindingsPanel({ ws, identityId, workloadId }: { ws: string; identityId?: string; workloadId?: string }) {
  const caps = usePolicyCapabilities(ws);
  const on = caps.state === "on" && (!!identityId || !!workloadId);
  const filter = identityId ? { identity_id: identityId } : { workload_id: workloadId };
  const q = useListGovFindingsQuery(
    { ws, ...filter, status: [...OPEN_FINDING_STATUSES], limit: LOOK },
    { skip: !on },
  );
  const objectId = identityId ?? workloadId ?? "";
  const target = useResolveGovTargetsQuery({ ws, keys: [govTargetKeyForObject(objectId)] }, { skip: !on });
  const control = target.data?.[0]?.control ?? null;
  const policy = useGetGovPolicyQuery({ ws, policyId: control?.policy_id ?? "" }, { skip: !control });

  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  const lines = useMemo(() => lineItems(rows), [rows]);
  if (!on) return null;

  const failure = classifyPolicyError(q.error);
  const more = !!q.data?.meta.next_cursor;
  const evaluated = q.data?.meta.evaluated_rev ?? null;
  const all = findingsHref(identityId ? { identity_id: identityId } : { workload_id: workloadId });

  return (
    <Panel
      title="Policy findings"
      count={q.data && !failure ? `${rows.length}${more ? "+" : ""} open` : undefined}
      actions={
        <Link to={all} className="font-medium text-(--color-primary-text) hover:underline">
          Open in Findings
        </Link>
      }
    >
      {q.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading findings…
        </p>
      ) : failure && !q.data ? (
        <PolicyLoadFailure failure={failure} subject="findings" onRetry={() => void q.refetch()} />
      ) : q.data && evaluated === null ? (
        <p className="text-[13px] text-(--color-text-muted)">Findings appear after the next scan publishes.</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-(--color-text-muted)">No open findings{identityId ? " for this role" : " for this workload"} in rev {evaluated}.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-(--color-text)">{summaryLine(rows, more)}</p>
          <ul className="divide-y divide-(--color-border-subtle)">
            {lines.slice(0, SHOWN).map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2 text-[13px]">
                <Link to={findingHref(l.id)} className="font-medium text-(--color-primary-text) hover:underline">
                  {l.title}
                </Link>
                <span className="text-xs text-(--color-text-muted)">{l.kind}</span>
              </li>
            ))}
          </ul>
          {lines.length > SHOWN ? (
            <p className="text-xs text-(--color-text-muted)">
              +{lines.length - SHOWN} more.{" "}
              <Link to={all} className="font-medium text-(--color-primary-text) hover:underline">
                See them all
              </Link>
            </p>
          ) : null}
        </div>
      )}
      {control ? (
        <p className="mt-3 border-t border-(--color-border-subtle) pt-3 text-[13px]">
          Controlled by{" "}
          <Link to={`/iga/policy/policies/${encodeURIComponent(control.policy_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
            {policy.data?.name ?? "an AuthSec policy"}
          </Link>{" "}
          <span className="text-xs text-(--color-text-muted)">({control.state})</span>
        </p>
      ) : null}
    </Panel>
  );
}

interface Line {
  id: string;
  title: string;
  kind: string;
}

/** One line per role for its unused services, one per other finding. */
function lineItems(rows: GovFinding[]): Line[] {
  const out: Line[] = [];
  const seen = new Set<string>();
  for (const f of rows) {
    if (f.kind === "unused_service") {
      const key = f.identity_account_id ?? f.role_arn;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = summarizeUnused(rows.filter((r) => r.kind === "unused_service" && (r.identity_account_id ?? r.role_arn) === key));
      out.push({ id: f.id, title: `${plural(u.services.length, "service")} unused${f.role_name ? ` on ${f.role_name}` : ""}`, kind: findingKind(f.kind) });
    } else {
      out.push({ id: f.id, title: otherHeadline(f).title, kind: findingKind(f.kind) });
    }
  }
  return out;
}

function summaryLine(rows: GovFinding[], more: boolean): string {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.kind, (by.get(r.kind) ?? 0) + 1);
  const parts = [...by.entries()].map(([k, n]) => `${n}${more ? "+" : ""} ${findingKind(k).toLowerCase()}`);
  return parts.join(" · ");
}
