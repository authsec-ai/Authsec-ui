/**
 * What this backend serves for agent runtime visibility. /capabilities may
 * carry `agent_runtime` (AI workloads, suggestions, findings), `agent_alerts`
 * and `agent_containment`, each `{available, reason?}`. Only
 * `agent_containment` is reported today (iga_graph_read_controller.go:154);
 * the others are not, so a key the backend does not send means "ask the API":
 * the screen loads, and a 503 from the endpoint itself shows as "Not
 * available" with its reason (classifyAr).
 */

import { useGetGraphCapabilitiesQuery, type AgentContainmentCapabilities, type AgentFeatureCapability } from "@/app/api/igaGraphApi";
import { classifyGraphError } from "../shared/graphErrors";

export type AgentFeature = "agent_runtime" | "agent_alerts" | "agent_containment";

export interface AgentCaps {
  state: "loading" | "available" | "unavailable" | "error";
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
  else if (!v || v.available) state = "available";
  else {
    state = "unavailable";
    reason = v.reason ?? null;
  }
  return { state, reason, containment: q.data?.agent_containment ?? null, refetch: () => void q.refetch() };
}
