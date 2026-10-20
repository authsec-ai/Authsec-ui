/**
 * The access graph around one Entra object, one hop at a time: who it can act
 * as or be acted on by (owners, agent identity blueprints, federated
 * credentials), what it is a member of, and the roles and permissions it holds
 * on which scope. Clicking a node centres on it. Below the picture the same
 * relationships are listed as text, and what the starting object can reach.
 * Relationships are as Microsoft returned them; nothing is rated.
 */

import { useMemo, useState } from "react";
import { ArrowLeft, Info, RotateCcw } from "lucide-react";

import {
  useGetAzureNeighbourhoodQuery,
  useGetAzureReachQuery,
  useListAzureConnectorsQuery,
  type AzureGraphEdge,
  type AzureGraphNode,
} from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { InventoryNotice } from "../aws/AWSInventoryNotices";
import { agentTypeLabel, armTypeLabel, identityKindLabel } from "./azureDiscoveryLabels";

const W = 640;
const H = 440;
const CX = W / 2;
const CY = H / 2;
const R = 170;
const NODE_W = 132;
const NODE_H = 40;
/** Neighbours drawn on the ring; the list below always has all of them. */
const MAX_RING = 18;

const EDGE_ORDER = ["can_assume", "member_of", "grant"];
const EDGE_GROUP: Record<string, string> = {
  can_assume: "Can act as, or be acted on by",
  member_of: "Group membership",
  grant: "Roles and permissions",
};

/** Subscription id → its display name, filled from the Azure connectors. */
const subscriptionNames = new Map<string, string>();

function useSubscriptionNames() {
  const q = useListAzureConnectorsQuery();
  for (const c of q.data ?? []) {
    const name = (c.attrs as Record<string, unknown> | undefined)?.["display_name"];
    if (c.scope_kind === "subscription" && typeof name === "string" && name) subscriptionNames.set(c.scope_id.toLowerCase(), name);
  }
}

/** "/subscriptions/<id>" (and anything under it) with the subscription's name in place of its id. */
function scopeLabel(path: string): string {
  if (path === "directory") return "the Microsoft Entra ID directory";
  if (path === "/") return "the tenant root (every subscription)";
  const m = /^\/subscriptions\/([0-9a-f-]{36})(.*)$/i.exec(path);
  const name = m ? subscriptionNames.get(m[1].toLowerCase()) : undefined;
  return name ? `subscription ${name}${m![2]}` : path;
}

function nodeLabel(n: AzureGraphNode): string {
  if (n.ref === "scope:directory") return "Microsoft Entra ID directory";
  if (n.ref.startsWith("scope:/subscriptions/")) {
    const s = scopeLabel(n.ref.slice("scope:".length));
    if (s.startsWith("subscription ")) return `Subscription ${s.slice("subscription ".length)}`;
  }
  return n.label || n.ref;
}

function nodeKind(n: AzureGraphNode): string {
  const agent = agentTypeLabel({ attrs: n.attrs ?? {} });
  if (agent) return agent;
  if (n.kind === "scope") return "Scope";
  if (n.kind.startsWith("entra_")) return identityKindLabel(n.kind);
  if (n.kind.includes("/")) return armTypeLabel(n.kind);
  return n.kind.replace(/_/g, " ");
}

