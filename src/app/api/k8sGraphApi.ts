/**
 * The Kubernetes access graph — what a workload in a cluster can actually do.
 *
 * Types transcribed from the backend Go source (internal/k8sread), not
 * inferred. Three things about this surface are load-bearing and easy to throw
 * away in a component:
 *
 *   - COVERAGE IS A STATE, NEVER A PERCENTAGE. A partially swept cluster is not
 *     "mostly covered". It is covered in the namespaces named and unknown
 *     everywhere else, and the unknown part is usually the cluster-scoped part,
 *     which is where cluster-admin is granted. Render the state and its
 *     sentence; never average them into a number.
 *   - STALE IS NOT ENDED. A grant we could not re-read is still believed. Showing
 *     it as gone turns a permissions outage into a revocation.
 *   - AN EMPTY LIST IS NOT "NO ACCESS". It may be "not calculated". Every list
 *     carries the sweep behind it, and AccessSummary ships even when the grant
 *     list is empty, precisely so the two can be told apart.
 */

import { baseApi } from "./baseApi";

/** The reading behind an answer. */
export interface K8sSweep {
  id: string;
  generation: number;
  status: "received" | "projected" | "failed";
  complete: boolean;
  cluster_scoped: boolean;
  namespaces: string[];
  observed_at: string;
  /** complete | namespaced_only | incomplete | not_swept */
  coverage: string;
  age_seconds: number;
  /** The one sentence explaining a non-complete coverage. Empty when complete. */
  limitation?: string;
}

export interface K8sCluster {
  cluster: string;
  discovery_source_id: string;
  service_accounts: number;
  roles: number;
  bindings: number;
  grants: number;
  /** Rows the latest sweep could not confirm. Believed, not gone. */
  stale: number;
  last_sweep: K8sSweep | null;
}

export interface K8sIdentity {
  id: string;
  /** system:serviceaccount:<ns>:<name> */
  anchor: string;
  namespace: string;
  lifecycle: string;
  grants: number;
  /** Holds at least one rule granting `*` in a group, resource or verb. */
  wildcard: boolean;
  stale: number;
}

export interface K8sWorkload {
  id: string;
  display_name: string;
  namespace: string;
  lifecycle: string;
  /** The ServiceAccount it executes as. Empty means unresolved, not none. */
  runs_as?: string;
  runs_as_id?: string;
  /** observed (we saw the Pod) | declared (configured anchor only) */
  basis?: string;
  grants: number;
}

/**
 * One resolved step of what a ServiceAccount is granted: binding, role and
 * rule in one row (k8sread.Grant).
 *
 * Three things the Go struct does not make obvious:
 *  - `binding` is the assignment's raw source key (segments joined by U+001F),
 *    not a name; `parseBindingKey` reads it.
 *  - `namespace` is the ROLE's namespace (empty for a ClusterRole). Where the
 *    grant applies is the binding's, which can narrow a ClusterRole to one.
 *  - on a partial grant (the role was not in the sweep) the rule lists are
 *    null, not empty, and the role may be unnamed.
 */
export interface K8sGrant {
  role_name: string;
  /** k8s_role | k8s_cluster_role; empty when the role was not seen. */
  role_kind: string;
  binding: string;
  /** k8s_role_binding | k8s_cluster_role_binding */
  binding_kind: string;
  namespace: string;
  verbs: string[] | null;
  api_groups: string[] | null;
  resources: string[] | null;
  resource_names?: string[] | null;
  non_resource_urls?: string[] | null;
  wildcard: boolean;
  /** Narrowed to named instances, so far weaker than the same rule without. */
  constrained: boolean;
  state: "current" | "stale";
  /** complete only when binding → role → rule all resolved. */
  calculation_state: string;
}

export interface K8sAccessSummary {
  total: number;
  complete: number;
  partial: number;
  stale: number;
}

export const k8sGraphApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listK8sClusters: builder.query<{ clusters: K8sCluster[] }, void>({
      query: () => ({ url: "/authsec/discovery/k8s/clusters", method: "GET" }),
      providesTags: ["K8sCluster"],
    }),

    listK8sIdentities: builder.query<K8sIdentity[], { limit?: number } | void>({
      query: (args) => ({
        url: "/authsec/discovery/k8s/identities",
        method: "GET",
        params: args?.limit ? { limit: args.limit } : undefined,
      }),
      transformResponse: (r: { identities?: K8sIdentity[] }) => r?.identities ?? [],
      providesTags: ["K8sIdentity"],
    }),

    listK8sWorkloads: builder.query<K8sWorkload[], { limit?: number } | void>({
      query: (args) => ({
        url: "/authsec/discovery/k8s/workloads",
        method: "GET",
        params: args?.limit ? { limit: args.limit } : undefined,
      }),
      transformResponse: (r: { workloads?: K8sWorkload[] }) => r?.workloads ?? [],
      providesTags: ["K8sWorkload"],
    }),

    getK8sAccess: builder.query<{ grants: K8sGrant[]; summary: K8sAccessSummary }, string>({
      query: (id) => ({
        url: `/authsec/discovery/k8s/identities/${id}/access`,
        method: "GET",
      }),
      providesTags: ["K8sIdentity"],
    }),
  }),
});

export const {
  useListK8sClustersQuery,
  useListK8sIdentitiesQuery,
  useListK8sWorkloadsQuery,
  useGetK8sAccessQuery,
} = k8sGraphApi;
