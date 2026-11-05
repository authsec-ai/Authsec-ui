/**
 * What this backend serves for agent runtime visibility. /capabilities carries
 * `agent_runtime` (AI workloads, suggestions, findings), `agent_alerts` and
 * `agent_containment`, each `{available, reason?}`. A key the backend does not
 * send is "unknown", not "available": the screen renders a neutral
 * "Not available" state with the reason, never an error or an empty list.
 */

import { useGetGraphCapabilitiesQuery, type AgentContainmentCapabilities, type AgentFeatureCapability } from "@/app/api/igaGraphApi";
import { classifyGraphError } from "../shared/graphErrors";

export type AgentFeature = "agent_runtime" | "agent_alerts" | "agent_containment";

export interface AgentCaps {
  state: "loading" | "available" | "unavailable" | "unknown" | "error";
  reason: string | null;
  containment: AgentContainmentCapabilities | null;
  refetch: () => void;
}

export function useAgentRuntimeCaps(ws: string, feature: AgentFeature): AgentCaps {
  const q = useGetGraphCapabilitiesQuery({ ws });
  const failure = classifyGraphError(q.error);
  const v: AgentFeatureCapability | undefined = q.data?.[feature];
  let state: AgentCaps["state"];
  let reason: string | null = null;
  if (q.isLoading) state = "loading";
  else if (failure && failure.kind === "unavailable") {
    state = "unavailable";
    reason = failure.reason ?? null;
  } else if (failure) state = "error";
  else if (!v) {
    state = "unknown";
    reason = "this server did not report it";
  } else if (v.available) state = "available";
  else {
    state = "unavailable";
    reason = v.reason ?? null;
  }
  return { state, reason, containment: q.data?.agent_containment ?? null, refetch: () => void q.refetch() };
}
