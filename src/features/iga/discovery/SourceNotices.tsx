/**
 * What the page says about the state of the sources behind the list — read
 * from the connections, never inferred from the rows: a revoked connection, a
 * failed or running scan, a failed publication, a partial collection, a
 * Kubernetes sweep that did not cover the whole cluster.
 *
 * Each says what STILL holds (the earlier results remain; nothing was deleted)
 * and links to the connection, where the action is. Discovery requests no scan.
 */

import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/console/status";

import type { Notice } from "./connectionNotices";

const SHOWN = 4;

export function SourceNotices({ notices }: { notices: Notice[] }) {
  if (!notices.length) return null;
  const shown = notices.slice(0, SHOWN);
  return (
    <section aria-label="State of the sources" className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <ul className="divide-y divide-(--color-border-subtle)">
        {shown.map((n) => (
          <li key={n.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
            <StatusBadge tone={n.tone}>{n.label}</StatusBadge>
            <span className="min-w-0 flex-1 text-(--color-text-muted)">{n.text}</span>
            {n.href ? (
              <Link to={n.href} className="shrink-0 text-sm font-semibold text-(--color-primary-text) hover:underline">
                View connection
              </Link>
            ) : null}
          </li>
        ))}
        {notices.length > SHOWN ? (
          <li className="px-4 py-2 text-sm">
            <Link to="/iga/connections" className="font-semibold text-(--color-primary-text) hover:underline">
              {notices.length - SHOWN} more on Connections
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
