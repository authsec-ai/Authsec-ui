import { Button } from "@/components/ui/button";

import type { GraphFailure } from "../graphErrors";

/**
 * The answer shown in place of a view's content when there is nothing to
 * render from (SPEC-iga-phase2-graph.md §2.14.7). Each failure has its own
 * words: "not deployed yet", "not permitted" and "could not ask" must never
 * read alike, and none of them is an empty result.
 */
export function GraphStatePanel({
  failure,
  subject,
  onRetry,
  onRefresh,
}: {
  failure: GraphFailure;
  /** What the view shows, in the customer's words: "agents and workloads". */
  subject: string;
  onRetry?: () => void;
  /** Re-pin to the current revision; offered when a newer publication is current. */
  onRefresh?: () => void;
}) {
  let title: string;
  let body: string;
  let retry = false;
  let refresh = false;

  switch (failure.kind) {
    case "unavailable":
      title = "Not available yet";
      body = `This view will show ${subject} from the AWS identity graph once it is enabled for this workspace.`;
      break;
    case "unauthorized":
      title = "You need the IGA read permission";
      body = "Ask a workspace administrator for iga:read to view the identity graph.";
      break;
    case "not_found":
      title = "Not found in this workspace";
      body = "The link may be from another workspace, or the object was never discovered here.";
      break;
    case "revision_stale":
      // A new read at the old publication is refused by the server (409): say so
      // in place of this panel only, never as an error or an empty list.
      title = "A newer publication is current — refresh to continue";
      body = "This view was not loaded before it changed, and the server no longer serves the earlier publication. What is already on screen is unchanged. Refresh re-reads the whole page together.";
      refresh = true;
      break;
    case "timeout":
      title = `Could not load ${subject}`;
      body = "The request ran out of time. Narrowing the filters makes it faster.";
      retry = true;
      break;
    default:
      title = `Could not load ${subject}`;
      body = "The request failed, so nothing is known about what it would have returned.";
      retry = true;
  }

  return (
    <div className="px-6 py-14 text-center" role={retry ? "alert" : undefined}>
      <p className="text-sm font-semibold text-(--color-text)">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">{body}</p>
      {retry && onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
      {refresh && onRefresh ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}
    </div>
  );
}
