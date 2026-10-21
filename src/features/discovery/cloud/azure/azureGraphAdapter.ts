/**
 * The Azure neighbourhood read, as the shared Access Graph (`iga/graph`) takes it.
 *
 * The AWS and Kubernetes graphs read `/api/iga/v1/graph`; Azure's answer comes from
 * `/authsec/discovery/azure/graph/neighbourhood`: one node and everything one hop from it, each
 * edge kind capped at 40, no revision, no cursor. This file maps that answer onto the shared
 * `GraphNeighbourhood` / `GraphExpansion`, so the same canvas, layout, legend and inspector draw
 * it. Azure's own words travel on the node and edge (`label`, `sublabel`, `attrs`, ...) and the
 * shared files read them where the provider is `azure`.
 *
 * Expanding a node is a second neighbourhood read rooted at it, merged by the shared reducer.
 */

import { useCallback, useMemo, useRef } from "react";

import {
  cloudDiscoveryApi,
  useGetAzureNeighbourhoodQuery,
  useListAzureConnectorsQuery,
  type AzureGraphEdge,
  type AzureGraphNeighbourhood,
  type AzureGraphNode,
} from "@/app/api/cloudDiscoveryApi";
import {
  refId,
  refType,
  type AzureNodeKind,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphExpansion,
  type GraphFrontier,
  type GraphMeta,
  type GraphNeighbourhood,
  type GraphNode,
  type GraphRef,
} from "@/app/api/igaGraphApi";

import { AZURE_IDENTITY_KINDS } from "./azureDiscoveryLabels";

/** Azure answers belong to no publication: no revision, never stale. */
const AZURE_META: GraphMeta = { rev: null, published_at: null, graph_state: "unrevisioned" };

/** What a Load control on an Azure card reads: the loaded node's own neighbourhood. */
export const AZURE_EXPAND = "azure";

const SCOPE_PREFIX = "scope~";

/** The shared ref of an Azure ref: an external is an `external_principal`, a scope is a resource whose id carries its path. */
export function toGraphRef(azureRef: string): GraphRef {
  if (azureRef.startsWith("external:")) return `external_principal:${azureRef.slice("external:".length)}`;
  if (azureRef.startsWith("scope:")) return `resource:${SCOPE_PREFIX}${encodeURIComponent(azureRef.slice("scope:".length))}`;
  return azureRef as GraphRef;
}

/** The Azure ref a shared ref stands for, for the neighbourhood read. */
export function toAzureRef(ref: GraphRef): string {
  const id = refId(ref);
  if (refType(ref) === "external_principal") return `external:${id}`;
  if (refType(ref) === "resource" && id.startsWith(SCOPE_PREFIX)) return `scope:${decodeURIComponent(id.slice(SCOPE_PREFIX.length))}`;
  return ref;
}

const IDENTITY_KINDS = new Set<string>(AZURE_IDENTITY_KINDS);

function nodeKindOf(n: AzureGraphNode): GraphNode["kind"] {
  if (n.kind === "workload") return "workload";
  if (n.kind === "external") return "external_principal";
  if (n.kind === "scope") return "azure_scope";
  if (n.kind === "resource") return "azure_resource";
  return (IDENTITY_KINDS.has(n.kind) ? n.kind : "entra_service_principal") as AzureNodeKind;
}

/** Subscription id -> its display name, so a scope reads "Subscription Contoso Prod", not a GUID. */
export type SubscriptionNames = ReadonlyMap<string, string>;

const SUB_PATH = /^(\/subscriptions\/)([0-9a-f-]{36})/i;

function friendlyPath(path: string, names: SubscriptionNames): string {
  const m = SUB_PATH.exec(path);
  const name = m ? names.get(m[2].toLowerCase()) : undefined;
  return name && m ? `${m[1]}${name}${path.slice(m[0].length)}` : path;
}

function labelOf(n: AzureGraphNode, names: SubscriptionNames): string {
  if (n.kind === "scope" && n.ref.startsWith("scope:/subscriptions/")) {
    const m = SUB_PATH.exec(n.ref.slice("scope:".length));
    const name = m ? names.get(m[2].toLowerCase()) : undefined;
    if (name && /^Subscription /.test(n.label)) return `Subscription ${name}`;
  }
  return n.label || n.ref;
}

function adaptNode(n: AzureGraphNode, names: SubscriptionNames): GraphNode {
  const sublabel = n.kind === "scope" && n.sublabel ? friendlyPath(n.sublabel, names) : n.sublabel;
  const attrs = n.attrs ?? {};
  const objectId = typeof attrs["object_id"] === "string" ? (attrs["object_id"] as string) : undefined;
  return {
    ref: toGraphRef(n.ref),
    kind: nodeKindOf(n),
    label: labelOf(n, names),
    state: "current",
    last_confirmed_at: null,
    provider: "azure",
    sublabel,
    sensitivity: n.sensitivity,
    attrs,
    native_id: objectId,
    limitations: [],
  };
}

function adaptEdge(e: AzureGraphEdge): GraphEdge {
  const grant = e.kind === "grant";
  return {
    claim: `${grant ? "grant" : "relationship"}:${e.id}`,
    kind: (["grant", "member_of", "can_assume", "executes_as"].includes(e.kind) ? e.kind : "can_assume") as GraphEdgeKind,
    from: toGraphRef(e.from),
    to: toGraphRef(e.to),
    state: e.state === "stale" ? "stale" : e.state === "ended" ? "ended" : "current",
    basis: "declared",
    closes_cycle: false,
    crosses_account: false,
    last_confirmed_at: null,
    provider: "azure",
    label: e.label,
    sensitivity: e.sensitivity,
    path_kind: e.path_kind,
    conclusion: e.effective_conclusion,
    limitations: [],
  };
}

