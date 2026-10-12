/**
 * Policy › Reviews (SPEC-iga-phase3-policy.md §9.3 S4b): the owner reviews the
 * caller was asked in, the ones that need an answer first.
 *
 * What the list can truthfully say. `GET /reviews` is ordered newest first by
 * the server (iga_gov_owner_review_service.go `List`), not by deadline, and is
 * cursor-paged, so "due dates first" is applied within the page on screen:
 * reviews that wait on the caller come first, then other open reviews, each by
 * deadline, then closed ones in the server's order. A page is therefore not a
 * global ranking and the footer says so when more pages exist. `mine=true`
 * (the default) lists the reviews the caller was asked in and needs a verified
 * member session; "everyone's" needs `governance:read`. A deadline changes
 * nothing by itself (silence is not consent), so "overdue" is a mark, not a
 * state. A failed read is a banner with Retry, never an empty list.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useListGovReviewsQuery, type GovReviewStatus, type GovReviewSummary } from "@/app/api/igaPolicyAuthoringApi";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, StateChip, classifyPolicyError, plural } from "../shared";
import { POLICIES_PATH } from "../policies/policyModel";
import { dueLine, dayText, responseLabel, reviewStatus } from "./reviewCopy";

const PAGE = 25;

type Scope = "mine" | "all";
type StatusParam = "active" | "" | GovReviewStatus;

const STATUS_CHIPS: { value: StatusParam; label: string }[] = [
  { value: "active", label: "Open and reopened" },
  { value: "", label: "All" },
  { value: "complete", label: reviewStatus("complete").label },
  { value: "excepted", label: reviewStatus("excepted").label },
  { value: "cancelled", label: reviewStatus("cancelled").label },
];

const statusesOf = (s: StatusParam): GovReviewStatus[] | undefined => (s === "active" ? ["open", "reopened"] : s === "" ? undefined : [s]);

const isLive = (r: GovReviewSummary) => r.closed_at === null && (r.status === "open" || r.status === "reopened");
/** The caller was asked and has not answered a review that still takes answers. */
const waitsOnMe = (r: GovReviewSummary) => r.asked && r.my_response === null && isLive(r);

/** Waiting on the caller, then other open reviews (each by deadline), then closed ones as the server sent them. */
function arrange(rows: GovReviewSummary[]): GovReviewSummary[] {
  const group = (r: GovReviewSummary) => (waitsOnMe(r) ? 0 : isLive(r) ? 1 : 2);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ga = group(a.r);
      const gb = group(b.r);
      if (ga !== gb) return ga - gb;
      if (ga < 2 && a.r.deadline_at !== b.r.deadline_at) return a.r.deadline_at < b.r.deadline_at ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.r);
}

