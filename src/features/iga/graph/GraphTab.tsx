/**
 * The Graph tab (SPEC-iga-phase2-graph.md §2.14.11, §2.14.15, §5.3, §5.4).
 * Lazy-loaded by `../shared/components/LazyGraphTab` so React Flow and ELK
 * never reach the main bundle. Renders on the object it opened on and
 * expands only on request — it is not an estate-wide canvas.
 *
 * Owns: the initial `/graph` read and its revision pin, `target=` path
 * search, the graph model (`model.ts`), the one-time ELK layout
 * (`layout.ts`), and the Canvas/Paths presentations. The page shell
 * (`IgaPage`) already mounts the live region, the Evidence panel and the
 * revision banner; this only calls into them.
 *
 * The Graph tab stays MOUNTED through a page-level Refresh — the object page
 * renders it even while `rev` is null (other tabs wait for the pin) — so
 * this issues its own unpinned root read on that transition like any other
 * first load, then replays whatever was expanded before (review item 1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refType,
  useGetGraphNeighbourhoodQuery,
  useGetGraphPathQuery,
  useLazyGetGraphExpansionQuery,
  type GraphDirection,
  type GraphFrontier,
  type GraphRef,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";

import { viaLink } from "../shared/links";
import { useEvidence } from "../evidence/useEvidence";
import { announce } from "../shared/announce";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { classifyGraphError } from "../shared/graphErrors";
import { accountLabel } from "../shared/labels";
import { graphSessionGeneration, useGraphRevision, useTrackRevision } from "../shared/revision";
import { GraphCanvas } from "./GraphCanvas";
import { KIND_LABEL } from "./graphLabels";
import { Legend } from "./Legend";
import { computeInitialLayout, terminateLayoutWorker, type LayoutEdgeInput, type LayoutNodeInput } from "./layout";
import {
  buildVisual,
  boundVisual,
  displayedModel,
  rememberGraphModel,
  canLoadMoreOf,
  enumerateRawPaths,
  expandStateOf,
  frontierByNode,
  resolveVisualPositions,
  useGraphModel,
  modelReducer,
  visibleNodeRefs,
  type ModelState,
} from "./model";
import { PathsList } from "./PathsList";
import { anchorOf, frontierKey, type FrontierKey, type GraphSelection, type VisualNode } from "./types";

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

function NodeSummary({
  visual,
  truncated,
  onOpen,
  onFocusHere,
  canOpen,
  canFocusHere,
}: {
  visual: VisualNode;
  truncated: boolean;
  onOpen: () => void;
  onFocusHere: () => void;
  canOpen: boolean;
  canFocusHere: boolean;
}) {
  const grouped = visual.members.length > 1;
  const first = visual.members[0];
  // "N statements declare this" is a completeness claim: suppressed the
  // moment that might not be the whole answer (review item 17).
  const maybeIncomplete = truncated || visual.frontier.length > 0;
  return (
    <aside
      aria-label="Selected"
      className="w-full shrink-0 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) p-3 @[900px]:w-64"
    >
      {grouped ? (
        <>
          <p className="text-sm font-semibold text-(--color-text)">{visual.kind === "workload" ? "Shared execution identity" : first.label}</p>
          <p className="mt-0.5 text-xs text-(--color-text-muted)">
            {visual.kind === "workload" ? `${visual.members.length} workloads loaded` : maybeIncomplete
              ? `${visual.members.length} statement(s) loaded declaring this`
              : `${visual.members.length} statements declare this`}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-(--color-text-muted)">
            {visual.members.map((m) => (
              <li key={m.ref} className="flex items-center justify-between gap-2">
                <span>{visual.kind === "workload" ? m.label : m.policy ?? "Policy"}</span>
                <StatusBadge tone={(m.state ?? "current") === "current" ? "neutral" : "warning"}>
                  {m.state ?? "current"}
                </StatusBadge>
              </li>
            ))}
          </ul>
          {visual.kind === "workload" ? <Button variant="outline" size="sm" className="mt-2" onClick={onOpen}>Show workloads</Button> : null}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-(--color-text)">{first.label}</p>
          <p className="mt-0.5 text-xs text-(--color-text-muted)">{KIND_LABEL[visual.kind]}</p>
          <p className="mt-0.5 text-xs text-(--color-text-muted)">{accountLabel(first.account ?? null)}</p>
          {first.state && first.state !== "current" ? (
            <StatusBadge tone={first.state === "stale" ? "warning" : "neutral"} className="mt-1">
              {first.state}
            </StatusBadge>
          ) : null}
          {canOpen ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={onOpen}>
                Open
              </Button>
              {canFocusHere ? (
                <Button size="sm" variant="outline" onClick={onFocusHere}>
                  Focus here
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}

type GraphTabProps = { ws: string; root: GraphRef; rootName: string };
export default function GraphTab(props: GraphTabProps) {
  const [params] = useSearchParams();
  const direction = refType(props.root) === "resource" ? "reverse" : params.get("direction") === "reverse" && refType(props.root) === "identity" ? "reverse" : "forward";
  return <GraphInvestigation key={`${graphSessionGeneration()}|${props.ws}|${props.root}|${direction}`} {...props} direction={direction} />;
}
function GraphInvestigation({ ws, root, rootName, direction }: GraphTabProps & { direction: GraphDirection }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Selection edits replace the entry and keep its history state: the
  // back-link name and an open evidence panel's mark belong to it.
  const location = useLocation();
  const dispatch = useAppDispatch();
  const evidence = useEvidence();
  const { rev, epoch, stale, refresh, markStale } = useGraphRevision(ws);
  const narrow = useMediaQuery("(max-width: 767px)");

  const isIdentity = refType(root) === "identity";
  const currentKey = `${graphSessionGeneration()}|${ws}|${root}|${direction}|${epoch}`;
  const setManualDirection = (next: GraphDirection) => {
    const search = new URLSearchParams(params);
    search.set("direction", next);
    setParams(search, { replace: true, state: location.state });
  };
  const [model, dispatchModel] = useGraphModel(currentKey);
  const modelRef = useRef<ModelState>(model);
  modelRef.current = model;

  // The request identity this render belongs to. Read from a ref inside any
  // async callback, never from the closure, so a response from a session the
  // investigation has already left is dropped rather than merged or shown as
  // a failure (review items 2, 3, 11).
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;

  useEffect(() => () => terminateLayoutWorker(), []);

  /* ------------------------------ initial load ----------------------------- */

  const rootArgs = { ws, rev, key: String(epoch), root, direction, assume_hops: 2 };
  const rootQuery = useGetGraphNeighbourhoodQuery(rootArgs);
  const rootFailure = classifyGraphError(rootQuery.error);
  useTrackRevision(ws, rootQuery.currentData, rootFailure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphNeighbourhood", { ...rootArgs, rev: r }, d)),
  );

  const ingestedKeyRef = useRef<string | null>(model.root ? currentKey : null);
  useEffect(() => {
    if (model.root && model.generationKey === currentKey) rememberGraphModel(currentKey, model);
  }, [currentKey, model]);
  const lastEpochRef = useRef(epoch);
  const pendingAnnounceRef = useRef<string | null>(null);

  interface ReplayItem {
    key: FrontierKey;
    frontier: GraphFrontier;
    anchorLabel: string;
    pages: number;
    owners: string[];
  }
  const replayQueueRef = useRef<ReplayItem[]>([]);
  const activeReplayRef = useRef<ReplayItem[]>([]);
  const cancelledReplayKeys = useRef(new Set<string>());
  // What the Refresh could not carry across: objects gone from the newer scan,
  // and expansions whose re-request failed (§2.14.5 step 4: say so in place).
  const [replayOutcome, setReplayOutcome] = useState<{ gone: string[]; failed: string[] }>({ gone: [], failed: [] });

  useEffect(() => {
    const data = rootQuery.currentData?.data;
    if (!data || (rev != null && rootQuery.currentData?.meta.rev !== rev)) return;
    if (ingestedKeyRef.current === currentKey) return;
    const wasIngested = ingestedKeyRef.current !== null;
    const epochChanged = lastEpochRef.current !== epoch;
    lastEpochRef.current = epoch;
    ingestedKeyRef.current = currentKey;
    if (wasIngested) {
      if (epochChanged) {
        // A genuine Refresh: keep an ordered log of what was expanded so it
        // can be replayed once the new root has loaded (review item 1) —
        // never silently dropped.
        const old = modelRef.current;
        const unfinished = replayQueueRef.current.filter((item) => !cancelledReplayKeys.current.has(item.key));
        cancelledReplayKeys.current.clear();
        const completed = [...old.expanded].map((key) => {
          const f = old.frontierEntries.get(key)!;
          return { key, frontier: f, anchorLabel: old.nodes.get(f.node)?.label ?? f.node, pages: old.pageCounts.get(key) ?? 1, owners: [...(old.nodeOwners.get(f.node) ?? [])] };
        });
        // Retain unfinished intent from a replay interrupted by another publication.
        const intents = new Map(completed.map((item) => [item.key, item]));
        for (const item of unfinished) {
          const prior = intents.get(item.key);
          intents.set(item.key, { ...item, pages: Math.max(item.pages, prior?.pages ?? 0) });
        }
        replayQueueRef.current = [...intents.values()];
        pendingAnnounceRef.current = "Layout updated for the newer scan";
        setReplayOutcome({ gone: [], failed: [] });
      }
      dispatchModel({ type: "reset" });
    }
    const revealed = [...modelRef.current.revealedWorkloads];
    dispatchModel({ type: "root", key: currentKey, root, data });
    if (epochChanged) dispatchModel({ type: "reveal-workloads", refs: revealed });
    // currentKey is derived from root/direction/epoch every render; the
    // effect keys on those directly, not the derived string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootQuery.currentData, root, direction, epoch, ws, dispatchModel]);

  const [triggerExpand] = useLazyGetGraphExpansionQuery();

  // Replays the previous investigation's expansions once the new root has
  // settled, in the order they originally happened (an ancestor before its
  // descendant, since `expanded` preserves insertion order and a child key's
  // anchor cannot exist before its parent's expansion added it).
  useEffect(() => {
    if (replayQueueRef.current.length === 0) return;
    // Wait for the new revision to be pinned: a replay sent unpinned could be
    // answered from a later publication than the root it is merged into.
    if (!model.root || rootQuery.isFetching || rev == null || stale || modelRef.current.generationKey !== currentKey) return;
    let cancelled = false;
    const queue = replayQueueRef.current;
    const cancelledKeys = cancelledReplayKeys.current;
    activeReplayRef.current = queue;
    replayQueueRef.current = [];
    let next = 0;
    void (async () => {
      const replayNodes = new Set(modelRef.current.nodes.keys());
      const gone: string[] = [];
      const failed: string[] = [];
      for (; next < queue.length; next++) {
        if (cancelled) return;
        const item = queue[next];
        if (cancelledReplayKeys.current.has(item.key)) continue;
        if (!replayNodes.has(item.frontier.node)) {
          gone.push(item.anchorLabel);
          continue;
        }
        try {
          const alreadyLoaded = modelRef.current.pageCounts.get(item.key) ?? 0;
          const savedCursor = modelRef.current.cursors.get(item.key);
          let cursor = typeof savedCursor === "string" ? savedCursor : undefined;
          if (alreadyLoaded > 0 && !cursor) continue;
          for (let page = alreadyLoaded; page < item.pages; page++) {
          const res = await triggerExpand({
            ws,
            rev,
            key: String(epoch),
            node: item.frontier.node,
            edge: item.frontier.edge,
            direction: item.frontier.direction,
            cursor,
          }).unwrap();
          if (cancelled) return;
          if (cancelledReplayKeys.current.has(item.key)) break;
          if (res.meta.rev !== rev) { markStale({ currentRev: res.meta.rev ?? undefined }); replayQueueRef.current = queue.slice(next); next = queue.length; return; }
          dispatchModel({ type: "expand-success", key: item.key, data: res.data });
          for (const node of res.data.nodes) replayNodes.add(node.ref);
          const nextCursor = res.data.next_cursor;
          if (!nextCursor || nextCursor === cursor) break;
          cursor = nextCursor;
          }
        } catch (err) {
          if (cancelled) return;
          if (cancelledReplayKeys.current.has(item.key)) continue;
          const f = classifyGraphError(err as Parameters<typeof classifyGraphError>[0]);
          if (f?.kind === "revision_stale") {
            // Another publication landed mid-replay: stop here; the rest is
            // replayed after the next Refresh.
            markStale({ currentRev: f.currentRev, currentPublishedAt: f.currentPublishedAt });
            replayQueueRef.current = queue.slice(next);
            next = queue.length; // handed back above; the cleanup must not re-add it
            break;
          }
          if (f?.kind === "not_found") gone.push(item.anchorLabel);
          else failed.push(item.anchorLabel);
        }
      }
      if (!cancelled) setReplayOutcome({ gone, failed });
    })();
    return () => {
      // Interrupted (the pin moved, the tab re-rendered with new inputs): put
      // back what was not replayed yet, so nothing is silently dropped.
      cancelled = true;
      if (next < queue.length) replayQueueRef.current = [...queue.slice(next), ...replayQueueRef.current].filter((item) => !cancelledKeys.has(item.key));
    };
  }, [model.root, model.generationKey, rootQuery.isFetching, rootQuery.currentData, ws, rev, epoch, stale, currentKey, triggerExpand, dispatchModel, markStale]);

  /* --------------------------------- layout --------------------------------- */

  const [fitViewToken, setFitViewToken] = useState(0);

  useEffect(() => {
    if (model.laidOut) return;
    const visible = visibleNodeRefs(model);
    if (visible.size === 0) return;
    let cancelled = false;
    const nodes: LayoutNodeInput[] = [...visible].map((ref) => {
      const n = model.nodes.get(ref)!;
      return { id: ref, kind: n.kind, upperBand: n.kind === "external_principal" };
    });
    const edges: LayoutEdgeInput[] = [];
    for (const [claim, owners] of model.edgeOwners) {
      if (owners.size === 0) continue;
      const e = model.edges.get(claim);
      if (e && visible.has(e.from) && visible.has(e.to)) edges.push({ id: claim, kind: e.kind, from: e.from, to: e.to });
    }
    void computeInitialLayout(nodes, edges).then((positions) => {
      if (cancelled) return;
      dispatchModel({ type: "positions", positions });
      dispatchModel({ type: "laid-out" });
      setFitViewToken((t) => t + 1);
      if (pendingAnnounceRef.current) {
        announce(pendingAnnounceRef.current);
        pendingAnnounceRef.current = null;
      }
    });
    return () => {
      cancelled = true;
    };
    // Re-runs exactly when `laidOut` goes false (reset/root/relayout) and the
    // node count actually changed — never on every ingest (§2.14.15).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.laidOut, model.nodes.size, dispatchModel]);

  const handleTidyLayout = useCallback(() => {
    pendingAnnounceRef.current = null;
    dispatchModel({ type: "relayout" });
  }, [dispatchModel]);

  /* -------------------------------- expansion -------------------------------- */

  const expansionAttempts = useRef(new Map<string, number>());
  const handleExpand = useCallback(
    (f: GraphFrontier, cursor?: string) => {
      if (stale || modelRef.current.generationKey !== currentKey) return; // paused: the control shows "Refresh" instead (§2.14.5)
      const key = frontierKey(f);
      if (modelRef.current.loading.has(key) || rev == null) return;
      const attempt = (expansionAttempts.current.get(key) ?? 0) + 1;
      expansionAttempts.current.set(key, attempt);
      const requestKey = currentKey;
      dispatchModel({ type: "expand-start", key });
      triggerExpand({ ws, rev, key: String(epoch), node: f.node, edge: f.edge, direction: f.direction, cursor })
        .unwrap()
        .then((res) => {
          // The investigation has moved to a different root, direction or
          // revision since this was requested: drop it (review item 3).
          if (!mounted.current || currentKeyRef.current !== requestKey || expansionAttempts.current.get(key) !== attempt) return;
          if (res.meta.rev != null && rev != null && res.meta.rev > rev) {
            // Answered at a newer revision than the one pinned: never merged
            // (review item 2) — mark stale and clear the read in flight, so
            // the control reads "paused" rather than "Could not load".
            markStale({ currentRev: res.meta.rev, currentPublishedAt: res.meta.published_at ?? undefined });
            dispatchModel({ type: "expand-abort", key });
            return;
          }
          dispatchModel({ type: "expand-success", key, data: res.data });
          announce(`Expanded ${modelRef.current.nodes.get(f.node)?.label ?? "the node"}`);
        })
        .catch((err: unknown) => {
          if (!mounted.current || currentKeyRef.current !== requestKey || expansionAttempts.current.get(key) !== attempt) return;
          const failure = classifyGraphError(err as Parameters<typeof classifyGraphError>[0]);
          if (failure?.kind === "revision_stale") {
            markStale({ currentRev: failure.currentRev, currentPublishedAt: failure.currentPublishedAt });
            dispatchModel({ type: "expand-abort", key });
            return;
          }
          dispatchModel({ type: "expand-failed", key });
          announce("Could not load. Retry");
        });
    },
    [stale, ws, rev, epoch, currentKey, triggerExpand, dispatchModel, markStale],
  );

  const handleLoadMore = useCallback(
    (f: GraphFrontier) => {
      const cursor = modelRef.current.cursors.get(frontierKey(f));
      if (typeof cursor === "string") handleExpand(f, cursor);
    },
    [handleExpand],
  );

  const handleCollapse = useCallback(
    (f: GraphFrontier) => {
      const key = frontierKey(f);
      const afterCollapse = modelReducer(modelRef.current, { type: "collapse", key });
      const remaining = visibleNodeRefs(afterCollapse);
      const intents = [...activeReplayRef.current, ...replayQueueRef.current];
      cancelledReplayKeys.current.add(key);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of intents) {
          if (cancelledReplayKeys.current.has(item.key) || remaining.has(item.frontier.node)) continue;
          // A shared anchor survives if any other expansion/root still owns it.
          if (item.owners.length && item.owners.every((owner) => cancelledReplayKeys.current.has(owner))) {
            cancelledReplayKeys.current.add(item.key);
            changed = true;
          }
        }
      }
      replayQueueRef.current = replayQueueRef.current.filter((item) => !cancelledReplayKeys.current.has(item.key));
      for (const [pending, attempt] of expansionAttempts.current) {
        if (pending === key || !remaining.has(anchorOf(pending))) expansionAttempts.current.set(pending, attempt + 1);
      }
      const label = modelRef.current.nodes.get(f.node)?.label ?? "the node";
      dispatchModel({ type: "collapse", key });
      announce(`Collapsed ${label}`);
    },
    [dispatchModel],
  );

  /* ---------------------------------- path ----------------------------------- */

  const targetRef = params.get("target") as GraphRef | null;
  const lastGoodPathTargetRef = useRef<string | null>(null);
  const sameTargetAsShown = targetRef !== null && lastGoodPathTargetRef.current === `${root}|${targetRef}`;
  const pathArgs = { ws, rev, key: String(epoch), from: root, to: targetRef ?? root };
  // Pause only a NEW target while stale; a target already answered keeps its
  // result on screen instead of being hidden by the revision moving under it
  // (review item 10).
  const pathQuery = useGetGraphPathQuery(pathArgs, { skip: !targetRef || (!!stale && !sameTargetAsShown) });
  const pathFailure = classifyGraphError(pathQuery.error);
  useTrackRevision(ws, pathQuery.currentData, pathFailure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphPath", { ...pathArgs, rev: r }, d)),
  );

  const targetName = useMemo(() => {
    if (!targetRef) return "";
    return pathQuery.currentData?.data.nodes.find((n) => n.ref === targetRef)?.label ?? targetRef;
  }, [pathQuery.currentData, targetRef]);

  // A previous target's path-only nodes are released the moment the target
  // changes or clears — never accumulated across searches (review item 21).
  const previousPathOwnerRef = useRef<string | null>(null);
  const ingestedPathKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const wanted = targetRef ? `path:${root}|${targetRef}` : null;
    const owners = new Set([...modelRef.current.nodeOwners.values()].flatMap((set) => [...set]));
    for (const owner of owners) if (owner.startsWith("path:") && owner !== wanted) dispatchModel({ type: "collapse", key: owner });
    previousPathOwnerRef.current = targetRef ? `path:${root}|${targetRef}` : null;
    ingestedPathKeyRef.current = null;
  }, [targetRef, root, dispatchModel]);

  useEffect(() => {
    const data = pathQuery.currentData?.data;
    if (!data || !targetRef || rev == null || model.generationKey !== currentKey || pathQuery.currentData?.meta.rev !== rev) return;
    lastGoodPathTargetRef.current = `${root}|${targetRef}`;
    const key = `${root}|${targetRef}|${epoch}`;
    if (ingestedPathKeyRef.current === key) return;
    ingestedPathKeyRef.current = key;
    if (data.outcome === "found") {
      // Anchored at `root`: a path-only node has no expansion of its own to
      // place it, and would otherwise render at {0,0} (review item 6).
      dispatchModel({ type: "path", owner: `path:${root}|${targetRef}`, anchor: root, nodes: data.nodes, edges: data.edges });
      announce(
        data.more_paths
          ? "Showing the declared path to the selected object. More paths exist beyond the limit."
          : "Showing the declared path to the selected object.",
      );
    } else if (data.outcome === "none_exists") {
      announce(`No declared path from ${rootName} to ${targetName}.`);
    } else if (data.outcome === "not_found_within_budget") {
      announce("No path found within the search limits.");
    }
  }, [pathQuery.currentData, rootQuery.currentData, model.generationKey, root, targetRef, epoch, rev, currentKey, rootName, targetName, dispatchModel]);

  const highlighted = useMemo(() => {
    const data = pathQuery.currentData?.data;
    if (!data || data.outcome !== "found") return null;
    const nodeRefs = new Set<GraphRef>();
    const claims = new Set<GraphRef>();
    for (const p of data.paths) {
      for (const n of p.nodes) nodeRefs.add(n);
      for (const c of p.edges) claims.add(c);
    }
    return { nodeRefs, claims };
  }, [pathQuery.currentData]);

  /* -------------------------------- derived model ---------------------------- */

  const revealedWorkloads = model.revealedWorkloads;
  const visual = useMemo(() => {
    const ungrouped = new Set(revealedWorkloads);
    for (const ref of highlighted?.nodeRefs ?? []) ungrouped.add(ref);
    return boundVisual(buildVisual(model, ungrouped), root, highlighted?.nodeRefs);
  }, [model, revealedWorkloads, root, highlighted]);
  const drawn = useMemo(() => displayedModel(model, visual), [model, visual]);
  const positionsForVisual = useMemo(() => resolveVisualPositions(visual.nodes, model.positions), [visual.nodes, model.positions]);
  const rawPathsResult = useMemo(() => enumerateRawPaths(drawn, root, direction), [drawn, root, direction]);
  const frontierMap = useMemo(() => frontierByNode(model), [model]);

  const highlightedNodeIds = useMemo(() => {
    if (!highlighted) return undefined;
    const set = new Set<string>();
    for (const vn of visual.nodes) if (vn.members.some((m) => highlighted.nodeRefs.has(m.ref))) set.add(vn.id);
    return set;
  }, [highlighted, visual.nodes]);
  const highlightedEdgeIds = useMemo(() => {
    if (!highlighted) return undefined;
    const set = new Set<string>();
    for (const ve of visual.edges) if (ve.members.some((m) => highlighted.claims.has(m.claim))) set.add(ve.id);
    return set;
  }, [highlighted, visual.edges]);

  /* -------------------------------- selection -------------------------------- */

  const nodeParam = params.get("node");
  // URL state is authoritative, including Browser Back. Evidence selects its
  // edge without a competing second navigation to update node=.
  const selectedClaim = evidence.claims[0];
  const evidenceEdge = selectedClaim ? visual.edges.find((e) => e.members.some((m) => m.claim === selectedClaim)) : undefined;
  const selection: GraphSelection | null = evidenceEdge ? { kind: "edge", id: evidenceEdge.id } : nodeParam ? { kind: "node", id: nodeParam } : null;

  const selectNode = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params);
      next.set("node", id);
      setParams(next, { replace: true, state: location.state });
      const vn = visual.nodes.find((v) => v.id === id);
      if (vn) announce(`Selected ${vn.members[0].label}`);
    },
    [params, setParams, location.state, visual.nodes],
  );

  const clearSelection = useCallback(() => {
    if (!params.has("node")) return;
    const next = new URLSearchParams(params);
    next.delete("node");
    setParams(next, { replace: true, state: location.state });
  }, [params, setParams, location.state]);

  const selectEdge = useCallback(
    (id: string) => {
      // Opening the evidence panel is the edge's selection; it is the only
      // navigation this makes, so nothing here competes with it.
      const ve = visual.edges.find((e) => e.id === id);
      if (ve) evidence.open(ve.members.map((m) => m.claim));
    },
    [visual.edges, evidence],
  );

  const openRef = useCallback(
    (ref: GraphRef) => {
      const group = visual.nodes.find((n) => n.kind === "workload" && n.members.length > 1 && n.members.some((m) => m.ref === ref));
      if (group) { dispatchModel({ type: "reveal-workloads", refs: [...model.revealedWorkloads, ...group.members.map((n) => n.ref)] }); return; }
      const path = objectPath(ref);
      if (path) { const link = viaLink(path, { ref: root, name: rootName }); navigate(link.to, { state: link.state }); }
    },
    [navigate, root, rootName, visual.nodes, model.revealedWorkloads, dispatchModel],
  );

  const focusHere = useCallback(
    (ref: GraphRef) => {
      const path = objectPath(ref);
      if (path && refType(ref) !== "external_principal") { const link = viaLink(`${path}/graph`, { ref: root, name: rootName }); navigate(link.to, { state: link.state }); }
    },
    [navigate, root, rootName],
  );

  const stateOf = useCallback((f: GraphFrontier) => expandStateOf(model, frontierKey(f), !!stale || rev == null || model.generationKey !== currentKey), [model, stale, rev, currentKey]);
  const canLoadMore = useCallback((f: GraphFrontier) => canLoadMoreOf(model, frontierKey(f)), [model]);

  /* ------------------------------ paths toggle -------------------------------- */

  const asParam = params.get("as");
  const showPaths = asParam === "paths" || (narrow && asParam !== "canvas");
  const setAs = (mode: "canvas" | "paths") => {
    const next = new URLSearchParams(params);
    if (mode === "paths") next.set("as", "paths");
    else next.set("as", "canvas");
    setParams(next, { replace: true, state: location.state });
  };

  /* ---------------------------------- render ---------------------------------- */

  // Never a partial canvas: while the current root/direction/revision hasn't
  // finished loading, show the spinner or the failure — not a stale picture
  // from a previous session (review items 11, 12).
  const rootReady = model.root !== null && model.generationKey === currentKey;

  if ((!rootReady && !model.root) || (rootFailure && ["unauthorized", "forbidden", "not_found", "unavailable"].includes(rootFailure.kind))) {
    if (rootFailure) {
      return (
        <TableCard>
          <CardContent variant="flush">
            <GraphStatePanel
              failure={rootFailure}
              subject="this graph"
              onRetry={() => void rootQuery.refetch()}
              onRefresh={refresh}
            />
          </CardContent>
        </TableCard>
      );
    }
    return (
      <TableCard>
        <CardContent>
          <div
            className="flex h-64 items-center justify-center"
            role="status"
            aria-busy="true"
            aria-label={`Loading the graph for ${rootName}`}
          >
            <div className="size-8 animate-spin rounded-full border-2 border-(--color-border-subtle) border-t-(--color-primary)" />
          </div>
        </CardContent>
      </TableCard>
    );
  }

  const toggleClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 text-xs font-medium",
      active ? "bg-(--color-primary) text-white" : "text-(--color-text-muted) hover:bg-(--color-surface-subtle)",
    );

  const selectedVisual = selection?.kind === "node" ? visual.nodes.find((v) => v.id === selection.id) : undefined;

  return (
    <TableCard>
      <CardContent variant="flush" className="@container">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border-subtle) px-3 py-2">
          {isIdentity ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-(--color-text-muted)">Direction</span>
              <div className="inline-flex overflow-hidden rounded-md border border-(--color-border-subtle)">
                <button
                  type="button"
                  aria-pressed={direction === "forward"}
                  onClick={() => setManualDirection("forward")}
                  className={toggleClass(direction === "forward")}
                >
                  Forward
                </button>
                <button
                  type="button"
                  aria-pressed={direction === "reverse"}
                  onClick={() => setManualDirection("reverse")}
                  className={toggleClass(direction === "reverse")}
                >
                  Reverse
                </button>
              </div>
            </div>
          ) : (
            <span />
          )}
          <div className="inline-flex overflow-hidden rounded-md border border-(--color-border-subtle)">
            <button type="button" aria-pressed={!showPaths} onClick={() => setAs("canvas")} className={toggleClass(!showPaths)}>
              Canvas
            </button>
            <button type="button" aria-pressed={showPaths} onClick={() => setAs("paths")} className={toggleClass(showPaths)}>
              Paths
            </button>
          </div>
        </div>

        {replayOutcome.gone.length > 0 || replayOutcome.failed.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border-subtle) px-3 py-2 text-xs" role="status">
            <span className="text-(--color-text-muted)">
              {replayOutcome.gone.length ? `Not in the newer scan: ${replayOutcome.gone.join(", ")}. ` : ""}
              {replayOutcome.failed.length
                ? `Could not re-expand ${replayOutcome.failed.join(", ")}; expand again to retry.`
                : ""}
            </span>
            <button
              type="button"
              className="font-medium text-(--color-primary-text) hover:underline"
              onClick={() => setReplayOutcome({ gone: [], failed: [] })}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {targetRef ? (
          pathFailure ? (
            <div className="p-3">
              <GraphStatePanel
                failure={pathFailure}
                subject="this path"
                onRetry={() => void pathQuery.refetch()}
                onRefresh={refresh}
              />
            </div>
          ) : stale && !sameTargetAsShown ? (
            <p className="px-3 py-2 text-xs text-(--color-info-text)">
              A newer scan published — refresh to search for this path.
            </p>
          ) : pathQuery.currentData?.data.outcome === "none_exists" ? (
            <div className="p-3">
              <DecisionBanner
                tone="neutral"
                title="No declared path"
                body={`No declared path from ${rootName} to ${targetName}.`}
              />
            </div>
          ) : pathQuery.currentData?.data.outcome === "not_found_within_budget" ? (
            <div className="p-3">
              <DecisionBanner
                tone="warning"
                title="No path found within the search limits"
                body="A budget stopped the search — one may still exist. Expanding nodes on the canvas searches further."
                actionLabel="Clear and explore"
                onAction={() => {
                  const next = new URLSearchParams(params);
                  next.delete("target");
                  setParams(next, { replace: true, state: location.state });
                }}
              />
            </div>
          ) : pathQuery.currentData?.data.outcome === "found" && pathQuery.currentData.data.more_paths ? (
            <p className="px-3 py-1 text-xs text-(--color-text-muted)">More paths exist beyond the limit.</p>
          ) : null
        ) : null}

        {!rootReady ? <div role="status" className="border-b px-3 py-2 text-sm">
          {rootFailure ? "Refresh failed. Showing the previous graph." : "Refreshing the graph. Showing the previous answer until the new one arrives."}
          {rootFailure ? <Button variant="outline" size="sm" className="ml-2" onClick={() => void rootQuery.refetch()}>Retry refresh</Button> : null}
        </div> : null}
        {nodeParam && !visual.nodes.some((n) => n.members.some((m) => m.ref === nodeParam)) ? <p role="status" className="px-3 py-2 text-xs text-(--color-text-muted)">The selected object is not in this loaded view. It may be outside the display limit or absent from the newer scan.</p> : null}
        {targetRef && highlighted && !visual.nodes.some((n) => n.members.some((m) => m.ref === targetRef)) ? <p role="status" className="px-3 py-2 text-xs text-(--color-warning-text)">A declared path was returned, but the requested target is beyond the display limit. Open the target to inspect its graph.</p> : null}
        {revealedWorkloads.size ? <div className="px-3 py-2"><Button variant="outline" size="sm" onClick={() => dispatchModel({ type: "reveal-workloads", refs: [] })}>Group shared workloads</Button></div> : null}
        {visual.limited ? <div role="status" className="border-b px-3 py-2 text-xs text-(--color-warning-text)">
          Display limit reached: showing {visual.nodes.length} nodes and {visual.edges.length} edges (maximum 150 / 300). Select an object and choose Focus here to investigate a smaller graph. Other loaded evidence is retained.
        </div> : null}
        {model.truncated ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs" role="status">
            <StatusBadge tone="warning">Truncated</StatusBadge>
            <span className="text-(--color-text-muted)">
              Showing {visibleNodeRefs(model).size} nodes; more are available at this depth (bound by{" "}
              {model.truncated.bound_by}). Expand a node to see more.
            </span>
          </div>
        ) : null}

        {!model.laidOut ? (
          // Never a partial canvas: the layout is being (re)computed — first
          // load, Tidy layout, or a refresh — so nothing is drawn yet
          // (review item 12).
          <div className="flex h-64 items-center justify-center" role="status" aria-busy="true" aria-label="Updating the graph">
            <div className="size-8 animate-spin rounded-full border-2 border-(--color-border-subtle) border-t-(--color-primary)" />
          </div>
        ) : (
          <div aria-busy={!rootReady} className={cn("flex flex-col gap-3 p-3 @[900px]:flex-row", !rootReady && "opacity-60")}>
            <div className="min-w-0 flex-1">
              {showPaths ? (
                <PathsList
                  root={root}
                  rootName={rootName}
                  paths={rawPathsResult.paths}
                  nodesByRef={model.nodes}
                  frontierByNode={frontierMap}
                  truncated={!!model.truncated || visual.limited}
                  boundByMax={rawPathsResult.boundByMax}
                  stateOf={stateOf}
                  canLoadMore={canLoadMore}
                  onExpand={handleExpand}
                  onLoadMore={handleLoadMore}
                  onCollapse={handleCollapse}
                  onRefresh={refresh}
                  onSelectNode={(ref) => {
                    const group = visual.nodes.find((n) => n.kind === "workload" && n.members.some((m) => m.ref === ref));
                    if (group) dispatchModel({ type: "reveal-workloads", refs: [...model.revealedWorkloads, ...group.members.map((m) => m.ref)] });
                    selectNode(ref);
                  }}
                  onSelectEdge={(claim) => evidence.open(claim)}
                />
              ) : (
                <GraphCanvas
                  visualNodes={visual.nodes}
                  visualEdges={visual.edges}
                  positions={positionsForVisual}
                  selection={selection}
                  highlightedNodeIds={highlightedNodeIds}
                  highlightedEdgeIds={highlightedEdgeIds}
                  onSelectNode={selectNode}
                  onSelectEdge={selectEdge}
                  onOpenNode={openRef}
                  onExpand={handleExpand}
                  onLoadMore={handleLoadMore}
                  onCollapse={handleCollapse}
                  onRefresh={refresh}
                  stateOf={stateOf}
                  canLoadMore={canLoadMore}
                  onClearSelection={clearSelection}
                  onTidyLayout={handleTidyLayout}
                  fitViewToken={fitViewToken}
                  viewport={model.viewport}
                  onViewportChange={(viewport) => dispatchModel({ type: "viewport", viewport })}
                  rootAccountId={model.nodes.get(root)?.account?.id ?? null}
                />
              )}
            </div>
            {selectedVisual ? (
              <NodeSummary
                visual={selectedVisual}
                truncated={!!model.truncated || visual.limited}
                onOpen={() => openRef(selectedVisual.members[0].ref)}
                onFocusHere={() => focusHere(selectedVisual.members[0].ref)}
                canOpen={selectedVisual.members.length === 1 && !!objectPath(selectedVisual.members[0].ref)}
                canFocusHere={
                  selectedVisual.members.length === 1 &&
                  refType(selectedVisual.members[0].ref) !== "external_principal" &&
                  !!objectPath(selectedVisual.members[0].ref)
                }
              />
            ) : null}
          </div>
        )}

        <Legend />
      </CardContent>
    </TableCard>
  );
}
