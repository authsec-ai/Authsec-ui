/**
 * The answers that replace a list's rows, each in its own words — none of them
 * is "No data" and none of them is an empty list (SPEC-console-revamp.md state
 * matrix): unauthorised, graph unavailable, failed, a newer publication,
 * empty, filtered-empty and not collected for this provider.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import type { GraphFailure } from "../shared/graphErrors";
import { notCollectedReason, TYPES_BY_PROVIDER } from "./model";
import { PROVIDER_LABEL, TYPE_LABEL, discoveryHref, type DiscoveryProvider, type DiscoveryType } from "./urlState";

function Panel({ title, children, role, action }: { title: string; children?: ReactNode; role?: "alert" | "status"; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center" role={role}>
      <p className="text-sm font-semibold text-(--color-text)">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-xs text-(--color-text-muted)">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center gap-3">{action}</div> : null}
    </div>
  );
}

/** A failed read: what it means, and what to do. Never an empty list. */
export function FailurePanel({
  failure,
  subject,
  permission,
  onRetry,
  onRefresh,
}: {
  failure: GraphFailure;
  /** What the list shows, in words: "workloads". */
  subject: string;
  /** The permission a 403 names: "iga:read". */
  permission: string;
  onRetry?: () => void;
  onRefresh?: () => void;
}) {
  switch (failure.kind) {
    case "unauthorized":
      return (
        <Panel title="Your role cannot see this">
          Ask a workspace administrator for <span className="font-mono">{permission}</span> to view {subject}.
        </Panel>
      );
    case "unavailable":
      return (
        <Panel
          title="The graph is unavailable"
          action={
            onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        >
          {subject.charAt(0).toUpperCase() + subject.slice(1)} could not be read because the graph is not enabled for this workspace, or cannot be reached right
          now. This is not an empty result.
        </Panel>
      );
    case "revision_stale":
      return (
        <Panel
          title="A newer publication is current — refresh to continue"
          action={
            onRefresh ? (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                Refresh
              </Button>
            ) : undefined
          }
        >
          This view needs the current publication. Your filters are kept.
        </Panel>
      );
    case "timeout":
      return (
        <Panel
          role="alert"
          title={`Could not load ${subject}`}
          action={
            onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        >
          The request ran out of time. Narrowing the filters makes it faster.
        </Panel>
      );
    default:
      return (
        <Panel
          role="alert"
          title={`Could not load ${subject}`}
          action={
            onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        >
          The request failed, so nothing is known about what it would have returned. This is not an empty list.
        </Panel>
      );
  }
}

/** Nothing matched, and nothing narrowed the list: we looked and there is nothing. */
export function EmptyList({ subject, detail }: { subject: string; detail: ReactNode }) {
  return (
    <Panel title={`No ${subject} found`} role="status">
      {detail}
    </Panel>
  );
}

/** Something narrowed the list to nothing: say what, and offer to clear it. */
export function FilteredEmpty({ subject, narrowing, onClear }: { subject: string; narrowing: string[]; onClear: () => void }) {
  return (
    <Panel
      title={`No ${subject} match`}
      role="status"
      action={
        <button type="button" onClick={onClear} className="text-sm font-semibold text-(--color-primary-text) hover:underline">
          Clear filters
        </button>
      }
    >
      Narrowed by {narrowing.join(", ")}.
    </Panel>
  );
}

/** The provider does not collect this: stated, with the reason, and a way to what it does collect. */
export function NotCollected({ provider, type }: { provider: DiscoveryProvider; type: DiscoveryType }) {
  const supported = TYPES_BY_PROVIDER[provider];
  return (
    <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <Panel
        title={`Not collected for ${PROVIDER_LABEL[provider]}`}
        role="status"
        action={
          <>
            {supported.map((t) => (
              <Link key={t} to={discoveryHref({ provider, type: t })} className="text-sm font-semibold text-(--color-primary-text) hover:underline">
                Show {TYPE_LABEL[t].toLowerCase()}
              </Link>
            ))}
          </>
        }
      >
        <p>
          {TYPE_LABEL[type]}: {notCollectedReason(provider, type)}
        </p>
        <p className="mt-1">This is not an empty list — nothing was looked for.</p>
      </Panel>
    </div>
  );
}

/** The URL names a source that is not a connection of this provider. */
export function UnknownSource({ id, provider, onClear }: { id: string; provider: DiscoveryProvider; onClear: () => void }) {
  return (
    <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <Panel
        title="This source is not connected"
        role="status"
        action={
          <button type="button" onClick={onClear} className="text-sm font-semibold text-(--color-primary-text) hover:underline">
            Show every {PROVIDER_LABEL[provider]} source
          </button>
        }
      >
        <span className="break-all font-mono">{id}</span> is not a {PROVIDER_LABEL[provider]} connection in this workspace, so nothing is listed rather than everything.
      </Panel>
    </div>
  );
}

/** A connection that has no objects recorded yet. */
export function SourceHasNoRows({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <Panel
        title={`Nothing recorded for ${label} yet`}
        role="status"
        action={
          <button type="button" onClick={onClear} className="text-sm font-semibold text-(--color-primary-text) hover:underline">
            Show every source
          </button>
        }
      >
        This connection has no objects in the inventory. That is a state of the connection, not a finding that it holds none.
      </Panel>
    </div>
  );
}
