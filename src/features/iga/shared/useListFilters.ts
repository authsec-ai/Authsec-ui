/**
 * A graph list's filters, search and sort, held in the URL
 * (SPEC-iga-phase2-graph.md §2.14.5 *What a URL carries*).
 *
 * - Edits REPLACE the history entry, so Back leaves the list instead of
 *   walking its filters; replacing without state also restarts paging.
 * - A value the list does not accept (a hand-edited or stale link) is
 *   ignored, rather than sent to the server as a request that can only fail.
 * - Search is typed locally and written once typing pauses. The text is
 *   written as typed; only the query trims it, so a pause after a space does
 *   not eat the space.
 * - `/` focuses the search box (§2.14.14 *Keyboard*).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

const SEARCH_DEBOUNCE_MS = 250;
/** The server ignores shorter searches (§5.2), so the console does not send them. */
const SEARCH_MIN = 2;

/** For each URL key, the values it accepts; `null` accepts any non-empty value. */
export type FilterSpec = Record<string, readonly string[] | null>;

export function useListFilters<S extends FilterSpec>(spec: S) {
  const [params, setParams] = useSearchParams();

  const value = (key: keyof S & string): string | undefined => {
    const v = params.get(key) ?? undefined;
    if (!v) return undefined;
    const allowed = spec[key];
    return allowed === null || allowed.includes(v) ? v : undefined;
  };

  const set = useCallback(
    (key: string, v: string | null | undefined) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v === null || v === undefined || v === "") next.delete(key);
          else next.set(key, v);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        // Filters go; the view's own parameters (evidence, via) stay.
        for (const keep of ["evidence", "via"]) {
          const v = prev.get(keep);
          if (v) next.set(keep, v);
        }
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  // Search: local text, debounced into the URL through the latest setter.
  const urlQ = params.get("q") ?? "";
  const [searchText, setSearchText] = useState(urlQ);
  const written = useRef(urlQ);
  useEffect(() => {
    // The URL changed from outside (Back, a link, Clear filters): follow it.
    if (urlQ !== written.current) {
      written.current = urlQ;
      setSearchText(urlQ);
    }
  }, [urlQ]);
  useEffect(() => {
    if (searchText === written.current) return;
    const t = window.setTimeout(() => {
      written.current = searchText;
      set("q", searchText);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchText, set]);

  const trimmed = urlQ.trim();

  return {
    value,
    values: (key: keyof S & string) => [...new Set(params.getAll(key).filter((v) => v && (spec[key] === null || spec[key].includes(v))))],
    setMany: (key: string, values: string[]) => setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      for (const value of [...new Set(values)].sort()) next.append(key, value);
      return next;
    }, { replace: true }),
    set,
    clear,
    searchText,
    setSearchText,
    /** The search as the server receives it: trimmed, and only from two characters. */
    q: trimmed.length >= SEARCH_MIN ? trimmed : undefined,
  };
}

/** `/` focuses the search box inside the element marked `data-graph-search`. */
export function useSlashToSearch() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const input = document.querySelector<HTMLInputElement>("[data-graph-search] input");
      if (!input) return;
      e.preventDefault();
      input.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
