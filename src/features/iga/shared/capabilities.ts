/**
 * What this deployment's backend serves (SPEC-iga-phase2-graph.md §2.14.14,
 * *Unavailable features*). The UI and backend release separately: a view
 * whose backend is not deployed is hidden from navigation, and reached anyway
 * it renders the Unavailable state — never an error, never empty.
 */

import { useGetGraphCapabilitiesQuery, type GraphFeature, type GraphProvider } from "@/app/api/igaGraphApi";

import { classifyGraphError } from "./graphErrors";

export function useGraphFeature(ws: string, feature: GraphFeature) {
  const caps = useGetGraphCapabilitiesQuery({ ws });
  const failure = classifyGraphError(caps.error);
  const data = caps.data;
  const off =
    failure?.kind === "unavailable" ||
    (!!data && (data.graph_projection !== "on" || data.features[feature] !== true));
  return {
    /** The backend does not serve this view. */
    off,
    /** Known to be served. Navigation shows a view only then. */
    on: !!data && data.graph_projection === "on" && data.features[feature] === true,
    unauthorized: failure?.kind === "unauthorized",
    loading: caps.isLoading,
    features: data?.features ?? {},
  };
}

/**
 * TRD 2 graph views. Available only when this server's `/capabilities`
 * reports `graph_v2.available`. An older server omits the object, and the
 * console stays on the default AWS graph.
 */
export function useGraphV2(ws: string) {
  const caps = useGetGraphCapabilitiesQuery({ ws });
  const reported = caps.data?.graph_v2;
  return {
    available: reported?.available === true,
    /** True until the first capabilities answer, so a v2 read is not preceded by a default URL. */
    loading: caps.isLoading || caps.isUninitialized,
    providers: (reported?.providers ?? []) as GraphProvider[],
  };
}
