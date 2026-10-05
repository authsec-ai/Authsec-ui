/** Typed reads of each provider's own connector, for the screens that show its facts. */

import type { Connection } from "@/app/api/connectionsApi";
import type { AWSConnectorAttrs, CloudConnector, GCPConnectorAttrs } from "@/app/api/cloudDiscoveryApi";
import { useGetDiscoverySourceQuery } from "@/app/api/discoveryApi";
import { enumerationLabel } from "@/features/discovery/cloud/gcp/gcpConnectorCopy";

export function awsAttrs(connector: CloudConnector | undefined): AWSConnectorAttrs | undefined {
  return connector?.attrs as AWSConnectorAttrs | undefined;
}

export function gcpAttrs(connector: CloudConnector | undefined): GCPConnectorAttrs {
  return (connector?.attrs ?? {}) as GCPConnectorAttrs;
}

export function gcpScopeRows(connector: CloudConnector): { label: string; value: string }[] {
  const attrs = gcpAttrs(connector);
  return [
    { label: "Scope", value: `${connector.scope_kind} ${connector.scope_id}` },
    { label: "Parent", value: connector.parent_scope_id || "None" },
    { label: "Enumerable below", value: enumerationLabel(attrs) },
    { label: "Quota project", value: attrs.cai_quota_project || "—" },
  ];
}

export function useSourceFacts(c: Connection) {
  return useGetDiscoverySourceQuery(c.id, { skip: c.provider !== "k8s" && c.provider !== "github" });
}

