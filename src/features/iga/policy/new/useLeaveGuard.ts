/**
 * Asks before leaving with unsaved changes. The console uses a plain
 * `BrowserRouter`, which has no route blocker, so this does two things: a
 * capturing click handler turns a click on any same-origin link into a
 * "Stay / Leave" question (it never runs for a link that opens elsewhere), and
 * `beforeunload` covers closing or reloading the tab. The browser's Back button
 * is not intercepted; the draft keeps its last saved version either way.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function useLeaveGuard(active: boolean) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(`${url.pathname}${url.search}${url.hash}`);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);

  const stay = useCallback(() => setPending(null), []);
  const leave = useCallback(() => {
    const to = pending;
    setPending(null);
    if (to) navigate(to);
  }, [navigate, pending]);
  return { pending, stay, leave };
}
