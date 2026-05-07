/**
 * `ApplicationDetailTabs` — the single workspace navigation for an
 * Application detail page.
 *
 * This intentionally carries both the section navigation and readiness
 * state. Keeping those separate created two horizontal bars that competed
 * for attention and wasted the first viewport.
 */

import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Readiness, ReadinessArea, ReadinessState } from "../types";

const TABS = [
  { key: "overview", label: "Overview", readinessKey: null },
  { key: "setup", label: "SDK", readinessKey: "protection" },
  { key: "tools", label: "Tools", readinessKey: "tools" },
  { key: "access", label: "Access", readinessKey: "access" },
  { key: "clients", label: "Clients", readinessKey: "clients" },
  { key: "test", label: "Test", readinessKey: "test" },
  { key: "launch", label: "Launch", readinessKey: "launch" },
  { key: "activity", label: "Activity", readinessKey: null },
] as const;

export interface ApplicationDetailTabsProps {
  applicationId: string;
  readiness?: Readiness;
  className?: string;
}

const STATE_DOT_CLASS: Record<ReadinessState, string> = {
  ok: "bg-[var(--color-success)]",
  warn: "bg-[var(--color-warning)]",
  err: "bg-[var(--color-danger)]",
  none: "bg-muted-foreground/40",
};

function ReadinessHint({ area }: { area?: ReadinessArea }) {
  if (!area) return null;
  return (
    <span className="mt-0.5 flex min-w-0 items-center justify-center gap-1.5 text-[10px] font-medium leading-none text-muted-foreground">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", STATE_DOT_CLASS[area.state])}
      />
      <span className="truncate">{area.status}</span>
    </span>
  );
}

export function ApplicationDetailTabs({
  applicationId,
  readiness,
  className,
}: ApplicationDetailTabsProps) {
  return (
    <nav
      aria-label="Application sections"
      data-slot="application-detail-tabs"
      className={cn(
        "grid w-full grid-cols-2 gap-1 rounded-md border border-border bg-card p-1 sm:grid-cols-4 xl:grid-cols-8",
        className,
      )}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={`/applications/${applicationId}/${tab.key}`}
          className={({ isActive }) =>
            cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center rounded-sm px-2 py-1.5 text-center text-xs font-semibold transition-colors",
              isActive
                ? "bg-[color:color-mix(in_oklch,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )
          }
        >
          <span className="truncate">{tab.label}</span>
          <ReadinessHint
            area={
              tab.readinessKey
                ? readiness?.[tab.readinessKey]
                : undefined
            }
          />
        </NavLink>
      ))}
    </nav>
  );
}
