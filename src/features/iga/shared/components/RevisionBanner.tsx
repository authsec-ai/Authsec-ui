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
  const at = currentPublishedAt ? format(new Date(currentPublishedAt), "d MMM HH:mm") : null;
  const title = at ? `A newer publication is current (${at})` : "A newer publication is current";
  useAnnounce(title);
  return (
    <DecisionBanner
      tone="info"
      title={title}
      body="What is on screen is labelled with the publication it was read at, and nothing newer is mixed in. Refresh to re-read it all at the current publication; your view and filters are kept."
      actionLabel="Refresh"
      onAction={onRefresh}
    />
  );
}