function edgeText(e: AzureGraphEdge): string {
  return e.label || e.kind.replace(/_/g, " ");
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface Placed {
  node: AzureGraphNode;
  x: number;
  y: number;
}

function Graph({
  rootRef,
  nodes,
  edges,
  onOpen,
}: {
  rootRef: string;
  nodes: AzureGraphNode[];
  edges: AzureGraphEdge[];
  onOpen: (ref: string) => void;
}) {
  const placed = useMemo(() => {
    const byRef = new Map(nodes.map((n) => [n.ref, n]));
    const root = byRef.get(rootRef);
    // Neighbours in relationship order, so related nodes sit together on the ring.
    const order: string[] = [];
    for (const kind of EDGE_ORDER) {
      for (const e of edges) {
        if (e.kind !== kind) continue;
        const other = e.from === rootRef ? e.to : e.from;
        if (other !== rootRef && byRef.has(other) && !order.includes(other)) order.push(other);
      }
    }
    for (const n of nodes) if (n.ref !== rootRef && !order.includes(n.ref)) order.push(n.ref);
    const ring = order.slice(0, MAX_RING);
    const out = new Map<string, Placed>();
    if (root) out.set(root.ref, { node: root, x: CX, y: CY });
    ring.forEach((ref, i) => {
      const a = (2 * Math.PI * i) / Math.max(ring.length, 1) - Math.PI / 2;
      out.set(ref, { node: byRef.get(ref)!, x: CX + R * Math.cos(a) * 1.25, y: CY + R * Math.sin(a) });
    });
    return { out, hidden: order.length - ring.length };
  }, [nodes, edges, rootRef]);

  // One line per pair of nodes; several relationships between the same pair share it.
  const lines = useMemo(() => {
    const m = new Map<string, { from: Placed; to: Placed; labels: string[] }>();
    for (const e of edges) {
      const from = placed.out.get(e.from);
      const to = placed.out.get(e.to);
      if (!from || !to) continue;
      const key = `${e.from}>${e.to}`;
      const cur = m.get(key) ?? { from, to, labels: [] };
      cur.labels.push(edgeText(e));
      m.set(key, cur);
    }
    return [...m.values()];
  }, [edges, placed]);

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Access graph centred on the selected object">
        <defs>
          <marker id="azg-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--color-text-muted)" />
          </marker>
        </defs>
        {lines.map((l, i) => {
          // Stop the line at the box edge rather than its centre, so the arrow shows.
          const dx = l.to.x - l.from.x;
          const dy = l.to.y - l.from.y;
          const len = Math.hypot(dx, dy) || 1;
          const shrink = (NODE_H / 2 + 4) / Math.max(Math.abs(dy) / len, 0.35);
          const t = Math.min(shrink / len, 0.45);
          const x1 = l.from.x + dx * t;
          const y1 = l.from.y + dy * t;
          const x2 = l.to.x - dx * t;
          const y2 = l.to.y - dy * t;
          const unique = [...new Set(l.labels)];
          const text = clip(unique[0], 32) + (l.labels.length > 1 ? ` +${l.labels.length - 1}` : "");
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-border-strong, var(--color-text-muted))" strokeWidth={1.25} markerEnd="url(#azg-arrow)" />
              <g transform={`translate(${mx},${my})`}>
                <title>{unique.join(", ")}</title>
                <rect x={-text.length * 2.9 - 5} y={-9} width={text.length * 5.8 + 10} height={18} rx={4} fill="var(--color-surface-raised)" stroke="var(--color-border-subtle)" />
                <text textAnchor="middle" dy="4" fontSize="10" fill="var(--color-text-muted)">
                  {text}
                </text>
              </g>
            </g>
          );
        })}
        {[...placed.out.values()].map(({ node, x, y }) => {
          const isRoot = node.ref === rootRef;
          return (
            <g
              key={node.ref}
              transform={`translate(${x - NODE_W / 2},${y - NODE_H / 2})`}
              className={cn(!isRoot && "cursor-pointer")}
              onClick={() => !isRoot && onOpen(node.ref)}
              role={isRoot ? undefined : "button"}
              tabIndex={isRoot ? undefined : 0}
              onKeyDown={(e) => {
                if (!isRoot && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onOpen(node.ref);
                }
              }}
              aria-label={isRoot ? undefined : `Centre on ${nodeLabel(node)}, ${nodeKind(node)}`}
            >
              <title>{`${nodeLabel(node)}\n${nodeKind(node)}${node.sublabel ? `\n${node.sublabel}` : ""}`}</title>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={isRoot ? "var(--color-primary-soft)" : "var(--color-surface-raised)"}
                stroke={isRoot ? "var(--color-primary)" : "var(--color-border-subtle)"}
                strokeWidth={isRoot ? 2 : 1}
              />
              <text x={10} y={17} fontSize="11.5" fontWeight={600} fill="var(--color-text)">
                {clip(nodeLabel(node), 19)}
              </text>
              <text x={10} y={31} fontSize="10" fill="var(--color-text-muted)">
                {clip(nodeKind(node), 24)}
              </text>
            </g>
          );
        })}
      </svg>
      {placed.hidden > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {placed.hidden} more connected {placed.hidden === 1 ? "object is" : "objects are"} listed below but not drawn.
        </p>
      ) : null}
    </div>
  );
}

