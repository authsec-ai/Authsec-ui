/**
 * The compiled plans of a policy version (SPEC-iga-phase3-policy.md §3.4, §9.3
 * S3 step 4 and S5 Targets): per role, whether AuthSec can change it and why
 * not when it cannot, what the apply plan and the undo plan do, the documents
 * before and after, the operations, and the proof and gaps an approver must
 * accept. Documents, operations, hashes and the evidence bundle are
 * disclosures; the sentence about what changes leads.
 *
 * `GET /policies/:id/versions/:no/plans` serves the CURRENT plans: a draft has
 * none ("Plans are compiled when you submit"); submitting compiles them from
 * live AWS reads and a fresh evidence bundle, and an edit supersedes them.
 *
 * Contract: `<PlanView ws policyId versionNo />`.
 */

import { useState } from "react";

import {
  govParseIneligibleReason,
  useGetGovVersionPlansQuery,
  type GovImpactService,
  type GovPlanView,
  type GovPlansView,
} from "@/app/api/igaPolicyAuthoringApi";
import { useListGovDeploymentsQuery, type GovDeploymentView } from "@/app/api/igaPolicyDeploymentsApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { CopyButton } from "@/features/iga/shared/components/CopyButton";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import {
  PolicyLoadFailure,
  StateChip,
  classifyPolicyError,
  delivery,
  deploymentState,
  humanize,
  planKind,
  plural,
  relTime,
  roleNameOf,
  serviceList,
  shortHash,
  versionStatus,
} from "../shared";
import { CodeBlock } from "./CodeBlock";
import { EvidenceBundleView } from "./EvidenceBundleView";
import {
  R1A_SCOPE,
  blockerText,
  dispositionText,
  eligibilityView,
  firstBoundaryText,
  gapText,
  opText,
  planCaseText,
  prettyJson,
  refusalText,
  routeText,
  statementResultText,
  statementResultView,
  unanalysedText,
} from "./planCopy";

const NOTES: Record<string, string> = {
  already_in_place: "The role already has this change in place.",
  customer_boundary_already_excludes: "The role's own boundary already excludes these services, so there is nothing to narrow.",
  baseline_document_changed: "The boundary document recorded before AuthSec's change has changed since it was read.",
  copy_retained_for_other_users: "The copy stays because other entities still use it.",
  policy_retained_for_other_users: "The policy stays because other entities still use it.",
};

function noteText(n: string): string {
  if (NOTES[n]) return NOTES[n];
  if (n.startsWith("iac_fallback:")) return `Delivered as an export instead of a pull request: ${humanize(n.slice("iac_fallback:".length).split(":")[0]).toLowerCase()}.`;
  return humanize(n);
}

function HashRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <Fact label={label}>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs" title={value}>
          {shortHash(value)}
        </span>
        <CopyButton value={value} label="Copy" what={label.toLowerCase()} />
      </span>
    </Fact>
  );
}

function ServiceChips({ items, empty }: { items: readonly GovImpactService[] | readonly string[]; empty?: string }) {
  const names = items.map((i) => (typeof i === "string" ? i : i.service));
  if (names.length === 0) return <span className="text-(--color-text-muted)">{empty ?? "none"}</span>;
  return <span className="text-(--color-text)">{serviceList(names, 12)}</span>;
}

/** The services a plan excludes while a resource-policy route to them remains. */
function remainingRouteServices(p: GovPlanView): string[] {
  return [...new Set(p.impact.routes.filter((r) => r.effect !== "limited").map((r) => r.service))].sort();
}

