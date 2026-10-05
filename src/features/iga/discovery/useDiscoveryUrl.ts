/**
 * Discovery's state, held in the URL (SPEC-console-revamp.md *Investigation-
 * context contract*): provider, type, view, search, source, filters, sort and
 * the selected object. Cursors and scroll live in history state (`usePaging`,
 * `useRestoreScroll`).
 *
 * - A FILTER edit replaces the entry WITHOUT history state: paging restarts at
 *   page one, as it must. The exception is a search that only narrows the rows
 *   already loaded (Sightings): the server's answer is the same, so the page and
 *   the selection stay.
 * - A SELECTION replaces the entry WITH the history state it has now, so the
 *   page and scroll survive opening and closing a preview.
 * - A switch of provider, type or view PUSHES an entry, so Back returns to the
 *   list the reader left; the filters it could not carry travel in history
 *   state as `removed`, and are shown for one interaction.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import type { RemovedFilter } from "./model";
import { isProvider, isType, isView } from "./urlState";

const SEARCH_DEBOUNCE_MS = 250;
/** The server ignores shorter searches (§5.2), so the console does not send them. */
const SEARCH_MIN = 2;

type Patch = Record<string, string | null | undefined>;
type HistoryUsr = { removed?: RemovedFilter[]; paging?: unknown; scroll?: unknown } | null;

function currentUsr(): HistoryUsr {
  return (window.history.state?.usr as HistoryUsr) ?? null;
}

export function useDiscoveryUrl() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const urlProvider = params.get("provider");
  const urlType = params.get("type");
  const urlView = params.get("view");
  const urlQ = params.get("q") ?? "";
  const removed = ((location.state as HistoryUsr)?.removed ?? []) as RemovedFilter[];

  // The writers below read the URL as it is when they are CALLED, not as it was
  // when they were created: a row's menu keeps the callback it rendered with,
  // and a stale copy of the query string would undo a filter set since.
  const latest = useRef({ pathname: location.pathname, params, state: location.state });
  useLayoutEffect(() => {
    latest.current = { pathname: location.pathname, params, state: location.state };
  });
  const write = useCallback(
    (next: URLSearchParams, state: unknown) => {
      const { pathname } = latest.current;
      const qs = next.toString();
      navigate({ pathname, search: qs ? `?${qs}` : "" }, { replace: true, state });
    },
    [navigate],
  );

  /**
   * A filter edit: one history write, no history state, so paging restarts.
   * `keepPosition` is for an edit that does not change what the server returns:
   * the page, scroll and selection are kept (a selection that no longer matches
   * is dropped by its list).
   */
  const patch = useCallback(
    (changes: Patch, opts?: { keepPosition?: boolean }) => {
      const next = new URLSearchParams(latest.current.params);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (opts?.keepPosition) {
        const usr = currentUsr();
        write(next, usr ? { ...usr, removed: undefined } : undefined);
        return;
      }
      // A different list is a different selection.
      next.delete("sel");
      write(next, undefined);
    },
    [write],
  );

  /** Select (or clear the selection of) one object, keeping page and scroll. */
  const select = useCallback(
    (sel: string | null) => {
      const usr = currentUsr();
      const next = new URLSearchParams(latest.current.params);
      if (sel) next.set("sel", sel);
      else next.delete("sel");
      write(next, usr ? { ...usr, removed: undefined } : undefined);
    },
    [write],
  );

  /** Fill in what the default rule resolved, so the URL is explicit from then on. */
  const normalise = useCallback(
    (resolved: Patch) => {
      const next = new URLSearchParams(latest.current.params);
      for (const [k, v] of Object.entries(resolved)) if (v) next.set(k, v);
      write(next, latest.current.state);
    },
    [write],
  );

  /** A switch of provider, type or view: a new history entry. */
  const go = useCallback(
    (next: URLSearchParams, removedFilters: RemovedFilter[]) => {
      navigate(
        { pathname: location.pathname, search: `?${next.toString()}` },
        { state: removedFilters.length ? { removed: removedFilters } : undefined },
      );
    },
    [navigate, location.pathname],
  );

  /** Dismiss the "Removed: …" chips without touching anything else. */
  const dismissRemoved = useCallback(() => {
    navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...(currentUsr() ?? {}), removed: undefined } });
  }, [navigate, location.pathname, location.search]);

  // Search: local text, debounced into the URL.
  const [searchText, setSearchText] = useState(urlQ);
  const written = useRef(urlQ);
  useEffect(() => {
    if (urlQ !== written.current) {
      written.current = urlQ;
      setSearchText(urlQ);
    }
  }, [urlQ]);
  // Sightings have no server search: the text only narrows the page already loaded,
  // so typing must not send the reader back to page one or drop their selection.
  const clientSearch = urlType === "sightings";
  useEffect(() => {
    if (searchText === written.current) return;
    const t = window.setTimeout(() => {
      written.current = searchText;
      patch({ q: searchText }, { keepPosition: clientSearch });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchText, patch, clientSearch]);
  const trimmed = urlQ.trim();

  return {
    params,
    search: location.search,
    provider: isProvider(urlProvider) ? urlProvider : undefined,
    type: isType(urlType) ? urlType : undefined,
    view: isView(urlView) ? urlView : undefined,
    source: params.get("source") ?? undefined,
    sel: params.get("sel") ?? undefined,
    sort: params.get("sort") ?? undefined,
    get: (key: string) => params.get(key) ?? undefined,
    searchText,
    setSearchText,
    /** The search as the server receives it: trimmed, and only from two characters. */
    q: trimmed.length >= SEARCH_MIN ? trimmed : undefined,
    /** What the reader typed that is too short to send. */
    qTooShort: trimmed.length > 0 && trimmed.length < SEARCH_MIN,
    removed,
    patch,
    select,
    normalise,
    go,
    dismissRemoved,
  };
}

export type DiscoveryUrl = ReturnType<typeof useDiscoveryUrl>;