/** A Load control on a node: its own neighbourhood, which the server has not sent yet. */
function frontierOf(node: GraphRef): GraphFrontier {
  return { node, edge: "grant", direction: "forward", more: { count: null, exact: false }, expand: AZURE_EXPAND };
}

/** "445 grants, 52 groups" for the notice: the server's totals, before its per-kind cap. */
const TOTAL_WORD: Record<string, string> = { grant: "roles and permissions", member_of: "group memberships", can_assume: "act-as relationships" };

function truncationOf(nb: AzureGraphNeighbourhood): GraphNeighbourhood["truncated"] {
  if (!nb.truncated) return null;
  const detail = Object.entries(nb.totals ?? {})
    .filter(([, n]) => n > 40)
    .map(([k, n]) => `${n} ${TOTAL_WORD[k] ?? k.replace(/_/g, " ")}`)
    .join(", ");
  return { bound_by: "edges", detail };
}

/** Every node but the starting object gets a Load control: its own neighbourhood. */
function frontierFor(nodes: GraphNode[], skip: GraphRef): GraphFrontier[] {
  return nodes.filter((n) => n.ref !== skip).map((n) => frontierOf(n.ref));
}

export function adaptNeighbourhood(nb: AzureGraphNeighbourhood, names: SubscriptionNames): GraphNeighbourhood {
  const nodes = nb.nodes.map((n) => adaptNode(n, names));
  const root = toGraphRef(nb.root);
  return {
    root,
    nodes,
    edges: nb.edges.map(adaptEdge),
    frontier: frontierFor(nodes, root),
    truncated: truncationOf(nb),
    resolution_not_followed: null,
  };
}

/** A node's neighbourhood as an expansion: the starting object is already drawn, so it gets no Load control of its own. */
export function adaptExpansion(nb: AzureGraphNeighbourhood, names: SubscriptionNames, start: GraphRef): GraphExpansion {
  const nodes = nb.nodes.map((n) => adaptNode(n, names));
  return {
    nodes,
    edges: nb.edges.map(adaptEdge),
    frontier: frontierFor(nodes, start).filter((f) => f.node !== toGraphRef(nb.root)),
    next_cursor: null,
    truncated: truncationOf(nb),
  };
}

function useSubscriptionNames(): SubscriptionNames {
  const q = useListAzureConnectorsQuery();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const c of q.data ?? []) {
      const name = (c.attrs as Record<string, unknown> | undefined)?.["display_name"];
      if (c.scope_kind === "subscription" && typeof name === "string" && name) names.set(c.scope_id.toLowerCase(), name);
    }
    return names;
  }, [q.data]);
}

export interface AzureRootRead {
  currentData: { data: GraphNeighbourhood; meta: GraphMeta } | undefined;
  isFetching: boolean;
  error: ReturnType<typeof useGetAzureNeighbourhoodQuery>["error"];
  refetch: () => unknown;
}

/** The graph's first read for an Azure root, in the shape `GraphTab` takes from the shared endpoint. */
export function useAzureGraphRoot(root: GraphRef, skip: boolean): AzureRootRead {
  const names = useSubscriptionNames();
  const q = useGetAzureNeighbourhoodQuery(toAzureRef(root), { skip });
  const currentData = useMemo(
    () => (q.currentData ? { data: adaptNeighbourhood(q.currentData, names), meta: AZURE_META } : undefined),
    [q.currentData, names],
  );
  return { currentData, isFetching: q.isFetching, error: q.error, refetch: q.refetch };
}

export interface AzureExpandArgs {
  node: GraphRef;
}

export type AzureExpandResult = { data: GraphExpansion; meta: GraphMeta };

/** Expanding a node: its neighbourhood, rooted at it, as an expansion. Same call shape as the shared lazy read. */
export function useAzureGraphExpansion(start: GraphRef) {
  const names = useSubscriptionNames();
  const [trigger] = cloudDiscoveryApi.useLazyGetAzureNeighbourhoodQuery();
  const namesRef = useRef(names);
  namesRef.current = names;
  return useCallback(
    (args: AzureExpandArgs) => ({
      unwrap: async (): Promise<AzureExpandResult> => {
        const nb = await trigger(toAzureRef(args.node), true).unwrap();
        return { data: adaptExpansion(nb, namesRef.current, start), meta: AZURE_META };
      },
    }),
    [trigger, start],
  );
}

/** Where an Azure graph node opens: an identity's page (by its Entra object id), a resource's or a workload's. Scopes and external principals have none. */
export function azureObjectPath(node: GraphNode | undefined, tab?: "graph"): string | null {
  if (!node || node.provider !== "azure") return null;
  const type = refType(node.ref);
  const suffix = tab ? `/${tab}` : "";
  if (type === "identity") return node.native_id ? `/iga/azure/identity/${encodeURIComponent(node.native_id)}${suffix}` : null;
  if (type === "resource" && node.kind === "azure_resource") return `/iga/azure/resource/${encodeURIComponent(refId(node.ref))}${suffix}`;
  if (type === "workload") return `/iga/azure/workload/${encodeURIComponent(refId(node.ref))}${suffix}`;
  return null;
}
