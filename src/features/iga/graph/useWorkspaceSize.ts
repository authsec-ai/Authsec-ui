/**
 * The graph workspace's size: its own width (for the inspector's inline or
 * drawer decision — the sidebar already taken out), and the height left in
 * the page's scroll area below where the workspace starts, so the toolbar,
 * canvas and inspector fit on one screen without the page scrolling.
 *
 * Re-measured when the scroll area resizes (window, sidebar) and when
 * anything above the workspace changes its height (a banner appearing).
 * Never below `minHeight`: on a short window the page scrolls instead of the
 * canvas collapsing.
 */

import { useLayoutEffect, useState, type RefObject } from "react";

export function useWorkspaceSize(ref: RefObject<HTMLElement | null>, minHeight = 460) {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: minHeight });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = el.closest<HTMLElement>("[data-main-content-area]");
    const page = el.closest<HTMLElement>(".console-page");
    const measure = () => {
      const area = scroller?.getBoundingClientRect();
      const top = el.getBoundingClientRect().top - (area?.top ?? 0) + (scroller?.scrollTop ?? 0);
      const visible = scroller?.clientHeight ?? window.innerHeight;
      const bottomPad = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 16;
      const height = Math.max(minHeight, Math.floor(visible - top - bottomPad));
      const width = el.clientWidth;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (scroller) ro.observe(scroller);
    ro.observe(el);
    // Content above the workspace moves its top: the header, and banners
    // inserted later (a newer publication, a failed refresh). Both change
    // the size of the column the workspace sits in.
    const above = page?.firstElementChild;
    if (above instanceof HTMLElement) ro.observe(above);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, minHeight]);

  return size;
}
