/** True once an element has come near the viewport, so per-row reads wait until the row is about to be seen. */

import { useEffect, useState } from "react";

export function useInView(rootMargin = "240px"): { ref: (node: Element | null) => void; seen: boolean } {
  const [node, setNode] = useState<Element | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!node || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [node, seen, rootMargin]);
  return { ref: setNode, seen };
}
