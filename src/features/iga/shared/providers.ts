/**
 * Provider filters for the v2 graph (S21.2c).
 *
 * Unset means the default AWS list: no `graph` and no `provider` on the URL.
 * A named provider, or "all", opts in with `graph=v2`. The identity kind
 * filter stays the three IAM kinds — the server rejects the new kinds there.
 */

import type { GraphProvider, GraphScope } from "@/app/api/igaGraphApi";

export const GRAPH_PROVIDERS = ["aws", "linux", "kubernetes", "ad"] as const satisfies readonly GraphProvider[];

export const PROVIDER_FILTER_VALUES = ["aws", "linux", "kubernetes", "ad", "all"] as const;

export const PROVIDER_LABEL: Record<GraphProvider | "all", string> = {
  aws: "AWS",
  linux: "Linux",
  kubernetes: "Kubernetes",
  ad: "Active Directory",
  all: "All providers",
};

/** Opt-in for a list. Undefined when the filter is unset, so the URL stays the default. */
export function listGraphOptIn(provider: string | undefined): Pick<GraphScope, "graph" | "provider"> {
  if (!provider) return {};
  if (provider === "all") return { graph: "v2" };
  if ((GRAPH_PROVIDERS as readonly string[]).includes(provider)) {
    return { graph: "v2", provider: [provider as GraphProvider] };
  }
  return {};
}

const K8S_RUNTIMES = new Set(["deployment", "statefulset", "daemonset", "job", "cronjob", "pod", "replicaset"]);

/** A badge only for a non-AWS kind or runtime. AWS rows keep today's look. */
export function providerOfWorkload(runtimeKind: string | null | undefined): GraphProvider | null {
  const rt = (runtimeKind ?? "").toLowerCase();
  if (rt === "systemd" || rt === "process_group" || rt.startsWith("linux")) return "linux";
  if (rt.startsWith("k8s") || K8S_RUNTIMES.has(rt)) return "kubernetes";
  return null;
}

export function providerOfIdentity(kind: string | null | undefined): GraphProvider | null {
  if (!kind) return null;
  if (kind.startsWith("local_")) return "linux";
  if (kind.startsWith("k8s_")) return "kubernetes";
  if (kind.startsWith("ad_")) return "ad";
  return null;
}

export function providerOfResource(nativeKind: string | null | undefined): GraphProvider | null {
  const kind = (nativeKind ?? "").toLowerCase();
  if (!kind) return null;
  if (kind.includes("k8s") || kind.includes("kubernetes")) return "kubernetes";
  if (kind === "process" || kind === "systemd" || kind === "file" || kind === "host") return "linux";
  if (kind.includes("ad_") || kind.includes("directory")) return "ad";
  return null;
}
