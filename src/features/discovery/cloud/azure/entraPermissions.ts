/**
 * Azure's Resources list without the Entra permissions (UI-056). An app role or
 * delegated scope is what an app may do in Microsoft Entra ID and Microsoft
 * 365, held as a resource in the graph; read as an Azure resource, it swells
 * the count with "Tenant-wide" rows. The list leaves them out unless the
 * reader asks (`?permissions=shown`) or picks one of their kinds.
 */

import type { GraphFacetValue } from "@/app/api/igaGraphApi";

export const ENTRA_PERMISSION_KINDS = ["entra_app_role", "entra_delegated_scope"] as const;

/** The kinds the Resources list leaves out, or undefined when it leaves none out. */
export function resourceExclusions(type: string, kind: string | undefined, shown: boolean): string[] | undefined {
  return type === "resources" && !kind && !shown ? [...ENTRA_PERMISSION_KINDS] : undefined;
}

/** How many permissions the kind facet counts (it counts what exclude_kind leaves out). */
export function permissionCount(facets: Record<string, GraphFacetValue[] | null> | undefined): number {
  return (facets?.kind ?? []).filter((f) => (ENTRA_PERMISSION_KINDS as readonly string[]).includes(f.value)).reduce((n, f) => n + f.count, 0);
}
