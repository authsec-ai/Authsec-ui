/**
 * The one quiet line a Kubernetes object page carries once the policy product
 * is on (SPEC-iga-phase3-policy.md §9.4): policy is not yet supported for
 * Kubernetes, and what it needs first (K-1 authenticated, ordered collection;
 * K-2 reads by identity; K-3 a separate actuation credential). No Create-policy
 * control, and nothing at all while the policy product is off.
 */

import { Link } from "react-router-dom";

import { getWorkspaceId } from "@/utils/workspace";

import { usePolicyCapabilities } from "./usePolicyCapabilities";

/** Kubernetes clusters have no connection page of their own; they are listed under Connections. */
const CONNECTIONS = "/iga/connections";

export function KubernetesPolicyNote({ clusterConnectionHref = CONNECTIONS }: { clusterConnectionHref?: string }) {
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");
  if (caps.state !== "on" || caps.providerSupported("k8s")) return null;
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
