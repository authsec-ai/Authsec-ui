import type { GraphRef } from "@/app/api/igaGraphApi";

/** History state carried by a link that detours from one object to another. */
export interface ViaState {
  viaName?: string;
}

/**
 * Link props for a detour from `from` (the object being viewed) to `to`:
 * `via` in the URL, the name in history state.
 */
export function viaLink(toPath: string, from: { ref: GraphRef; name: string }) {
  const sep = toPath.includes("?") ? "&" : "?";
  return {
    to: `${toPath}${sep}via=${encodeURIComponent(from.ref)}`,
    state: { viaName: from.name } satisfies ViaState,
  };
}

/** An object page's tab, as the route and the shell see it. */
export interface TabRoute {
  key: string;
  /** false: the deployment does not serve it; undefined: capabilities still loading. */
  available?: boolean;
  /** The tab depends on a capability; while capabilities load it is not yet known. */
  gated?: boolean;
}

/**
 * What the `:tab` route segment resolves to. An unknown tab is Not found; a
 * known tab the deployment does not serve is Unavailable (§2.14.14), never
 * "not found" — that answer belongs to the object (§2.14.5).
 */
export type ActiveTab =
  | { state: "ready"; key: string }
  | { state: "pending"; key: string }
  | { state: "unavailable"; key: string }
  | { state: "unknown" };

export function activeTabOf(tabs: TabRoute[], tab: string | undefined): ActiveTab {
  const t = tab === undefined ? tabs[0] : tabs.find((x) => x.key === tab);
  if (!t) return { state: "unknown" };
  if (t.available === true || !t.gated) return { state: "ready", key: t.key };
  return t.available === false ? { state: "unavailable", key: t.key } : { state: "pending", key: t.key };
}
