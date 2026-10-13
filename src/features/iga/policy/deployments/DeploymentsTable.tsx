/**
 * One table of deployments, shared by Policy › Deployments (every policy) and a
 * policy's own Deployments tab (SPEC-iga-phase3-policy.md §9.3 S5, S8). Rows:
 * policy, role and account, kind, delivery, state, attempts, next action. The
 * state is text plus tone, never colour alone, and the next action is the one
 * sentence of what happens next or what needs a person.
 */

import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { GovDeploymentView } from "@/app/api/igaPolicyDeploymentsApi";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleRowActions, type ConsoleActionItem } from "@/components/console/iam-console";

import { StateChip, delivery, deploymentState, planKind, roleNameOf } from "../shared";
import { policyHref } from "../policies/policyModel";
import { deploymentHref, nextActionShort } from "./deploymentModel";

export function DeploymentsTable({
  tableId,
  rows,
  loading,
  emptyState,
  policyNames,
  showPolicy = true,
  rowActions,
}: {
  tableId: string;
  rows: GovDeploymentView[];
  loading: boolean;
  emptyState: ReactNode;
  /** Policy id to name; an id not in it reads "Policy" with its first characters. */
  policyNames?: ReadonlyMap<string, string>;
  showPolicy?: boolean;
  /** Extra items of the row menu (Undo), after Open. */
  rowActions?: (d: GovDeploymentView) => ConsoleActionItem[];
}) {
  const navigate = useNavigate();

  const columns = useMemo<AdaptiveColumn<GovDeploymentView>[]>(() => {
    const policyName = (d: GovDeploymentView) => policyNames?.get(d.policy_id) ?? `Policy ${d.policy_id.slice(0, 8)}`;
    const cols: AdaptiveColumn<GovDeploymentView>[] = [
      {
        id: "role",
        header: "Role",
        label: "Role",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="min-w-0">
              <Link
                to={deploymentHref(d.id, d.policy_id)}
                onClick={(e) => e.stopPropagation()}
                className="block truncate text-[13px] font-medium text-(--color-primary-text) hover:underline"
              >
                {roleNameOf(d.role_arn) || d.role_id}
              </Link>
              <div className="truncate text-xs text-(--color-text-muted)">
                Account {d.account_id} · version {d.version_no}
              </div>
            </div>
          );
        },
      },
      {
        id: "state",
        header: "State",
        label: "State",
        priority: 1,
        approxWidth: 170,
        cell: ({ row }) => <StateChip state={deploymentState(row.original.state, row.original.delivery)} />,
        detail: (d) => <StateChip state={deploymentState(d.state, d.delivery)} />,
      },
      {
        id: "next",
        header: "Next action",
        label: "Next action",
        priority: 2,
        approxWidth: 210,
        cell: ({ row }) => <span className="block truncate text-[13px]">{nextActionShort(row.original)}</span>,
        detail: (d) => nextActionShort(d),
      },
    ];
    if (showPolicy) {
      cols.splice(1, 0, {
        id: "policy",
        header: "Policy",
        label: "Policy",
        priority: 3,
        approxWidth: 190,
        cell: ({ row }) => (
          <Link
            to={policyHref(row.original.policy_id)}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-[13px] text-(--color-primary-text) hover:underline"
          >
            {policyName(row.original)}
          </Link>
        ),
        detail: (d) => <Link to={policyHref(d.policy_id)} className="text-(--color-primary-text) hover:underline">{policyName(d)}</Link>,
      });
    }
    cols.push(
      {
        id: "kind",
        header: "Kind",
        label: "Kind",
        priority: 4,
        approxWidth: 150,
        cell: ({ row }) => <span className="block truncate text-[13px]">{planKind(row.original.kind)}</span>,
        detail: (d) => planKind(d.kind),
      },
      {
        id: "delivery",
        header: "Delivery",
        label: "Delivery",
        priority: 5,
        approxWidth: 150,
        cell: ({ row }) => <span className="block truncate text-[13px]">{delivery(row.original.delivery)}</span>,
        detail: (d) => delivery(d.delivery),
      },
      {
        id: "attempts",
        header: "Attempts",
        label: "Attempts",
        priority: 6,
        approxWidth: 90,
        cell: ({ row }) => <span className="text-[13px] tabular-nums">{row.original.attempts}</span>,
        detail: (d) => String(d.attempts),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        label: "Actions",
        alwaysVisible: true,
        approxWidth: 64,
        className: "pr-4",
        cellClassName: "pr-4 text-right",
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                label={`Actions for the deployment on ${roleNameOf(d.role_arn) || d.role_id}`}
                items={[
                  { label: "Open deployment", onSelect: () => navigate(deploymentHref(d.id, d.policy_id)) },
                  ...(showPolicy ? [{ label: "Open policy", onSelect: () => navigate(policyHref(d.policy_id)) }] : []),
                  ...(rowActions?.(d) ?? []),
                ]}
              />
            </div>
          );
        },
      },
    );
    return cols;
  }, [policyNames, showPolicy, rowActions, navigate]);

  return (
    <AdaptiveTable
      tableId={tableId}
      sizing="fit"
      rowDetails={false}
      cardsBelow={640}
      loading={loading}
      emptyState={emptyState}
      columns={columns}
      data={rows}
      getRowId={(d) => d.id}
      onRowClick={(d) => navigate(deploymentHref(d.id, d.policy_id))}
      enableSelection={false}
      enableExpansion={false}
      enablePagination={false}
    />
  );
}
