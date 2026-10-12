/**
 * Policy › Approvals (SPEC-iga-phase3-policy.md §9.3 S6, §7.5): the versions
 * waiting for the caller's decision, and the decisions the caller has made.
 *
 * `GET /approvals` needs `governance:approve` (iga_gov_policy_controller.go:144).
 * `pending` lists versions in review that the caller did not author (a person
 * never approves their own version); `decided` lists the caller's own
 * decisions. A 403 means the role cannot approve: the permission is marked
 * refused, so the Policy navigation stops offering Approvals, and this page
 * says so instead of showing an empty queue. The row does not decide anything:
 * it opens the policy, whose Overview carries the decision panel with the
 * review result, the evidence and every item to accept.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useListGovApprovalsQuery, type GovApprovalListStatus, type GovApprovalQueueItem } from "@/app/api/igaPolicyAuthoringApi";
import { DecisionBanner } from "@/components/console/status";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, StateChip, classifyPolicyError, markPolicyDenied, plural, useWorkspaceMemberSession, versionStatus } from "../shared";
import { policyHref } from "../policies/policyModel";
import { useMemberNames } from "../policies/useMemberNames";

const PAGE = 25;

const CHIPS: { value: GovApprovalListStatus; label: string }[] = [
  { value: "pending", label: "Waiting for me" },
  { value: "decided", label: "My decisions" },
];

export default function ApprovalsPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const nameOf = useMemberNames(ws);
  const [params, setParams] = useSearchParams();
  const status: GovApprovalListStatus = params.get("status") === "decided" ? "decided" : "pending";

  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: status, stack: [] });
  const stack = paging.key === status ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  // Upgrade to a workspace-member session before the member-gated list runs.
  const { ready } = useWorkspaceMemberSession();
  const query = useListGovApprovalsQuery({ ws, status, limit: PAGE, cursor }, { skip: !ready });
  const failure = classifyPolicyError(query.error);
  const refused = failure?.kind === "forbidden";
  useEffect(() => {
    if (refused) markPolicyDenied("governance:approve");
  }, [refused]);

  const rows = query.currentData?.data ?? [];
  const next = query.currentData?.meta.next_cursor ?? null;

  const columns = useMemo<AdaptiveColumn<GovApprovalQueueItem>[]>(
    () => [
      {
        id: "policy",
        header: "Policy",
        label: "Policy",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <Link to={policyHref(r.policy_id)} className="block truncate text-[13px] font-medium text-(--color-primary-text) hover:underline">
                {r.policy_name}
              </Link>
              <div className="truncate text-xs text-(--color-text-muted)">Version {r.version_no}</div>
            </div>
          );
        },
      },
      {
        id: "requester",
        header: "Requested by",
        label: "Requested by",
        priority: 1,
        approxWidth: 160,
        cell: ({ row }) => <span className="block truncate text-[13px]">{nameOf(row.original.author_id)}</span>,
        detail: (r) => nameOf(r.author_id),
      },
      {
        id: "targets",
        header: "Targets",
        label: "Targets",
        priority: 2,
        approxWidth: 90,
        cell: ({ row }) => <span className="text-[13px]">{plural(row.original.targets, "role")}</span>,
        detail: (r) => plural(r.targets, "role"),
      },
      {
        id: "state",
        header: status === "pending" ? "Version" : "Decision",
        label: status === "pending" ? "Version" : "Decision",
        priority: 3,
        approxWidth: 220,
        cell: ({ row }) => <Outcome row={row.original} />,
        detail: (r) => <Outcome row={r} />,
      },
      {
        id: "at",
        header: status === "pending" ? "Proposed" : "Decided",
        label: status === "pending" ? "Proposed" : "Decided",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => <span className="text-[13px]"><Timestamp iso={status === "pending" ? row.original.proposed_at : (row.original.decided_at ?? row.original.proposed_at)} /></span>,
        detail: (r) => <Timestamp iso={status === "pending" ? r.proposed_at : (r.decided_at ?? r.proposed_at)} />,
      },
    ],
    [nameOf, status],
  );

  const emptyState =
    status === "pending" ? (
      <div className="mx-auto max-w-md space-y-2 py-4">
        <p className="text-sm font-medium text-foreground">No version is waiting for your decision.</p>
        <p>Versions you did not author appear here once their author proposes them for review. Versions you wrote are decided by someone else.</p>
      </div>
    ) : (
      <div className="mx-auto max-w-md space-y-2 py-4">
        <p className="text-sm font-medium text-foreground">You have not approved or rejected a version yet.</p>
      </div>
    );

  return (
    <PolicyShell
      title="Approvals"
      description="Versions that need a decision. Opening one shows the owner review, the evidence and every item you must accept before approving."
    >
      {refused ? (
        <DecisionBanner
          tone="warning"
          title="Your role cannot approve"
          body="Approving or rejecting a version needs the governance:approve permission. An administrator can grant it. Policies and their reviews are still readable from the Policy menu."
          actionLabel="Open policies"
          actionHref="/iga/policy/policies"
        />
      ) : failure && !query.currentData ? (
        <PolicyLoadFailure failure={failure} subject="approvals" onRetry={() => void query.refetch()} />
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
              <div data-compact-toolbar className="border-b border-(--color-border-subtle) px-4 py-3">
                <div role="group" aria-label="Show approvals" className="flex flex-wrap items-center gap-1.5">
                  {CHIPS.map((c) => {
                    const on = status === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const n = new URLSearchParams(params);
                          if (c.value === "pending") n.delete("status");
                          else n.set("status", c.value);
                          setParams(n, { replace: true });
                        }}
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
              </div>

              <AdaptiveTable
                tableId="iga-policy-approvals"
                sizing="fit"
                rowDetails={false}
                cardsBelow={640}
                loading={(query.isLoading || (query.isFetching && !query.currentData))}
                emptyState={emptyState}
                columns={columns}
                data={rows}
                getRowId={(r) => r.approval_id ?? r.version_id}
                onRowClick={(r) => navigate(policyHref(r.policy_id))}
                enableSelection={false}
                enableExpansion={false}
                enablePagination={false}
              />

              {query.currentData ? (
                <CursorPager
                  meta={{ next_cursor: next, limit: PAGE }}
                  pageIndex={stack.length}
                  rowsOnPage={rows.length}
                  onPrev={() => setPaging({ key: status, stack: stack.slice(0, -1) })}
                  onNext={(c) => setPaging({ key: status, stack: [...stack, c] })}
                  onRetry={() => void query.refetch()}
                />
              ) : null}
            </CardContent>
          </TableCard>

          <p className="text-xs text-(--color-text-muted)">
            An owner&apos;s acknowledgement is not an approval. Approving is a separate decision, made by someone who did not write the version, after the owners have answered or an approver has recorded an exception.
          </p>
        </>
      )}
    </PolicyShell>
  );
}

function Outcome({ row }: { row: GovApprovalQueueItem }) {
  if (!row.decision) return <StateChip state={versionStatus(row.status)} />;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StateChip state={row.decision === "approve" ? { label: "You approved", tone: "success" } : { label: "You rejected", tone: "neutral" }} />
      {row.revoked_at ? <StateChip state={{ label: "Revoked", tone: "warning", hint: row.revoked_reason || undefined }} /> : null}
      <StateChip state={versionStatus(row.status)} />
    </div>
  );
}