function RelationshipList({ rootRef, nodes, edges, onOpen }: { rootRef: string; nodes: AzureGraphNode[]; edges: AzureGraphEdge[]; onOpen: (ref: string) => void }) {
  const byRef = useMemo(() => new Map(nodes.map((n) => [n.ref, n])), [nodes]);
  const groups = EDGE_ORDER.map((kind) => ({ kind, edges: edges.filter((e) => e.kind === kind) })).filter((g) => g.edges.length);
  const other = edges.filter((e) => !EDGE_ORDER.includes(e.kind));
  if (other.length) groups.push({ kind: "other", edges: other });
  if (!groups.length) return <p className="text-xs text-muted-foreground">No relationship was recorded for this object.</p>;
  const name = (ref: string) => {
    const n = byRef.get(ref);
    return n ? nodeLabel(n) : ref;
  };
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.kind} className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">
            {EDGE_GROUP[g.kind] ?? "Other relationships"} <span className="text-muted-foreground">({g.edges.length})</span>
          </p>
          <ul className="divide-y rounded-md border text-[13px]">
            {g.edges.map((e) => {
              const otherRef = e.from === rootRef ? e.to : e.from;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-3 py-2">
                  <NodeLink ref_={e.from} label={name(e.from)} current={e.from === rootRef} onOpen={onOpen} />
                  <span className="text-muted-foreground">— {edgeText(e)} →</span>
                  <NodeLink ref_={e.to} label={name(e.to)} current={e.to === rootRef} onOpen={onOpen} />
                  {byRef.get(otherRef) ? <span className="text-[11px] text-muted-foreground">({nodeKind(byRef.get(otherRef)!)})</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function NodeLink({ ref_, label, current, onOpen }: { ref_: string; label: string; current: boolean; onOpen: (ref: string) => void }) {
  if (current) return <span className="font-medium">{label}</span>;
  return (
    <button type="button" className="font-medium text-(--color-primary-text) hover:underline" onClick={() => onOpen(ref_)}>
      {label}
    </button>
  );
}

const VIA: Record<string, string> = { self: "directly", member_of: "through a group", can_assume: "by acting as another identity" };

function WhatItCanReach({ objectId }: { objectId: string }) {
  const q = useGetAzureReachQuery(objectId);
  // currentData, not data: data keeps the previous object's answer while this one loads.
  if (q.isError) return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="what this object can reach" permission="discovery:read" onRetry={() => void q.refetch()} />;
  if (!q.currentData) return <p className="text-xs text-muted-foreground">Loading…</p>;
  const { reach, grants } = q.currentData;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Its own roles and permissions, those of the groups it belongs to, and those of the identities it can act as. Assigned access, not
        evaluated: Azure deny assignments and conditions are not applied.
      </p>
      {reach.length ? (
        <div className="space-y-1">
          <p className="text-xs font-medium">Identities it reaches ({reach.length})</p>
          <ul className="divide-y rounded-md border text-[13px]">
            {reach.map((r) => (
              <li key={r.identity_id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span className="font-medium">{r.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {identityKindLabel(r.account_kind)} · {r.via === "member_of" ? "member of" : r.via === "can_assume" ? "can act as" : r.via}
                  {r.depth > 1 ? ` · ${r.depth} steps` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium">Roles and permissions ({grants.length})</p>
        {grants.length ? (
          <ul className="divide-y rounded-md border text-[13px]">
            {grants.map((g) => (
              <li key={g.edge_id} className="space-y-0.5 px-3 py-2">
                <span className="font-medium">{g.rights?.role_name || (g.rights?.actions ?? []).join(", ") || g.entitlement_kind}</span>
                <p className="break-all text-xs text-muted-foreground">
                  On {g.resource_name || scopeLabel(g.native_scope)}
                  {" · "}
                  {g.via === "self" ? "held directly" : `held by ${g.holder_name} (${VIA[g.via] ?? g.via})`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No role or permission was recorded.</p>
        )}
      </div>
    </div>
  );
}

export function AzureAccessGraph({ objectId, name, startRef }: { objectId?: string; name: string; startRef?: string }) {
  useSubscriptionNames();
  const start = startRef ?? `object:${objectId}`;
  const [trail, setTrail] = useState<{ ref: string; label: string; objectId?: string }[]>([{ ref: start, label: name, objectId }]);
  const current = trail[trail.length - 1].ref;
  const q = useGetAzureNeighbourhoodQuery(current);
  const data = q.currentData;
  // The server answers object refs with the graph's own ref for the same node.
  const rootRef = data?.root ?? current;

  const open = (ref: string) => {
    const n = data?.nodes.find((x) => x.ref === ref);
    const oid = typeof n?.attrs?.["object_id"] === "string" ? (n.attrs["object_id"] as string) : undefined;
    setTrail((t) => [...t, { ref, label: n ? `${nodeLabel(n)} (${nodeKind(n)})` : ref, objectId: oid }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={trail.length < 2} onClick={() => setTrail((t) => t.slice(0, -1))}>
          <ArrowLeft className="mr-1 size-3.5" /> Back
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={trail.length < 2} onClick={() => setTrail((t) => t.slice(0, 1))}>
          <RotateCcw className="mr-1 size-3.5" /> Start
        </Button>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={trail.map((t) => t.label).join(" › ")}>
          {trail.map((t) => t.label).join(" › ")}
        </span>
      </div>

      {q.isFetching && !data ? (
        <div className="h-64 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the graph" />
      ) : q.isError ? (
        loadFailureOf(q.error) === "not_found" ? (
          <InventoryNotice icon={<Info />}>
            This object is not in the access graph yet. Graph projection must be on (IGA_GRAPH_PROJECTION) and a scan must have finished since.
          </InventoryNotice>
        ) : (
          <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="the access graph" permission="discovery:read" onRetry={() => void q.refetch()} />
        )
      ) : data ? (
        <>
          <div className="rounded-md border bg-(--color-surface-subtle) p-2">
            <Graph rootRef={rootRef} nodes={data.nodes} edges={data.edges} onOpen={open} />
          </div>
          {data.truncated ? (
            <InventoryNotice icon={<Info />}>
              Each relationship type shows up to 40 entries. Totals:{" "}
              {Object.entries(data.totals)
                .map(([k, v]) => `${v} ${(EDGE_GROUP[k] ?? k).toLowerCase()}`)
                .join(", ")}
              .
            </InventoryNotice>
          ) : null}
          <RelationshipList rootRef={rootRef} nodes={data.nodes} edges={data.edges} onOpen={open} />
        </>
      ) : null}

      {trail[trail.length - 1].objectId ? (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">What {trail.length === 1 ? "it" : trail[trail.length - 1].label} can reach</p>
          <WhatItCanReach objectId={trail[trail.length - 1].objectId!} />
        </div>
      ) : null}
    </div>
  );
}
