/**
 * The Evidence panel's URL and history rules (SPEC-iga-phase2-graph.md
 * §2.14.5). The panel is `?evidence=<claim ref>` on the view that opened it.
 *
 * | Action                          | History                                          |
 * |---------------------------------|--------------------------------------------------|
 * | Open, from a closed panel       | push, marked `opened-here`                       |
 * | Open another claim while open   | replace (Back does not step through claims)      |
 * | Close or Escape                 | back one entry if marked, else replace without it |
 * | Browser Back while open         | the browser pops the entry; the panel closes     |
 * | Direct link with `evidence=`    | none; Close replaces rather than leaving the page |
 *
 * Several claims — the grants behind one grouped graph line (§2.14.11) — are
 * one comma-separated value, and the panel shows each claim separately.
 */

import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { GraphRef } from "@/app/api/igaGraphApi";

const PARAM = "evidence";
const MARK = "opened-here";

/** Where focus returns when the panel closes. Module-level: one panel at a time. */
let opener: HTMLElement | null = null;

export function restoreEvidenceFocus() {
  const target = opener && document.contains(opener) ? opener : document.querySelector<HTMLElement>("[data-iga-page] h1");
  if (target) { if (target.tagName === "H1") target.tabIndex = -1; target.focus(); }
}

export function useEvidence() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const raw = params.get(PARAM);
  const claims = raw ? (raw.split(",").filter(Boolean) as GraphRef[]) : [];
  const state = useMemo(() => (location.state as Record<string, unknown> | null) ?? {}, [location.state]);

  const open = useCallback(
    (refs: GraphRef | GraphRef[]) => {
      const list = Array.isArray(refs) ? refs : [refs];
      if (!list.length) return;
      const next = new URLSearchParams(location.search);
      next.set(PARAM, list.join(","));
      const alreadyOpen = new URLSearchParams(location.search).has(PARAM);
      if (!alreadyOpen) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      navigate(
        { pathname: location.pathname, search: `?${next.toString()}` },
        alreadyOpen
          ? { replace: true, state }
          : { state: { ...state, panel: MARK } },
      );
    },
    [location.pathname, location.search, navigate, state],
  );

  const close = useCallback(() => {
    if (state.panel === MARK) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(location.search);
    next.delete(PARAM);
    const qs = next.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true, state });
  }, [location.pathname, location.search, navigate, state]);

  return { claims, isOpen: claims.length > 0, open, close };
}
