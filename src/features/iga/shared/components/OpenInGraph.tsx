/**
 * "Open in graph" from a Cloud Inventory row (SPEC-iga-phase2-graph.md
 * §2.14.5 *Links between the two views*). The mapping is a server lookup by
 * the row's source key through its own connector — never a match by name,
 * because names repeat across accounts. Offered only when the backend serves
 * the graph.
 */

import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Network } from "lucide-react";

import { objectPath, useLazyListGraphResourcesQuery, useLazyLookupGraphObjectQuery } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { getWorkspaceId } from "@/utils/workspace";

import { useGraphFeature } from "../capabilities";
import { classifyGraphError } from "../graphErrors";

export function OpenInGraph({ cloudRef }: { cloudRef: `cloud_identity:${string}` | `cloud_workload:${string}` }) {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const feature = useGraphFeature(ws, cloudRef.startsWith("cloud_workload:") ? "workloads" : "identities");
  const [lookup, { isFetching }] = useLazyLookupGraphObjectQuery();
  if (!feature.on) return null;

  const open = async () => {
    try {
      const { ref } = await lookup({ ws, cloud_ref: cloudRef }).unwrap();
      const path = objectPath(ref);
      if (path) navigate(path);
    } catch (e) {
      const f = classifyGraphError(e as Parameters<typeof classifyGraphError>[0]);
      toast.error(
        f?.kind === "not_found"
          ? "This row has no counterpart in the identity graph. It is added when the graph is next built from a scan."
          : "Could not look this row up in the identity graph. Try again.",
      );
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void open()} disabled={isFetching} className="no-row-click">
      <Network className="size-3.5" /> Open in graph
    </Button>
  );
}

/**
 * "Open in graph" for a Cloud Inventory resource. Resources have no source-key
 * lookup, so this asks the graph's resource list for the row's full ARN — an
 * exact match server-side (§5.2 `q`), never a match by name — and opens the
 * one exact reference whose text is that ARN. None: the graph has no statement
 * naming it exactly, which is said as such.
 */
export function OpenResourceInGraph({ arn }: { arn: string }) {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const feature = useGraphFeature(ws, "resources");
  const [list, { isFetching }] = useLazyListGraphResourcesQuery();
  if (!feature.on || !arn.startsWith("arn:")) return null;

  const open = async () => {
    try {
      const page = await list({ ws, q: arn, kind: "exact" }).unwrap();
      const match = page.data.find((r) => r.kind === "exact" && r.text === arn);
      const path = match ? objectPath(match.ref) : null;
      if (path) navigate(path);
      else toast.error("No policy statement names this resource exactly, so the identity graph has no page for it.");
    } catch {
      toast.error("Could not look this resource up in the identity graph. Try again.");
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={() => void open()} disabled={isFetching} className="no-row-click">
      <Network className="size-3.5" /> Open in graph
    </Button>
  );
}
