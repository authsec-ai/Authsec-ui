/**
 * `ReadinessRibbon` — compact 6-cell strip below the ApplicationHeader.
 *
 * Six gates: Protection · Tools · Access · Clients · Test · Launch.
 * Each cell is clickable, navigates to the relevant detail tab, and
 * shows label + status text + a state-coloured dot.
 *
 * Designed to be ~44px tall — never the hero of the page. The page
 * content (queue, form, gate review, etc.) is the hero.
 */

import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Readiness, ReadinessArea, ReadinessState } from "../types";

interface RibbonCell {
  key: keyof Readiness;
  label: string;
  /** Tab path — appended to /applications/:id. */
  tab: string;
  area: ReadinessArea;
}

export interface ReadinessRibbonProps {
  applicationId: string;
  readiness: Readiness;
  className?: string;
}

const STATE_DOT_CLASS: Record<ReadinessState, string> = {
  ok: "bg-[var(--color-success)]",
  warn: "bg-[var(--color-warning)]",
  err: "bg-[var(--color-danger)]",
  none: "bg-muted-foreground/40",
};

const STATE_TEXT_CLASS: Record<ReadinessState, string> = {
  ok: "text-[var(--color-success)]",
  warn: "text-[var(--color-warning)]",
  err: "text-[var(--color-danger)]",
  none: "text-muted-foreground",
};

export function ReadinessRibbon({
  applicationId,
  readiness,
  className,
}: ReadinessRibbonProps) {
  const cells: RibbonCell[] = [
    { key: "protection", label: "Protection", tab: "setup", area: readiness.protection },
    { key: "tools", label: "Tools", tab: "tools", area: readiness.tools },
    { key: "access", label: "Access", tab: "access", area: readiness.access },
    { key: "clients", label: "Clients", tab: "clients", area: readiness.clients },
    { key: "test", label: "Test", tab: "test", area: readiness.test },
    { key: "launch", label: "Launch", tab: "launch", area: readiness.launch },
  ];

  return (
    <nav
      aria-label="Application readiness"
      data-slot="readiness-ribbon"
      className={cn(
        "flex w-full items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-card",
        className,
      )}
    >
      {cells.map((cell) => (
        <Link
          key={cell.key}
          to={`/applications/${applicationId}/${cell.tab}`}
          className="group flex flex-1 items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40"
        >
          <span
            aria-hidden
            className={cn(
              "mt-0.5 size-1.5 shrink-0 rounded-full",
              STATE_DOT_CLASS[cell.area.state],
            )}
          />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[11px] font-bold tracking-wide text-foreground">
              {cell.label}
            </span>
            <span
              className={cn(
                "truncate text-[11px] font-medium",
                STATE_TEXT_CLASS[cell.area.state],
              )}
            >
              {cell.area.status}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
