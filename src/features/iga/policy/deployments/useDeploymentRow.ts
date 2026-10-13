/**
 * The list row of one deployment, and the deployments that share its policy.
 *
 * Undo needs the policy's deployments (is this the latest on the control?) and
 * the list row's version number. The list cannot be filtered by id, so the row
 * is found in the policy's own list (newest first, bounded paging). The policy
 * comes from the deployment's detail (`context`), or from the link's
 * `?policy=` until that has loaded. A deployment that is not found still
 * renders from its detail; only Undo is withheld.
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

  // The policy is known from the deployment's detail (or the link); the unfiltered list is never walked.
  const scan = useListGovDeploymentsQuery({ ws, policy_id: policyHint ?? undefined, limit: PAGE, cursor }, { skip: !id || !policyHint });
  const foundHere = scan.data?.data.find((d) => d.id === id);
  const next = scan.data?.meta.next_cursor ?? null;

  useEffect(() => {
    if (scan.isFetching || !scan.data || foundHere || !next || pages >= MAX_PAGES) return;
    setCursor(next);
    setPages((n) => n + 1);
  }, [scan.isFetching, scan.data, foundHere, next, pages]);

  const row = foundHere;
  const stillScanning = !row && !!next && pages < MAX_PAGES;
  return {
    row,
    siblings: scan.data?.data ?? (row ? [row] : []),
    siblingsPartial: !!next || cursor !== undefined,
    loading: !!policyHint && (scan.isLoading || scan.isFetching || stillScanning),
  };
}
