/**
 * Policy › Overview (SPEC-iga-phase3-policy.md §9.3 S0): what AuthSec can
 * change today first — the readiness counts, from the server, each role counted
 * once — then what needs a decision now (approvals waiting for the caller,
 * owner reviews due, deployments that need a person), the hourly metrics and
 * what is coming up. It leads with the next action; detail is one click away.
 *
 * Counts come from the server's first page only (the lists have no count
 * route). When more pages exist the figure says "at least" and the empty
 * state says so, never "Nothing is waiting". A failed read is a banner with
 * Retry, never a zero.
 */

import { Link } from "react-router-dom";

import { useListGovApprovalsQuery, useListGovReviewsQuery } from "@/app/api/igaPolicyAuthoringApi";
import { needsOperator, useListGovDeploymentsQuery } from "@/app/api/igaPolicyDeploymentsApi";
import { StatusBadge } from "@/components/console/status";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { LegacyPoliciesNotice } from "../legacy/LegacyPoliciesNotice";
import { ReadinessPanel } from "../readiness/ReadinessPanel";
import {
  PolicyLoadFailure,
  PolicyShell,
  classifyPolicyError,
  plural,
  relTime,
  usePolicyPermission,
} from "../shared";
import { PolicyMetricsStrip } from "./PolicyMetricsStrip";

/** The first page is enough to say "n need you"; the list says "at least n" when more exist. */
const LOOK = 100;

function countText(n: number, more: boolean): string {
  return more ? `${n}+` : String(n);
}

function Decision({
  to,
  title,
  count,
  tone,
  children,
}: {
  to: string;
  title: string;
  count: string;
  tone: "info" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-(--color-surface-subtle) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--color-primary)"
      >
        <StatusBadge tone={tone} className="mt-0.5 shrink-0 tabular-nums">
          {count}
        </StatusBadge>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-(--color-text)">{title}</span>
          <span className="block text-xs text-(--color-text-muted)">{children}</span>
        </span>
      </Link>
    </li>
  );
}

