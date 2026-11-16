/**
 * One Google Cloud resource with its own IAM policy — `/iga/gcp/resource/:id[/:tab]`.
 * Overview (what it is, where it lives) and Access (the bindings on its policy).
 */

import { useParams } from "react-router-dom";

import { useListGcpResourcesQuery } from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { DetailGrid, DetailRow } from "@/components/console/detail";
import { ObjectShell, type ObjectHeaderData, type ObjectTabDef } from "@/features/iga/shared/components/ObjectShell";
import type { GraphFailure } from "@/features/iga/shared/graphErrors";
import { dayText } from "@/features/iga/shared/labels";
import { activeTabOf } from "@/features/iga/shared/links";
import { getWorkspaceId } from "@/utils/workspace";

import { CloudPill } from "../CloudPill";
import { GcpBindingsList } from "./GcpBindingsList";
import { GCP_RESOURCE_LABEL } from "./gcpInventoryLabels";

const TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "", hint: "What the resource is and where it lives, as Cloud Asset names it." },
  { key: "access", label: "Access", path: "/access", hint: "The bindings on this resource's own IAM policy." },
];

export default function GcpResourcePage() {
  const { id = "", tab } = useParams<{ id: string; tab?: string }>();
  const ws = getWorkspaceId() ?? "";
  const q = useListGcpResourcesQuery({ id, limit: 1 }, { skip: !id });
  const resource = q.data?.rows.find((r) => r.id === id);

  const f = loadFailureOf(q.error);
  const failure: GraphFailure | null = f
    ? f === "forbidden"
      ? { kind: "unauthorized" }
      : f === "not_found"
        ? { kind: "not_found" }
        : { kind: "failed" }
    : q.isSuccess && !resource
      ? { kind: "not_found" }
      : null;
  const retry = () => void q.refetch();
  const activeTab = activeTabOf(TABS, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;
  const kindLabel = resource ? (GCP_RESOURCE_LABEL[resource.kind] ?? resource.kind) : "Resource";

  const object: ObjectHeaderData | undefined = resource
    ? {
        name: resource.name || resource.native_id,
        kind: { label: kindLabel, category: "resource", icon: "resource" },
        context: [],
        sweep: { context: [resource.resource_account || "Google Cloud project"], line: `Last seen by AuthSec ${dayText(resource.last_seen_at)}` },
        copy: { value: resource.native_id, label: "Copy name", what: "Name" },
        plainNote: { short: "Recorded, not tested", long: "This is the resource's IAM policy as Google Cloud recorded it. AuthSec has not tested what can reach it." },
      }
    : undefined;

  return (
    <ObjectShell
      ws={ws}
      listType="resources"
      provider="gcp"
      kindLabel={kindLabel}
      base={`/iga/gcp/resource/${encodeURIComponent(id)}`}
      tabs={TABS}
      activeTab={activeTab}
      failure={failure}
      permission="discovery:read"
      onRetry={retry}
      onRefresh={retry}
      object={object}
    >
      {resource && active === "overview" ? (
        <DetailGrid>
          <DetailRow label="Type" value={kindLabel} />
          <DetailRow label="Name" value={resource.native_id} mono full />
          <DetailRow label="Project" value={resource.resource_account || "Unknown"} mono />
          <DetailRow
            label="Scope"
            value={resource.is_external ? <CloudPill tone="warning">Outside the connected scope</CloudPill> : <CloudPill tone="muted">Not shown to be outside</CloudPill>}
          />
          <DetailRow label="Sensitivity" value={`${resource.sensitivity}${resource.sensitivity_reason ? ` (${resource.sensitivity_reason})` : ""}`} full />
          <DetailRow label="Bindings on its policy" value={String(resource.binding_count)} />
        </DetailGrid>
      ) : null}
      {resource && active === "access" ? <GcpBindingsList resourceId={resource.id} /> : null}
    </ObjectShell>
  );
}
