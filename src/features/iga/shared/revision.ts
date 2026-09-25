/**
 * The pinned graph revision (SPEC-iga-phase2-graph.md §2.14.5, §5.1).
 *
 * An investigation reads ONE published revision. The first graph response
 * pins it; every later request sends it; a `409 revision_stale` marks the
 * pin stale, and the screens keep what they show until the customer chooses
 * Refresh, which clears the pin so the next responses pin the new revision.
 *
 * Held in memory, per workspace, outside React: the IGA routes each mount
 * their own layout, so a context would be torn down between the list and an
 * object's page, and the investigation would silently re-pin mid-way. It is
 * never written to the URL or to storage — a revision is current-only, and a
 * link must not promise one (§2.14.5).
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { GraphFailure } from "./graphErrors";

export interface RevisionState {
  /** The revision this investigation reads, once a response has pinned it. */
  rev: number | null;
  /** Set when the server reports a newer publication. */
  stale: { currentRev?: number; currentPublishedAt?: string } | null;
  /**
   * Bumped by Refresh. It is part of every cache key, so a refreshed read is
   * never answered from a pre-refresh cache entry, and lists key their paging
   * on it, so a refresh restarts every list at its first page.
   */
  epoch: number;
}

const EMPTY: RevisionState = { rev: null, stale: null, epoch: 0 };
const byWorkspace = new Map<string, RevisionState>();
const listeners = new Set<() => void>();
let sessionGeneration = 0;
const resetListeners = new Set<() => void>();
export const graphSessionGeneration = () => sessionGeneration;
export function onGraphSessionReset(fn: () => void) { resetListeners.add(fn); }


function emit() {
  for (const l of listeners) l();
}

function get(ws: string): RevisionState {
  return byWorkspace.get(ws) ?? EMPTY;
}

function set(ws: string, next: RevisionState) {
  byWorkspace.set(ws, next);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget every workspace's investigation. Called when a session ends. */
export function resetGraphRevisions() {
  sessionGeneration++;
  byWorkspace.clear();
  for (const reset of resetListeners) reset();
  emit();
}

function pin(ws: string, rev: number) {
  const cur = get(ws);
  if (cur.rev != null) return;
  set(ws, { ...cur, rev });
}

function markStale(ws: string, info: { currentRev?: number; currentPublishedAt?: string }) {
  const cur = get(ws);
  if (cur.stale) return;
  set(ws, { ...cur, stale: info });
}

export function useGraphRevision(ws: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => get(ws),
    () => EMPTY,
  );

  const stale = useCallback(
    (info: { currentRev?: number; currentPublishedAt?: string }) => markStale(ws, info),
    [ws],
  );

  /** Refresh: drop the pin and the stale flag; lists restart at page one. */
  const refresh = useCallback(() => {
    const cur = get(ws);
    set(ws, { rev: null, stale: null, epoch: cur.epoch + 1 });
  }, [ws]);

  return { ...state, markStale: stale, refresh };
}

/** A graph response: every list and detail envelope carries these (§5.2). */
interface Answered {
  meta: { rev: number | null; published_at?: string | null };
}

/**
 * What every graph view does with its own read.
 *
 * - The first published answer pins the investigation. Pinning changes the
 *   query's arguments (they now carry `rev`), which is a new cache entry; so
 *   `seed` first writes the answer already held into that entry, and the pin
 *   lands only after it. Without the seed, every first load and every Refresh
 *   would request the same data twice and blank the view in between — and a
 *   publication landing between the two would turn a good answer into a
 *   stale-revision panel.
 * - An answer at another revision than the pin (a read issued before the pin
 *   landed) is never shown as if it were the pinned one: it marks the pin
 *   stale.
 * - A `409 revision_stale` marks the pin stale.
 */
export function useTrackRevision<T extends Answered>(
  ws: string,
  answered: T | undefined,
  failure: GraphFailure | null,
  seed: (rev: number, data: T) => PromiseLike<unknown> | void,
) {
  useEffect(() => {
    const rev = answered?.meta.rev;
    if (rev == null || !answered) return;
    const pinned = get(ws).rev;
    if (pinned == null) {
      const generation = sessionGeneration;
      const epoch = get(ws).epoch;
      void Promise.resolve(seed(rev, answered)).then(() => {
        if (generation === sessionGeneration && epoch === get(ws).epoch) pin(ws, rev);
      });
    } else if (rev > pinned) {
      markStale(ws, { currentRev: rev, currentPublishedAt: answered.meta.published_at ?? undefined });
    }
    // `seed` is recreated each render; the effect reacts to the answer alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, answered]);

  const stale = failure?.kind === "revision_stale" ? failure : null;
  const staleRev = stale?.currentRev;
  const stalePublishedAt = stale?.currentPublishedAt;
  const isStale = stale !== null;
  useEffect(() => {
    if (isStale) markStale(ws, { currentRev: staleRev, currentPublishedAt: stalePublishedAt });
  }, [ws, isStale, staleRev, stalePublishedAt]);
}
