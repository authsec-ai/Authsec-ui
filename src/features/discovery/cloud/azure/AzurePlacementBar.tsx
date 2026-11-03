/**
 * Azure's Subscription and Resource group filter. It sits above the tabs and
 * belongs to the page, not to a tab: the choice stays when the tab changes
 * (planSwitch carries it), and it narrows every list that lives in a
 * subscription (Resources, Workloads) and those tabs' counts. Entra objects
 * and agents belong to the tenant, so their tabs say they are not narrowed.
 *
 * Options and counts are the inventory's `subscription` and `resource_group`
 * facets over resources and workloads together. Each facet applies the other
 * filter, so the resource groups follow the chosen subscription.
 */

import { useListInventoryQuery, type InventoryMeta } from "@/app/api/igaInventoryApi";
import { Button } from "@/components/ui/button";
import { MultiFacetPopover, type MultiFacetSpec } from "@/features/iga/discovery/FacetBar";
import { reportedFacet } from "@/features/iga/discovery/facets";
import type { ScreenProps } from "@/features/iga/discovery/screenTypes";
import { typeLabel, type DiscoveryType } from "@/features/iga/discovery/urlState";

import { groupsWithin, labelGroups, mergeOptions, PLACED_TYPES, placementOf, placementParam } from "./azurePlacement";
import { ENTRA_PERMISSION_KINDS } from "./entraPermissions";

/** What a tab leaves out while a subscription or resource group is chosen. */
const PLACED_NOTE: Partial<Record<DiscoveryType, string>> = {
  identities: "Only managed identities live in a subscription, under their resource's. Users, groups and app registrations belong to the tenant and are not listed.",
  sightings: "Agents are listed under their resource's or Foundry project's subscription. Agents that are only Entra objects belong to the tenant and are not listed.",
};

export default function AzurePlacementBar(p: Pick<ScreenProps, "ws" | "url" | "type" | "scope">) {
  const { subscription, resource_group: resourceGroup } = placementOf(p.url);
  const blocked = p.scope.kind === "unknown" || p.scope.kind === "no_rows";
  const scopeId = p.scope.kind === "one" ? p.scope.source.scopeId : undefined;
  const base = { ws: p.ws, provider: "azure" as const, scope: scopeId, subscription, resource_group: resourceGroup, facets: "subscription,resource_group", limit: 1 };
  // Resources leave out the Entra permissions, as their list and count do (UI-056); they have no subscription anyway.
  const res = useListInventoryQuery({ ...base, class: "resources", exclude_kind: [...ENTRA_PERMISSION_KINDS] }, { skip: blocked });
  const wl = useListInventoryQuery({ ...base, class: "workloads" }, { skip: blocked });
  const idn = useListInventoryQuery({ ...base, class: "identities" }, { skip: blocked });
  // The last answer while a new one loads: the chosen subscription keeps its name instead of flashing its id.
  const facets: InventoryMeta["facets"][] = [res.data?.meta.facets, wl.data?.meta.facets, idn.data?.meta.facets];

  const facetOf = (key: string) => {
    const each = facets.map((f) => reportedFacet(f, key));
    return { options: mergeOptions(each.map((f) => f.options)), countsUnavailable: each.some((f) => f.countsUnavailable) };
  };
  const subscriptions = facetOf("subscription");
  const groups = facetOf("resource_group");
  groups.options = labelGroups(groups.options, subscriptions.options);

  // Several of each may be ticked: a row is in any one of the subscriptions, and any one of the resource groups.
  const subscriptionFacet: MultiFacetSpec = {
    key: "subscription",
    label: "Subscription",
    values: subscription ?? [],
    ...subscriptions,
    // A resource group stays ticked while its subscription is still chosen (or none is).
    onChange: (v) => p.url.patch({ subscription: placementParam(v), resource_group: placementParam(groupsWithin(resourceGroup ?? [], v)) }),
  };
  const groupFacet: MultiFacetSpec = {
    key: "resource_group",
    label: "Resource group",
    values: resourceGroup ?? [],
    ...groups,
    onChange: (v) => p.url.patch({ resource_group: placementParam(v) }),
  };
  const active = !!(subscription || resourceGroup);
  const placed = PLACED_TYPES.includes(p.type);

  return (
    <div role="group" aria-label="Azure subscription and resource group" className="flex flex-wrap items-center gap-2">
      <MultiFacetPopover facet={subscriptionFacet} />
      <MultiFacetPopover facet={groupFacet} />
      {active ? (
        <Button variant="ghost" size="sm" className="h-8" onClick={() => p.url.patch({ subscription: null, resource_group: null })}>
          Clear
        </Button>
      ) : null}
      {active ? <p className="text-xs text-(--color-text-muted)">{placed ? PLACED_NOTE[p.type] : `${typeLabel("azure", p.type)} belong to the tenant, not a subscription, so this tab is not narrowed by it.`}</p> : null}
    </div>
  );
}
