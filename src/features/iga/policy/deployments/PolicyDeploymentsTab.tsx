/**
 * A policy's Deployments tab (SPEC-iga-phase3-policy.md §9.3 S5): this policy's
 * deployments (`GET /deployments?policy_id=`), a row opens the deployment, and
 * Undo is offered on the latest change of each role (`canUndo`, advisory: the
 * server decides). Verification, attempts, validations and health reports are
 * on the deployment page, not repeated here.
 *
 * Usage: `<PolicyDeploymentsTab ws={ws} policyId={policy.id} />`
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { canUndo, useListGovDeploymentsQuery, type GovDeploymentView } from "@/app/api/igaPolicyDeploymentsApi";
import type { ConsoleActionItem } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";

import { PolicyLoadFailure, classifyPolicyError, usePolicyPermission } from "../shared";
import { DeploymentsTable } from "./DeploymentsTable";
import { UndoDialog } from "./UndoDialog";

const LOOK = 200;

export function PolicyDeploymentsTab({ ws, policyId }: { ws: string; policyId: string }) {
  const query = useListGovDeploymentsQuery({ ws, policy_id: policyId, limit: LOOK }, { pollingInterval: 30_000, skipPollingIfUnfocused: true });
  const enforce = usePolicyPermission("governance:enforce");
  const [undoing, setUndoing] = useState<GovDeploymentView | null>(null);

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const more = !!query.data?.meta.next_cursor;
  const failure = classifyPolicyError(query.error);

  const rowActions = useCallback(
    (d: GovDeploymentView): ConsoleActionItem[] =>
      enforce.offered && canUndo(d, rows) ? [{ label: "Undo…", destructive: true, onSelect: () => setUndoing(d) }] : [],
    [enforce.offered, rows],
  );

  if (failure && !query.data) {
    return <PolicyLoadFailure failure={failure} subject="this policy's deployments" onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-3">
      {failure ? (
        <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
          <strong className="font-medium">Could not refresh.</strong> It shows what loaded earlier.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      <TableCard>
        <CardContent variant="flush">
          <DeploymentsTable
            tableId="iga-policy-deployments-tab"
            rows={rows}
            loading={query.isLoading}
            showPolicy={false}
            rowActions={rowActions}
            emptyState={
              <div className="space-y-1 py-3">
                <p>This policy has no deployments yet.</p>
                <p className="text-xs">A deployment is created when the rollout reaches a role. Start from the Rollout tab.</p>
              </div>
            }
          />
        </CardContent>
      </TableCard>
      {more ? (
        <p className="text-xs text-(--color-text-muted)">
          Showing the first {LOOK} deployments.{" "}
          <Link to="/iga/policy/deployments" className="font-medium text-(--color-primary-text) hover:underline">
            Open Deployments
          </Link>{" "}
          for the rest.
        </p>
      ) : null}
      {undoing ? (
        <UndoDialog ws={ws} deployment={undoing} siblings={rows} siblingsPartial={more} open onOpenChange={(o) => !o && setUndoing(null)} />
      ) : null}
    </div>
  );
}
