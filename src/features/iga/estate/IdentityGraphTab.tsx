/**
 * Identity Graph tab — wraps the generic GraphTab with the workload as root.
 * Lazy-loaded by WorkloadPage so the graph bundle is only fetched on demand.
 */

import React from "react";
import GraphTab from "../graph/GraphTab";
import type { GraphRef } from "@/app/api/igaGraphApi";

interface IdentityGraphTabProps {
  workspaceId: string;
  workloadId: string;
  workloadName: string;
}

const IdentityGraphTab: React.FC<IdentityGraphTabProps> = ({ workspaceId, workloadId, workloadName }) => {
  return (
    <GraphTab
      ws={workspaceId}
      root={`workload:${workloadId}` as GraphRef}
      rootName={workloadName}
      graphV2
    />
  );
};

export default IdentityGraphTab;
