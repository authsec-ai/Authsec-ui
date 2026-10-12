/**
 * The read-only evidence an approver decides on (SPEC-iga-phase3-policy.md
 * §9.3 S6): what the version does, how the owner review went, what observation
 * found, how far the evidence can be trusted, what undo does and the hashes the
 * approval binds. Each section says only what its endpoint served; a read that
 * failed says so and never reads as "nothing to report".
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  type GovPlansView,
  type GovReviewView,
  type GovVersionView,
  type GovRightSizeIntent,
} from "@/app/api/igaPolicyAuthoringApi";
import { useGetGovRolloutQuery } from "@/app/api/igaPolicyDeploymentsApi";
import { useGetGovEvidenceBundleQuery } from "@/app/api/igaPolicyReadsApi";
import { Meta } from "@/features/iga/shared/components/Panel";
import { copyToClipboard } from "@/lib/clipboard";

import {
  PolicyLoadFailure,
  StateChip,
  classifyPolicyError,
  delivery,
  humanize,
  plural,
  relTime,
  roleNameOf,
  rolloutStage,
  serviceList,
  shortHash,
  trust,
} from "../shared";
import { R1A_SCOPE, blockerText, dateTimeText, reviewStatus } from "../reviews/reviewCopy";
import { forwardPlans, routeLine, undoLine, undoPlans } from "./approvalCopy";

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[13px] font-semibold text-(--color-text)">{title}</h4>
      {children}
    </section>
  );
}

const uniq = (xs: string[]) => [...new Set(xs)].sort();

/* -------------------------------- summary --------------------------------- */

