/**
 * `ApplicationDetailTabs` — underline tab bar for the Application detail
 * shell (Console Refresh prototype). Each tab carries a small per-area
 * readiness status dot. Renders inside a `[data-cr]` region.
 */

import { NavLink } from "react-router-dom";
import type { Readiness, ReadinessState } from "../types";

const TABS = [
  { key: "overview", label: "Overview", readinessKey: "launch" },
  { key: "setup", label: "Setup", readinessKey: "protection" },
  { key: "tools", label: "Tools", readinessKey: "tools" },
  { key: "scopes", label: "Scopes", readinessKey: "access" },
  { key: "roles", label: "Roles", readinessKey: "access" },
  { key: "access-assignments", label: "Access", readinessKey: "access" },
  { key: "clients", label: "Clients", readinessKey: "clients" },
  { key: "connections", label: "Connections", readinessKey: null },
  { key: "consent-grants", label: "Consent Grants", readinessKey: null },
  { key: "test", label: "Test", readinessKey: "test" },
  { key: "activity", label: "Monitor", readinessKey: null },
] as const;

export interface ApplicationDetailTabsProps {
  applicationId: string;
  readiness?: Readiness;
  pendingRequestCount?: number;
  pendingClientCount?: number;
  className?: string;
}

const DOT_TONE: Record<ReadinessState, string> = {
  ok: "t-success",
  warn: "t-warning",
  err: "t-danger",
  none: "t-muted",
};

export function ApplicationDetailTabs({
  applicationId,
  readiness,
  pendingRequestCount,
  pendingClientCount,
}: ApplicationDetailTabsProps) {
  return (
    <nav className="tabbar" role="tablist" aria-label="Application sections">
      {TABS.map((tab) => {
        const area = tab.readinessKey ? readiness?.[tab.readinessKey] : undefined;
        const badge =
          tab.key === "requests" && (pendingRequestCount ?? 0) > 0
            ? pendingRequestCount
            : tab.key === "clients" && (pendingClientCount ?? 0) > 0
              ? pendingClientCount
              : undefined;
        return (
          <NavLink
            key={tab.key}
            to={`/applications/${applicationId}/${tab.key}`}
            role="tab"
            title={area?.detail ?? area?.status ?? tab.label}
            className={({ isActive }) => (isActive ? "tab active" : "tab")}
          >
            {area ? <span className={`tdot ${DOT_TONE[area.state]}`} /> : null}
            {tab.label}
            {badge !== undefined && (
              <span
                className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--component-button-primary-bg)] px-1.5 py-px text-[10px] font-bold leading-none text-white"
                aria-label={`${badge} pending`}
              >
                {badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
