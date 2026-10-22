/**
 * What one Entra object can reach: its own roles and permissions, those of the groups it belongs
 * to, and those of the identities it can act as. Assigned access, not evaluated. Sits under the
 * Access Graph on an identity's page (`AzureObjectPage`).
 */

import { useGetAzureReachQuery, useListAzureConnectorsQuery } from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";

import { identityKindLabel } from "./azureDiscoveryLabels";

const VIA: Record<string, string> = { self: "directly", member_of: "through a group", can_assume: "by acting as another identity" };

/** "/subscriptions/<id>" (and anything under it) with the subscription's name in place of its id. */
function scopeLabel(path: string, names: ReadonlyMap<string, string>): string {
  if (path === "directory") return "the Microsoft Entra ID directory";
  if (path === "/") return "the tenant root (every subscription)";
  const m = /^\/subscriptions\/([0-9a-f-]{36})(.*)$/i.exec(path);
  const name = m ? names.get(m[1].toLowerCase()) : undefined;
  return name ? `subscription ${name}${m![2]}` : path;
}

export function AzureReachPanel({ objectId }: { objectId: string }) {
  const q = useGetAzureReachQuery(objectId);
  const connectors = useListAzureConnectorsQuery();
  const names = new Map<string, string>();
  for (const c of connectors.data ?? []) {
    const name = (c.attrs as Record<string, unknown> | undefined)?.["display_name"];
    if (c.scope_kind === "subscription" && typeof name === "string" && name) names.set(c.scope_id.toLowerCase(), name);
  }
  // currentData, not data: data keeps the previous object's answer while this one loads.
  if (q.isError) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="what this object can reach" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  if (!q.currentData) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { reach, grants } = q.currentData;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Its own roles and permissions, those of the groups it belongs to, and those of the identities it can act as. Assigned access, not
        evaluated: Azure deny assignments and conditions are not applied.
      </p>
      {reach.length ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Identities it reaches ({reach.length})</p>
          <ul className="divide-y rounded-md border text-[13px]">
            {reach.map((r) => (
              <li key={r.identity_id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span className="font-medium">{r.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {identityKindLabel(r.account_kind)} · {r.via === "member_of" ? "member of" : r.via === "can_assume" ? "can act as" : r.via}
                  {r.depth > 1 ? ` · ${r.depth} steps` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium">Roles and permissions ({grants.length})</p>
        {grants.length ? (
          <ul className="divide-y rounded-md border text-[13px]">
            {grants.map((g) => (
              <li key={g.edge_id} className="space-y-0.5 px-3 py-2">
                <span className="font-medium">{g.rights?.role_name || (g.rights?.actions ?? []).join(", ") || g.entitlement_kind}</span>
                <p className="break-all text-xs text-muted-foreground">
                  On {g.resource_name || scopeLabel(g.native_scope, names)}
                  {" · "}
                  {g.via === "self" ? "held directly" : `held by ${g.holder_name} (${VIA[g.via] ?? g.via})`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No role or permission was recorded.</p>
        )}
      </div>
    </div>
  );
}