export function SummaryBlock({ version, plans, review }: { version: GovVersionView; plans: GovPlansView; review: GovReviewView | null }) {
  const fwd = forwardPlans(plans.plans);
  if (fwd.length === 0) {
    return (
      <Block title="What this version does">
        <p className="text-[13px] text-(--color-text-muted)">No plan has been compiled for this version, so there is nothing to approve yet.</p>
      </Block>
    );
  }
  const removed = uniq(fwd.flatMap((p) => p.impact.removed.map((r) => r.service)));
  const retained = uniq(fwd.flatMap((p) => p.impact.retained.map((r) => r.service)));
  const restored = uniq(fwd.flatMap((p) => (p.impact.restored ?? []).map((r) => r.service)));
  const consumerIds = uniq(fwd.flatMap((p) => p.impact.consumers.map((c) => c.workload_id)));
  const names = new Map((review?.targets ?? []).flatMap((t) => t.consumers.map((c) => [c.workload_id, c.name] as const)));
  const consumerNames = consumerIds.map((id) => names.get(id)).filter((n): n is string => !!n);
  const routes = fwd.flatMap((p) => p.impact.routes.map((r) => ({ role: roleNameOf(p.role_arn), route: r })));
  const intent = version.intent;

  let headline: ReactNode;
  if (intent.kind === "dedicated_identity") {
    headline = (
      <>
        Moves a workload from the shared role to a new role named <span className="font-medium">{intent.new_role.name}</span>. This changes which role the workload runs as; the new role is created
        with the permissions listed in the plans.
      </>
    );
  } else if (intent.kind === "remove_control") {
    headline = (
      <>
        Removes AuthSec&apos;s control from {plural(fwd.length, "role")}, restoring each role&apos;s baseline
        {restored.length > 0 ? (
          <>
            ; these services are reachable again: <span className="font-medium">{serviceList(restored, 12)}</span>
          </>
        ) : null}
        .
      </>
    );
  } else {
    headline = (
      <>
        Restricts <span className="font-medium">{plural(removed.length, "AWS service")}</span> ({serviceList(removed, 12)}) for {plural(fwd.length, "role")} and keeps{" "}
        <span className="font-medium">{serviceList(retained, 12)}</span>.
      </>
    );
  }

  return (
    <Block title="What this version does">
      <p className="text-[13px] leading-6 text-(--color-text)">{headline}</p>
      {intent.kind === "right_size_services" ? <Meta>{R1A_SCOPE}</Meta> : null}
      <p className="text-[13px] text-(--color-text)">
        {consumerIds.length > 0
          ? `Affects ${consumerNames.length === consumerIds.length ? serviceList(consumerNames, 6) : plural(consumerIds.length, "workload")}.`
          : "AuthSec found no workload that runs as these roles."}
        {fwd.some((p) => p.impact.owners.length > 0) ? ` ${plural(uniq(fwd.flatMap((p) => p.impact.owners)).length, "owner")} asked.` : " No owner is recorded for these roles or what runs as them."}
      </p>
      {routes.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-(--color-text-muted)">Resource-policy routes AuthSec found for removed services</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[13px] text-(--color-text)">
            {routes.map((x, i) => (
              <li key={i}>
                {routeLine(x.route)}
                {fwd.length > 1 ? <span className="text-xs text-(--color-text-muted)"> · {x.role}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className="rounded-md border border-(--color-border-subtle) px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-medium text-(--color-text)">Per role ({fwd.length})</summary>
        <ul className="mt-2 space-y-2 text-[13px] text-(--color-text)">
          {fwd.map((p) => (
            <li key={p.id}>
              <span className="font-medium">{roleNameOf(p.role_arn)}</span>
              <span className="text-xs text-(--color-text-muted)">
                {" "}
                · {delivery(p.delivery) || humanize(p.delivery)} · removes {plural(p.impact.removed.length, "service")}
                {p.eligibility === "iac_only" ? " · applied through your own infrastructure code" : ""}
                {p.first_attachment ? " · the role has no boundary today; this attaches the first" : ""}
              </span>
              {p.eligibility === "ineligible" ? (
                <span className="block text-xs text-(--color-danger-text)">Cannot be approved as it stands{p.ineligible_reason ? `: ${p.ineligible_reason}` : ""}.</span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </Block>
  );
}

/* ------------------------------ owner review ------------------------------ */

export type ReviewLookup = { state: "loading" } | { state: "failed"; retry: () => void } | { state: "not_found" } | { state: "ok"; review: GovReviewView };

export function ReviewBlock({ lookup }: { lookup: ReviewLookup }) {
  if (lookup.state === "loading") {
    return (
      <Block title="Owner review">
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading the owner review…
        </p>
      </Block>
    );
  }
  if (lookup.state === "failed") {
    return (
      <Block title="Owner review">
        <p className="text-[13px] text-(--color-text)">
          The owner review could not be read, so its result is not shown here. Approving is still checked by the server.{" "}
          <button className="font-medium text-(--color-primary-text) hover:underline" onClick={lookup.retry}>
            Retry
          </button>
        </p>
      </Block>
    );
  }
  if (lookup.state === "not_found") {
    return (
      <Block title="Owner review">
        <p className="text-[13px] text-(--color-text)">
          The owner review for this version was not found among the newest reviews, so its result is not shown here. The server still refuses approval until the owner gate passes.{" "}
          <Link to="/iga/policy/reviews?scope=all&status=" className="font-medium text-(--color-primary-text) hover:underline">
            Open reviews
          </Link>
        </p>
      </Block>
    );
  }

  const review = lookup.review;
  const asked = review.responses.filter((r) => r.asked || r.current_owner);
  const answered = asked.filter((r) => r.response);
  const ageAsk = uniq(review.requested.age_confirmations.map((a) => a.service));
  const ageOpen = uniq(review.unconfirmed.age.map((a) => a.service));
  const routeKeys = uniq(review.requested.route_confirmations.map((r) => `${r.service}\u001f${r.route}`));
  const routeOpen = review.unconfirmed.routes.length;
  const who = (pred: (r: GovReviewView["responses"][number]) => boolean) => asked.filter(pred).map((r) => r.name || "an owner");

  return (
    <Block title="Owner review">
      <div className="flex flex-wrap items-center gap-2">
        <StateChip state={reviewStatus(review.status)} />
        <span className="text-[13px] text-(--color-text)">
          {answered.length} of {asked.length} owners responded
          {review.overdue ? " · past its deadline" : ""}
        </span>
        <Link to={`/iga/policy/reviews/${encodeURIComponent(review.id)}`} className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
          Open the review
        </Link>
      </div>
      {review.status === "excepted" ? (
        <p className="text-[13px] text-(--color-warning-text)">
          An approver let this version proceed without every owner{review.exception_reason ? ` (${review.exception_reason})` : ""}. That is not the owners&apos; acknowledgement.
        </p>
      ) : review.gate?.passed ? (
        <p className="text-[13px] text-(--color-text)">Every owner has answered and nothing blocks the version. Owners acknowledged the change; that is not a deployment approval.</p>
      ) : review.gate && !review.gate.passed ? (
        <p className="text-[13px] text-(--color-warning-text)">{reviewGateWords(review.gate.code)}</p>
      ) : null}
      {review.blockers.length > 0 && review.status !== "excepted" ? (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-(--color-text)">
          {review.blockers.map((b, i) => (
            <li key={`${b.kind}-${b.user_id ?? b.target_id ?? i}`}>{blockerText(b)}</li>
          ))}
        </ul>
      ) : null}
      {who((r) => r.response === "object").length > 0 ? (
        <p className="text-[13px] text-(--color-danger-text)">Objection from {who((r) => r.response === "object").join(", ")}. It blocks approval until the owner changes their answer, an approver records an exception, or the author edits the version.</p>
      ) : null}
      {ageAsk.length > 0 ? (
        <p className="text-[13px] text-(--color-text)">
          Age confirmations: {ageAsk.length - ageOpen.length} of {ageAsk.length} services confirmed not added recently
          {ageOpen.length > 0 ? `; still needed for ${serviceList(ageOpen, 8)}` : ""}.
        </p>
      ) : (
        <p className="text-[13px] text-(--color-text-muted)">No grant age needed confirming: AuthSec watched each removed service&apos;s grant since it was added.</p>
      )}
      {routeKeys.length > 0 ? (
        <p className="text-[13px] text-(--color-text)">
          Resource-policy routes: {routeKeys.length - routeOpen} of {routeKeys.length} confirmed unused by an owner
          {routeOpen > 0 ? `; ${plural(routeOpen, "route")} still unconfirmed` : ""}.
        </p>
      ) : null}
    </Block>
  );
}

function reviewGateWords(code: string): string {
  switch (code) {
    case "age_unconfirmed":
      return "Owners have not confirmed when some grants were added, so approval will be refused until they do.";
    case "route_unconfirmed":
      return "Owners have not confirmed some resource-policy routes are unused, so approval will be refused until they do.";
    default:
      return "The owner review is not complete, so approval will be refused until every owner responds or an approver records an exception.";
  }
}

/* ------------------------------- observation ------------------------------ */

export function ObservationBlock({ ws, policyId, versionNo, version }: { ws: string; policyId: string; versionNo: number; version: GovVersionView }) {
  const q = useGetGovRolloutQuery({ ws, policyId, version_no: versionNo });
  const failure = classifyPolicyError(q.error);
  const intent = version.intent;
  const days = intent.kind === "right_size_services" ? (intent as GovRightSizeIntent).observation_days : undefined;
  const minQualified = intent.kind === "right_size_services" ? Math.min(...intent.remove.map((r) => r.qualified_days), Infinity) : Infinity;

  let body: ReactNode;
  if (q.isLoading) {
    body = (
      <p role="status" className="text-[13px] text-(--color-text-muted)">
        Loading the observation result…
      </p>
    );
  } else if (failure?.code === "rollout_not_started") {
    body = (
      <p className="text-[13px] text-(--color-text)">
        Observation has not started{days ? `; the window is ${plural(days, "day")}` : ""}. It does not have to finish before approval, but the canary cannot begin until it has and the version is approved.
      </p>
    );
  } else if (failure) {
    body = <PolicyLoadFailure failure={failure} subject="the observation result" onRetry={() => void q.refetch()} />;
  } else if (q.data) {
    const { rollout, results } = q.data;
    const obs = results.observation?.result;
    body = (
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-(--color-text)">
          <StateChip state={rolloutStage(rollout.stage)} />
          {rollout.observe_until ? <span>Observation window ends {dateTimeText(rollout.observe_until)} ({relTime(rollout.observe_until)}).</span> : null}
        </p>
        {obs ? (
          obs.back_to_draft.length > 0 ? (
            <p className="text-[13px] text-(--color-danger-text)">
              A removed service was attempted during observation: {obs.back_to_draft.map((a) => `${a.service} on ${dateTimeText(a.at)}`).join("; ")}. The version goes back to draft.
            </p>
          ) : obs.complete ? (
            <p className="text-[13px] text-(--color-text)">Observation is complete: no removed service was attempted, and every target has an activity report from after the window.</p>
          ) : (
            <p className="text-[13px] text-(--color-text)">
              Observation is not complete yet
              {obs.awaiting_report.length > 0 ? `: ${plural(obs.awaiting_report.length, "role")} still waiting for an activity report generated after ${dateTimeText(obs.required_after)}` : ""}
              {obs.needs_refresh ? "; AuthSec is asking for a fresh report" : ""}.
            </p>
          )
        ) : (
          <p className="text-[13px] text-(--color-text-muted)">No observation result has been recorded yet.</p>
        )}
      </div>
    );
  }

  return (
    <Block title="Observation">
      {Number.isFinite(minQualified) ? (
        <p className="text-[13px] text-(--color-text)">When this version was written, AWS&apos;s activity report showed no attempt in at least the last {plural(minQualified, "day")} for each service it removes.</p>
      ) : null}
      {body}
    </Block>
  );
}

/* --------------------------------- evidence -------------------------------- */

export function EvidenceBlock({ ws, plans }: { ws: string; plans: GovPlansView }) {
  const fwd = forwardPlans(plans.plans);
  const byBundle = new Map<string, string[]>();
  for (const p of fwd) {
    if (!p.evidence_bundle_id) continue;
    byBundle.set(p.evidence_bundle_id, [...(byBundle.get(p.evidence_bundle_id) ?? []), roleNameOf(p.role_arn)]);
  }
  return (
    <Block title="Evidence">
      {byBundle.size === 0 ? (
        <p className="text-[13px] text-(--color-text-muted)">These plans name no evidence bundle.</p>
      ) : (
        <ul className="space-y-2">
          {[...byBundle.entries()].map(([id, roles]) => (
            <BundleLine key={id} ws={ws} id={id} roles={roles} showRole={byBundle.size > 1 || fwd.length > 1} />
          ))}
        </ul>
      )}
    </Block>
  );
}

function BundleLine({ ws, id, roles, showRole }: { ws: string; id: string; roles: string[]; showRole: boolean }) {
  const q = useGetGovEvidenceBundleQuery({ ws, id });
  const failure = classifyPolicyError(q.error);
  if (q.isLoading) {
    return (
      <li role="status" className="text-[13px] text-(--color-text-muted)">
        Loading the evidence…
      </li>
    );
  }
  if (failure || !q.data) {
    return (
      <li className="text-[13px] text-(--color-text)">
        The evidence{showRole ? ` for ${roles.join(", ")}` : ""} could not be read.{" "}
        <button className="font-medium text-(--color-primary-text) hover:underline" onClick={() => void q.refetch()}>
          Retry
        </button>
      </li>
    );
  }
  const b = q.data;
  const t = trust(b.trust);
  const gaps = b.facts.gaps.length;
  return (
    <li className="space-y-0.5">
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-(--color-text)">
        <StateChip state={t} />
        {showRole ? <span className="font-medium">{roles.join(", ")}</span> : null}
        <span className="text-xs text-(--color-text-muted)">built {relTime(b.created_at)}</span>
      </p>
      {b.trust_reasons.length > 0 ? <Meta>{b.trust_reasons.map(humanize).join("; ")}.</Meta> : null}
      {b.facts.sources.map((s) => (
        <Meta key={`${s.kind}-${s.connector_id}-${s.rev}`}>
          {s.kind === "k8s_sweep" ? "Kubernetes sweep" : "AWS collection"} at revision {s.rev}, {s.trust === "trusted" ? "trusted" : s.trust}; activity report {s.activity_report_generated_at ? `generated ${relTime(s.activity_report_generated_at)}` : "time not known"}.
          {s.trust !== "trusted" ? (
            <>
              {" "}
              <Link to={`/iga/connections/${encodeURIComponent(s.connector_id)}/coverage`} className="font-medium text-(--color-primary-text) hover:underline">
                See collection coverage
              </Link>
            </>
          ) : null}
        </Meta>
      ))}
      <Meta>
        {gaps > 0
          ? `${plural(gaps, "evidence gap")} to accept below; each one is a thing AuthSec could not verify.`
          : "No evidence gap to accept."}
      </Meta>
    </li>
  );
}

/* ---------------------------------- undo ----------------------------------- */

export function UndoBlock({ plans }: { plans: GovPlansView }) {
  const undo = undoPlans(plans.plans);
  return (
    <Block title="If it has to be undone">
      {undo.length === 0 ? (
        <p className="text-[13px] text-(--color-text-muted)">This version has no undo plan.</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-(--color-text)">
          {undo.map((p) => (
            <li key={p.id}>{undoLine(p)}</li>
          ))}
        </ul>
      )}
    </Block>
  );
}

/* --------------------------------- hashes ---------------------------------- */

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-40 shrink-0 text-(--color-text-muted)">{label}</span>
      <code className="font-mono text-(--color-text)" title={value}>
        {shortHash(value)}
      </code>
      <button type="button" className="text-(--color-primary-text) hover:underline" onClick={() => void copyToClipboard(value, "Hash")} aria-label={`Copy ${label}`}>
        Copy
      </button>
    </li>
  );
}

export function HashesBlock({ version, plans }: { version: GovVersionView; plans: GovPlansView }) {
  const role = new Map(plans.plans.map((p) => [p.plan_hash, roleNameOf(p.role_arn)] as const));
  return (
    <details className="rounded-md border border-(--color-border-subtle) px-3 py-2">
      <summary className="cursor-pointer text-[13px] font-medium text-(--color-text)">What your approval binds (hashes)</summary>
      <div className="mt-2 space-y-2">
        <Meta>
          Your decision names exactly this intent, these impacts, these plans (the changes and their undo) and this evidence revision ({version.evidence_rev}). If any of them changes before you decide, the server refuses and you review the new version.
        </Meta>
        <ul className="space-y-1">
          <HashRow label="Intent" value={plans.hashes.intent_hash} />
          {plans.hashes.impact_hashes.map((h, i) => (
            <HashRow key={`i-${h}-${i}`} label={`Impact ${i + 1}`} value={h} />
          ))}
          {plans.plans.map((p) => (
            <HashRow key={p.id} label={`${humanize(p.kind)} plan · ${role.get(p.plan_hash) ?? ""}`} value={p.plan_hash} />
          ))}
          {plans.plans.map((p) => (
            <HashRow key={`m-${p.id}`} label={`Material · ${role.get(p.plan_hash) ?? ""}`} value={p.material_hash} />
          ))}
        </ul>
      </div>
    </details>
  );
}
