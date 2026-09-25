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

import { objectPath, useLazyLookupGraphObjectQuery } from "@/app/api/igaGraphApi";
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
