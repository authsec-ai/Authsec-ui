/**
 * Connections (SPEC-console-revamp.md B3): every connected source of every
 * provider, in one shape, with the four independent conditions the console
 * never collapses into one word.
 *
 *   GET /authsec/discovery/connections
 *
 * `id` is the connection's own id — a cloud connector's or a discovery
 * source's — and is the same value the graph tables record as a row's
 * `source_ref`. `scope_id` is what the unified inventory calls `scope.id` for
 * this connection's rows, so Discovery filters a connection's objects with it.
 */

import { baseApi } from "./baseApi";
import type { CloudConnector } from "./cloudDiscoveryApi";

export type ConnectionProvider = "aws" | "gcp" | "azure" | "k8s" | "github";
export type ConnectionScopeKind = "account" | "project" | "cluster" | "organisation" | "tenant";

/** Can AuthSec reach it? */
export type ConnectionState = "connected" | "authentication_failed" | "revoked" | "not_verified";
/** The most recent attempt to read it. */
export type ScanState = "never_run" | "queued" | "running" | "finished" | "failed";
/** Could the read see everything it was asked to? */
export type CoverageState = "complete" | "partial" | "denied" | "unknown";
/** Is what was read in a numbered graph publication? */
export type ConnectionGraphState =
  | "published"
  | "publishing"
  | "failed"
  | "not_published"
  | "unrevisioned"
  | "not_applicable";

export interface Connection {
  id: string;
  provider: ConnectionProvider;
  scope_kind: ConnectionScopeKind;
  /** The display name, or `native_id` when it has none. */
  name: string;
  /** Account id, project id, cluster name or organisation login. */
  native_id: string;
  /** What the unified inventory uses as `scope.id` for this connection's rows; "" when it has no rows there. */
  scope_id: string;
  created_at: string;
  connection: {
    state: ConnectionState;
    /** A stable code for the cause when it is not `connected` (the connector's stored error code). */
    reason_code: string | null;
    verified_at: string | null;
  };
  scan: {
    state: ScanState;
    at: string | null;
    run_id: string | null;
    /** Kubernetes: the agent's last heartbeat — connection health, never inventory currency. */
    heartbeat_at?: string | null;
    /** Kubernetes: how often the agent reports. */
    reports_every_seconds?: number | null;
  };
  coverage: {
    state: CoverageState;
    /** Only the surfaces that were not fully read. */
    gaps: { surface: string; state: string }[];
  };
  graph: {
    state: ConnectionGraphState;
    rev: number | null;
    published_at: string | null;
  };
  /** "3 regions", "all namespaces", "12 repositories". */
  scope_summary: string;
  /** Is Discovery ready for this connection, by its provider's own rule, and from when. */
  discovery: { ready: boolean; as_of: string | null };
  /** What this provider can do — independent of who is asking. */
  capabilities: {
    scan: boolean;
    verify: boolean;
    edit_scope: boolean;
    revoke: boolean;
    rules: boolean;
  };
}

const AUTH_CODES = new Set(["auth_refused", "credential_invalid"]);

/**
 * An Azure tenant connector in the shared Connection shape. The server's
 * connections list does not include Azure yet, so the console reads the tenants
 * from `/azure/connectors` and adds them; one the server already lists is not
 * added twice.
 */
export function azureTenantConnection(t: CloudConnector, all: CloudConnector[]): Connection {
  const cov = t.coverage ?? {};
  const surfaces = Object.entries(cov.surfaces ?? {});
  const gaps = surfaces
    // "unsupported" (e.g. a licence the tenant does not have) is not a gap in the
    // connection; the backend counts such a pass as complete too.
    .filter(([, s]) => s.state !== "reached" && s.state !== "not_selected" && s.state !== "unsupported")
    .map(([surface, s]) => ({ surface, state: s.state }));
  const subs = all.filter((c) => c.scope_kind === "subscription" && c.parent_scope_id === t.scope_id && c.status === "active").length;
  const finished = cov.status === "complete" || cov.status === "partial";
  const state: ConnectionState =
    t.status === "revoked"
      ? "revoked"
      : t.status === "error"
        ? AUTH_CODES.has(t.last_error_code ?? "")
          ? "authentication_failed"
          : "not_verified"
        : t.verified_at
          ? "connected"
          : "not_verified";
  return {
    id: t.id,
    provider: "azure",
    scope_kind: "tenant",
    name: t.scope_id,
    native_id: t.scope_id,
    scope_id: t.scope_id.toLowerCase(),
    created_at: t.created_at,
    connection: { state, reason_code: t.last_error_code || null, verified_at: t.verified_at ?? null },
    scan: {
      state: cov.status === "running" ? "running" : cov.status === "failed" ? "failed" : finished ? "finished" : "never_run",
      at: cov.finished_at ?? cov.started_at ?? null,
      run_id: null,
    },
    coverage: {
      state: cov.status === "complete" && !gaps.length ? "complete" : finished ? "partial" : cov.status === "failed" ? "denied" : "unknown",
      gaps,
    },
    graph: { state: "not_applicable", rev: null, published_at: null },
    scope_summary: subs === 1 ? "1 subscription" : `${subs} subscriptions`,
    // A pass in progress replaces the coverage, but an earlier finished pass
    // (generation above 1) left results Discovery can already show.
    discovery: { ready: finished || (t.scan_generation ?? 0) > 1, as_of: finished ? cov.finished_at ?? null : null },
    capabilities: { scan: true, verify: true, edit_scope: false, revoke: true, rules: false },
  };
}

export const connectionsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Can this reader administer connections? Answered by the server's own
     * discovery:admin middleware: 200 means yes, 403 means no. The console never
     * infers a permission from a role name or a token claim.
     */
    getCanAdminister: builder.query<{ can_administer: boolean }, void>({
      query: () => ({ url: "/authsec/discovery/connections/can-administer" }),
    }),
    listDiscoveryConnections: builder.query<Connection[], void>({
      async queryFn(_arg, _api, _opts, fetchWithBQ) {
        const res = await fetchWithBQ({ url: "/authsec/discovery/connections" });
        // A backend without the shared list (404) still lists its Azure tenants.
        // A plain-text 404 arrives as PARSING_ERROR with originalStatus 404.
        const notFound = res.error && (res.error.status === 404 || ("originalStatus" in res.error && res.error.originalStatus === 404));
        if (res.error && !notFound) return { error: res.error };
        const listed = res.error ? [] : ((res.data as { connections?: Connection[] })?.connections ?? []);
        // Best effort: a failed Azure read leaves the other providers' list intact.
        const az = await fetchWithBQ({ url: "/authsec/discovery/azure/connectors" });
        const azure = az.error ? [] : ((az.data as { data?: CloudConnector[] })?.data ?? []);
        const known = new Set(listed.map((c) => c.id));
        const tenants = azure
          .filter((c) => c.scope_kind === "tenant" && !known.has(c.id))
          .map((t) => azureTenantConnection(t, azure));
        return { data: [...listed, ...tenants] };
      },
      providesTags: ["Connections"],
    }),
  }),
});

export const { useListDiscoveryConnectionsQuery, useGetCanAdministerQuery } = connectionsApi;
