import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of a detail view whose by-id read returned 404 (see
 * isNotFoundError in lib/error-utils). Says what was missing and offers a way
 * back, rather than an endless loader or a "could not load" error that
 * suggests retrying.
 */
export function NotFoundState({
  subject,
  backTo,
  backLabel,
  onBack,
  children,
}: {
  /** What was looked up: "application", "connector", "role", "user". */
  subject: string;
  /** Link back to the list. */
  backTo?: string;
  backLabel?: string;
  /** Button handler when there is no route to go back to (drawers). */
  onBack?: () => void;
  children?: ReactNode;
}) {
  const label = backLabel ?? "Go back";
  return (
    <div
      role="status"
      data-testid="not-found-state"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold text-foreground">This {subject} was not found</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {children ?? `It may have been deleted, or it is not part of this workspace.`}
      </p>
      {backTo ? (
        <Button asChild variant="outline" size="sm">
          <Link to={backTo}>{label}</Link>
        </Button>
      ) : onBack ? (
        <Button variant="outline" size="sm" onClick={onBack}>
          {label}
        </Button>
      ) : null}
    </div>
  );
}

export default NotFoundState;
