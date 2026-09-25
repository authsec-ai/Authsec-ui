/**
 * The Graph tab (SPEC-iga-phase2-graph.md §2.14.11, §2.14.15, §5.3, §5.4).
 * Lazy-loaded by `../shared/components/LazyGraphTab` so React Flow and ELK
 * never reach the main bundle. Renders on the object it opened on and
 * expands only on request — it is not an estate-wide canvas.
 *
 * A workspace, top to bottom: one toolbar (Canvas / Paths, Fit graph,
 * Focus start, Arrange, Legend, and the declared-access notice), a status
 * line only when something needs saying, then the canvas with the inspector
 * beside it — or over it as a drawer when the workspace is too narrow for
 * both. It fills the height the page has left.
 *
 * Owns: the initial `/graph` read and its revision pin, `target=` path
 * search, the graph model (`model.ts`), progressive disclosure, layout
 * (`layout.ts`: ELK on first view and Arrange, `placeNewNodes` after), the
 * inspector, and the Canvas/Paths presentations. The page shell (`IgaPage`)
 * mounts the live region and the revision banner.
 *
 * The Graph tab stays MOUNTED through a page-level Refresh — the object page
 * renders it even while `rev` is null (other tabs wait for the pin) — so
 * this issues its own unpinned root read on that transition like any other
 * first load, then replays whatever was expanded before (review item 1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Expand, LayoutGrid, Maximize2, Minimize, Search } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { viaLink } from "../shared/links";
import { useEvidence, withoutMark } from "../evidence/useEvidence";
import { announce } from "../shared/announce";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { classifyGraphError } from "../shared/graphErrors";
import { graphSessionGeneration, useGraphRevision, useTrackRevision } from "../shared/revision";
import { GraphCanvas, type CanvasApi } from "./GraphCanvas";
import { GraphInspector } from "./GraphInspector";
import { edgeVerb } from "./graphLabels";
import { Legend } from "./Legend";
import { computeLayout, placeNewNodes, rectsOverlap, terminateLayoutWorker, type Position, type Size } from "./layout";
import {
  buildVisual,
  boundVisual,
  discloseVisual,
  rememberGraphModel,
  summarizeStatements,
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
import { describeNode, nodeSize, type NodeDescription } from "./nodeView";
import { PathsList } from "./PathsList";
import { readSavedLayout, writeSavedLayout } from "./savedLayout";
import { SelectionCard, type SelectionActions, type SelectionSubject } from "./SelectionCard";
import { useWorkspaceSize } from "./useWorkspaceSize";
import { anchorOf, frontierKey, type FrontierKey, type GraphSelection, type VisualEdge } from "./types";

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

/** The inspector beside the canvas needs this much room left for the canvas. */
const CANVAS_MIN = 560;
const INSPECTOR_MIN = 360;
const INSPECTOR_MAX = 420;

type GraphTabProps = { ws: string; root: GraphRef; rootName: string };

/**
 * The claims that name a line in `edge=`: a drawn relationship's first
 * claim, or — for an Overview `declares` line — one of its statements'
 * grant and that statement's target, which together belong to it alone.
 */
