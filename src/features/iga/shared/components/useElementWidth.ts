import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * The content width of one element, re-measured when its container changes
 * (sidebar open or collapsed, a preview opening). Responsive rules in the
 * console are about the AVAILABLE width, not the viewport — see the spec's
 * *Responsive contract*.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.clientWidth);
    observer.current = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.current.observe(el);
  }, []);
  useLayoutEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}
