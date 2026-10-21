/**
 * An Azure object's Access Graph tab: the shared graph (React Flow + ELK, the same one AWS and
 * Kubernetes use) fed by the Azure neighbourhood read, and under it what the object can reach.
 *
 * An identity page is keyed by its Entra object id, so the first read is by `object:<id>`; the
 * server answers with the graph's own ref for that identity, and the graph is rooted there.
 */

import { Info } from "lucide-react";

import { useGetAzureNeighbourhoodQuery } from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { LazyGraphTab } from "@/features/iga/shared/components/LazyGraphTab";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { InventoryNotice } from "../aws/AWSInventoryNotices";
import { AzureReachPanel } from "./AzureReachPanel";
import { toGraphRef } from "./azureGraphAdapter";

export function AzureGraphPanel({ kind, id, name, objectId }: { kind: "identity" | "resource" | "workload"; id: string; name: string; objectId?: string }) {
  const start = kind === "identity" ? `object:${id}` : `${kind}:${id}`;
  const q = useGetAzureNeighbourhoodQuery(start);
  const failure = q.isError ? (loadFailureOf(q.error) ?? "failed") : null;

  return (
    <div className="space-y-4">
      {q.currentData ? (
        <LazyGraphTab ws={getWorkspaceId() ?? ""} root={toGraphRef(q.currentData.root)} rootName={name} provider="azure" />
      ) : failure === "not_found" ? (
        <InventoryNotice icon={<Info />}>
          This object is not in the access graph yet. The access graph has to be turned on for this workspace, and a scan has to have finished since.
        </InventoryNotice>
      ) : failure ? (
        <LoadFailurePanel failure={failure} subject="the access graph" permission="discovery:read" onRetry={() => void q.refetch()} />
      ) : (
        <div className="h-96 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the graph" />
      )}
      {objectId ? (
        <Panel title="What it can reach">
          <AzureReachPanel objectId={objectId} />
        </Panel>
      ) : null}
    </div>
  );
}