export default function ReviewsPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const scope: Scope = params.get("scope") === "all" ? "all" : "mine";
  const status = (params.has("status") ? (params.get("status") ?? "") : "active") as StatusParam;

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  // A cursor belongs to one filter set.
  const filterKey = `${scope}|${status}`;
  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: filterKey, stack: [] });
  const stack = paging.key === filterKey ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  const query = useListGovReviewsQuery({ ws, mine: scope === "mine", status: statusesOf(status), limit: PAGE, cursor });
  const failure = classifyPolicyError(query.error);
  const next = query.currentData?.meta.next_cursor ?? null;
  const rows = useMemo(() => arrange(query.currentData?.data ?? []), [query.currentData]);
  const waiting = rows.filter(waitsOnMe).length;
  const filtered = scope !== "mine" || status !== "active";

  const columns = useMemo<AdaptiveColumn<GovReviewSummary>[]>(
    () => [
      {
        id: "policy",
        header: "Change",
        label: "Change",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <Link to={`/iga/policy/reviews/${encodeURIComponent(r.id)}`} className="block truncate text-[13px] font-medium text-(--color-primary-text) hover:underline">
                {r.policy_name}
              </Link>
              <div className="truncate text-xs text-(--color-text-muted)">Version {r.version_no}</div>
            </div>
          );
        },
      },
      {
        id: "mine",
        header: "Your answer",
        label: "Your answer",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => <MyAnswer review={row.original} scope={scope} />,
        detail: (r) => <MyAnswer review={r} scope={scope} />,
      },
      {
        id: "due",
        header: "Due",
        label: "Due",
        priority: 2,
        approxWidth: 200,
        cell: ({ row }) => <Due review={row.original} />,
        detail: (r) => <Due review={r} />,
      },
      {
        id: "status",
        header: "Review",
        label: "Review",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <StateChip state={reviewStatus(row.original.status)} />,
        detail: (r) => <StateChip state={reviewStatus(r.status)} />,
      },
      {
        id: "owners",
        header: "Owners responded",
        label: "Owners responded",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => <span className="text-[13px] tabular-nums">{row.original.owners_responded} of {row.original.owners_asked}</span>,
        detail: (r) => `${r.owners_responded} of ${plural(r.owners_asked, "owner")}`,
      },
    ],
    [scope],
  );

  const emptyState = filtered ? (
    <div className="space-y-2 py-2">
      <p>{scope === "mine" ? "No reviews match this filter." : "No reviews in this workspace match this filter."}</p>
      <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
        Show reviews that need my answer
      </Button>
    </div>
  ) : (
    <div className="mx-auto max-w-md space-y-2 py-4">
      <p className="text-sm font-medium text-foreground">Nothing is waiting for your answer.</p>
      <p>When a change touches a role or a workload you own, AuthSec asks you here, by email, and in Slack when it is set up.</p>
    </div>
  );

  return (
    <PolicyShell
      title="Reviews"
      description="Changes to roles and workloads you own, and what AuthSec asks you to confirm. Answering is not approving: a different person decides separately whether anything is deployed."
    >
      {failure && !query.currentData ? (
        <PolicyLoadFailure failure={failure} subject="reviews" onRetry={() => void query.refetch()} />
      ) : (
        <>
          {failure && query.currentData ? (
            <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
              <strong className="font-medium">Could not refresh the list.</strong> It shows what loaded earlier.{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          ) : null}

          <TableCard>
            <CardContent variant="flush">
              <div data-compact-toolbar className="space-y-3 border-b border-(--color-border-subtle) px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div role="group" aria-label="Filter by review status" className="flex flex-wrap items-center gap-1.5">
                    {STATUS_CHIPS.map((c) => {
                      const on = status === c.value;
                      return (
                        <button
                          key={c.value || "all"}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setParam("status", c.value === "active" ? null : c.value)}
                          className={cn(
                            "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors",
                            on
                              ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                              : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="flex-1" />
                  <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
                    Show
                    <select
                      value={scope}
                      onChange={(e) => setParam("scope", e.target.value === "all" ? "all" : null)}
                      className="h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)"
                    >
                      <option value="mine">Reviews I was asked in</option>
                      <option value="all">Every review in the workspace</option>
                    </select>
                  </label>
                </div>
                {waiting > 0 ? (
                  <p role="status" className="text-[13px] text-(--color-text)">
                    <strong className="font-medium">{plural(waiting, "review")}</strong> on this page {waiting === 1 ? "is" : "are"} waiting for your answer.
                  </p>
                ) : null}
              </div>

              <AdaptiveTable
                tableId="iga-policy-reviews"
                sizing="fit"
                rowDetails={false}
                cardsBelow={640}
                loading={(query.isLoading || (query.isFetching && !query.currentData))}
                emptyState={emptyState}
                columns={columns}
                data={rows}
                getRowId={(r) => r.id}
                onRowClick={(r) => navigate(`/iga/policy/reviews/${encodeURIComponent(r.id)}`)}
                enableSelection={false}
                enableExpansion={false}
                enablePagination={false}
              />

              {query.currentData ? (
                <CursorPager
                  meta={{ next_cursor: next, limit: PAGE }}
                  pageIndex={stack.length}
                  rowsOnPage={rows.length}
                  onPrev={() => setPaging({ key: filterKey, stack: stack.slice(0, -1) })}
                  onNext={(c) => setPaging({ key: filterKey, stack: [...stack, c] })}
                  onRetry={() => void query.refetch()}
                />
              ) : null}
            </CardContent>
          </TableCard>

          {next || stack.length > 0 ? (
            <p className="text-xs text-(--color-text-muted)">
              AuthSec lists reviews newest first. On each page the reviews waiting on you come first, soonest deadline first; older pages are not re-ranked against this one.
            </p>
          ) : null}
          <p className="text-xs text-(--color-text-muted)">
            A deadline changes nothing by itself: a version stays waiting for its owners until they answer or an approver records an exception. Policies are under{" "}
            <Link to={POLICIES_PATH} className="font-medium text-(--color-primary-text) hover:underline">
              Policies
            </Link>
            .
          </p>
        </>
      )}
    </PolicyShell>
  );
}

function MyAnswer({ review, scope }: { review: GovReviewSummary; scope: Scope }) {
  if (!review.asked) {
    return <span className="text-[13px] text-(--color-text-muted)">{scope === "all" ? "You were not asked" : "Not asked"}</span>;
  }
  if (review.my_response) return <span className="text-[13px]">{responseLabel(review.my_response)}</span>;
  return waitsOnMe(review) ? (
    <span className="text-[13px] font-medium text-(--color-text)">Needs your answer</span>
  ) : (
    <span className="text-[13px] text-(--color-text-muted)">You did not answer</span>
  );
}

function Due({ review }: { review: GovReviewSummary }) {
  const closed = review.closed_at !== null && review.status !== "reopened";
  const text = dueLine(review.deadline_at, review.overdue, closed);
  return (
    <span className={cn("text-[13px]", review.overdue ? "font-medium text-(--color-warning-text)" : undefined)} title={dayText(review.deadline_at)}>
      {text}
      {review.overdue ? <span className="sr-only"> (overdue)</span> : null}
    </span>
  );
}
