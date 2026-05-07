/**
 * `ApplicationDetailTabs` — eight tabs that govern the Application
 * detail surface. Free navigation, never a wizard. The active tab is
 * derived from the URL so deep links work.
 */

import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "setup", label: "Setup" },
  { key: "tools", label: "Tools" },
  { key: "access", label: "Access" },
  { key: "clients", label: "Clients" },
  { key: "test", label: "Test" },
  { key: "launch", label: "Launch" },
  { key: "activity", label: "Activity" },
] as const;

export interface ApplicationDetailTabsProps {
  applicationId: string;
  className?: string;
}

export function ApplicationDetailTabs({
  applicationId,
  className,
}: ApplicationDetailTabsProps) {
  return (
    <nav
      aria-label="Application sections"
      data-slot="application-detail-tabs"
      className={cn(
        "flex w-full items-center gap-1 overflow-x-auto rounded-md border border-border bg-card p-1",
        className,
      )}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={`/applications/${applicationId}/${tab.key}`}
          className={({ isActive }) =>
            cn(
              "flex-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-center text-xs font-semibold transition-colors",
              isActive
                ? "bg-[color:color-mix(in_oklch,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
