import { useState } from "react";

import { refId, type GraphCoverageGap, type GraphRef, type Pipeline } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { CoverageSheet } from "../../coverage/CoverageSheet";
import { INCOMPLETE_STATES, SURFACE_STATE_LABEL } from "../labels";

/**
 * Partial collection, above the rows (SPEC-iga-phase2-graph.md §2.14.7,
 * §2.14.13): per account and surface, what could not be read and which
 * conclusion that prevents. The rows the list does have still render below.
 * A coverage gap is never described as "more available" — that is paging.
 */
export function CoverageNotice({
  ws,
  gaps,
  accountName,
  pipeline,
}: {
  ws: string;
  gaps: GraphCoverageGap[];
  accountName: (accountId: string) => string;
  pipeline?: Pipeline;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (gaps.length === 0) return null;
  const connectorOf = (accountId: string) => {
    const a = pipeline?.accounts.find((x) => x.account_id === accountId);
    return a ? refId(a.integration as GraphRef) : undefined;
  };
  return (
    <section
      aria-label="Collection gaps"
      className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)"
    >
      <ul className="divide-y divide-(--color-border-subtle)">
        {gaps.map((g) => (
          <li key={`${g.account_id}:${g.surface}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <StatusBadge tone={INCOMPLETE_STATES.has(g.state) ? "warning" : "neutral"}>
              {SURFACE_STATE_LABEL[g.state]}
            </StatusBadge>
            <span className="font-medium text-(--color-text)">
              {accountName(g.account_id)}
              <span className="ml-1 font-mono text-xs text-(--color-text-muted)">{g.account_id}</span>
              <span className="ml-2 font-mono text-xs text-(--color-text-muted)">{g.surface}</span>
            </span>
            <span className="min-w-0 flex-1 text-(--color-text-muted)">{g.affects}</span>
            <button
              type="button"
              onClick={() => setOpen(g.account_id)}
              className="shrink-0 text-sm font-semibold text-(--color-primary-text) hover:underline"
            >
              Coverage
            </button>
          </li>
        ))}
      </ul>
      <CoverageSheet
        ws={ws}
        accountId={open}
        accountName={open ? accountName(open) : ""}
        connectorId={open ? connectorOf(open) : undefined}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
