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

export type ConnectionProvider = "aws" | "gcp" | "k8s" | "github";
export type ConnectionScopeKind = "account" | "project" | "cluster" | "organisation";

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
    listConnections: builder.query<Connection[], void>({
      query: () => ({ url: "/authsec/discovery/connections" }),
      transformResponse: (r: { connections?: Connection[] }) => r?.connections ?? [],
      providesTags: ["Connections"],
    }),
  }),
});

export const { useListConnectionsQuery, useGetCanAdministerQuery } = connectionsApi;
