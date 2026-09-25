/**
 * The global breadcrumb's last item, when a page knows a better name for it
 * than its URL does — an object page's own name instead of a raw id.
 *
 * One page at a time owns it: `useBreadcrumbTail` sets it while mounted and
 * clears it on unmount, and the breadcrumb only shows it while the location
 * is still inside `path`, so a stale name can never label another page.
 */

import { useEffect, useSyncExternalStore } from "react";

export interface BreadcrumbTail {
  /** The object's own URL; the tail applies to it and to its tabs. */
  path: string;
  label: string;
  /** The list the object belongs to, when it is not the URL's parent segment. */
  list?: { label: string; href: string };
}

let tail: BreadcrumbTail | null = null;
const listeners = new Set<() => void>();

function set(next: BreadcrumbTail | null) {
  tail = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useBreadcrumbTailValue(): BreadcrumbTail | null {
  return useSyncExternalStore(subscribe, () => tail);
}

/** Names the current object in the global breadcrumb while this is mounted. */
export function useBreadcrumbTail(
  path: string | null,
  label: string | null,
  list?: { label: string; href: string },
) {
  const listLabel = list?.label;
  const listHref = list?.href;
  useEffect(() => {
    if (!path || !label) return;
    const mine: BreadcrumbTail = {
      path,
      label,
      list: listLabel && listHref ? { label: listLabel, href: listHref } : undefined,
    };
    set(mine);
    return () => {
      if (tail === mine) set(null);
    };
  }, [path, label, listLabel, listHref]);
}
