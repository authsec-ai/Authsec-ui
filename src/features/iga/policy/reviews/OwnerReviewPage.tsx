/**
 * Owner review (SPEC-iga-phase3-policy.md §9.3 S4, §7.4): the page behind the
 * link in the email or Slack message. It tells one owner, in their own words,
 * what AuthSec proposes to change on a role they own, what is asked of them,
 * who else is asked and what happens next, and takes their answer.
 *
 * `GET /reviews/:id` serves the same view to an owner and to an approver; they
 * differ only in `my_response` and `viewer_is_owner`. An owner (who may hold
 * nothing but `governance:read`) gets the answer controls; anyone else who can
 * read it gets a read-only page plus the review controls their permissions
 * offer. A review that does not take answers (cancelled, excepted, or a version
 * that is no longer in review) says so instead of showing dead controls.
 *
 * An acknowledgement and a deployment approval are separate decisions, and the
 * page never implies otherwise: nothing changes in AWS because an owner said
 * "Looks fine".
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useGetGovReviewQuery, useGetGovVersionQuery, type GovReviewView } from "@/app/api/igaPolicyAuthoringApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";
import { SessionManager } from "@/utils/sessionManager";
import { getWorkspaceId } from "@/utils/workspace";

import {
  PolicyLoadFailure,
  PolicyShell,
  StateChip,
  classifyPolicyError,
  humanize,
  plural,
  relTime,
  serviceList,
  versionStatus,
} from "../shared";
import { ReviewAdminControls } from "./ReviewAdminControls";
import { ReviewHealthReports } from "./ReviewHealthReports";
import { RespondOutcomeBanner, ReviewRespond, type RespondOutcome } from "./ReviewRespond";
import {
  DELIVERY_LABEL,
  R1A_SCOPE,
  arnTail,
  blockerText,
  dateTimeText,
  dueLine,
  responseLabel,
  reviewStatus,
  reviewTakesAnswers,
} from "./reviewCopy";

const RETAIN_BASIS: Record<string, string> = {
  observed: "recent use in AWS's activity report",
  dependency: "another kept service depends on it",
  owner: "kept at an owner's request",
  unreviewed: "not reviewed",
};

function accountOf(arn: string): string {
  return arn.split(":")[4] ?? "";
}

/** The role(s) this owner is being asked about, in their words. */
function subjectOf(review: GovReviewView, mineOf: (id: string) => boolean): string {
  const mine = review.targets.filter((t) => mineOf(t.target_id));
  const targets = mine.length > 0 ? mine : review.targets;
  if (targets.length === 1) {
    const names = targets[0].consumers.map((c) => c.name).filter(Boolean);
    return names.length > 0 ? `the role ${names.join(", ")} ${names.length === 1 ? "runs" : "run"} as` : `the role ${arnTail(targets[0].role_arn)}`;
  }
  return `${targets.length} roles${mine.length > 0 ? " you own" : ""}`;
}

