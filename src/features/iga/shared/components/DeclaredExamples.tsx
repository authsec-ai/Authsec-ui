import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { StatusBadge } from "@/components/console/status";

import { ActionList } from "./ActionList";
import { Panel } from "./Panel";

/** One example of a declared permission, as the first lines of the Permissions / Resources tab state it. */
export interface ExampleLine {
  key: string;
  /** "allow" / "deny" only when the source states the effect; never inferred. */
  effect?: "allow" | "deny";
  actions: string[];
  /** The statement lists everything EXCEPT these actions (NotAction). */
  notActions?: string[];
  /** What it names: an ARN, a pattern, or null when the statement names no resource in this read. */
  target: string | null;
  /** NotResource entries: exclusions, never destinations. */
  exclusions?: string[];
  conditional?: boolean;
  /** Qualifications that answer "does this hold?": shown on the permission they bear on. */
  boundary?: boolean;
  denyStatements?: number;
}

/**
 * "Declared permissions — examples": the first grant lines at the pinned
 * publication, labelled as examples. No ranking is claimed, nothing here is a
 * count of what the object can reach, and a NotResource exclusion is never a
 * destination. Allow / Deny, conditions and exclusions are carried to the
 * drill-down (`all`) where the full statement is.
 */
export function DeclaredExamples({
  lines,
  more,
  all,
  empty,
}: {
  lines: ExampleLine[];
  /** A further page or more statements exist than these lines. Said as "More available", never a number. */
  more: boolean;
  all: { to: string; label: string };
  empty: ReactNode;
}) {
  return (
    <Panel
      title="Declared permissions — examples"
      flush
      description="The first few declared lines, not ranked and not a list of what it can reach."
      actions={
        <Link to={all.to} className="font-medium text-(--color-primary-text) hover:underline">
          {all.label}
        </Link>
      }
    >
      {lines.length ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {lines.map((l) => (
            <li key={l.key} className="space-y-1 px-4 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {l.effect ? <StatusBadge tone={l.effect === "deny" ? "warning" : "neutral"}>{l.effect === "deny" ? "Deny" : "Allow"}</StatusBadge> : null}
                {l.actions.length ? <ActionList actions={l.actions} /> : null}
                {l.notActions?.length ? (
                  <span className="text-xs text-(--color-text-muted)">
                    every action except <span className="font-mono text-(--color-text)">{l.notActions.join(", ")}</span>
                  </span>
                ) : null}
              </div>
              {l.target ? (
                <p className="text-xs text-(--color-text-muted)">
                  on <span className="break-all font-mono text-(--color-text)">{l.target}</span>
                </p>
              ) : null}
              {l.exclusions?.length ? (
                <p className="text-xs text-(--color-text-muted)">
                  All resources except <span className="break-all font-mono">{l.exclusions.join(", ")}</span>.
                </p>
              ) : null}
              {l.conditional ? <p className="text-xs text-(--color-warning-text)">Has conditions, recorded and not evaluated.</p> : null}
              {l.boundary || l.denyStatements ? (
                <p className="text-xs text-(--color-warning-text)">
                  {[l.boundary ? "Permissions boundary present" : null, l.denyStatements ? `${l.denyStatements} Deny ${l.denyStatements === 1 ? "statement" : "statements"} may restrict it` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3 text-[13px] text-(--color-text-muted)">{empty}</div>
      )}
      {more ? <p className="border-t border-(--color-border-subtle) px-4 py-2 text-xs text-(--color-text-muted)">More available.</p> : null}
    </Panel>
  );
}