function lineKey(e: VisualEdge): GraphRef[] {
  if (e.kind !== "declares") return [e.members[0].claim];
  const target = e.members.find((m) => m.kind === "target");
  const grant = e.members.find((m) => m.kind === "grant" && m.to === target?.from);
  return grant && target ? [grant.claim, target.claim] : [e.members[0].claim];
}

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
      // Path-only nodes are placed beside the path's own nodes when drawn
      // (`placeNewNodes`), never at {0,0} (review item 6).
      dispatchModel({ type: "path", owner: `path:${root}|${targetRef}`, nodes: data.nodes, edges: data.edges });
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

  /* ------------------------------- derived view ------------------------------ */

  // The view: Overview (statements summarised into `declares` lines, the
  // default), Detailed (every statement drawn) or Paths. `as=canvas` from an
  // older link means Overview.
  const asParam = params.get("as");
  const view: "overview" | "detailed" | "paths" =
    asParam === "paths" || (narrow && !asParam) ? "paths" : asParam === "detailed" ? "detailed" : "overview";
  const showPaths = view === "paths";
  const setView = (mode: "overview" | "detailed" | "paths") => {
    const next = new URLSearchParams(params);
    next.set("as", mode);
    setParams(next, { replace: true, state: location.state });
  };

  const nodeParam = params.get("node");
  // `edge=` names a line by its claims: one claim for a drawn relationship;
  // a statement's grant and target for an Overview `declares` line, since a
  // grant is shared by every line of that statement and a target by every
  // holder of it.
  const edgeParam = params.get("edge");
  const edgeClaims = useMemo(() => (edgeParam ? (edgeParam.split(",") as GraphRef[]) : []), [edgeParam]);
  const selectedClaims = evidence.claims;
  const selectedClaimsKey = selectedClaims.join(",");
  const tracedPath = model.tracedPath;

  // Drawn as themselves, never folded into a group: the requested and the
  // traced path's objects.
  const pathRefs = useMemo(() => {
    const set = new Set<GraphRef>(highlighted?.nodeRefs ?? []);
    for (const claim of tracedPath ?? []) {
      const e = model.edges.get(claim);
      if (e) {
        set.add(e.from);
        set.add(e.to);
      }
    }
    return set;
  }, [highlighted, tracedPath, model.edges]);
  // Never hidden by progressive disclosure: those, plus what is selected.
  const keep = useMemo(() => {
    const set = new Set(pathRefs);
    if (nodeParam) set.add(nodeParam as GraphRef);
    for (const claim of [...edgeClaims, ...(selectedClaimsKey ? (selectedClaimsKey.split(",") as GraphRef[]) : [])]) {
      const e = claim ? model.edges.get(claim) : undefined;
      if (e) {
        set.add(e.from);
        set.add(e.to);
      }
    }
    return set;
  }, [pathRefs, nodeParam, edgeClaims, selectedClaimsKey, model.edges]);

  const revealedWorkloads = model.revealedWorkloads;
  // Keyed on the fields the view is built from — not the whole model, which
  // also changes on every pan (the saved viewport) and every drag.
  const { nodes: mNodes, edges: mEdges, nodeOwners, edgeOwners, frontierEntries, expanded: mExpanded, cursors: mCursors, loading: mLoading, failed: mFailed } = model;
  const grouped = useMemo(() => {
    const ungrouped = new Set([...revealedWorkloads, ...pathRefs]);
    return buildVisual(modelRef.current, ungrouped);
    // modelRef.current is the model of this render; its view fields are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mNodes, mEdges, nodeOwners, edgeOwners, frontierEntries, model.root, revealedWorkloads, pathRefs]);
  // Only Overview summarises; Paths lists and selects the claims themselves.
  const projected = useMemo(() => (view === "overview" ? summarizeStatements(grouped) : grouped), [grouped, view]);
  // A folded branch says whether its parent still has relationships of that
  // kind the server has not sent: not loaded yet, or loaded with pages left.
  const hasUnloaded = useCallback(
    (f: GraphFrontier) => {
      const key = frontierKey(f);
      return !mExpanded.has(key) || typeof mCursors.get(key) === "string";
    },
    [mExpanded, mCursors],
  );
  // The canvas: bounded, with large loaded branches folded.
  const visual = useMemo(
    () => boundVisual(discloseVisual(projected, root, model.revealedBranches, keep, hasUnloaded), root, keep),
    [projected, root, model.revealedBranches, keep, hasUnloaded],
  );
  const frontierMap = useMemo(
    () => frontierByNode(modelRef.current),
    // frontierByNode reads only the frontier entries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frontierEntries],
  );

  const rootAccountId = model.nodes.get(root)?.account?.id ?? null;
  const rootId = visual.nodes.find((n) => n.members.some((m) => m.ref === root))?.id ?? null;
  const { descriptions, sizes } = useMemo(() => {
    const descriptions = new Map<string, NodeDescription>();
    const sizes = new Map<string, Size>();
    for (const v of visual.nodes) {
      const d = describeNode(v, rootAccountId);
      descriptions.set(v.id, d);
      sizes.set(v.id, nodeSize(d));
    }
    return { descriptions, sizes };
  }, [visual.nodes, rootAccountId]);

  // Find in the loaded graph: matches by name among what is loaded (never
  // the whole estate), and says so.
  const [find, setFind] = useState("");
  const findMatches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (q.length < 2) return null;
    return visual.nodes.filter((v) => (descriptions.get(v.id)?.title ?? "").toLowerCase().includes(q) || v.members.some((m) => m.label.toLowerCase().includes(q)));
  }, [find, visual.nodes, descriptions]);

  const traced = useMemo(() => new Set(tracedPath ?? []), [tracedPath]);
  const highlightedNodeIds = useMemo(() => {
    if (!highlighted && !traced.size && !findMatches) return undefined;
    const set = new Set<string>();
    for (const vn of visual.nodes) if (vn.members.some((m) => highlighted?.nodeRefs.has(m.ref) || pathRefs.has(m.ref))) set.add(vn.id);
    for (const vn of findMatches ?? []) set.add(vn.id);
    return set;
  }, [highlighted, traced, pathRefs, visual.nodes, findMatches]);
  const highlightedEdgeIds = useMemo(() => {
    if (!highlighted && !traced.size) return undefined;
    const set = new Set<string>();
    for (const ve of visual.edges) if (ve.members.some((m) => highlighted?.claims.has(m.claim) || traced.has(m.claim))) set.add(ve.id);
    return set;
  }, [highlighted, traced, visual.edges]);

  /* ------------------------------ layout & placement ------------------------- */

  // Positions the customer set on an earlier visit to this graph.
  useEffect(() => {
    if (!model.root || model.generationKey !== currentKey || model.manualPositions.size) return;
    const saved = readSavedLayout(ws, root, direction);
    if (saved.size) dispatchModel({ type: "seed-manual", positions: saved });
    // Once per investigation (and again after a refresh reset the model).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.root, model.generationKey, currentKey]);
  const manualPositions = model.manualPositions;
  const savedOnce = useRef(false);
  useEffect(() => {
    // Nothing to write until the customer has moved something or reset.
    if (!savedOnce.current && !manualPositions.size) return;
    savedOnce.current = true;
    writeSavedLayout(ws, root, direction, manualPositions);
  }, [manualPositions, ws, root, direction]);

  // What is drawn now, and what was drawn last render: a node shown again
  // keeps its old place only if nothing drawn meanwhile has taken it.
  const stored = useMemo(() => resolveVisualPositions(visual.nodes, model.positions), [visual.nodes, model.positions]);
  // Sizes as last drawn: a card shown again, or one that grew in place (a
  // group gaining a member, a new Load row), keeps its place only if it
  // still fits there; otherwise it alone is placed again. A position the
  // customer set is always kept.
  const lastDrawnRef = useRef<Map<string, number>>(new Map());
  const placement = useMemo(() => {
    if (!model.laidOut) return stored;
    const drawn = visual.nodes.map((v) => ({ id: v.id, size: sizes.get(v.id)! }));
    const usable = new Map(stored);
    const last = lastDrawnRef.current;
    if (last.size) {
      const settled = (id: string) => last.get(id) === sizes.get(id)?.height || manualPositions.has(id);
      for (const n of drawn) {
        if (settled(n.id) || !usable.has(n.id)) continue;
        const p = usable.get(n.id)!;
        if (drawn.some((o) => o.id !== n.id && settled(o.id) && usable.has(o.id) && rectsOverlap(p, n.size, usable.get(o.id)!, o.size))) usable.delete(n.id);
      }
    }
    const added = placeNewNodes(drawn, visual.edges, usable);
    const out = new Map<string, Position>();
    for (const n of drawn) {
      const p = added.get(n.id) ?? usable.get(n.id);
      if (p) out.set(n.id, p);
    }
    return out;
  }, [model.laidOut, visual.nodes, visual.edges, sizes, stored, manualPositions]);
  useEffect(() => {
    lastDrawnRef.current = new Map(visual.nodes.map((v) => [v.id, sizes.get(v.id)?.height ?? 0]));
  }, [visual.nodes, sizes]);
  useEffect(() => {
    if (!model.laidOut) return;
    const fresh = new Map<string, Position>();
    for (const [id, p] of placement) {
      const s = model.positions.get(id);
      if (!s || s.x !== p.x || s.y !== p.y) fresh.set(id, p);
    }
    if (fresh.size) dispatchModel({ type: "positions", positions: fresh });
  }, [placement, model.laidOut, model.positions, dispatchModel]);

  // ELK: the first view of this graph, a refresh, and Reset layout. A result
  // for a layout that has since been superseded — a newer reset, another
  // root, workspace or publication — is dropped.
  const [revealToken, setRevealToken] = useState(0);
  const layoutRun = useRef(0);
  const layoutSig = model.laidOut || !rootReadyForLayout(model, currentKey)
    ? ""
    : visual.nodes.map((v) => `${v.id}:${sizes.get(v.id)?.height}`).join("|");
  useEffect(() => {
    if (!layoutSig) return;
    const run = ++layoutRun.current;
    const key = currentKey;
    const layer: "first" | "last" | undefined = refType(root) === "workload" ? "first" : refType(root) === "resource" ? "last" : undefined;
    const nodes = visual.nodes.map((v) => ({ id: v.id, size: sizes.get(v.id)!, layer: v.id === rootId ? layer : undefined }));
    const edges = visual.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));
    void computeLayout(nodes, edges).then((positions) => {
      if (!mounted.current || run !== layoutRun.current || currentKeyRef.current !== key) return;
      dispatchModel({ type: "arranged", positions });
      setRevealToken((t) => t + 1);
      if (pendingAnnounceRef.current) {
        announce(pendingAnnounceRef.current);
        pendingAnnounceRef.current = null;
      }
    });
    // The signature is the drawn set and its sizes; nothing else re-runs ELK.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSig]);

  const resetLayout = useCallback(() => {
    pendingAnnounceRef.current = "Layout reset. Restore previous layout undoes it.";
    dispatchModel({ type: "reset-layout" });
  }, [dispatchModel]);
  const restoreLayout = useCallback(() => {
    dispatchModel({ type: "restore-layout" });
    announce("Previous layout restored");
  }, [dispatchModel]);

  /* -------------------------------- selection -------------------------------- */

  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasApi = useRef<CanvasApi | null>(null);
  const pendingView = useRef<GraphSelection | null>(null);
  const onApi = useCallback((api: CanvasApi | null) => {
    canvasApi.current = api;
    if (api && pendingView.current) {
      const sel = pendingView.current;
      pendingView.current = null;
      requestAnimationFrame(() => api.bringIntoView(sel));
    }
  }, []);

  // Where focus goes back to when the card or panel closes: the card, line
  // or list item the selection was made from.
  const originRef = useRef<HTMLElement | null>(null);
  const noteOrigin = () => {
    const active = document.activeElement;
    originRef.current = active instanceof HTMLElement && workspaceRef.current?.contains(active) ? active : null;
  };
  const focusOrigin = (fallback: string | null) => {
    requestAnimationFrame(() => {
      const el =
        originRef.current && document.contains(originRef.current)
          ? originRef.current
          : fallback
            ? workspaceRef.current?.querySelector<HTMLElement>(fallback)
            : null;
      el?.focus({ preventScroll: true });
    });
  };

  // The selected line: by one of its claims (`edge=`), or — for evidence
  // opened straight from a link — by the evidence's claims. A statement
  // selected in Detailed is its `declares` line in Overview, so switching
  // views keeps the selection.
  const edgeOf = (claims: GraphRef[]) => {
    if (!claims.length) return undefined;
    const lines = visual.edges.filter((e) => claims.every((c) => e.members.some((m) => m.claim === c)));
    // The narrowest line that holds them all.
    return lines.sort((a, b) => a.members.length - b.members.length)[0];
  };
  const nodeVisualDirect = nodeParam
    ? visual.nodes.find((v) => v.id === nodeParam) ?? visual.nodes.find((v) => v.members.some((m) => m.ref === nodeParam))
    : undefined;
  const statementLine = !nodeVisualDirect && nodeParam
    ? visual.edges.find((e) => e.summary?.statements.some((st) => st.id === nodeParam || st.members.some((m) => m.ref === nodeParam)))
    : undefined;
  const selectedEdge = edgeOf(edgeClaims) ?? statementLine ?? (nodeParam || edgeParam ? undefined : edgeOf(selectedClaims));
  // An Overview line opened in Detailed: its statement, which Detailed draws.
  const lineStatement =
    !selectedEdge && !nodeVisualDirect && edgeClaims.length > 1
      ? visual.nodes.find((v) => v.members.some((m) => m.ref === model.edges.get(edgeClaims[edgeClaims.length - 1])?.from))
      : undefined;
  const nodeVisual = selectedEdge ? undefined : nodeVisualDirect ?? lineStatement;
  const selectionKind = selectedEdge ? "edge" : nodeVisual ? "node" : null;
  const selectionId = selectedEdge?.id ?? nodeVisual?.id ?? null;
  const selection = useMemo<GraphSelection | null>(
    () => (selectionKind && selectionId ? { kind: selectionKind, id: selectionId } : null),
    [selectionKind, selectionId],
  );
  const card: SelectionSubject | null = selectedEdge ? { kind: "edge", edge: selectedEdge } : nodeVisual ? { kind: "node", visual: nodeVisual } : null;
  const evidenceOpen = selectedClaims.length > 0;

  const clearMark = () => withoutMark(location.state as Record<string, unknown> | null);
  const select = useCallback(
    (param: "node" | "edge", value: string) => {
      noteOrigin();
      const next = new URLSearchParams(params);
      next.delete("node");
      next.delete("edge");
      next.delete("evidence");
      next.set(param, value);
      setParams(next, { replace: true, state: clearMark() });
    },
    // noteOrigin/clearMark read refs and location only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, setParams, location.state],
  );
  const selectNode = useCallback(
    (id: string) => {
      select("node", id);
      const vn = visual.nodes.find((v) => v.id === id);
      if (vn) announce(`Selected ${descriptions.get(vn.id)?.title ?? vn.members[0].label}`);
    },
    [select, visual.nodes, descriptions],
  );
  const selectEdge = useCallback(
    (id: string) => {
      const ve = visual.edges.find((e) => e.id === id);
      if (!ve) return;
      // The line into a folded branch stands for every hidden relationship:
      // select the branch (its card lists them) rather than unfold it.
      const folded = visual.nodes.find((n) => n.overflow && (n.id === ve.to || n.id === ve.from));
      if (folded) selectNode(folded.id);
      else {
        select("edge", lineKey(ve).join(","));
        announce(`Selected ${edgeVerb(ve)}`);
      }
    },
    [visual.edges, visual.nodes, select, selectNode],
  );
  const openEvidence = useCallback(
    (claims: GraphRef[]) => {
      // The evidence panel replaces the card; the selection stays, so Back
      // returns to it. One layer at a time.
      evidence.open(claims, { within: ["node", "edge"] });
    },
    [evidence],
  );

  // One close per history entry: Escape can reach both a drawer and the
  // canvas, and a second `navigate(-1)` would leave the page.
  const closedAt = useRef<string | null>(null);
  const clearAll = useCallback(() => {
    if (closedAt.current === location.key) return;
    closedAt.current = location.key;
    const fallback = selection ? (selection.kind === "node" ? `[data-node-id="${CSS.escape(selection.id)}"]` : `[data-edge-id="${CSS.escape(selection.id)}"]`) : null;
    if (evidence.isOpen && !nodeParam && !edgeParam) evidence.close();
    else if (params.has("node") || params.has("edge") || params.has("evidence")) {
      const next = new URLSearchParams(params);
      next.delete("evidence");
      next.delete("node");
      next.delete("edge");
      setParams(next, { replace: true, state: clearMark() });
    }
    focusOrigin(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, evidence, nodeParam, edgeParam, params, setParams, location.state, location.key]);
  // Escape steps back one layer: evidence → card → nothing.
  const backFromEvidence = useCallback(() => {
    if (nodeParam || edgeParam) evidence.close();
    else clearAll();
  }, [nodeParam, edgeParam, evidence, clearAll]);

  const openRef = useCallback(
    (ref: GraphRef) => {
      const group = visual.nodes.find((n) => n.kind === "workload" && n.members.length > 1 && n.members.some((m) => m.ref === ref));
      if (group) {
        dispatchModel({ type: "reveal-workloads", refs: [...model.revealedWorkloads, ...group.members.map((n) => n.ref)] });
        return;
      }
      const path = objectPath(ref);
      if (path) {
        const link = viaLink(path, { ref: root, name: rootName });
        navigate(link.to, { state: link.state });
      }
    },
    [navigate, root, rootName, visual.nodes, model.revealedWorkloads, dispatchModel],
  );

  const focusHere = useCallback(
    (ref: GraphRef) => {
      const path = objectPath(ref);
      if (path && refType(ref) !== "external_principal") {
        const link = viaLink(`${path}/graph`, { ref: root, name: rootName });
        navigate(link.to, { state: link.state });
      }
    },
    [navigate, root, rootName],
  );

  const generationKey = model.generationKey;
  const stateOf = useCallback(
    (f: GraphFrontier) => expandStateOf(modelRef.current, frontierKey(f), !!stale || rev == null || generationKey !== currentKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mExpanded, mLoading, mFailed, stale, rev, generationKey, currentKey],
  );
  const canLoadMore = useCallback(
    (f: GraphFrontier) => canLoadMoreOf(modelRef.current, frontierKey(f)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mCursors],
  );

  /* ---------------------------------- Paths ---------------------------------- */

  // Paths lists EVERYTHING loaded — never only what the canvas has room to
  // draw — and says where its own listing stopped.
  const rawPathsResult = useMemo(
    () => (showPaths ? enumerateRawPaths(modelRef.current, root, direction) : { paths: [], boundByMax: false, depthLimited: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showPaths, root, direction, nodeOwners, edgeOwners],
  );
  // Tracing a path from Paths: switch to the canvas, and once the traced
  // objects are drawn (unfolded if they were folded), pan to its first step.
  const pendingTrace = useRef<GraphRef[] | null>(null);
  const trace = (claims: GraphRef[]) => {
    dispatchModel({ type: "trace", claims });
    pendingTrace.current = claims;
    setView("detailed");
    announce("Showing the path on the canvas");
  };
  useEffect(() => {
    const claims = pendingTrace.current;
    if (!claims || showPaths) return;
    // One attempt, in the render that draws the traced objects: an edge the
    // display limit keeps off the canvas must not pan the view later.
    pendingTrace.current = null;
    const edge = visual.edges.find((e) => e.members.some((m) => m.claim === claims[0]));
    if (!edge) return;
    if (canvasApi.current) canvasApi.current.bringIntoView({ kind: "edge", id: edge.id });
    else pendingView.current = { kind: "edge", id: edge.id };
  }, [visual.edges, showPaths]);

  /* --------------------------- workspace and fullscreen ----------------------- */

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void workspaceRef.current?.requestFullscreen?.().catch(() => announce("Full screen is not available in this browser"));
  };

  const { width: wsWidth, height: wsHeight } = useWorkspaceSize(workspaceRef);
  const inline = wsWidth - CANVAS_MIN >= INSPECTOR_MIN;
  const inspectorWidth = inline
    ? Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, Math.round(wsWidth * 0.3)))
    : Math.min(INSPECTOR_MAX, window.innerWidth - 24);

  /* ---------------------------------- render ---------------------------------- */

  // Never a partial canvas: while the current root/direction/revision hasn't
  // finished loading, show the spinner or the failure — not a stale picture
  // from a previous session (review items 11, 12).
  const rootReady = model.root !== null && model.generationKey === currentKey;
  const hardFailure = rootFailure && ["unauthorized", "forbidden", "not_found", "unavailable"].includes(rootFailure.kind);
  const firstLoad = !rootReady && !model.root;

  const toggleClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-primary)",
      active ? "bg-(--color-primary) text-white" : "text-(--color-text-muted) hover:bg-(--color-surface-subtle)",
    );
  const canvasControls = !showPaths && rootReady && model.laidOut;

  const cardActions: SelectionActions = {
    onClose: clearAll,
    onEvidence: openEvidence,
    onOpenObject: openRef,
    onFocusHere: focusHere,
    onSelectNode: selectNode,
    onShowBranch: (id, sel) => {
      dispatchModel({ type: "reveal-branch", id, shown: true });
      if (sel) selectNode(sel);
    },
    onShowWorkloads: (refs) => dispatchModel({ type: "reveal-workloads", refs: [...model.revealedWorkloads, ...refs] }),
    onExpand: handleExpand,
    onLoadMore: handleLoadMore,
    onCollapse: handleCollapse,
    onRefresh: refresh,
    stateOf,
    canLoadMore,
  };

  // Things worth saying, one line each, only when they apply.
  const notices: { key: string; tone: "muted" | "warning" | "info"; text: string; action?: { label: string; run: () => void } }[] = [];
  if (!rootReady && model.root)
    notices.push({ key: "refresh", tone: "info", text: rootFailure ? "Refresh failed. Showing the previous graph." : "Refreshing the graph. Showing the previous answer until the new one arrives.", action: rootFailure ? { label: "Retry", run: () => void rootQuery.refetch() } : undefined });
  if (replayOutcome.gone.length || replayOutcome.failed.length)
    notices.push({
      key: "replay",
      tone: "muted",
      text: `${replayOutcome.gone.length ? `Not in the newer scan: ${replayOutcome.gone.join(", ")}. ` : ""}${replayOutcome.failed.length ? `Could not re-expand ${replayOutcome.failed.join(", ")}; expand again to retry.` : ""}`,
      action: { label: "Dismiss", run: () => setReplayOutcome({ gone: [], failed: [] }) },
    });
  if (targetRef) {
    const outcome = pathQuery.currentData?.data.outcome;
    if (stale && !sameTargetAsShown) notices.push({ key: "path", tone: "info", text: "A newer scan published — refresh to search for this path." });
    else if (outcome === "none_exists") notices.push({ key: "path", tone: "muted", text: `No declared path from ${rootName} to ${targetName}.` });
    else if (outcome === "not_found_within_budget")
      notices.push({
        key: "path",
        tone: "warning",
        text: "No path found within the search limits — one may still exist. Expanding objects searches further.",
        action: { label: "Clear", run: () => { const next = new URLSearchParams(params); next.delete("target"); setParams(next, { replace: true, state: location.state }); } },
      });
    else if (outcome === "found" && pathQuery.currentData?.data.more_paths) notices.push({ key: "path", tone: "muted", text: "Showing the declared path. More paths exist beyond the search limit." });
    if (highlighted && !visual.nodes.some((n) => n.members.some((m) => m.ref === targetRef)))
      notices.push({ key: "target", tone: "warning", text: "A declared path was returned, but its target is beyond the display limit. Open the target to see its own graph." });
  }
  if (tracedPath) notices.push({ key: "trace", tone: "muted", text: "Tracing a path from the Paths list.", action: { label: "Clear", run: () => dispatchModel({ type: "trace", claims: null }) } });
  if ((nodeParam || edgeParam) && rootReady && model.laidOut && !card)
    notices.push({ key: "missing", tone: "muted", text: "The selected item is not in this loaded view. It may be beyond the display limit or absent from the newer scan." });
  if (revealedWorkloads.size) notices.push({ key: "group", tone: "muted", text: "Workloads sharing an identity are drawn one by one.", action: { label: "Group them", run: () => dispatchModel({ type: "reveal-workloads", refs: [] }) } });
  if (model.revealedBranches.size) notices.push({ key: "branches", tone: "muted", text: "Every loaded relationship of the branches you opened is drawn.", action: { label: "Fold them again", run: () => { for (const id of model.revealedBranches) dispatchModel({ type: "reveal-branch", id, shown: false }); } } });
  if (visual.limited && !showPaths)
    notices.push({ key: "limit", tone: "warning", text: `Display limit: ${visual.nodes.length} objects and ${visual.edges.length} relationships are drawn (maximum 150 / 300). Paths lists everything loaded.`, action: { label: "Open Paths", run: () => setView("paths") } });
  if (model.truncated)
    notices.push({ key: "truncated", tone: "warning", text: `The server stopped at its ${model.truncated.bound_by.replace(/_/g, " ")} limit, so more relationships exist than are loaded. Use the Load controls to fetch them.` });

  const noRelationships = rootReady && model.laidOut && visual.edges.length === 0 && visual.nodes.length <= 1;
  const rootFrontier = frontierMap.get(root) ?? [];

  const evidencePanel = evidenceOpen ? (
    <GraphInspector
      ws={ws}
      subject={{
        claims: selectedClaims,
        edge: selectedEdge,
        backTo: card ? `Back to ${card.kind === "node" ? descriptions.get(card.visual.id)?.title ?? "selection" : edgeVerb(card.edge)}` : undefined,
      }}
      nodes={model.nodes}
      presentation={inline ? "inline" : "drawer"}
      width={inspectorWidth}
      modal={narrow}
      onClose={clearAll}
      onBack={backFromEvidence}
    />
  ) : null;

  let body;
  if (hardFailure || (firstLoad && rootFailure)) {
    body = (
      <div className="p-4">
        <GraphStatePanel failure={rootFailure!} subject="this graph" onRetry={() => void rootQuery.refetch()} onRefresh={refresh} />
      </div>
    );
  } else if (firstLoad) {
    body = (
      <div className="flex h-full items-center justify-center" role="status" aria-busy="true" aria-label={`Loading the graph for ${rootName}`}>
        <div className="size-8 animate-spin rounded-full border-2 border-(--color-border-subtle) border-t-(--color-primary)" />
      </div>
    );
  } else if (showPaths) {
    body = (
      <div className="flex h-full">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <PathsList
            rootName={rootName}
            paths={rawPathsResult.paths}
            nodesByRef={model.nodes}
            frontierByNode={frontierMap}
            truncated={!!model.truncated}
            boundByMax={rawPathsResult.boundByMax}
            depthLimited={rawPathsResult.depthLimited}
            stateOf={stateOf}
            canLoadMore={canLoadMore}
            onExpand={handleExpand}
            onLoadMore={handleLoadMore}
            onCollapse={handleCollapse}
            onRefresh={refresh}
            onSelectNode={(ref) => {
              const group = grouped.nodes.find((n) => n.kind === "workload" && n.members.length > 1 && n.members.some((m) => m.ref === ref));
              if (group) dispatchModel({ type: "reveal-workloads", refs: [...model.revealedWorkloads, ...group.members.map((m) => m.ref)] });
              select("node", ref);
            }}
            onSelectEdge={(claim) => select("edge", claim)}
            onTrace={trace}
            selectedRef={(nodeVisual?.members[0].ref ?? (nodeParam as GraphRef | null)) ?? null}
            selectedClaims={edgeClaims.length ? edgeClaims : selectedClaims}
          />
        </div>
        {card && !evidenceOpen ? (
          <SelectionCard subject={card} edges={visual.edges} nodes={model.nodes} rootAccountId={rootAccountId} actions={cardActions} docked />
        ) : null}
      </div>
    );
  } else {
    body = (
      <div className={cn("relative h-full", !rootReady && "opacity-60")} aria-busy={!rootReady || !model.laidOut}>
        <GraphCanvas
          visualNodes={visual.nodes}
          visualEdges={visual.edges}
          descriptions={descriptions}
          sizes={sizes}
          positions={placement}
          rootId={rootId}
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
          onClearSelection={clearAll}
          onMoveNode={(id, position) => dispatchModel({ type: "move", id, position })}
          rightInset={card && !evidenceOpen ? 344 : 0}
          revealToken={revealToken}
          viewport={model.viewport}
          onViewportChange={(viewport) => dispatchModel({ type: "viewport", viewport })}
          onApi={onApi}
        />
        {card && !evidenceOpen ? (
          <div className="pointer-events-none absolute inset-y-3 right-3 flex items-start">
            <div className="pointer-events-auto max-h-full">
              <SelectionCard subject={card} edges={visual.edges} nodes={model.nodes} rootAccountId={rootAccountId} actions={cardActions} />
            </div>
          </div>
        ) : null}
        {!model.laidOut ? (
          <div className="absolute inset-0 flex items-center justify-center bg-(--color-surface-raised)/60" role="status" aria-label="Arranging the graph">
            <div className="size-8 animate-spin rounded-full border-2 border-(--color-border-subtle) border-t-(--color-primary)" />
          </div>
        ) : null}
        {noRelationships ? (
          <div role="status" className="absolute inset-x-0 top-6 mx-auto w-fit max-w-md rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3 text-center text-sm shadow-(--shadow-xs)">
            {rootFrontier.length
              ? `No relationships are loaded for ${rootName} yet. Use its Load controls to fetch them.`
              : `The latest scan recorded no relationships for ${rootName}. That is what was collected — if collection for its account was incomplete, some may be missing.`}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={workspaceRef}
      style={{ height: fullscreen ? "100vh" : wsHeight }}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)"
    >
      <div role="toolbar" aria-label="Graph" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--color-border-subtle) px-3 py-2">
        <div className="inline-flex overflow-hidden rounded-md border border-(--color-border-subtle)" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "overview"} onClick={() => setView("overview")} className={toggleClass(view === "overview")} title="Workload → identity → what it declares">
            Overview
          </button>
          <button type="button" aria-pressed={view === "detailed"} onClick={() => setView("detailed")} className={toggleClass(view === "detailed")} title="Every policy statement drawn">
            Detailed
          </button>
          <button type="button" aria-pressed={showPaths} onClick={() => setView("paths")} className={toggleClass(showPaths)} title="Every loaded path as a list">
            Paths
          </button>
        </div>
        {isIdentity ? (
          <div className="inline-flex items-center gap-1.5 text-xs">
            <span className="text-(--color-text-muted)">Direction</span>
            <div className="inline-flex overflow-hidden rounded-md border border-(--color-border-subtle)">
              <button type="button" aria-pressed={direction === "forward"} onClick={() => setManualDirection("forward")} className={toggleClass(direction === "forward")}>
                What it reaches
              </button>
              <button type="button" aria-pressed={direction === "reverse"} onClick={() => setManualDirection("reverse")} className={toggleClass(direction === "reverse")}>
                What reaches it
              </button>
            </div>
          </div>
        ) : null}
        {!showPaths ? (
          <label className="relative flex min-w-[180px] max-w-xs flex-1 items-center">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 size-3.5 text-(--color-text-muted)" />
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && findMatches?.[0]) selectNode(findMatches[0].id);
                // Escape clears the text first; only an empty box lets it
                // reach the selection.
                if (e.key === "Escape" && find) {
                  e.stopPropagation();
                  setFind("");
                }
              }}
              placeholder="Find in loaded graph"
              aria-label="Find an object in the loaded graph"
              className="h-8 w-full rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) pl-7 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)"
            />
            {findMatches ? (
              <span className="ml-2 shrink-0 text-[11px] text-(--color-text-muted)" role="status">
                {findMatches.length} of {visual.nodes.length} loaded
              </span>
            ) : null}
          </label>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-right text-xs text-(--color-text-muted)" title="Everything here is declared by policy and configuration. Whether a request would succeed has not been evaluated.">
          Declared access · not evaluated
        </p>
        <div className="flex items-center gap-1">
          {canvasControls ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => canvasApi.current?.fitGraph()} title="Frame everything drawn">
                <Maximize2 className="size-3.5" /> Fit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Layout options">
                    <LayoutGrid className="size-3.5" /> Layout
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => canvasApi.current?.revealStart()}>Go to the starting object</DropdownMenuItem>
                  <DropdownMenuItem onSelect={resetLayout}>Reset layout{manualPositions.size ? ` (discards ${manualPositions.size} moved)` : ""}</DropdownMenuItem>
                  <DropdownMenuItem disabled={!model.previousLayout} onSelect={restoreLayout}>Restore previous layout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
          <Button variant="ghost" size="icon" className="size-8" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"}>
            {fullscreen ? <Minimize className="size-3.5" /> : <Expand className="size-3.5" />}
          </Button>
          <Legend />
        </div>
      </div>

      {notices.length ? (
        <ul className="shrink-0 divide-y divide-(--color-border-subtle) border-b border-(--color-border-subtle) text-xs" role="status">
          {notices.map((n) => (
            <li key={n.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className={n.tone === "warning" ? "text-(--color-warning-text)" : n.tone === "info" ? "text-(--color-info-text)" : "text-(--color-text-muted)"}>{n.text}</span>
              {n.action ? (
                <button type="button" onClick={n.action.run} className="shrink-0 font-medium text-(--color-primary-text) hover:underline">
                  {n.action.label}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">{body}</div>
        {evidencePanel && inline ? evidencePanel : null}
      </div>
      {evidencePanel && !inline ? evidencePanel : null}
    </div>
  );
}

/** The layout may run once this session's root has been ingested. */
function rootReadyForLayout(model: ModelState, currentKey: string): boolean {
  return model.root !== null && model.generationKey === currentKey && visibleNodeRefs(model).size > 0;
}
