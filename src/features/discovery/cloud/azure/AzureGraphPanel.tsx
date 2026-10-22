/**
 * An Azure object's Access Graph tab: the shared graph (React Flow + ELK, the same one AWS and
 * Kubernetes use), from the shared read (`/api/iga/v1/graph`, D-114), and under it what the
 * object can reach.
 *
 * A resource or workload page is keyed by AuthSec's id, which is the graph's own. An identity page
 * is keyed by its Entra object id, so the graph's ref for it is found in the inventory, whose
 * native id for an Azure identity is that object id.
 */

import { Info } from "lucide-react";

import { useListInventoryQuery } from "@/app/api/igaInventoryApi";
import type { GraphRef } from "@/app/api/igaGraphApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { LazyGraphTab } from "@/features/iga/shared/components/LazyGraphTab";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { InventoryNotice } from "../aws/AWSInventoryNotices";
import { AzureReachPanel } from "./AzureReachPanel";

export function AzureGraphPanel({ kind, id, name, objectId }: { kind: "identity" | "resource" | "workload"; id: string; name: string; objectId?: string }) {
  const ws = getWorkspaceId() ?? "";
  const isIdentity = kind === "identity";
  const q = useListInventoryQuery({ ws, class: "identities", provider: "azure", q: id, limit: 10 }, { skip: !isIdentity });
  const row = q.data?.data.find((r) => r.native_id.toLowerCase() === id.toLowerCase());
  const root: GraphRef | undefined = isIdentity ? row?.ref : (`${kind}:${id}` as GraphRef);
  const failure = q.isError ? (loadFailureOf(q.error) ?? "failed") : null;

  return (
    <div className="space-y-4">
      {root ? (
        <LazyGraphTab ws={ws} root={root} rootName={name} provider="azure" />
      ) : failure ? (
        <LoadFailurePanel failure={failure} subject="the access graph" permission="discovery:read" onRetry={() => void q.refetch()} />
      ) : q.isSuccess ? (
        <InventoryNotice icon={<Info />}>
          This object is not in the access graph yet. It appears once a scan has finished and been projected into the graph.
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
