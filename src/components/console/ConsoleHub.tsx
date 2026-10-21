import { Suspense, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { ConsoleHubContext } from "./hub-context";
import { HUBS, type HubId, type HubTab } from "./hubs";

const matches = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(`${path}/`);

function isTabActive(tab: HubTab, pathname: string) {
  return [tab.to, ...(tab.match ?? [])].some((p) =>
    // "/settings" owns only itself: /settings/team and /settings/trusted-issuers
    // are tabs of their own.
    p === "/settings" ? pathname === p : matches(pathname, p),
  );
}

/** Segmented control: the proposal's tab style (a pill group, the open tab raised). */
export function SegmentedNav({
  label,
  items,
  isActive,
}: {
  label: string;
  items: { label: string; to: string; count?: number }[];
  isActive: (to: string) => boolean;
}) {
  return (
    // `flex w-fit`, not `inline-flex`: two of these (tabs, then a tab's
    // sub-tabs) must each take their own row.
    <nav
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg bg-(--color-surface-subtle) p-1"
    >
      {items.map((item) => {
        const active = isActive(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[14px] transition-colors",
              active
                ? "bg-(--color-surface-raised) font-semibold text-(--color-text) shadow-(--shadow-pill)"
                : "text-(--color-text-muted) hover:bg-(--color-hover) hover:text-(--color-text)",
            )}
          >
            {item.label}
            {item.count != null ? <span className="tabular-nums">{item.count}</span> : null}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * `ConsoleHub` — one page that groups several existing pages as tabs: the
 * heading, the tab control and the open tab's page. The hosted page keeps its
 * own route and code; its `ConsolePage` sees the hub and drops its own title
 * (see `hub-context.ts`), and its header buttons move up into the hub header.
 */
export function ConsoleHub({ id, children }: { id: HubId; children: ReactNode }) {
  const hub = HUBS[id];
  const { pathname } = useLocation();
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const ctx = useMemo(() => ({ actionsSlot }), [actionsSlot]);

  const activeTab = hub.tabs.find((t) => isTabActive(t, pathname));

  return (
    <div data-cr>
      <div className="console-page">
        <header className="section-header">
          <div className="min-w-0">
            <h1 className="sh-title">{hub.title}</h1>
            <p className="sh-desc">{hub.description}</p>
          </div>
          <div ref={setActionsSlot} className="flex shrink-0 items-center gap-2 empty:hidden" />
        </header>

        <div className="space-y-4">
          <SegmentedNav
            label={`${hub.title} sections`}
            items={hub.tabs}
            isActive={(to) => hub.tabs.find((t) => t.to === to) === activeTab}
          />

          {activeTab?.subTabs ? (
            <SegmentedNav
              label={`${activeTab.label} sections`}
              items={activeTab.subTabs}
              isActive={(to) => matches(pathname, to)}
            />
          ) : null}

          {/* Its own Suspense, so the header and tabs stay put while a tab's
              code loads instead of the whole page flashing to a skeleton. */}
          <ConsoleHubContext.Provider value={ctx}>
            <Suspense fallback={<div className="py-10 text-center text-sm text-(--color-text-muted)">Loading…</div>}>
              {children}
            </Suspense>
          </ConsoleHubContext.Provider>
        </div>
      </div>
    </div>
  );
}
