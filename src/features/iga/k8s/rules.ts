/**
 * What a Kubernetes rule, binding and scope are called, and which rules need
 * a second look — one place, so the page's Overview, its Access tab and the
 * Graph's cards say the same thing about the same rule.
 *
 * Everything here describes DECLARED RBAC. Kubernetes RBAC only allows: it has
 * no deny rule and no condition. That is not the same as proving what a request
 * would do — admission policies, webhooks and token mounting are other layers
 * and are not evaluated anywhere in this product.
 */

/** The unit separator joining the segments of a source key (internal/k8sgraph.Sep). */
const SEP = "\u001f";

/** A rule as the API states it: nothing expanded, `*` is `*`. Lists may arrive null on a partial grant. */
export interface RuleShape {
  verbs?: string[] | null;
  api_groups?: string[] | null;
  resources?: string[] | null;
  resource_names?: string[] | null;
  non_resource_urls?: string[] | null;
}

const list = (l: string[] | null | undefined): string[] => l ?? [];

/** Verbs that let the holder change what it, or someone else, may do. */
const ESCALATION_VERBS = ["escalate", "bind", "impersonate"] as const;

export interface RuleFlags {
  /** `*` in a verb, a resource or an API group. */
  wildcard: boolean;
  /** One of escalate, bind, impersonate; or `get` on secrets. Said in words, never a score. */
  escalation: string | null;
  /** The rule names instances. `list`, `watch` and `create` are not constrained by names. */
  named: boolean;
}

export function ruleFlags(r: RuleShape): RuleFlags {
  const verbs = list(r.verbs);
  const resources = list(r.resources);
  const groups = list(r.api_groups);
  const wildcard = [verbs, resources, groups].some((l) => l.includes("*"));
  const verb = ESCALATION_VERBS.find((v) => verbs.includes(v));
  const secrets = resources.includes("secrets") && verbs.includes("get") && (!groups.length || groups.includes("") || groups.includes("*"));
  const escalation = verb ? `the ${verb} verb` : secrets ? "get on secrets, which reads their contents" : null;
  return { wildcard, escalation, named: list(r.resource_names).length > 0 };
}

/** "get, list on pods, pods/log" — the rule as a reader says it. */
export function ruleSentence(r: RuleShape): string {
  const verbs = list(r.verbs).join(", ") || "no verbs";
  const targets = ruleTargets(r);
  return targets.length ? `${verbs} on ${targets.join(", ")}` : verbs;
}

/** What the rule applies to: resource types (narrowed to names when it has them) and non-resource URLs. */
export function ruleTargets(r: RuleShape): string[] {
  const names = list(r.resource_names);
  const resources = list(r.resources).map((res) => (names.length ? `${res} (${names.join(", ")})` : res));
  return [...resources, ...list(r.non_resource_urls)];
}

/** An API group as a person says it: the empty group is the core group. */
export function groupWords(groups: string[] | null | undefined): string {
  const g = list(groups);
  return g.length ? g.map((x) => (x === "" ? "core" : x)).join(", ") : "none stated";
}

/* --------------------------------- bindings -------------------------------- */

export interface BindingRef {
  kind: "RoleBinding" | "ClusterRoleBinding";
  name: string;
  /** Null for a ClusterRoleBinding: it grants cluster-wide. */
  namespace: string | null;
}

/**
 * Reads the binding out of the source key `/access` returns as `binding`
 * (`k8s␟cluster␟rolebinding␟namespace␟name␟…`). The graph states the same
 * binding as `assignment {kind, name, namespace}`; this is the one adapter for
 * the flat route, so the raw key is never shown.
 */
export function parseBindingKey(key: string | null | undefined): BindingRef | null {
  if (!key) return null;
  const p = key.split(SEP);
  if (p[0] !== "k8s") return null;
  if (p[2] === "rolebinding" && p[3] && p[4]) return { kind: "RoleBinding", namespace: p[3], name: p[4] };
  if (p[2] === "clusterrolebinding" && p[3]) return { kind: "ClusterRoleBinding", namespace: null, name: p[3] };
  return null;
}

/** The graph's binding kind as a Kubernetes kind. */
export function bindingKindWord(kind: string): BindingRef["kind"] {
  return kind === "k8s_cluster_role_binding" ? "ClusterRoleBinding" : "RoleBinding";
}

/** The role's kind, or null when the sweep did not see the role. */
export function roleKindWord(kind: string | null | undefined): "Role" | "ClusterRole" | null {
  return kind === "k8s_cluster_role" ? "ClusterRole" : kind === "k8s_role" ? "Role" : null;
}

/* ---------------------------------- scope ---------------------------------- */

/** Where a grant applies: the binding decides, not the role (a RoleBinding narrows a ClusterRole to its namespace). */
export type Scope = { kind: "cluster" } | { kind: "namespace"; namespace: string };

export function scopeOfBinding(b: Pick<BindingRef, "namespace"> | null): Scope | null {
  if (!b) return null;
  return b.namespace ? { kind: "namespace", namespace: b.namespace } : { kind: "cluster" };
}

/** The badge text: `cluster-wide` or `namespace prod`. */
export function scopeBadge(s: Scope): string {
  return s.kind === "cluster" ? "cluster-wide" : `namespace ${s.namespace}`;
}

export function sameScope(a: Scope, b: Scope): boolean {
  return a.kind === b.kind && (a.kind === "cluster" || (b.kind === "namespace" && a.namespace === b.namespace));
}

/* ------------------------------- workload kind ------------------------------ */

const WORKLOAD_KIND: Record<string, string> = {
  deployment: "Deployment",
  statefulset: "StatefulSet",
  daemonset: "DaemonSet",
  replicaset: "ReplicaSet",
  replicationcontroller: "ReplicationController",
  cronjob: "CronJob",
  job: "Job",
  pod: "Pod",
};

/** `k8s_deployment` → "Deployment". A kind this console does not know is named as the cluster did. */
export function workloadKindWord(runtimeKind: string | null | undefined): string | null {
  if (!runtimeKind) return null;
  const k = runtimeKind.replace(/^k8s_/, "");
  return WORKLOAD_KIND[k.toLowerCase()] ?? (k ? k.charAt(0).toUpperCase() + k.slice(1) : null);
}

/** `system:serviceaccount:prod:web` → { namespace: "prod", name: "web" }. */
export function parseAnchor(anchor: string): { namespace: string; name: string } | null {
  const m = /^system:serviceaccount:([^:]+):(.+)$/.exec(anchor);
  return m ? { namespace: m[1], name: m[2] } : null;
}