export default function OwnerReviewPage() {
  const { id = "" } = useParams();
  const ws = getWorkspaceId() ?? "";
  const [outcome, setOutcome] = useState<RespondOutcome | null>(null);
  const q = useGetGovReviewQuery({ ws, id }, { skip: !id });
  const review = q.data;
  const version = useGetGovVersionQuery(
    { ws, policyId: review?.version.policy_id ?? "", versionNo: review?.version.version_no ?? 0 },
    { skip: !review },
  );

  const failure = classifyPolicyError(q.error);

  if (!review) {
    return (
      <PolicyShell title="Owner review" nav={false}>
        {q.isLoading || (!failure && q.isFetching) ? (
          <p role="status" className="text-sm text-(--color-text-muted)">
            Loading the review…
          </p>
        ) : failure?.kind === "not_found" ? (
          <DecisionBanner
            tone="warning"
            title="This review was not found"
            body="It does not exist in this workspace, or the link is wrong. Reviews are listed under Policy › Reviews."
            actionLabel="Open my reviews"
            actionHref="/iga/policy/reviews"
          />
        ) : failure?.kind === "forbidden" ? (
          <DecisionBanner
            tone="warning"
            title="You were not asked in this review"
            body="Only the owners AuthSec asked, and people whose role can read policy, can open an owner review. If you should have been asked, tell the person who requested the change."
          />
        ) : failure ? (
          <PolicyLoadFailure failure={failure} subject="this review" onRetry={() => void q.refetch()} />
        ) : null}
      </PolicyShell>
    );
  }

  // An owner the review has not asked yet has no `my_response`, but is listed among the owners.
  const myId = SessionManager.getSession()?.user_id;
  const me = review.my_response ?? (review.viewer_is_owner ? (review.responses.find((r) => r.user_id === myId) ?? null) : null);
  const myTargets = me ? new Set(me.owner_of.map((o) => o.target_id)) : null;
  const mineOf = (tid: string) => (review.viewer_is_owner ? !myTargets || myTargets.has(tid) : false);
  const mineWorkload = new Set((me?.owner_of ?? []).filter((o) => o.object_kind === "workload").map((o) => o.object_id));

  const status = reviewStatus(review.status);
  const closed = review.closed_at !== null && review.status !== "reopened";
  const inReview = review.version.status === "in_review";
  const answering = review.viewer_is_owner && reviewTakesAnswers(review.status) && inReview;

  const requester = review.responses.find((r) => r.user_id === review.version.created_by)?.name;
  const removed = [...new Set(review.targets.flatMap((t) => t.removed.map((r) => r.service)))].sort();
  const retained = [...new Set(review.targets.flatMap((t) => t.retained.map((r) => r.service)))].sort();
  const intent = version.data?.intent;
  const days =
    intent && intent.kind === "right_size_services"
      ? Math.min(...intent.remove.filter((r) => removed.includes(r.service)).map((r) => r.qualified_days).filter((n) => n > 0), Infinity)
      : Infinity;
  const minDays = Number.isFinite(days) ? days : undefined;

  const asked = review.responses.filter((r) => r.asked || r.current_owner);
  const responded = asked.filter((r) => r.response).length;
  const first = (me?.name || "").trim().split(/\s+/)[0];

  const title = review.viewer_is_owner
    ? `${first ? `${first}, please` : "Please"} review a change to ${subjectOf(review, mineOf)}`
    : `Owner review · ${review.version.policy_name} · version ${review.version.version_no}`;

  const description = (
    <>
      <span className={review.overdue ? "font-medium text-(--color-warning-text)" : undefined}>{dueLine(review.deadline_at, review.overdue, closed)}</span>
      {" · "}
      Requested by {requester ?? "the version's author"} · {review.version.policy_name} · version {review.version.version_no}
    </>
  );

  return (
    <PolicyShell title={title} description={description} nav={false}>
      <div className="space-y-4">
        {outcome ? <RespondOutcomeBanner outcome={outcome} policyId={review.version.policy_id} /> : null}
        <StatusBanner review={review} />

        <Panel
          title="What AuthSec proposes"
          actions={
            <>
              <StateChip state={status} />
              <StateChip state={versionStatus(review.version.status)} />
            </>
          }
        >
          <div className="space-y-3 text-[13px] leading-6 text-(--color-text)">
            <p>
              {removed.length > 0 ? (
                <>
                  AWS shows no attempt{minDays ? ` in the last ${minDays} days` : ""} to use{" "}
                  <span className="font-medium">{plural(removed.length, "service")}</span> ({serviceList(removed, 12)}) through this role&apos;s IAM policies. AuthSec proposes removing
                  access to {removed.length === 1 ? "it" : "them"}
                  {retained.length > 0 ? (
                    <>
                      {" "}
                      and keeps <span className="font-medium">{serviceList(retained, 12)}</span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                "This version removes no service."
              )}
            </p>
            <Meta>{R1A_SCOPE}</Meta>
            {review.requested.route_confirmations.length > 0 ? (
              <Meta>
                Some of this access may also be reachable through resource policies, which AWS&apos;s activity report does not cover; those routes are listed below for you to confirm.
              </Meta>
            ) : null}
            <div className="space-y-2">
              {review.targets.map((t) => (
                <details key={t.target_id} className="rounded-md border border-(--color-border-subtle) px-3 py-2">
                  <summary className="cursor-pointer text-[13px] font-medium text-(--color-text)">
                    {arnTail(t.role_arn)}
                    <span className="ml-2 font-normal text-(--color-text-muted)">
                      account {accountOf(t.role_arn)} · removes {plural(t.removed.length, "service")}
                      {mineOf(t.target_id) ? " · you own this" : ""}
                    </span>
                  </summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-(--color-text-muted)">Services removed</p>
                      {t.removed.length === 0 ? (
                        <p className="text-xs text-(--color-text-muted)">None on this role.</p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-[13px]">
                          {t.removed.map((r) => (
                            <li key={r.service}>
                              {r.service}
                              <span className="text-xs text-(--color-text-muted)"> · {r.basis === "no_attempt" ? "no attempt in AWS's activity report" : humanize(r.basis)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-(--color-text-muted)">Services kept</p>
                      {t.retained.length === 0 ? (
                        <p className="text-xs text-(--color-text-muted)">None listed.</p>
                      ) : (
                        <ul className="mt-1 space-y-0.5 text-[13px]">
                          {t.retained.map((r) => (
                            <li key={r.service}>
                              {r.service}
                              <span className="text-xs text-(--color-text-muted)"> · {RETAIN_BASIS[r.basis] ?? humanize(r.basis)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </div>
            <p className="text-xs">
              <Link to={`/iga/policy/policies/${encodeURIComponent(review.version.policy_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
                Open the policy
              </Link>
            </p>
          </div>
        </Panel>

        {answering ? (
          <ReviewRespond review={review} me={me} minDays={minDays} onStale={() => void q.refetch()} onOutcome={setOutcome} />
        ) : review.viewer_is_owner ? (
          <Panel title="Your answer">
            <p className="text-[13px] text-(--color-text)">
              {me?.response ? (
                <>
                  You answered <span className="font-medium">{responseLabel(me.response)}</span>
                  {me.responded_at ? ` on ${dateTimeText(me.responded_at)}` : ""}.{" "}
                </>
              ) : (
                "You did not answer. "
              )}
              {inReview
                ? `This review is ${status.label.toLowerCase()} and no longer takes answers.`
                : `Version ${review.version.version_no} is ${versionStatus(review.version.status).label.toLowerCase()}, so an answer can no longer change anything.`}
            </p>
          </Panel>
        ) : (
          <Panel title="Read-only view">
            <p className="text-[13px] text-(--color-text-muted)">
              You are not one of the owners asked in this review, so you cannot answer it. You can see who was asked and how they answered
              {review.blockers.length > 0 ? ", and what still blocks the version" : ""}.
            </p>
          </Panel>
        )}

        <Panel title="Owners" count={`${responded} of ${asked.length} responded`} description="Silence is not consent: a deadline changes nothing, and an approver may record an exception for an owner who cannot answer." flush>
          <ul className="divide-y divide-(--color-border-subtle)">
            {review.responses.map((r) => {
              const delivery = DELIVERY_LABEL[r.delivery];
              const youAre = me?.user_id === r.user_id;
              return (
                <li key={r.user_id} className="space-y-1 px-4 py-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-(--color-text)">
                      {r.name || "An owner"}
                      {youAre ? <span className="ml-1.5 font-normal text-(--color-text-muted)">(you)</span> : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.response ? (
                        <StatusBadge tone={r.response === "object" ? "danger" : r.response === "retain" ? "warning" : "success"}>{responseLabel(r.response)}</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Silent</StatusBadge>
                      )}
                      {r.response ? null : <StatusBadge tone={delivery.tone}>{delivery.label}</StatusBadge>}
                    </div>
                  </div>
                  <p className="text-xs text-(--color-text-muted)">
                    Owns {r.owner_of.map((o) => o.name || arnTail(o.role_arn)).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "nothing listed"}
                    {!r.current_owner ? " · no longer an owner" : ""}
                    {r.delivery_channels.length > 0 ? ` · sent by ${r.delivery_channels.join(", ")}` : ""}
                    {r.responded_at ? ` · ${dateTimeText(r.responded_at)}${r.responded_via ? ` via ${humanize(r.responded_via).toLowerCase()}` : ""}` : ""}
                  </p>
                  {r.retain_items.length > 0 ? (
                    <p className="text-xs text-(--color-text-muted)">
                      Keeps {r.retain_items.map((k) => `${k.service} (${k.reason}; review by ${k.review_by})`).join("; ")}
                    </p>
                  ) : null}
                  {r.comment ? <p className="text-xs text-(--color-text-muted)">“{r.comment}”</p> : null}
                </li>
              );
            })}
            {review.responses.length === 0 ? <li className="px-4 py-3 text-[13px] text-(--color-text-muted)">Nobody can be asked: no owner is recorded for this role or for what runs as it.</li> : null}
          </ul>
        </Panel>

        <Panel title="Who else this affects" description="What runs as each role, and who answers for it.">
          <div className="space-y-3">
            {review.targets.map((t) => (
              <div key={t.target_id}>
                <p className="text-xs font-medium text-(--color-text-muted)">{arnTail(t.role_arn)}</p>
                {t.consumers.length === 0 ? (
                  <p className="text-[13px] text-(--color-text-muted)">AuthSec found no workload that runs as this role.</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {t.consumers.map((c) => (
                      <li key={c.workload_id} className="text-[13px] text-(--color-text)">
                        <span className="font-medium">{c.name || "A workload"}</span>
                        <span className="text-xs text-(--color-text-muted)">
                          {" "}
                          · {humanize(c.runtime_kind).toLowerCase()} · {humanize(c.relationship).toLowerCase()}
                          {mineWorkload.has(c.workload_id) ? " · you own this" : ""}
                        </span>
                        <span className="block text-xs text-(--color-text-muted)">
                          {c.owners.length > 0
                            ? `Owner${c.owners.length === 1 ? "" : "s"}: ${c.owners.map((o) => `${o.name || o.email || "a member"}${o.member ? "" : " (no longer a member)"}`).join(", ")}`
                            : "No accountable owner is recorded for this workload."}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {review.blockers.length > 0 && review.status !== "cancelled" && review.status !== "excepted" ? (
          <Panel title="What still blocks the version" description="The version cannot be approved while any of these remain.">
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-(--color-text)">
              {review.blockers.map((b, i) => (
                <li key={`${b.kind}-${b.user_id ?? b.target_id ?? i}`}>{blockerText(b)}</li>
              ))}
              {review.unconfirmed.age.length > 0 ? (
                <li>
                  {plural(new Set(review.unconfirmed.age.map((a) => a.service)).size, "service")} still need an owner to confirm the grant is not recent (
                  {serviceList([...new Set(review.unconfirmed.age.map((a) => a.service))], 8)}).
                </li>
              ) : null}
              {review.unconfirmed.routes.length > 0 ? <li>{plural(review.unconfirmed.routes.length, "resource-policy route")} still need an owner to confirm they are not used.</li> : null}
            </ul>
          </Panel>
        ) : null}

        <ReviewAdminControls review={review} />

        <ReviewHealthReports ws={ws} policyId={review.version.policy_id} versionNo={review.version.version_no} />

        <Panel title="What happens next">
          <NextSteps review={review} />
        </Panel>
      </div>
    </PolicyShell>
  );
}

/** The one line that says where this review stands, above everything else. */
function StatusBanner({ review }: { review: GovReviewView }) {
  if (review.status === "cancelled") {
    return (
      <DecisionBanner
        tone="neutral"
        title="This review was cancelled"
        body={`Version ${review.version.version_no} was withdrawn or replaced by a newer version, so nothing here needs your answer. A newer version asks its owners again when it is proposed.`}
      />
    );
  }
  if (review.status === "excepted") {
    return (
      <DecisionBanner
        tone="warning"
        title="An approver let this version proceed without every owner"
        body={`${review.exception_reason ? `Reason given: ${review.exception_reason}. ` : ""}Closed ${relTime(review.closed_at)}. The exception does not count as the owners' acknowledgement.`}
      />
    );
  }
  if (review.blockers.some((b) => b.kind === "impact_changed")) {
    return (
      <DecisionBanner
        tone="warning"
        title="The plan changed after owners were asked"
        body="Who or what this change affects is different from when this review opened, so earlier answers may not cover it. The review is reopened and owners are asked again."
      />
    );
  }
  if (review.version.status !== "in_review") {
    return (
      <DecisionBanner
        tone="neutral"
        title={`Version ${review.version.version_no} is ${versionStatus(review.version.status).label.toLowerCase()}`}
        body="This review is kept for the record. Answers can no longer change what happens to the version."
      />
    );
  }
  if (review.overdue) {
    return (
      <DecisionBanner
        tone="warning"
        title="This review is past its deadline"
        body="The deadline changes nothing by itself: the version stays waiting for every owner, or for an approver's recorded exception."
      />
    );
  }
  return null;
}

function NextSteps({ review }: { review: GovReviewView }) {
  if (review.status === "cancelled") {
    return <p className="text-[13px] text-(--color-text)">Nothing. If the policy is proposed again, its owners are asked again.</p>;
  }
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-6 text-(--color-text)">
      <li>
        {review.status === "complete" || review.status === "excepted"
          ? "Owners have answered, or an approver recorded an exception."
          : "Every owner answers; AuthSec reminds the ones who have not."}
      </li>
      <li>A different person with approval rights approves or rejects the version. Your acknowledgement is not that approval, and the author cannot approve their own version.</li>
      <li>
        If it is approved, AuthSec rolls it out in stages, starting with a canary role, and checks that the boundary in AWS matches the plan. You can report a problem or say it is working for what you
        own once rollout starts.
      </li>
    </ol>
  );
}
