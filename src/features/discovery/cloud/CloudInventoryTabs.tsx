/**
 * The Cloud Inventory tab strip.
 *
 * `NavLink` against real routes rather than a `useState` tab index, following
 * `ApplicationDetailTabs` — which is the repo's only "one shell, several tabbed
 * sub-pages" precedent. Real routes are what give each tab a shareable URL, the
 * property the AWS connector drawer's own `Tabs` cannot offer and the reason
 * these views were split out of that drawer in the first place.
 *
 * Renders inside a `[data-cr]` region: `.tabbar`/`.tab` are scoped to it in
 * `theme/console-screens.css`, so this must stay a child of `ConsolePage`.
 */

import { NavLink, useSearchParams } from "react-router-dom";

import {
  ACCOUNT_SCOPED_PARAMS,
  CARRIED_TAB_PARAMS,
  CLOUD_INVENTORY_TABS,
  type CloudInventoryTab,
} from "./cloudInventoryNav";

export function CloudInventoryTabs() {
  const [params] = useSearchParams();

  // A bare `to="/iga/cloud/compute"` drops the query string, which would reset
  // the account filter every time the reader changed tab. Built per target tab
  // rather than once, because `account` travels only to a tab that reads it —
  // Compute is workspace-wide by design, so an `?account=` in its URL would
  // claim a scope it does not apply.
  const searchFor = (tab: CloudInventoryTab): string => {
    const carried = new URLSearchParams();
    for (const key of CARRIED_TAB_PARAMS) {
      if (ACCOUNT_SCOPED_PARAMS.has(key) && !tab.scopedByAccount) continue;
      const value = params.get(key);
      if (value) carried.set(key, value);
    }
    return carried.toString();
  };

  return (
    <nav className="tabbar" role="tablist" aria-label="Cloud inventory sections">
      {CLOUD_INVENTORY_TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={{ pathname: `/iga/cloud/${tab.key}`, search: searchFor(tab) }}
          role="tab"
          className={({ isActive }) => (isActive ? "tab active" : "tab")}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
