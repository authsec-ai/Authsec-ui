/**
 * The one quiet line a Kubernetes page carries once the policy product is on.
 * With Kubernetes access policies on this server (migration 146,
 * `access_policies.k8s.available`) it offers one: block a ServiceAccount from a
 * Role or ClusterRole for a set time (UI-054). Without them it says policy is
 * not yet supported for Kubernetes and what it needs first (K-1 authenticated,
 * ordered collection; K-2 reads by identity; K-3 a separate actuation
 * credential). Nothing at all while the policy product is off.
 */

import { Link } from "react-router-dom";

import { getWorkspaceId } from "@/utils/workspace";

import { k8sPolicyHref } from "./k8sPolicyHref";
import { usePolicyCapabilities } from "./usePolicyCapabilities";

/** Kubernetes clusters have no connection page of their own; they are listed under Connections. */
const CONNECTIONS = "/iga/connections";

export function KubernetesPolicyNote({
  clusterConnectionHref = CONNECTIONS,
  serviceAccount,
}: {
  clusterConnectionHref?: string;
  /** On a ServiceAccount's page: the form opens with it chosen. */
  serviceAccount?: { id: string; name: string };
}) {
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");
  if (caps.state !== "on") return null;
  if (caps.accessK8s) {
    return (
      <p className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text-muted)">
        An access policy can block a ServiceAccount from a Role or ClusterRole for a set time; the cluster's agent takes it out of the role's bindings
        and puts it back at the end.{" "}
        <Link to={k8sPolicyHref(serviceAccount)} className="font-medium text-(--color-primary-text) hover:underline">
          Create policy
        </Link>
      </p>
    );
  }
  if (caps.providerSupported("k8s")) return null;
  return (
    <p className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text-muted)">
      <strong className="font-medium text-(--color-text)">Policy is not yet supported for Kubernetes.</strong>{" "}
      {caps.providerReason("k8s") ?? "It needs authenticated, ordered collection from this cluster first."}
      {clusterConnectionHref ? (
        <>
          {" "}
          <Link to={clusterConnectionHref} className="font-medium text-(--color-primary-text) hover:underline">
            Open Connections
          </Link>
        </>
      ) : null}
    </p>
  );
}
