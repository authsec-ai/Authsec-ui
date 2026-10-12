/**
 * The list row of one deployment, and the deployments that share its policy.
 *
 * `GET /deployments/:id` names neither the policy, the version number nor the
 * role (services.GovDeploymentDetail), and the list cannot be filtered by id.
 * The page needs them for the role's name, Undo (the policy's plans, the
 * control's other deployments) and the link back to the policy. So the row is
 * found in the list: directly when the link carries `?policy=`, otherwise by
 * paging the unfiltered list, bounded. A deployment that is not found still
 * renders from its detail; only the actions that need the policy are withheld.
 */

import { useEffect, useState } from "react";

import { useListGovDeploymentsQuery, type GovDeploymentView } from "@/app/api/igaPolicyDeploymentsApi";

const PAGE = 200;
const MAX_PAGES = 5;

export interface DeploymentRow {
  row: GovDeploymentView | undefined;
  /** Every deployment of the row's policy that was read (the control's siblings are among them). */
  siblings: GovDeploymentView[];
  /** More deployments exist than were read: a "latest on the control" check is then advisory. */
  siblingsPartial: boolean;
  loading: boolean;
}

export function useDeploymentRow(ws: string, id: string, policyHint: string | null): DeploymentRow {
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState(1);

  const scan = useListGovDeploymentsQuery({ ws, policy_id: policyHint ?? undefined, limit: PAGE, cursor }, { skip: !id });
  const foundHere = scan.data?.data.find((d) => d.id === id);
  const next = scan.data?.meta.next_cursor ?? null;

  useEffect(() => {
    if (scan.isFetching || !scan.data || foundHere || !next || pages >= MAX_PAGES) return;
    setCursor(next);
    setPages((n) => n + 1);
  }, [scan.isFetching, scan.data, foundHere, next, pages]);

  const row = foundHere;
  // With the policy known, the siblings are the policy's own list; without a hint they come from a second, filtered read.
  const needSiblings = !!row && !policyHint;
  const sib = useListGovDeploymentsQuery({ ws, policy_id: row?.policy_id, limit: PAGE }, { skip: !needSiblings });

  const siblingSource = needSiblings ? sib.data : scan.data;
  const stillScanning = !row && !!next && pages < MAX_PAGES;
  return {
    row,
    siblings: siblingSource?.data ?? (row ? [row] : []),
    siblingsPartial: !!siblingSource?.meta.next_cursor || (!needSiblings && cursor !== undefined),
    loading: scan.isLoading || scan.isFetching || stillScanning || (needSiblings && sib.isLoading),
  };
}
