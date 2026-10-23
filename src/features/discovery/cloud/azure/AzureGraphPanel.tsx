/**
 * An Azure object's Access Graph tab: the shared graph (React Flow + ELK, the same one AWS and
 * Kubernetes use), from the shared read (`/api/iga/v1/graph`, D-114), and under it what the
 * object can reach.
 *
 * A resource or workload page is keyed by AuthSec's id, which is the graph's own. An identity page
 * is keyed by its Entra object id, so the graph's ref for it is found in the inventory
 * (`useAzureIdentityRef`).
 */

import { Info } from "lucide-react";

import type { GraphRef } from "@/app/api/igaGraphApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { LazyGraphTab } from "@/features/iga/shared/components/LazyGraphTab";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { InventoryNotice } from "../aws/AWSInventoryNotices";
import { AzureReachPanel } from "./AzureReachPanel";
import { useAzureIdentityRef } from "./azureGraphLinks";

export function AzureGraphPanel({ kind, id, name, objectId }: { kind: "identity" | "resource" | "workload"; id: string; name: string; objectId?: string }) {
  const ws = getWorkspaceId() ?? "";
  const isIdentity = kind === "identity";
  const { ref, query: q } = useAzureIdentityRef(ws, isIdentity ? id : undefined);
  const root: GraphRef | undefined = isIdentity ? ref : (`${kind}:${id}` as GraphRef);
  const failure = q.isError ? (loadFailureOf(q.error) ?? "failed") : null;

  return (
    <div className="space-y-4">
      {root ? (
        <LazyGraphTab ws={ws} root={root} rootName={name} provider="azure" />
      ) : failure ? (
        <LoadFailurePanel failure={failure} subject="the Access Graph" permission="discovery:read" onRetry={() => void q.refetch()} />
      ) : q.isSuccess ? (
        <InventoryNotice icon={<Info />}>
          This object is not in the Access Graph yet. It appears once a scan has finished and been projected into the graph.
        </InventoryNotice>
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
