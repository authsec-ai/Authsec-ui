/**
 * Policy › Legacy agent policies (SPEC-iga-phase3-policy.md §7.10, §9.5) at
 * `/iga/policy/legacy`: a read-only list of the previous Kubernetes
 * agent-lifecycle policies, with Pause and Remove. No create, no edit.
 *
 * Unlike the other Policy views this one does not go through the policy gate
 * (`PolicyShell`): the legacy routes are not behind IGA_POLICY, and a workspace
 * whose policy product is off may still have a reconciler acting on these.
 * It uses the same page chrome and the Policy view strip directly.
 *
 * Pause and Remove need `governance:enforce`; the server's 403 hides them. The
 * list is cursor-paged; a 404 `legacy_agent_policies_unavailable` means there is
 * nothing to show (the stack is off and the workspace has none), not a failure.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useListLegacyAgentPoliciesQuery, type LegacyAgentPolicyView } from "@/app/api/igaPolicySetupApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyNav, classifyPolicyError, humanize, usePolicyPermission } from "../shared";
import { PauseLegacyPolicyDialog, RemoveLegacyPolicyDialog } from "./LegacyActionDialogs";
import { lastActionLine, onExpiryWords, outcomeView, targetLabel } from "./legacyModel";
import { LEGACY_ADMIN } from "./useLegacyAdmin";

const PAGE = 25;

function Target({ p }: { p: LegacyAgentPolicyView }) {
  return (
    <div className="min-w-0 text-[13px]">
      <span className="block truncate">{targetLabel(p)}</span>
      {p.target.kind === "selector" && p.target.selector ? (
        <details className="text-xs text-(--color-text-muted)">
          <summary className="cursor-pointer">Selector</summary>
          <pre className="mt-1 max-w-xs overflow-auto whitespace-pre-wrap break-all font-mono">{JSON.stringify(p.target.selector, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function LastReconcile({ p }: { p: LegacyAgentPolicyView }) {
  const o = p.last_reconcile;
  if (!o) return <span className="text-[13px] text-(--color-text-muted)">Nothing recorded</span>;
  const v = outcomeView(o);
  return (
    <div className="min-w-0 space-y-0.5">
      <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
      <p className="text-xs text-(--color-text-muted)">
        {lastActionLine(o)}
      </p>
      {o.detail ? <p className="line-clamp-2 break-words text-xs text-(--color-text-muted)">{o.detail}</p> : null}
    </div>
  );
}

function Deadline({ p }: { p: LegacyAgentPolicyView }) {
  if (!p.pending_destructive_deadline) return <span className="text-[13px] text-(--color-text-muted)">None</span>;
  const past = new Date(p.pending_destructive_deadline).getTime() <= Date.now();
  return (
    <div className="space-y-0.5 text-[13px]">
      <span className={past ? "font-medium text-(--color-danger-text)" : "font-medium text-(--color-warning-text)"}>
        <Timestamp iso={p.pending_destructive_deadline} />
      </span>
      <p className="text-xs text-(--color-text-muted)">
        {past ? "Acts on its next pass: " : "Then: "}
        {onExpiryWords(p.on_expiry)}.
      </p>
    </div>
  );
}

export default function LegacyPoliciesPage() {
  const ws = getWorkspaceId() ?? "";
  const admin = usePolicyPermission(LEGACY_ADMIN);
  const [stack, setStack] = useState<string[]>([]);
  const cursor = stack[stack.length - 1];
  const query = useListLegacyAgentPoliciesQuery({ ws, limit: PAGE, cursor });
  const [pausing, setPausing] = useState<LegacyAgentPolicyView | null>(null);
  const [removing, setRemoving] = useState<LegacyAgentPolicyView | null>(null);

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const meta = query.data?.meta;
  const failure = classifyPolicyError(query.error);
  // Nothing to show: the legacy stack is off and the workspace has none.
  const nothing = failure?.code === "legacy_agent_policies_unavailable";

  // Removing the last row of a later page leaves it empty: go back one page.
  useEffect(() => {
    if (query.data && rows.length === 0 && stack.length > 0) setStack((s) => s.slice(0, -1));
  }, [query.data, rows.length, stack.length]);

  const columns = useMemo<AdaptiveColumn<LegacyAgentPolicyView>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        label: "Policy",
        primary: true,
        alwaysVisible: true,
        minWidth: 200,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-(--color-text)">{row.original.name}</span>
            {row.original.description ? <span className="block truncate text-xs text-(--color-text-muted)">{row.original.description}</span> : null}
          </div>
        ),
      },
      {
        id: "target",
        header: "Target",
        label: "Target",
        priority: 1,
        approxWidth: 190,
        cell: ({ row }) => <Target p={row.original} />,
        detail: (p) => <Target p={p} />,
      },
      {
        id: "enabled",
        header: "State",
        label: "State",
        priority: 2,
        approxWidth: 130,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <StatusBadge tone={row.original.enabled ? "warning" : "neutral"}>{row.original.enabled ? "Enabled" : "Paused"}</StatusBadge>
            <p className="text-xs text-(--color-text-muted)">Wants {humanize(row.original.desired_state).toLowerCase()}</p>
          </div>
        ),
        detail: (p) => `${p.enabled ? "Enabled" : "Paused"}, wants ${humanize(p.desired_state).toLowerCase()}`,
      },
      {
        id: "last",
        header: "Last reconcile",
        label: "Last reconcile",
        priority: 3,
        approxWidth: 220,
        cell: ({ row }) => <LastReconcile p={row.original} />,
        detail: (p) => <LastReconcile p={p} />,
      },
      {
        id: "deadline",
        header: "Pending destructive deadline",
        label: "Pending destructive deadline",
        priority: 4,
        approxWidth: 220,
        cell: ({ row }) => <Deadline p={row.original} />,
        detail: (p) => <Deadline p={p} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        label: "Actions",
        alwaysVisible: true,
        approxWidth: 170,
        className: "pr-4",
        cellClassName: "pr-4 text-right",
        cell: ({ row }) =>
          admin.refused ? null : (
            <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {row.original.enabled ? (
                <Button size="sm" variant="outline" onClick={() => setPausing(row.original)} aria-label={`Pause ${row.original.name}`}>
                  Pause
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setRemoving(row.original)} aria-label={`Remove ${row.original.name}`}>
                Remove
              </Button>
            </div>
          ),
      },
    ],
    [admin.refused],
  );

  const emptyState = (
    <div className="mx-auto max-w-md space-y-1 py-4">
      <p className="text-sm font-medium text-foreground">No legacy agent policies</p>
      <p>This workspace has none of the previous Kubernetes agent-lifecycle policies. Policy for AWS roles starts from a finding.</p>
      <Button asChild className="mt-2 text-white">
        <Link to="/iga/policy/findings">Open Findings</Link>
      </Button>
    </div>
  );

  return (
    <ConsolePage
      title="Legacy agent policies"
      description="The previous Kubernetes agent-lifecycle policies. They are listed here to pause or remove; new policy is created from findings."
    >
      <PolicyNav />
      {failure && !query.data && !nothing ? (
        failure.kind === "forbidden" ? (
          <p className="text-[13px] text-(--color-text-muted)">Your role cannot see legacy agent policies.</p>
        ) : (
          <PolicyLoadFailure failure={failure} subject="legacy agent policies" onRetry={() => void query.refetch()} />
        )
      ) : (
        <>
          {rows.length > 0 ? (
            <DecisionBanner
              tone="warning"
              title="The legacy reconciler still runs these policies"
              body={
                <>
                  They are not part of Policy. The reconciler keeps acting on every enabled one until its retirement gate.{" "}
                  {meta?.legacy_workers === "off"
                    ? "On the server that answered, the reconciler is switched off, so none is acting from there."
                    : meta?.legacy_workers === "on"
                      ? "The reconciler is running on the server that answered."
                      : ""}
                </>
              }
            />
          ) : null}
          {failure && query.data ? (
            <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
              <strong className="font-medium">Could not refresh the list.</strong> It shows what loaded earlier.{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          ) : null}
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="iga-policy-legacy"
                sizing="fit"
                rowDetails={false}
                cardsBelow={640}
                loading={query.isLoading}
                emptyState={emptyState}
                columns={columns}
                data={nothing ? [] : rows}
                getRowId={(p) => p.id}
                enableSelection={false}
                enableExpansion={false}
                enablePagination={false}
              />
              {query.data ? (
                <CursorPager
                  meta={{ next_cursor: meta?.next_cursor ?? null, limit: PAGE }}
                  pageIndex={stack.length}
                  rowsOnPage={rows.length}
                  onPrev={() => setStack((s) => s.slice(0, -1))}
                  onNext={(c) => setStack((s) => [...s, c])}
                />
              ) : null}
            </CardContent>
          </TableCard>
          {admin.refused && rows.length > 0 ? (
            <p className="text-xs text-(--color-text-muted)">Your role cannot pause or remove legacy policies. Ask a workspace administrator.</p>
          ) : null}
        </>
      )}
      <PauseLegacyPolicyDialog policy={pausing} onClose={() => setPausing(null)} />
      <RemoveLegacyPolicyDialog policy={removing} onClose={() => setRemoving(null)} />
    </ConsolePage>
  );
}
