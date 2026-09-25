import { format } from "date-fns";

import { DecisionBanner } from "@/components/console/status";

import { useAnnounce } from "../announce";

/**
 * Shown when the server reports a newer publication than the one this
 * investigation reads (SPEC-iga-phase2-graph.md §2.14.5). The data on screen
 * stays; nothing swaps until the customer chooses Refresh. Refresh keeps the
 * object, tab, filters, search, sort and open evidence; paging restarts,
 * because cursors belong to one revision.
 */
export function RevisionBanner({
  currentPublishedAt,
  onRefresh,
}: {
  currentPublishedAt?: string;
  onRefresh: () => void;
}) {
  const at = currentPublishedAt ? format(new Date(currentPublishedAt), "HH:mm") : null;
  const title = at ? `A newer scan published at ${at}` : "A newer scan published";
  useAnnounce(title);
  return (
    <DecisionBanner
      tone="info"
      title={title}
      body="You are viewing the previous result. Refresh to see the current graph; your view and filters are kept."
      actionLabel="Refresh"
      onAction={onRefresh}
    />
  );
}
