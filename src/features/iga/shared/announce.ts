/**
 * One polite live region for the graph screens (§2.14.14 *Keyboard*): every
 * §2.14.7 state is announced — "Showing 1–100 of 412 found", "Could not load.
 * Retry", "A newer scan published". The region stays mounted; only its text
 * changes, which is what screen readers reliably announce.
 */

import { useEffect, useSyncExternalStore } from "react";

let message = "";
const listeners = new Set<() => void>();

export function announce(text: string) {
  // Re-announcing the same words needs a change the reader notices.
  message = message === text ? `${text} ` : text;
  for (const l of listeners) l();
}

export function useAnnouncement(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => message,
    () => "",
  );
}

/** Announce `text` whenever it changes; nothing while it is null. */
export function useAnnounce(text: string | null) {
  useEffect(() => {
    if (text) announce(text);
  }, [text]);
}
