/** The panel for a thing that could not load; see `load-failure.ts`. */

import { DecisionBanner } from "./status";
import type { LoadFailure } from "./load-failure";

/** The failure of loading one thing — `subject` is "this integration". */
export function LoadFailurePanel({
  failure,
  subject,
  permission,
  onRetry,
}: {
  failure: LoadFailure;
  subject: string;
  /** The permission a 403 is missing, when it is known: "discovery:read". */
  permission?: string;
  onRetry: () => void;
}) {
  switch (failure) {
    case "not_found":
      return <DecisionBanner tone="neutral" title="Not found" body={`${capitalise(subject)} does not exist in this workspace, or it was deleted.`} />;
    case "forbidden":
      return (
        <DecisionBanner
          tone="warning"
          title="You do not have access"
          body={`Your role is missing the permission to see ${subject}${permission ? ` (${permission})` : ""}. An administrator can grant it.`}
        />
      );
    case "unauthenticated":
      return <DecisionBanner tone="warning" title="Your session has ended" body="Sign in again to continue." />;
    default:
      return (
        <DecisionBanner
          tone="danger"
          title={`Could not load ${subject}`}
          body="The request failed — this is not a missing object. Try again; if it keeps failing, the service may be unavailable."
          actionLabel="Retry"
          onAction={onRetry}
        />
      );
  }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
