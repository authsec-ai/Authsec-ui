/**
 * One Azure object from Discovery — `/iga/azure/:kind/:id[/:tab]`, kind
 * `identity`, `resource` or `workload` — on the same shell as the AWS and
 * Kubernetes object pages.
 *
 * THE ID IN THE URL, and how the legacy Azure reads are found from it. The
 * inventory's rows are keyed by IGA uuids; the Azure list endpoints
 * (`/authsec/discovery/azure/{grants,secrets,federation,usage,workloads}`) take
 * the legacy cloud_* ids, which are different. Both lists match `q` against the
 * native id, so the join is one read per page:
 *   - identity: `:id` is the Entra object id. The record is the identities list
 *     searched for it; the graph root is `object:<id>`.
 *   - resource: `:id` is the IGA uuid. The graph root `resource:<id>` carries the
 *     ARM id (attrs.native_id); the record is the resources list searched for it.
 *   - workload: `:id` is the IGA uuid. The graph root `workload:<id>` carries only
 *     its name and region, so the record is the workloads list matched on both.
 *   - resource or workload by ARM id: `:id` is the ARM id itself ("/subscriptions/…"),
 *     linked from the scan-table lists while the graph is not ready. No graph read is
 *     needed: the record is the list searched for that id.
 */

import { useParams } from "react-router-dom";

import {
  useGetAzureNeighbourhoodQuery,
  useListAzureConnectorsQuery,
  useListAzureIdentitiesQuery,
  useListAzureResourcesQuery,
  useListAzureWorkloadsQuery,
  type AzureIdentity,
  type AzureResource,
  type AzureWorkload,
} from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { ObjectShell, type ObjectHeaderData, type ObjectTabDef } from "@/features/iga/shared/components/ObjectShell";
import type { GraphFailure } from "@/features/iga/shared/graphErrors";
import { dayText } from "@/features/iga/shared/labels";
import { activeTabOf } from "@/features/iga/shared/links";
import { getWorkspaceId } from "@/utils/workspace";
import { refId } from "@/app/api/igaGraphApi";
import { AzurePolicySection } from "@/features/iga/policy/DiscoveryPolicySection";
import { AZURE_TARGET_KINDS } from "@/features/iga/policy/access/model";

import { Info } from "lucide-react";
import { InventoryNotice } from "../aws/AWSInventoryNotices";
import { AzureGraphPanel } from "./AzureGraphPanel";
import { useAzureIdentityRef } from "./azureGraphLinks";
import {
  IdentityAccessTab,
  IdentityActivityTab,
  IdentityCredentialsTab,
  IdentityEvidenceTab,
  IdentityOverview,
  IdentityTokensTab,
  IdentityWorkloadsTab,
  ResourceAccessTab,
  ResourceOverview,
  WorkloadOverview,
} from "./AzureObjectTabs";
import { agentTypeLabel, armTypeLabel, connectorLabel, identityKindLabel } from "./azureDiscoveryLabels";

type Kind = "identity" | "resource" | "workload";

const IDENTITY_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "access", label: "Access", path: "/access" },
  { key: "credentials", label: "Credentials", path: "/credentials" },
  { key: "token-access", label: "Token access", path: "/token-access" },
  { key: "activity", label: "Activity", path: "/activity" },
  { key: "workloads", label: "Workloads", path: "/workloads" },
  { key: "evidence", label: "Evidence", path: "/evidence" },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true },
];
const RESOURCE_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "access", label: "Who can access", path: "/access" },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true },
];
const WORKLOAD_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true },
];
const TABS: Record<Kind, ObjectTabDef[]> = { identity: IDENTITY_TABS, resource: RESOURCE_TABS, workload: WORKLOAD_TABS };

