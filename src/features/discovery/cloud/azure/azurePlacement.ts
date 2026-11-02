/**
 * Azure's Subscription and Resource group, the page's filter above the tabs
 * (AzurePlacementBar): what it reads from the URL, and how its options are named.
 */

import type { FacetOption } from "@/features/iga/discovery/FacetBar";
import type { ScreenProps } from "@/features/iga/discovery/screenTypes";
import type { DiscoveryType } from "@/features/iga/discovery/urlState";

/**
 * The tabs the filter narrows: resources and workloads, managed identities
 * (where their resource is) and agents (where their resource or Foundry project
 * is). Entra Agent ID lists Entra objects, which belong to the tenant.
 */
export const PLACED_TYPES: readonly DiscoveryType[] = ["resources", "workloads", "identities", "sightings"];

/** The page's subscription and resource group, as the inventory takes them. */
export function placementOf(url: ScreenProps["url"]): { subscription?: string; resource_group?: string } {
  return { subscription: url.get("subscription"), resource_group: url.get("resource_group") };
}

/** One option per value across the lists, their counts added. */
export function mergeOptions(lists: FacetOption[][]): FacetOption[] {
  const byValue = new Map<string, FacetOption>();
  for (const o of lists.flat()) {
    const seen = byValue.get(o.value);
    const n = (o.count?.kind === "exact" ? o.count.value : 0) + (seen?.count?.kind === "exact" ? seen.count.value : 0);
    byValue.set(o.value, { ...(seen ?? o), count: { kind: "exact", value: n } });
  }
  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** A resource group's name is unique only in its subscription: name the subscription when two share it. */
export function labelGroups(groups: FacetOption[], subscriptions: FacetOption[]): FacetOption[] {
  const subscriptionName = new Map(subscriptions.map((o) => [o.value, o.label]));
  const names = groups.map((o) => o.label.toLowerCase());
  return groups.map((o) => {
    if (names.filter((n) => n === o.label.toLowerCase()).length < 2) return o;
    const sub = o.value.split("/")[0];
    return { ...o, label: `${o.label} (${subscriptionName.get(sub) ?? sub})` };
  });
}
