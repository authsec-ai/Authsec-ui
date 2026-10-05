import type { GraphFailure } from "../graphErrors";

/**
 * One line standing in for a value or a small panel whose read did not
 * arrive. Each failure has its own words — refresh-required, forbidden, not
 * served, not found and failed are never one "Could not load" — and none of
 * them reads as "none" or as an empty list. `GraphStatePanel` is the same
 * answer for a whole view.
 */
export function InlineState({
  failure,
  subject,
  onRetry,
  onRefresh,
}: {
  failure: GraphFailure;
  /** What was being read: "the identities", "declared permissions". */
  subject: string;
  onRetry?: () => void;
  onRefresh?: () => void;
}) {
  const link = (label: string, run?: () => void) =>
    run ? (
      <>
        {" "}
        <button type="button" onClick={run} className="font-medium text-(--color-primary-text) hover:underline">
          {label}
        </button>
      </>
    ) : null;
  switch (failure.kind) {
    case "revision_stale":
      return (
        <span className="text-(--color-text-muted)">
          A newer publication is current — refresh to continue.{link("Refresh", onRefresh)}
        </span>
      );
    case "unauthorized":
      return <span className="text-(--color-text-muted)">Needs the IGA read permission.</span>;
    case "unavailable":
      return <span className="text-(--color-text-muted)">Not available yet in this workspace.</span>;
    case "not_found":
      return <span className="text-(--color-text-muted)">Not found at this publication.</span>;
    default:
      return (
        <span role="alert" className="text-(--color-text-muted)">
          Could not load {subject}.{link("Retry", onRetry)}
        </span>
      );
  }
}
