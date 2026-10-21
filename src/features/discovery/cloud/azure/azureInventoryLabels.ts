import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";
import type { InventoryClass } from "@/app/api/igaInventoryApi";

import { armTypeLabel, identityKindLabel, shortId } from "./azureDiscoveryLabels";

const GRAPH_KIND_LABEL: Record<string, string> = {
  entra_app_role: "Application permission",
  entra_delegated_scope: "Delegated permission",
};

/** An inventory row's kind in words: an Entra kind, or an ARM type with its namespace beside it. */
export function inventoryKindLabel(cls: InventoryClass, kind: string): string {
  if (cls === "identities") return identityKindLabel(kind);
  return GRAPH_KIND_LABEL[kind] ?? armTypeLabel(kind);
}

/** The inventory scope id of an Azure tenant: its tenant id, lowercased, as the backend writes it. */
export function tenantScopeId(c: Pick<CloudConnector, "scope_id">): string {
  return c.scope_id.toLowerCase();
}

/** A tenant's name where the connector has one, else its id as a stub (a full GUID is never the label). */
export function tenantName(c: CloudConnector | undefined, fallback: string): string {
  const attrs = (c?.attrs ?? {}) as Record<string, unknown>;
  const name = attrs["tenant_display_name"];
  return typeof name === "string" && name ? name : shortId(fallback);
}

/** A subscription as the inventory states it: its name, or its id as a stub when no name was read. */
export function subscriptionLabel(sub: string | null | undefined): string {
  return sub ? shortId(sub) : "Tenant-wide";
}