const LIST_TYPE = { identity: "identities", resource: "resources", workload: "workloads" } as const;
const KIND_WORD: Record<Kind, string> = { identity: "Identity", resource: "Resource", workload: "Workload" };

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export default function AzureObjectPage() {
  const { kind, id = "", tab } = useParams<{ kind: string; id: string; tab?: string }>();
  if (kind !== "identity" && kind !== "resource" && kind !== "workload") {
    return (
      <ObjectShell
        ws={getWorkspaceId() ?? ""}
        listType="identities"
        provider="azure"
        kindLabel="Object"
        base={`/iga/azure/${kind}/${encodeURIComponent(id)}`}
        tabs={[]}
        activeTab={{ state: "unknown" }}
        failure={{ kind: "not_found" }}
        onRetry={() => undefined}
        onRefresh={() => undefined}
      >
        {null}
      </ObjectShell>
    );
  }
  return <AzureObject kind={kind} id={id} tab={tab} />;
}

function failureOf(error: Parameters<typeof loadFailureOf>[0]): GraphFailure | null {
  const f = loadFailureOf(error);
  if (!f) return null;
  return f === "forbidden" ? { kind: "unauthorized" } : f === "not_found" ? { kind: "not_found" } : { kind: "failed" };
}

function AzureObject({ kind, id, tab }: { kind: Kind; id: string; tab: string | undefined }) {
  const ws = getWorkspaceId() ?? "";
  const isIdentity = kind === "identity";
  // An ARM id in the URL (from the scan-table lists) needs no graph read.
  const byArmId = !isIdentity && id.startsWith("/");

  // The graph root: for resources and workloads it also names the native id / name+region the lists are searched by.
  const rootQ = useGetAzureNeighbourhoodQuery(`${kind}:${id}`, { skip: isIdentity || byArmId || !id });
  const rootNode = rootQ.data?.nodes.find((n) => n.ref === rootQ.data?.root);
  const native = isIdentity || byArmId ? id.toLowerCase() : kind === "resource" ? str(rootNode?.attrs?.native_id)?.toLowerCase() : undefined;
  const workloadName = kind === "workload" && !byArmId ? rootNode?.label : undefined;
  const workloadRegion = kind === "workload" && !byArmId ? str(rootNode?.attrs?.region) : undefined;
  const workloadQ = byArmId ? native : workloadName;

  const idQ = useListAzureIdentitiesQuery({ q: native, limit: 10 }, { skip: !isIdentity || !native });
  const resQ = useListAzureResourcesQuery({ q: native, limit: 10 }, { skip: kind !== "resource" || !native });
  const wlQ = useListAzureWorkloadsQuery({ q: workloadQ, limit: 100 }, { skip: kind !== "workload" || !workloadQ });
  const connectorsQ = useListAzureConnectorsQuery();

  const identity: AzureIdentity | undefined = idQ.data?.rows.find((r) => r.native_id.toLowerCase() === native);
  const resource: AzureResource | undefined = resQ.data?.rows.find((r) => r.native_id.toLowerCase() === native);
  const workload: AzureWorkload | undefined = wlQ.data?.rows.find((w) =>
    byArmId ? w.native_id.toLowerCase() === native : w.name.toLowerCase() === workloadName?.toLowerCase() && (!workloadRegion || w.region === workloadRegion),
  );
  const record = identity ?? resource ?? workload;
  // A policy names AuthSec's id for the object: a resource's is in the URL; an identity's is found by its Entra object id.
  const policyIdentity = useAzureIdentityRef(ws, isIdentity && identity && AZURE_TARGET_KINDS.has(identity.kind) ? id : undefined);
  const policyIgaId = kind === "resource" && !byArmId ? id : policyIdentity.ref ? refId(policyIdentity.ref) : undefined;
  const listQ = isIdentity ? idQ : kind === "resource" ? resQ : wlQ;
  const listDone = listQ.isSuccess;

  const failure: GraphFailure | null = failureOf(isIdentity || byArmId ? listQ.error : (rootQ.error ?? listQ.error)) ?? (listDone && !record ? { kind: "not_found" } : null);
  const retry = () => {
    if (!isIdentity && !byArmId) void rootQ.refetch();
    void listQ.refetch();
  };

  const connector = (connectorsQ.data ?? []).find((c) => c.id === record?.connector_id);
  const name = identity?.name || resource?.name || workload?.name || "";
  const nativeId = identity?.native_id ?? resource?.native_id ?? workload?.native_id ?? "";
  const lastSeen = record?.last_seen_at;

  let header: ObjectHeaderData["kind"] | undefined;
  if (identity) {
    const agent = agentTypeLabel(identity);
    header = {
      label: agent ? `${identityKindLabel(identity.kind)} · ${agent}` : identityKindLabel(identity.kind),
      category: "identity",
      icon: identity.kind === "entra_user" || identity.kind === "entra_agent_user" ? "user" : identity.kind === "entra_group" ? "group" : "service_account",
    };
  } else if (resource) header = { label: armTypeLabel(resource.kind), category: "resource", icon: "resource" };
  else if (workload) header = { label: armTypeLabel(workload.runtime_kind), category: "workload", icon: "workload" };

  const object: ObjectHeaderData | undefined =
    record && header
      ? {
          name,
          kind: header,
          context: [],
          sweep: { context: [connectorLabel(connector)], line: `Last confirmed ${dayText(lastSeen)}` },
          copy: { value: nativeId, label: isIdentity ? "Copy object ID" : "Copy resource ID", what: isIdentity ? "Object ID" : "Resource ID" },
        }
      : undefined;

  const tabs = TABS[kind];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;

  // A workload's "Runs as" links to the identity page: the graph's can_assume neighbour carries its Entra object id.
  const runsAs = rootQ.data && rootNode ? rootQ.data.nodes.find((n) => n.ref !== rootNode.ref && rootQ.data!.edges.some((e) => e.from === rootNode.ref && e.to === n.ref)) : undefined;
  const runsAsObjectId = str(runsAs?.attrs?.object_id);

  let body: React.ReactNode = null;
  if (record) {
    if (active === "overview") {
      body = identity ? (
        <>
          <IdentityOverview identity={identity} tenant={connector} />
          {AZURE_TARGET_KINDS.has(identity.kind) ? <AzurePolicySection ws={ws} what="identity" igaId={policyIgaId} /> : null}
        </>
      ) : resource ? (
        <>
          <ResourceOverview resource={resource} subscription={connector} />
          {/* A policy is on an ARM resource; an application permission or delegated scope cannot be named. */}
          {resource.native_id.toLowerCase().startsWith("/subscriptions/") && resource.native_id.toLowerCase().includes("/providers/") ? <AzurePolicySection ws={ws} what="resource" igaId={policyIgaId} /> : null}
        </>
      ) : workload ? (
        <WorkloadOverview workload={workload} subscription={connector} identityHref={runsAsObjectId ? `/iga/azure/identity/${encodeURIComponent(runsAsObjectId)}` : undefined} />
      ) : null;
    } else if (active === "graph") {
      body = byArmId ? (
        <InventoryNotice icon={<Info />}>
          The access graph is not available for this object yet. It was opened from the scan tables, which carry no graph reference. Open it from Discovery once the access graph is ready on this server.
        </InventoryNotice>
      ) : (
        <AzureGraphPanel kind={kind} id={id} name={name} objectId={kind === "identity" ? id : undefined} />
      );
    } else if (identity) {
      body =
        active === "access" ? (
          <IdentityAccessTab id={identity.id} />
        ) : active === "credentials" ? (
          <IdentityCredentialsTab id={identity.id} />
        ) : active === "token-access" ? (
          <IdentityTokensTab id={identity.id} />
        ) : active === "activity" ? (
          <IdentityActivityTab id={identity.id} />
        ) : active === "workloads" ? (
          <IdentityWorkloadsTab id={identity.id} />
        ) : active === "evidence" ? (
          <IdentityEvidenceTab objectId={identity.native_id} />
        ) : null;
    } else if (resource && active === "access") {
      body = <ResourceAccessTab resourceId={resource.id} />;
    }
  }

  return (
    <ObjectShell
      ws={ws}
      listType={LIST_TYPE[kind]}
      provider="azure"
      kindLabel={KIND_WORD[kind]}
      base={`/iga/azure/${kind}/${encodeURIComponent(id)}`}
      tabs={tabs}
      activeTab={activeTab}
      failure={failure}
      permission="discovery:read"
      onRetry={retry}
      onRefresh={retry}
      object={object}
    >
      {body}
    </ObjectShell>
  );
}
