/**
 * Cursor paging for graph lists (SPEC-iga-phase2-graph.md §2.14.5, §5.1).
 *
 * Cursors are bound to one revision, so they live in HISTORY STATE, never in
 * the URL: Back to a list restores its page, and a shared link never carries
 * a cursor. Prev is client-side — the stack of cursors used to get here. One
 * view may page several sections at once, so each has its own `name`.
 *
 * A filter edit replaces the history entry without state, which drops every
 * stack: paging restarts at page one, as it must.
 */

import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

interface SectionState {
  cursors: string[];
  /** The revision epoch the cursors were issued under (see revision.ts). */
  epoch: number;
  /** Bumped when the listing changed under the cursor; part of the cache key. */
  restart: number;
}

type PagingHistory = { paging?: Record<string, SectionState>; scroll?: Record<string, number> };

export function usePaging(name: string, epoch: number) {
  const location = useLocation();
  const navigate = useNavigate();
  const all = (location.state as PagingHistory | null)?.paging ?? {};
  const own = all[name];
  const section: SectionState = own && own.epoch === epoch ? own : { cursors: [], epoch, restart: 0 };

  const write = useCallback(
    (next: SectionState) => {
      const prev = (window.history.state?.usr as PagingHistory | null) ?? {};
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: { ...prev, paging: { ...(prev.paging ?? {}), [name]: next } },
      });
    },
    [navigate, location.pathname, location.search, location.hash, name],
  );

  const cursors = section.cursors;
  return {
    pageIndex: cursors.length,
    cursor: cursors[cursors.length - 1] as string | undefined,
    /**
     * Client-only cache discriminator: the revision epoch and the restart
     * count. A restart must read page one afresh — the cached page one holds a
     * `next_cursor` signed under the old listing, which would fail again.
     */
    cacheKey: `${epoch}.${section.restart}`,
    next: (cursor: string) => write({ ...section, cursors: [...cursors, cursor] }),
    prev: () => write({ ...section, cursors: cursors.slice(0, -1) }),
    /**
     * The customer came back to a page whose cursors belong to an earlier
     * revision: the list restarted at page one, and says why.
     */
    resetByRevision: !!own && own.epoch !== epoch && own.cursors.length > 0,
    /** The listing changed under the cursor: back to a fresh page one. */
    restart: () => write({ cursors: [], epoch, restart: section.restart + 1 }),
  };
}

/** The console's scrolling element (IgaLayout's main content area). */
function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-main-content-area]");
}

/**
 * Returning to a list restores its scroll position as well as its page
 * (§2.14.5 *Rows, panels and returning*). The offset is kept in the current
 * history entry as the customer scrolls, and restored once, when the list's
 * rows have arrived — before that there is nothing to scroll to.
 */
export function useRestoreScroll(name: string, ready: boolean) {
  const restored = useRef(false);

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    let t: number | undefined;
    const save = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const h = window.history.state ?? {};
        const usr = (h.usr as PagingHistory | null) ?? {};
        window.history.replaceState({ ...h, usr: { ...usr, scroll: { ...(usr.scroll ?? {}), [name]: el.scrollTop } } }, "");
      }, 150);
    };
    el.addEventListener("scroll", save, { passive: true });
    return () => {
      window.clearTimeout(t);
      el.removeEventListener("scroll", save);
    };
  }, [name]);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const top = (window.history.state?.usr as PagingHistory | null)?.scroll?.[name];
    const el = scroller();
    if (el && top) el.scrollTop = top;
  }, [ready, name]);
}
