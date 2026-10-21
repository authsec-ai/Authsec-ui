/**
 * `ApplicationDetailTabs` — the MCP page's navigation: three tabs
 * (Overview · Access · Activity). Each tab opens its landing route
 * (`overview`, `access-assignments`, `activity`).
 *
 * The other sub-pages (setup, test, tools, scopes, roles, clients,
 * connections, consent grants) keep their own routes and are reached from
 * links inside Overview and Access. While one of them is open, its tab stays
 * highlighted and a small row of sibling links sits under the tabs so the
 * way back is one click; on the landing routes that row is hidden.
 *
 * Renders inside a `[data-cr]` region (the `.tabbar` / `.tab` classes).
 */

import { Link, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SubPage {
  key: string;
  label: string;
}

interface TabGroup {
  key: string;
  label: string;
  /** Route the tab opens. */
  landing: string;
  /** Every sub-route that belongs to this tab, landing first. */
  subs: SubPage[];
}

const APPLICATION_TAB_GROUPS: TabGroup[] = [
  {
    key: "overview",
    label: "Overview",
    landing: "overview",
    subs: [
      { key: "overview", label: "Overview" },
      { key: "setup", label: "Setup" },
      { key: "test", label: "Test sign-in" },
    ],
  },
  {
    key: "access",
    label: "Access",
    landing: "access-assignments",
    subs: [
      { key: "access-assignments", label: "Who has access" },
      { key: "tools", label: "Tools" },
      { key: "scopes", label: "Scopes" },
      { key: "roles", label: "Roles" },
      { key: "clients", label: "Clients" },
      { key: "connections", label: "Connections" },
      { key: "consent-grants", label: "Consent grants" },
    ],
  },
  {
    key: "activity",
    label: "Activity",
    landing: "activity",
    subs: [{ key: "activity", label: "Activity" }],
  },
];

/** Sub-route segment right after `/applications/:id/`, e.g. "tools". */
function activeSubKey(pathname: string, applicationId: string): string | undefined {
  const marker = `/applications/${applicationId}/`;
  const at = pathname.indexOf(marker);
  if (at === -1) {
    // The id in the URL may be percent-encoded; fall back to the 3rd segment.
    return pathname.split("/").filter(Boolean)[2];
  }
  return pathname.slice(at + marker.length).split("/")[0] || undefined;
}

export interface ApplicationDetailTabsProps {
  applicationId: string;
  /** Clients waiting for approval — shown as a count on the Access tab. */
  pendingClientCount?: number;
  className?: string;
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-(--component-button-primary-bg) px-1.5 py-px text-[length:12.5px] font-bold leading-4 text-white"
      aria-label={`${count} pending`}
    >
      {count}
    </span>
  );
}

export function ApplicationDetailTabs({
  applicationId,
  pendingClientCount,
  className,
}: ApplicationDetailTabsProps) {
  const { pathname } = useLocation();
  const current = activeSubKey(pathname, applicationId);
  const activeGroup =
    APPLICATION_TAB_GROUPS.find((g) => g.subs.some((s) => s.key === current)) ??
    APPLICATION_TAB_GROUPS[0];
  const pendingClients = pendingClientCount ?? 0;
  const base = `/applications/${applicationId}`;
  const onSubPage = current !== undefined && current !== activeGroup.landing;

  return (
    <div className={className}>
      <nav className="tabbar" aria-label="MCP sections">
        {APPLICATION_TAB_GROUPS.map((group) => {
          const active = group.key === activeGroup.key;
          const badge = group.key === "access" && pendingClients > 0 ? pendingClients : undefined;
          return (
            <Link
              key={group.key}
              to={`${base}/${group.landing}`}
              aria-current={active ? "page" : undefined}
              className={active ? "tab active" : "tab"}
            >
              {group.label}
              {badge !== undefined ? <CountBadge count={badge} /> : null}
            </Link>
          );
        })}
      </nav>

      {onSubPage && activeGroup.subs.length > 1 ? (
        <div className="mt-3 max-w-full overflow-x-auto">
          <nav
            aria-label={`${activeGroup.label} pages`}
            className="inline-flex gap-0.5 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) p-0.75"
          >
            {activeGroup.subs.map((sub) => {
              const badge = sub.key === "clients" && pendingClients > 0 ? pendingClients : undefined;
              return (
                <NavLink
                  key={sub.key}
                  to={`${base}/${sub.key}`}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex h-7.5 items-center gap-1.5 whitespace-nowrap rounded px-3 text-[length:12.5px] font-medium transition-colors",
                      isActive
                        ? "bg-(--color-surface-raised) font-semibold text-(--color-text) shadow-(--shadow-pill)"
                        : "text-(--color-text-muted) hover:text-(--color-text)",
                    )
                  }
                >
                  {sub.label}
                  {badge !== undefined ? <CountBadge count={badge} /> : null}
                </NavLink>
              );
            })}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
