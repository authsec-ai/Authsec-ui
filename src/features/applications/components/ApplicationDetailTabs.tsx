/**
 * `ApplicationDetailTabs` — the single workspace navigation for an
 * Application detail page.
 *
 * Compact lifecycle navigation. Status detail belongs in the page body;
 * tabs only carry a small semantic dot.
 */

import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Readiness, ReadinessState } from "../types";

const TABS = [
  { key: "overview", label: "Overview", readinessKey: null },
  { key: "setup", label: "Protect", readinessKey: "protection" },
  { key: "tools", label: "Tools", readinessKey: "tools" },
  { key: "access", label: "Access", readinessKey: "access" },
  { key: "clients", label: "Clients", readinessKey: "clients" },
  { key: "test", label: "Test", readinessKey: "test" },
  { key: "launch", label: "Launch", readinessKey: "launch" },
  { key: "activity", label: "Monitor", readinessKey: null },
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
        "flex h-12 w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white px-2 shadow-[0_1px_1px_rgba(15,23,42,0.02)]",
        className,
      )}
    >
      {TABS.map((tab) => {
        const area = tab.readinessKey ? readiness?.[tab.readinessKey] : undefined;
        return (
          <NavLink
            key={tab.key}
            to={`/applications/${applicationId}/${tab.key}`}
            title={area?.detail ?? area?.status ?? tab.label}
            className={({ isActive }) =>
              cn(
                "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              )
            }
          >
            {area ? (
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", STATE_DOT_CLASS[area.state])}
              />
            ) : null}
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