function NeedsADecision({ ws }: { ws: string }) {
  const approve = usePolicyPermission("governance:approve");
  const approvals = useListGovApprovalsQuery({ ws, status: "pending", limit: LOOK }, { skip: !approve.offered });
  const reviews = useListGovReviewsQuery({ ws, mine: true, status: ["open", "reopened"], limit: LOOK });
  const deployments = useListGovDeploymentsQuery({ ws, limit: 200 });

  const approvalsFailure = classifyPolicyError(approvals.error);
  // A 403 is "your role cannot approve", not a failure; the nav hides Approvals once it is marked.
  const approvalsForbidden = approvalsFailure?.kind === "forbidden";
  const reviewsFailure = classifyPolicyError(reviews.error);
  const deploymentsFailure = classifyPolicyError(deployments.error);

  const approvalRows = approvals.data?.data ?? [];
  const reviewRows = reviews.data?.data ?? [];
  const overdue = reviewRows.filter((r) => r.overdue).length;
  const attention = (deployments.data?.data ?? []).filter((d) => needsOperator(d));
  const moreDeployments = !!deployments.data?.meta.next_cursor;
  const unresolved = attention.filter((d) => d.state === "outcome_unresolved").length;

  const loading = approvals.isLoading || reviews.isLoading || deployments.isLoading;
  const failures = [
    approvalsFailure && !approvalsForbidden ? { subject: "approvals", f: approvalsFailure, retry: () => void approvals.refetch() } : null,
    reviewsFailure ? { subject: "your reviews", f: reviewsFailure, retry: () => void reviews.refetch() } : null,
    deploymentsFailure ? { subject: "deployments", f: deploymentsFailure, retry: () => void deployments.refetch() } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const items: React.ReactNode[] = [];
  if (unresolved > 0) {
    items.push(
      <Decision key="unresolved" to="/iga/policy/deployments?attention=1" title="A change needs your decision" count={countText(unresolved, moreDeployments)} tone="danger">
        AuthSec could not confirm what happened to {plural(unresolved, "change")}. Each role stays locked until someone resolves it.
      </Decision>,
    );
  }
  if (approve.offered && approvalRows.length > 0) {
    items.push(
      <Decision
        key="approvals"
        to="/iga/policy/approvals"
        title={`${plural(approvalRows.length, "version")} waiting for your approval`}
        count={countText(approvalRows.length, !!approvals.data?.meta.next_cursor)}
        tone="info"
      >
        Owners have been asked. Open one to see what it removes, who is affected and the evidence behind it.
      </Decision>,
    );
  }
  if (reviewRows.length > 0) {
    items.push(
      <Decision
        key="reviews"
        to="/iga/policy/reviews"
        title={`${plural(reviewRows.length, "review")} waiting for you as an owner`}
        count={countText(reviewRows.length, !!reviews.data?.meta.next_cursor)}
        tone={overdue > 0 ? "warning" : "info"}
      >
        {overdue > 0 ? `${overdue} past the deadline. ` : ""}A change would affect something you own; silence is not consent.
      </Decision>,
    );
  }
  const otherAttention = attention.length - unresolved;
  if (otherAttention > 0) {
    items.push(
      <Decision
        key="attention"
        to="/iga/policy/deployments?attention=1"
        title={`${plural(otherAttention, "deployment")}${moreDeployments ? " or more" : ""} need attention`}
        count={countText(otherAttention, moreDeployments)}
        tone="warning"
      >
        Blocked, failed, drifted or overdue for verification.
      </Decision>,
    );
  }

  return (
    <Panel title="Needs a decision now" flush>
      {loading ? (
        <p role="status" className="px-4 py-3 text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : (
        <>
          {failures.map((x) => (
            <div key={x.subject} className="p-3">
              <PolicyLoadFailure failure={x.f} subject={x.subject} onRetry={x.retry} />
            </div>
          ))}
          {items.length > 0 ? (
            <ul className="divide-y divide-(--color-border-subtle)">{items}</ul>
          ) : failures.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-(--color-text-muted)">
              {moreDeployments || !!approvals.data?.meta.next_cursor || !!reviews.data?.meta.next_cursor ? (
                <>
                  Nothing needs you in the first {LOOK} of each list.{" "}
                  <Link to="/iga/policy/deployments?attention=1" className="text-(--color-primary-text) underline">
                    Open Deployments
                  </Link>{" "}
                  to check the rest.
                </>
              ) : (
                "Nothing is waiting for you."
              )}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function ComingUp({ ws }: { ws: string }) {
  const reviews = useListGovReviewsQuery({ ws, status: ["open", "reopened"], limit: LOOK });
  const failure = classifyPolicyError(reviews.error);
  const due = [...(reviews.data?.data ?? [])].sort((a, b) => a.deadline_at.localeCompare(b.deadline_at)).slice(0, 5);
  return (
    <Panel title="Coming up" description={reviews.data?.meta.next_cursor ? "The nearest deadlines among the latest reviews. Open Reviews for all of them." : "Owner review deadlines, soonest first."}>
      {reviews.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure ? (
        <PolicyLoadFailure failure={failure} subject="review deadlines" onRetry={() => void reviews.refetch()} />
      ) : due.length === 0 ? (
        <p className="text-[13px] text-(--color-text-muted)">No review deadlines.</p>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {due.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
              <Link to={`/iga/policy/reviews/${encodeURIComponent(r.id)}`} className="min-w-0 truncate font-medium text-(--color-primary-text) hover:underline">
                {r.policy_name} · version {r.version_no}
              </Link>
              <span className={r.overdue ? "shrink-0 text-(--color-warning-text)" : "shrink-0 text-(--color-text-muted)"}>
                {r.overdue ? "Overdue · " : "Due "}
                {relTime(r.deadline_at)} · {r.owners_responded} of {r.owners_asked} responded
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function PolicyOverviewPage() {
  const ws = getWorkspaceId() ?? "";
  return (
    <PolicyShell
      title="Policy"
      description="Decide what discovered identities may do, review who is affected, and see each change verified in AWS."
      actions={
        <Link
          to="/iga/policy/findings"
          className="inline-flex h-9 items-center rounded-md bg-(--color-primary) px-3.5 text-sm font-semibold text-white transition hover:bg-(--color-primary-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
        >
          Review findings
        </Link>
      }
    >
      <LegacyPoliciesNotice ws={ws} />
      <ReadinessPanel ws={ws} />
      <NeedsADecision ws={ws} />
      <PolicyMetricsStrip ws={ws} />
      <ComingUp ws={ws} />
    </PolicyShell>
  );
}