function PlanSection({ ws, plan, forward }: { ws: string; plan: GovPlanView; forward: boolean }) {
  const [bundleOpen, setBundleOpen] = useState(false);
  const d = plan.diff;
  const refusals = govParseIneligibleReason(plan.ineligible_reason);
  const elig = eligibilityView(plan.eligibility);
  const routesRemain = remainingRouteServices(plan);
  const fa = d.first_attachment;
  const accepts = plan.unanalysed.length + plan.gaps.length;
  const owners = plan.impact.owners.length;
  const consumers = plan.impact.consumers.length;

  return (
    <div className="space-y-3 text-[13px] leading-6 text-(--color-text)">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{planKind(plan.kind)}</span>
        <StateChip state={elig} />
        <span className="text-xs text-(--color-text-muted)">{delivery(plan.delivery)}</span>
        <span className="text-xs text-(--color-text-muted)">
          · compiled from an AWS read {relTime(plan.basis_read_at) || "at an unrecorded time"}
        </span>
      </div>

      {plan.eligibility === "ineligible" ? (
        <div className="rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-(--color-danger-text)">
          <p className="font-medium">AuthSec cannot change this role with this plan</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {refusals.length === 0 ? <li>No reason was recorded.</li> : refusals.map((r, i) => <li key={`${r.code}:${i}`}>{refusalText(r)}</li>)}
          </ul>
        </div>
      ) : plan.eligibility === "iac_only" ? (
        <p className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text)">
          AuthSec will not write to AWS for this plan: it is delivered by pull request or export.
          {refusals.length > 0 ? ` ${refusals.map(refusalText).join(" ")}` : ""}
        </p>
      ) : null}

      <p>{planCaseText(d.case, plan)}</p>
      {d.notes.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-(--color-text-muted)">
          {d.notes.map((n) => (
            <li key={n}>{noteText(n)}</li>
          ))}
        </ul>
      ) : null}

      <Facts>
        {forward ? (
          <>
            <Fact label="Services removed">
              <ServiceChips items={d.newly_excluded} empty="none newly" />
              {d.already_excluded.length > 0 ? <span className="text-(--color-text-muted)"> · already excluded: {serviceList(d.already_excluded, 12)}</span> : null}
            </Fact>
            <Fact label="Services kept">
              <ServiceChips items={plan.impact.retained} />
            </Fact>
          </>
        ) : (
          <Fact label="Services restored">
            <ServiceChips items={d.newly_unexcluded.length > 0 ? d.newly_unexcluded : plan.impact.restored ?? []} empty="none" />
          </Fact>
        )}
        <Fact label="Boundary">
          {dispositionText(plan).join(" ")}
        </Fact>
        {forward ? (
          <Fact label="Who is affected">
            {plural(consumers, "workload")} running as this role · {plural(owners, "owner")} will be asked
          </Fact>
        ) : null}
      </Facts>

      {forward && routesRemain.length > 0 ? (
        <div className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
          <p className="font-medium">Excluded, but a route remains: {routesRemain.join(", ")}</p>
          <p>The boundary removes these from the role&apos;s IAM permissions. A resource policy can still allow access that the boundary does not limit.</p>
        </div>
      ) : null}
      {forward && plan.impact.routes.length > 0 ? (
        <details className="rounded-md border border-(--color-border-subtle)">
          <summary className="cursor-pointer select-none px-3 py-2 font-medium">Resource-policy routes ({plan.impact.routes.length})</summary>
          <ul className="space-y-1.5 border-t border-(--color-border-subtle) px-3 py-2 text-xs">
            {plan.impact.routes.map((r, i) => (
              <li key={`${r.service}:${r.resource ?? r.form ?? ""}:${i}`}>{routeText(r)}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {d.narrowing && d.narrowing.statements.length > 0 ? (
        <details className="rounded-md border border-(--color-border-subtle)" open={d.narrowing.changed}>
          <summary className="cursor-pointer select-none px-3 py-2 font-medium">
            Statements of the role&apos;s own boundary ({d.narrowing.statements.filter((s) => s.result === "kept").length} kept ·{" "}
            {d.narrowing.statements.filter((s) => s.result === "narrowed").length} narrowed · {d.narrowing.statements.filter((s) => s.result === "deleted").length} deleted)
          </summary>
          <ul className="space-y-1 border-t border-(--color-border-subtle) px-3 py-2 text-xs">
            {d.narrowing.statements.map((s) => (
              <li key={s.index} className="flex flex-wrap items-center gap-2">
                <StateChip state={statementResultView(s)} />
                <span>{statementResultText(s)}</span>
              </li>
            ))}
            <li className="text-(--color-text-muted)">
              {d.narrowing.subset_proof ? "AuthSec checked that the result allows nothing the original did not." : "The subset check did not pass."}
            </li>
          </ul>
        </details>
      ) : null}

      {fa ? (
        <div className="space-y-1.5 rounded-md border border-(--color-border-subtle) px-3 py-2">
          <p className="font-medium">First boundary on this role</p>
          <p className="text-xs text-(--color-text-muted)">
            {firstBoundaryText(fa.incomplete)}
            {fa.scan_run_id ? ` Checked against scan ${shortHash(fa.scan_run_id, 6)}.` : ""}
          </p>
          {fa.blockers.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-(--color-danger-text)">
              {fa.blockers.map((b, i) => (
                <li key={`${b.resource}:${i}`}>{blockerText(b)}</li>
              ))}
            </ul>
          ) : null}
          {fa.blockers.length === 0 && fa.incomplete.length === 0 ? (
            <p className="text-xs text-(--color-text-muted)">Every collected resource policy was read and none uses Deny with NotPrincipal.</p>
          ) : null}
        </div>
      ) : null}

      {forward && accepts > 0 ? (
        <div className="space-y-1.5 rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-(--color-warning-text)">
          <p className="font-medium">An approver must accept {plural(accepts, "item")} for this role</p>
          <p className="text-xs">AuthSec could not examine these. Each is accepted one by one, with a reason, before approval.</p>
          {plan.unanalysed.length > 0 ? (
            <div>
              <p className="text-xs font-medium">Not analysed ({plan.unanalysed.length})</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {plan.unanalysed.map((u) => (
                  <li key={u.key}>{unanalysedText(u)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.gaps.length > 0 ? (
            <div>
              <p className="text-xs font-medium">Evidence gaps ({plan.gaps.length})</p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {plan.gaps.map((g) => (
                  <li key={g.key}>{gapText(g)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {plan.before_document != null || plan.desired_document != null || plan.before_document_hash || plan.desired_document_hash ? (
        <div className="space-y-2">
          {plan.before_document != null ? (
            <CodeBlock title="Boundary document before" text={prettyJson(plan.before_document)} what="before document" filename={`before-${plan.role_id}.json`} />
          ) : (
            <Meta>{plan.before_document_hash ? "The boundary document before this plan was not archived." : "The role has no boundary document before this plan."}</Meta>
          )}
          {plan.desired_document != null ? (
            <CodeBlock title="Boundary document after" text={prettyJson(plan.desired_document)} what="desired document" filename={`desired-${plan.role_id}.json`} />
          ) : (
            <Meta>{plan.desired_document_hash ? "The document after this plan was not archived." : "This plan leaves the role with no boundary document."}</Meta>
          )}
        </div>
      ) : null}

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium">Operations in order ({plan.operations.length})</summary>
        <div className="border-t border-(--color-border-subtle) px-3 py-2">
          {plan.operations.length === 0 ? (
            <p className="text-xs text-(--color-text-muted)">This plan has no operations{plan.eligibility === "ineligible" ? ": it is not eligible" : ""}.</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-xs">
              {plan.operations.map((o, i) => (
                <li key={`${o.op}:${i}`}>
                  {opText(o)} <span className="font-mono text-(--color-text-muted)">{o.op}</span>
                </li>
              ))}
            </ol>
          )}
          <Meta className="mt-1.5">For a pull request or an export these are the changes your own tooling makes; AuthSec runs them only when it applies the plan itself.</Meta>
        </div>
      </details>

      <details className="rounded-md border border-(--color-border-subtle)" onToggle={(e) => setBundleOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer select-none px-3 py-2 font-medium">Evidence this plan was compiled from</summary>
        <div className="border-t border-(--color-border-subtle) px-3 py-2">{bundleOpen ? <EvidenceBundleView ws={ws} bundleId={plan.evidence_bundle_id} /> : null}</div>
      </details>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium">Hashes</summary>
        <div className="space-y-2 border-t border-(--color-border-subtle) px-3 py-2">
          <Facts>
            <HashRow label="Plan hash" value={plan.plan_hash} />
            <HashRow label="Material hash" value={plan.material_hash} />
            <HashRow label="Impact hash" value={plan.impact_hash} />
            <HashRow label="Precondition hash" value={plan.precondition_hash} />
            <HashRow label="Before document" value={plan.before_document_hash} />
            <HashRow label="Desired document" value={plan.desired_document_hash} />
            <Fact label="Evidence revision">{plan.evidence_rev}</Fact>
          </Facts>
          <Meta>An approval binds these values. If AWS or the evidence changes in a way that matters, they change and the plan needs a new approval.</Meta>
        </div>
      </details>
    </div>
  );
}

/** The role's newest deployment (§9.3 S5 Targets: "current deployment state"), whichever version made it. */
function newestDeployment(rows: readonly GovDeploymentView[], controlId: string): GovDeploymentView | undefined {
  return rows.filter((d) => d.control_id === controlId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}

function RolePlans({ ws, roleArn, plans, deployment }: { ws: string; roleArn: string; plans: GovPlanView[]; deployment: GovDeploymentView | "none" | "unread" | "loading" }) {
  const forward = plans.filter((p) => p.kind === "apply" || p.kind === "split");
  const others = plans.filter((p) => !forward.includes(p));
  const lead = forward[0] ?? plans[0];
  const elig = eligibilityView(lead.eligibility);
  return (
    <Panel
      title={roleNameOf(roleArn) || lead.role_id}
      actions={
        <>
          <StateChip state={elig} />
          {deployment === "unread" ? (
            <span className="text-xs text-(--color-text-muted)">Deployment state could not be read</span>
          ) : deployment === "none" ? (
            <span className="text-xs text-(--color-text-muted)">Not deployed yet</span>
          ) : deployment === "loading" ? null : (
            <span className="inline-flex items-center gap-1.5 text-xs text-(--color-text-muted)">
              {deployment.kind === "apply" ? "Deployment" : planKind(deployment.kind)}
              <StateChip state={deploymentState(deployment.state, deployment.delivery)} />
              version {deployment.version_no}
            </span>
          )}
        </>
      }
      description={<span className="break-all">{roleArn}</span>}
    >
      <div className="space-y-4">
        {forward.map((p) => (
          <PlanSection key={p.id} ws={ws} plan={p} forward />
        ))}
        {others.map((p) => (
          <details key={p.id} className="rounded-md border border-(--color-border-subtle)">
            <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-(--color-text)">
              {planKind(p.kind)} plan
              <span className="ml-2 font-normal text-(--color-text-muted)">{planCaseText(p.diff.case, p).split(".")[0]}</span>
            </summary>
            <div className="border-t border-(--color-border-subtle) px-3 py-3">
              <PlanSection ws={ws} plan={p} forward={false} />
            </div>
          </details>
        ))}
      </div>
    </Panel>
  );
}

function groupByRole(view: GovPlansView): { arn: string; plans: GovPlanView[] }[] {
  const m = new Map<string, GovPlanView[]>();
  for (const p of view.plans) m.set(p.role_id, [...(m.get(p.role_id) ?? []), p]);
  return [...m.values()].map((plans) => ({ arn: plans[0].role_arn, plans }));
}

export function PlanView({ ws, policyId, versionNo }: { ws: string; policyId: string; versionNo: number }) {
  const q = useGetGovVersionPlansQuery({ ws, policyId, versionNo }, { skip: !policyId || !versionNo });
  // The same wide page the policy's Deployments tab reads, so one cached call serves both.
  const deployments = useListGovDeploymentsQuery({ ws, policy_id: policyId, limit: 200 }, { skip: !policyId });
  const failure = classifyPolicyError(q.error);
  const view = q.data;

  if (!view) {
    return failure ? (
      <PolicyLoadFailure failure={failure} subject="the plans" onRetry={() => void q.refetch()} />
    ) : (
      <p role="status" className="text-sm text-(--color-text-muted)">
        Loading the plans…
      </p>
    );
  }

  const roles = groupByRole(view);
  const accepts = view.acceptance_items.length;
  const ineligible = view.plans.filter((p) => p.eligibility === "ineligible" && (p.kind === "apply" || p.kind === "split")).length;

  if (roles.length === 0) {
    return (
      <DecisionBanner
        tone="info"
        title={view.status === "draft" ? "Plans are compiled when you submit" : "This version has no plans"}
        body={
          view.status === "draft" ? (
            <>
              Submitting reads AWS, builds fresh evidence and compiles an apply plan and an undo plan for each role. Until then there is nothing to show but the intent. {R1A_SCOPE}
            </>
          ) : (
            <>This {versionStatus(view.status).label.toLowerCase()} version has no current plan. A plan is replaced when the version is edited and submitted again.</>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-(--color-text-muted)">
        <StateChip state={versionStatus(view.status)} />
        <span>
          {plural(roles.length, "role")}
          {ineligible > 0 ? ` · ${ineligible} not eligible` : ""}
        </span>
        {accepts > 0 ? <StatusBadge tone="warning">{plural(accepts, "item")} to accept at approval</StatusBadge> : <StatusBadge tone="success">Nothing to accept beyond approval</StatusBadge>}
      </div>
      <Meta>{R1A_SCOPE}</Meta>
      {roles.map((r) => (
        <RolePlans
          key={r.plans[0].role_id}
          ws={ws}
          roleArn={r.arn}
          plans={r.plans}
          deployment={deployments.data ? (newestDeployment(deployments.data.data, r.plans[0].control_id) ?? (deployments.data.meta.next_cursor ? "unread" : "none")) : deployments.isError ? "unread" : "loading"}
        />
      ))}
      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-(--color-text)">Hashes an approval binds</summary>
        <div className="space-y-2 border-t border-(--color-border-subtle) px-3 py-2">
          <Facts>
            <HashRow label="Intent hash" value={view.hashes.intent_hash} />
            {view.hashes.impact_hashes.map((h, i) => (
              <HashRow key={`i${i}`} label={`Impact hash ${i + 1}`} value={h} />
            ))}
            {view.hashes.plan_hashes.map((h, i) => (
              <HashRow key={`p${i}`} label={`Plan hash ${i + 1}`} value={h} />
            ))}
            {view.hashes.material_hashes.map((h, i) => (
              <HashRow key={`m${i}`} label={`Material hash ${i + 1}`} value={h} />
            ))}
          </Facts>
        </div>
      </details>
    </div>
  );
}
