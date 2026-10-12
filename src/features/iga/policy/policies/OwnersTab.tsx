/**
 * Policy › detail › Owners & review (SPEC-iga-phase3-policy.md §9.3 S5): who
 * owns each target role (from the owners read, not inferred), and the owner
 * review of the version: who was asked, how they were reached, what they said.
 * Remind and Exception are the review controls: each is hidden once the
 * server has refused its permission. An owner answers on the review page
 * (`/iga/policy/reviews/:id`), never here.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import type { GovReviewResponseView, GovTargetView, GovVersionView } from "@/app/api/igaPolicyAuthoringApi";
import { useGetGovOwnersQuery } from "@/app/api/igaPolicyReadsApi";
import { StatusBadge } from "@/components/console/status";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { ReviewAdminControls } from "../reviews/ReviewAdminControls";
import { DELIVERY_LABEL, blockerText, dueLine, responseLabel, reviewStatus } from "../reviews/reviewCopy";
import { PolicyLoadFailure, StateChip, classifyPolicyError, plural, roleNameOf } from "../shared";
import type { VersionReview } from "./usePolicyFacts";

const TARGETS_SHOWN = 15;

export function OwnersTab({ ws, version, review }: { ws: string; version: GovVersionView | undefined; review: VersionReview }) {
  const [all, setAll] = useState(false);
  if (!version) return <p className="text-sm text-(--color-text-muted)">This policy has no version yet, so there are no target roles or review.</p>;
  const targets = all ? version.targets : version.targets.slice(0, TARGETS_SHOWN);

  return (
    <div className="space-y-4">
      <ReviewPanel version={version} review={review} />

      <Panel title="Owners of the target roles" count={plural(version.targets.length, "role")} description="An owner is asked about a role they own, directly or through a workload that runs as it.">
        {version.targets.length === 0 ? <p className="text-[13px] text-(--color-text-muted)">This version targets no role.</p> : null}
        <ul className="divide-y divide-(--color-border-subtle)">
          {targets.map((t) => (
            <TargetOwners key={t.id} ws={ws} target={t} />
          ))}
        </ul>
        {!all && version.targets.length > TARGETS_SHOWN ? (
          <button type="button" onClick={() => setAll(true)} className="mt-2 text-xs font-medium text-(--color-primary-text) hover:underline">
            Show the other {version.targets.length - TARGETS_SHOWN} roles
          </button>
        ) : null}
      </Panel>
    </div>
  );
}

function ReviewPanel({ version, review }: { version: GovVersionView; review: VersionReview }) {
  const draft = version.status === "draft";
  if (draft) {
    return (
      <Panel title="Owner review">
        <p className="text-[13px] text-(--color-text-muted)">Version {version.no} is a draft. The owners are asked when it is proposed.</p>
      </Panel>
    );
  }
  if (review.loading) {
    return (
      <Panel title="Owner review">
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading the review…
        </p>
      </Panel>
    );
  }
  if (review.facts === "unknown") {
    return review.failure ? (
      <PolicyLoadFailure failure={review.failure} subject="the owner review" onRetry={review.refetch} />
    ) : (
      <Panel title="Owner review">
        <p className="text-[13px] text-(--color-text-muted)">
          The review for version {version.no} is not among the most recent reviews, so it cannot be shown here. Open it from{" "}
          <Link to="/iga/policy/reviews" className="font-medium text-(--color-primary-text) hover:underline">
            Reviews
          </Link>
          .
        </p>
      </Panel>
    );
  }
  const { summary, view } = review;
  if (!summary) {
    return (
      <Panel title="Owner review">
        <p className="text-[13px] text-(--color-text-muted)">No owner review was opened for version {version.no}.</p>
      </Panel>
    );
  }
  const st = reviewStatus(summary.status);
  const closed = summary.closed_at !== null;
  return (
    <>
      <Panel
        title="Owner review"
        count={`${summary.owners_responded} of ${summary.owners_asked} responded`}
        actions={
          <Link to={`/iga/policy/reviews/${encodeURIComponent(summary.id)}`} className="font-medium text-(--color-primary-text) hover:underline">
            Open the review
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateChip state={st} />
          <span className="text-[13px] text-(--color-text-muted)">{dueLine(summary.deadline_at, summary.overdue, closed)}</span>
        </div>
        {view && view.blockers.length > 0 ? (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-(--color-text)">
            {view.blockers.map((b, i) => (
              <li key={`${b.kind}-${b.user_id ?? b.target_id ?? i}`}>{blockerText(b)}</li>
            ))}
          </ul>
        ) : null}
        {view?.gate && !view.gate.passed ? <Meta className="mt-2">Approval is held: {view.gate.message}</Meta> : null}
        {view?.exception_by ? <Meta className="mt-2">Excepted: {view.exception_reason}</Meta> : null}
        <Meta className="mt-2">Silence is not consent. A deadline that passes changes nothing.</Meta>
      </Panel>

      {view ? (
        <Panel title="Responses" count={plural(view.responses.length, "owner")} flush>
          {view.responses.length === 0 ? <p className="px-4 py-3 text-[13px] text-(--color-text-muted)">No owner could be asked.</p> : null}
          <ul className="divide-y divide-(--color-border-subtle)">
            {view.responses.map((r) => (
              <ResponseRow key={r.user_id} r={r} />
            ))}
          </ul>
        </Panel>
      ) : null}

      {view ? <ReviewAdminControls review={view} /> : null}
    </>
  );
}

function ResponseRow({ r }: { r: GovReviewResponseView }) {
  const d = DELIVERY_LABEL[r.delivery];
  const roles = [...new Set(r.owner_of.map((o) => roleNameOf(o.role_arn) || o.name))];
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-(--color-text)">{r.name || `Member ${r.user_id.slice(0, 8)}`}</span>
        <StatusBadge tone={r.response === "object" ? "danger" : r.response ? "success" : "neutral"}>{responseLabel(r.response)}</StatusBadge>
        {!r.asked ? <StatusBadge tone="warning">Not asked yet</StatusBadge> : <StatusBadge tone={d?.tone ?? "neutral"}>{d?.label ?? r.delivery}</StatusBadge>}
        {!r.current_owner ? <span className="text-xs text-(--color-text-muted)">No longer an owner</span> : null}
      </div>
      <Meta>
        {roles.length > 0 ? `Owner of ${roles.join(", ")}` : "Owner of a target role"}
        {r.delivery_channels.length > 0 ? ` · asked by ${r.delivery_channels.join(", ")}` : ""}
        {r.responded_at ? (
          <>
            {" · "}
            <Timestamp iso={r.responded_at} />
            {r.responded_via ? ` via ${r.responded_via.replace("_", " ")}` : ""}
          </>
        ) : null}
      </Meta>
      {r.retain_items.length > 0 ? (
        <Meta>
          Keeps {r.retain_items.map((x) => x.service).join(", ")}: {r.retain_items[0]?.reason}
        </Meta>
      ) : null}
      {r.age_confirmations.length > 0 || r.route_confirmations.length > 0 ? (
        <Meta>
          Confirmed {plural(r.age_confirmations.filter((a) => a.confirmed).length, "grant age")} and {plural(r.route_confirmations.filter((c) => c.confirmed).length, "route")}
        </Meta>
      ) : null}
      {r.comment ? <p className="text-[13px] text-(--color-text)">&ldquo;{r.comment}&rdquo;</p> : null}
    </li>
  );
}

function TargetOwners({ ws, target }: { ws: string; target: GovTargetView }) {
  const q = useGetGovOwnersQuery({ ws, object_kind: "identity_account", object_id: target.identity_account_id });
  const failure = classifyPolicyError(q.error);
  const o = q.data;
  return (
    <li className="space-y-1 py-3">
      <p className="text-[13px] font-medium text-(--color-text)">{roleNameOf(target.role_arn) || target.role_id}</p>
      {q.isLoading ? (
        <Meta>Loading owners…</Meta>
      ) : failure && !o ? (
        <Meta>
          {failure.kind === "forbidden" ? "Your role cannot see owners." : "Owners could not be read."}{" "}
          <button type="button" className="font-medium text-(--color-primary-text) hover:underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </Meta>
      ) : o && o.resolved.length === 0 ? (
        <Meta>No owner. A role with no owner cannot be reviewed; assign one in Findings or Discovery.</Meta>
      ) : o ? (
        <ul className="space-y-0.5">
          {o.resolved.map((p) => (
            <li key={p.user_id} className="text-[13px] text-(--color-text)">
              {p.name || p.email || `Member ${p.user_id.slice(0, 8)}`}
              {!p.member ? <span className="text-xs text-(--color-warning-text)"> (no longer a member)</span> : null}
              <span className="text-xs text-(--color-text-muted)">
                {" "}
                · {[...new Set(p.owner_of.map((x) => `${x.role === "accountable" ? "accountable" : "technical"} owner of ${x.name || "this role"}`))].join(", ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
