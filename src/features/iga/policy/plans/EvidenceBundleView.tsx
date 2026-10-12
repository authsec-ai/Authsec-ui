/**
 * An evidence bundle (SPEC-iga-phase3-policy.md §2.11, §9.3 S3 step 4): the
 * insert-once, hash-verified record a plan is compiled from. It leads with the
 * answer (is this evidence trusted, how fresh, what is missing) and keeps the
 * rest behind disclosures: sources, gaps an approver must accept, who runs as
 * the role, activity by service and the resource-policy routes. No raw dump.
 *
 * `GET /evidence-bundles/:id` re-derives `trust` from the facts, so the trust
 * shown here is the bundle's own, never a cached label.
 */

import { Link } from "react-router-dom";

import { useGetGovEvidenceBundleQuery, type GovBundleActivity, type GovBundleSource } from "@/app/api/igaPolicyReadsApi";
import { StatusBadge } from "@/components/console/status";
import { CopyButton } from "@/features/iga/shared/components/CopyButton";
import { Fact, Facts, Meta } from "@/features/iga/shared/components/Panel";

import { PolicyLoadFailure, StateChip, classifyPolicyError, humanize, plural, relTime, shortHash, trust } from "../shared";
import { arnTail, gapText, routeText, trustReasonText } from "./planCopy";

const SOURCE_KIND: Record<string, string> = { aws_publication: "AWS scan", k8s_sweep: "Kubernetes sweep" };
const COVERAGE: Record<string, string> = { complete: "complete", partial: "partly read", not_collected: "not collected" };
const OUTCOME: Record<string, string> = {
  observed: "used",
  no_attempt: "no attempt",
  not_enough_history: "not enough history",
  unreviewed: "not reviewed",
  "": "not in the activity report",
};

function SourceRow({ s }: { s: GovBundleSource }) {
  const t = trust(s.trust);
  return (
    <li className="space-y-1 rounded-md border border-(--color-border-subtle) px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-(--color-text)">{SOURCE_KIND[s.kind] ?? humanize(s.kind)}</span>
        <StateChip state={t} />
        <span className="text-xs text-(--color-text-muted)">revision {s.rev}</span>
      </div>
      <Facts>
        <Fact label="Published">{s.published_at ? relTime(s.published_at) : "not recorded"}</Fact>
        <Fact label="Freshness">{s.freshness_hours} h old when the bundle was built</Fact>
        <Fact label="Authenticated">{s.authenticated ? "yes" : "no"}</Fact>
        <Fact label="Ordered">{s.ordered ? "yes" : "no"}</Fact>
        <Fact label="Activity report">{s.activity_report_generated_at ? `generated ${relTime(s.activity_report_generated_at)}` : "none"}</Fact>
        <Fact label="Resource policies">{COVERAGE[s.resource_policy_coverage] ?? humanize(s.resource_policy_coverage)}</Fact>
        {s.connector_id ? (
          <Fact label="Connection">
            <Link to={`/iga/connections/${encodeURIComponent(s.connector_id)}/coverage`} className="font-medium text-(--color-primary-text) hover:underline">
              Open its coverage
            </Link>
          </Fact>
        ) : null}
      </Facts>
      {s.trust_reasons.length > 0 ? (
        <Meta>Not fully trusted because {s.trust_reasons.map(trustReasonText).join("; ")}.</Meta>
      ) : null}
    </li>
  );
}

function activityLine(a: GovBundleActivity): string {
  const outcome = OUTCOME[a.outcome] ?? humanize(a.outcome);
  const last = a.last_authenticated_at ? `last attempt ${relTime(a.last_authenticated_at)}` : "no attempt reported";
  const age = a.grant_age_basis === "predates_observation" ? " · grant predates the first scan" : a.grant_age_basis === "unknown" ? " · grant age unknown" : "";
  return `${outcome} · ${last}${a.qualified_days > 0 ? ` · ${a.qualified_days} d window` : ""}${age}`;
}

