/**
 * A local identity and the directory identity behind it. They stay two
 * identities. The link is labelled "directory backing", never merged.
 */

import { useGetGraphNeighbourhoodQuery, type GraphEdge, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";

import { Panel } from "../shared/components/Panel";
import { useGraphRevision } from "../shared/revision";
import { classifyEdge } from "../graph/v2/edgeClass";

function directoryBackingEdges(edges: GraphEdge[]): GraphEdge[] {
  return edges.filter((edge) => classifyEdge(edge) === "directory_backing");
}

export function DirectoryBacking({ edges, nodes }: { edges: GraphEdge[]; nodes: GraphNode[] }) {
  const backing = directoryBackingEdges(edges);
  if (backing.length === 0) return null;
  const labelOf = (ref: string) => nodes.find((node) => node.ref === ref)?.label ?? ref;

  return (
    <Panel title="Directory backing">
      <p className="mb-2 text-xs text-(--color-text-muted)">
        The local identity and the directory identity are kept as two identities, linked by directory backing.
      </p>
      <ul className="space-y-1 text-sm" aria-label="Directory backing">
        {backing.map((edge) => (
          <li key={edge.claim}>
            {labelOf(edge.from)} <span className="text-(--color-text-muted)">directory backing</span> {labelOf(edge.to)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Forward and reverse neighbourhood. Backing is an edge, not a field on the identity. */
export function IdentityBacking({ ws, root }: { ws: string; root: GraphRef }) {
  const { rev, epoch } = useGraphRevision(ws);
  const scope = { ws, rev, key: String(epoch), root, assume_hops: 2, graph: "v2" as const };
  const forward = useGetGraphNeighbourhoodQuery({ ...scope, direction: "forward" });
  const reverse = useGetGraphNeighbourhoodQuery({ ...scope, direction: "reverse" });
  const edges = [...(forward.data?.data.edges ?? []), ...(reverse.data?.data.edges ?? [])];
  const nodes = [...(forward.data?.data.nodes ?? []), ...(reverse.data?.data.nodes ?? [])];
  return <DirectoryBacking edges={edges} nodes={nodes} />;
}
