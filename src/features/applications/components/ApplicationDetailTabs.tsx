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
  { key: "access", label: "Access", readinessKey: "access" },
  { key: "role-bindings", label: "Access Assignments", readinessKey: "access" },
  { key: "clients", label: "Clients", readinessKey: "clients" },
  { key: "consent-grants", label: "Consent Grants", readinessKey: null },
  { key: "test", label: "Test", readinessKey: "test" },
  { key: "activity", label: "Monitor", readinessKey: null },
] as const;

export interface ApplicationDetailTabsProps {
  applicationId: string;
  readiness?: Readiness;
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
}: ApplicationDetailTabsProps) {
  const launched = readiness?.launch.state === "ok";
  const visibleTabs = TABS.filter((tab) => tab.key !== "role-bindings" || launched);

  return (
    <nav className="tabbar" role="tablist" aria-label="Application sections">
      {visibleTabs.map((tab) => {
        const area = tab.readinessKey ? readiness?.[tab.readinessKey] : undefined;
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
          </NavLink>
        );
      })}
    </nav>
  );
}