export function EvidenceBundleView({ ws, bundleId }: { ws: string; bundleId: string }) {
  const q = useGetGovEvidenceBundleQuery({ ws, id: bundleId }, { skip: !bundleId });
  const failure = classifyPolicyError(q.error);
  const b = q.data;

  if (!b) {
    return failure ? (
      <PolicyLoadFailure failure={failure} subject="the evidence bundle" onRetry={() => void q.refetch()} />
    ) : (
      <p role="status" className="text-sm text-(--color-text-muted)">
        Loading the evidence…
      </p>
    );
  }

  const f = b.facts;
  const removed = new Set(f.removed_services);
  const activity = [...f.activity].sort((a, c) => Number(removed.has(c.service)) - Number(removed.has(a.service)) || a.service.localeCompare(c.service));
  const t = trust(b.trust);
  const consumers = f.consumers;
  const oldest = f.sources.reduce<number | null>((m, s) => (m === null || s.freshness_hours > m ? s.freshness_hours : m), null);

  return (
    <div className="space-y-3 text-[13px] text-(--color-text)">
      <div className="flex flex-wrap items-center gap-2">
        <StateChip state={t} />
        <span className="text-xs text-(--color-text-muted)">
          {plural(f.sources.length, "source")}
          {oldest !== null ? ` · up to ${oldest} h old` : ""} · built {relTime(f.built_at)}
        </span>
      </div>
      {b.trust_reasons.length > 0 ? (
        <p className="text-xs text-(--color-text-muted)">
          {b.trust === "untrusted" ? "AuthSec cannot propose a change from this evidence" : "An approver must accept what is missing"}: {b.trust_reasons.map(trustReasonText).join("; ")}.
        </p>
      ) : null}

      <section aria-label="Gaps an approver must accept" className="space-y-1">
        <h4 className="text-xs font-semibold text-(--color-text)">Gaps ({f.gaps.length})</h4>
        {f.gaps.length === 0 ? (
          <p className="text-xs text-(--color-text-muted)">No gaps: every source this plan rests on was read in full.</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-(--color-text)">
            {f.gaps.map((g) => (
              <li key={g.key}>{gapText(g)}</li>
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium">Sources ({f.sources.length})</summary>
        <ul className="space-y-2 border-t border-(--color-border-subtle) p-3">
          {f.sources.map((s) => (
            <SourceRow key={`${s.kind}:${s.connector_id}:${s.rev}`} s={s} />
          ))}
        </ul>
      </details>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium">
          Who runs as this role ({consumers.length}
          {f.consumers_unresolved > 0 ? `, ${f.consumers_unresolved} unresolved` : ""})
        </summary>
        <div className="space-y-1 border-t border-(--color-border-subtle) p-3 text-xs">
          {consumers.length === 0 ? (
            <p className="text-(--color-text-muted)">AuthSec found no workload that runs as this role.</p>
          ) : (
            <ul className="space-y-0.5">
              {consumers.map((c) => (
                <li key={`${c.workload_id}:${c.relationship}`}>
                  Workload {shortHash(c.workload_id, 6)} · {humanize(c.relationship).toLowerCase()}
                </li>
              ))}
            </ul>
          )}
          {f.consumers_unresolved > 0 ? (
            <p className="text-(--color-text-muted)">
              {plural(f.consumers_unresolved, "workload")} name this role but AuthSec could not resolve {f.consumers_unresolved === 1 ? "it" : "them"}.
            </p>
          ) : null}
          <p className="text-(--color-text-muted)">{plural(f.owners.length, "owner")} recorded for the role and what runs as it.</p>
        </div>
      </details>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium">Activity by service ({activity.length})</summary>
        <ul className="divide-y divide-(--color-border-subtle) border-t border-(--color-border-subtle) text-xs">
          {activity.map((a) => (
            <li key={a.service} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-1.5">
              <span className="font-medium text-(--color-text)">
                {a.service}
                {removed.has(a.service) ? <span className="ml-2 font-normal text-(--color-text-muted)">proposed for removal</span> : null}
              </span>
              <span className="text-(--color-text-muted)">{activityLine(a)}</span>
            </li>
          ))}
          {activity.length === 0 ? <li className="px-3 py-2 text-(--color-text-muted)">No activity was recorded.</li> : null}
        </ul>
      </details>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium">Resource-policy routes ({f.routes.length})</summary>
        <div className="space-y-1 border-t border-(--color-border-subtle) p-3 text-xs">
          {f.routes.length === 0 ? (
            <p className="text-(--color-text-muted)">No resource policy was found that grants a removed service to this role or its sessions.</p>
          ) : (
            <ul className="space-y-1.5">
              {f.routes.map((r, i) => (
                <li key={`${r.service}:${r.resource ?? r.form ?? ""}:${i}`}>{routeText(r)}</li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium">Target and integrity</summary>
        <div className="space-y-2 border-t border-(--color-border-subtle) p-3">
          <Facts>
            <Fact label="Role">{arnTail(f.target.role_arn)}</Fact>
            <Fact label="Account">{f.target.account_id}</Fact>
            <Fact label="Grants read">{plural(f.grants.length, "statement")}</Fact>
            <Fact label="Bundle hash">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs" title={b.bundle_hash}>
                  {shortHash(b.bundle_hash)}
                </span>
                <CopyButton value={b.bundle_hash} label="Copy hash" what="bundle hash" />
              </span>
            </Fact>
          </Facts>
          <Meta>The bundle cannot be edited after it is stored; a plan quotes its hash, so what was reviewed is what was compiled.</Meta>
        </div>
      </details>
      {failure ? <StatusBadge tone="warning">Showing the last loaded evidence; refreshing failed</StatusBadge> : null}
    </div>
  );
}
