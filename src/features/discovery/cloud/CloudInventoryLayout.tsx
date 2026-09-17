/**
 * Discovery → Cloud Inventory
 *
 * One shell over the three inventory tables — Identities, Compute, Resources —
 * that were previously three flat sidebar items named "AWS …".
 *
 * ── Why one entry and not three ─────────────────────────────────────────────
 *
 * Three per-provider items become six when GCP inventory ships and nine with
 * Azure, and the GCP build workflow says that is not the plan: its console row
 * reads "Built for AWS, provider-filterable", and AS-215 spells it out — "the
 * AWS console views read provider-neutral tables, so GCP inherits them once the
 * endpoints exist… Every other view reuses without change." A second provider
 * is meant to filter into these tabs, not duplicate them.
 *
 * ── Why here and not inside Integrations ────────────────────────────────────
 *
 * Integrations is the CONNECTIONS surface — "ONE table, not two… no separate
 * Cloud landing page and no second table for cloud accounts", one row per
 * connector with a drawer for connection health. These tables are the CONTENTS
 * of those connections: they span accounts, need table width, search, paging
 * and a deep link, and are where a reader actually spends time. That split is
 * the backend's own, between the connector endpoints and the seven list
 * endpoints under `/authsec/discovery/aws/*`.
 *
 * Shape follows `ApplicationLayout` — the repo's existing tabbed-detail shell:
 * header + tab strip + `<Outlet />`, with the tab strip inside the `[data-cr]`
 * region `ConsolePage` opens, because `.tabbar` is scoped to it.
 */

import { Outlet, useLocation } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";

import { CLOUD_INVENTORY_TABS } from "./cloudInventoryNav";
import { CloudInventoryTabs } from "./CloudInventoryTabs";

export default function CloudInventoryLayout() {
  const { pathname } = useLocation();

  // The description belongs to the active tab, so the header keeps saying what
  // the table below it actually holds. Falls back to the first tab rather than
  // rendering a bare header: `/iga/cloud` redirects to Identities, so the
  // fallback is only ever a frame or two during that redirect.
  const active =
    CLOUD_INVENTORY_TABS.find((tab) => pathname.endsWith(`/${tab.key}`)) ??
    CLOUD_INVENTORY_TABS[0];

  return (
    <ConsolePage title="Cloud Inventory" description={active.description}>
      <div className="tabbar-wrap">
        <CloudInventoryTabs />
      </div>
      <Outlet />
    </ConsolePage>
  );
}
