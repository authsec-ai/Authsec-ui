/**
 * Connections as Discovery sees them: which providers can be shown, which
 * sources narrow a list, and which provider opens by default.
 *
 * A Discovery `source=<connection id>` is a connection's id; the unified
 * inventory and the graph lists filter by `Connection.scope_id` (what the
 * inventory calls `scope.id`), so the id is mapped here, explicitly. A source
 * that maps to nothing is never read as "all": the list says so.
 */

import type { Connection } from "@/app/api/connectionsApi";
import { SessionManager } from "@/utils/sessionManager";

import { DISCOVERY_PROVIDERS, type DiscoveryProvider, type DiscoveryType } from "./urlState";
import { supportsType } from "./model";

export interface Source {
  id: string;
  label: string;
  /** What the inventory and graph lists call this connection's `scope.id`; "" when it has no rows there. */
  scopeId: string;
  /** Revoked sources are listed and marked. */
  revoked: boolean;
  connection: Connection;
}

export function sourcesOf(connections: Connection[], provider: DiscoveryProvider): Source[] {
  return connections
    .filter((c) => c.provider === provider)
    .map((c) => ({
      id: c.id,
      label: c.name || c.native_id,
      scopeId: c.scope_id,
      revoked: c.connection.state === "revoked",
      connection: c,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type SourceScope =
  | { kind: "all" }
  | { kind: "one"; source: Source }
  /** The URL names a source that is not a connection of this provider. */
  | { kind: "unknown"; id: string }
  /** A connection that has no rows in the inventory: filtering by it would widen, so it is empty. */
  | { kind: "no_rows"; source: Source };

export function resolveSource(sources: Source[], id: string | undefined, needsScopeId: boolean): SourceScope {
  if (!id) return { kind: "all" };
  const source = sources.find((s) => s.id === id);
  if (!source) return { kind: "unknown", id };
  if (needsScopeId && !source.scopeId) return { kind: "no_rows", source };
  return { kind: "one", source };
}

/* ----------------------------- the default provider ----------------------------- */

export function connectedProviders(connections: Connection[]): DiscoveryProvider[] {
  return DISCOVERY_PROVIDERS.filter((p) => connections.some((c) => c.provider === p));
}

function prefKey(): string {
  const s = SessionManager.getSession();
  return `authsec.discovery.provider:${s?.user_id ?? "-"}:${s?.workspace_id ?? "-"}`;
}

/** The provider last used in this browser: a local preference, never required. */
export function readLastProvider(): DiscoveryProvider | undefined {
  try {
    const v = window.localStorage.getItem(prefKey());
    return DISCOVERY_PROVIDERS.find((p) => p === v);
  } catch {
    return undefined;
  }
}

export function writeLastProvider(provider: DiscoveryProvider): void {
  try {
    window.localStorage.setItem(prefKey(), provider);
  } catch {
    /* A private window or blocked storage: the preference is only a convenience. */
  }
}

/**
 * The provider whose result became available most recently, by its own rule:
 * AWS publication, Kubernetes sweep, Google Cloud latest scan, GitHub latest
 * result — all of which B3 reports as `discovery.as_of` once `ready`.
 */
function mostRecentlyAvailable(connections: Connection[], candidates: DiscoveryProvider[]): DiscoveryProvider | undefined {
  let best: { provider: DiscoveryProvider; at: number } | undefined;
  for (const c of connections) {
    if (!candidates.includes(c.provider) || !c.discovery?.ready || !c.discovery.as_of) continue;
    const at = Date.parse(c.discovery.as_of);
    if (Number.isNaN(at)) continue;
    if (!best || at > best.at) best = { provider: c.provider, at };
  }
  return best?.provider;
}

/**
 * The default rule (spec: *Scope rule*): the provider in the URL, then the one
 * last used in this browser, else the one whose result is most recently
 * available, else the only (or first) connected provider. `type` narrows the
 * candidates when the URL already names one: a link to sightings opens on a
 * provider that has them.
 */
export function defaultProvider(connections: Connection[], type?: DiscoveryType): DiscoveryProvider | undefined {
  const connected = connectedProviders(connections);
  const candidates = type ? connected.filter((p) => supportsType(p, type)) : connected;
  if (!candidates.length) return undefined;
  const last = readLastProvider();
  if (last && candidates.includes(last)) return last;
  return mostRecentlyAvailable(connections, candidates) ?? candidates[0];
}
