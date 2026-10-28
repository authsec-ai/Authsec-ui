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
  useListAzureFoundryQuery,
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
import {
  AgentIdentityOverview,
  AuditLogTab,
  BlueprintAgentsTab,
  BlueprintCredentialsTab,
  BlueprintOverview,
  BlueprintPermissionsTab,
} from "./AzureAgentPages";
import { AzureGraphPanel } from "./AzureGraphPanel";
import { FoundryOverview } from "./AzureFoundryView";
import { foundryNodeOf, type FoundryNode } from "./azureFoundry";
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
import { agentPageKind, agentTypeLabel, armTypeLabel, connectorLabel, identityKindLabel, identityTabKeys } from "./azureDiscoveryLabels";

type Kind = "identity" | "resource" | "workload";

const TAB_HINT = {
  overview: "Who and what it is: IDs, status, sponsors and owners, and the key facts Microsoft records.",
  access: "Its Azure role assignments, Microsoft Entra roles and API permissions, including any inherited from its blueprint.",
  credentials: "Its client secrets and certificates: names, dates and status only. AuthSec never holds a secret value.",
  tokenAccess: "Who can get its tokens without its own secret: federated credentials, owners and its agent identity blueprint.",
  activity: "Its sign-ins, from Microsoft Entra sign-in logs, and its actions in the Azure Activity Log.",
  workloads: "The Azure resources that sign in with this managed identity.",
  graph: "A picture of what it can reach, and who or what can reach it.",
  evidence: "Which Microsoft API each fact came from, and in how many scans. For audits.",
  resourceAccess: "The Azure role assignments given directly on this resource.",
  signIns: "Its sign-ins, from Microsoft Entra sign-in logs. Reading them needs Microsoft Entra ID P1 or P2.",
  audit: "Changes made to it, from the Microsoft Entra audit log.",
  agentOverview: "Status, its blueprint, created, last sign-in, sponsors and owners, and where Foundry placed it.",
  agentAccess: "Its Azure roles and Microsoft Entra permissions, including any inherited from its blueprint.",
  blueprintOverview: "Status, IDs, publisher, created, sponsors and owners.",
  blueprintAgents: "The agent identities made from this blueprint.",
  blueprintCredentials: "How this blueprint gets its agents' tokens: federated credentials, client secrets and certificates.",
  blueprintPermissions: "Permissions granted to this blueprint. Inheritable ones pass to every agent identity made from it.",
} as const;

/** An Entra Agent ID agent identity: what the Entra admin center shows for one. */
const AGENT_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "", hint: TAB_HINT.agentOverview },
  { key: "access", label: "Roles and permissions", path: "/access", hint: TAB_HINT.agentAccess },
  { key: "activity", label: "Sign-in logs", path: "/activity", hint: TAB_HINT.signIns },
  { key: "audit", label: "Audit logs", path: "/audit", hint: TAB_HINT.audit },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true, hint: TAB_HINT.graph },
];
/** An agent identity blueprint: what the Entra admin center shows for one. */
const BLUEPRINT_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "", hint: TAB_HINT.blueprintOverview },
  { key: "agents", label: "Agent identities", path: "/agents", hint: TAB_HINT.blueprintAgents },
  { key: "credentials", label: "Credentials", path: "/credentials", hint: TAB_HINT.blueprintCredentials },
  { key: "access", label: "Permissions", path: "/access", hint: TAB_HINT.blueprintPermissions },
  { key: "audit", label: "Audit logs", path: "/audit", hint: TAB_HINT.audit },
];

const IDENTITY_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "", hint: TAB_HINT.overview },
  { key: "access", label: "Roles and permissions", path: "/access", hint: TAB_HINT.access },
  { key: "credentials", label: "Credentials", path: "/credentials", hint: TAB_HINT.credentials },
  { key: "token-access", label: "Who can act as it", path: "/token-access", hint: TAB_HINT.tokenAccess },
  { key: "activity", label: "Sign-ins and activity", path: "/activity", hint: TAB_HINT.activity },
  { key: "workloads", label: "Runs on", path: "/workloads", hint: TAB_HINT.workloads },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true, hint: TAB_HINT.graph },
  { key: "evidence", label: "Evidence", path: "/evidence", hint: TAB_HINT.evidence },
];
/** Overview, Access Graph and Evidence always; the rest only where its kind makes them possible (identityTabKeys). */
const ALWAYS = new Set(["overview", "graph", "evidence"]);
const RESOURCE_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "access", label: "Who can access", path: "/access", hint: TAB_HINT.resourceAccess },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true, hint: TAB_HINT.graph },
];
const WORKLOAD_TABS: ObjectTabDef[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "graph", label: "Access Graph", path: "/graph", workspace: true, hint: TAB_HINT.graph },
];
const TABS: Record<Kind, ObjectTabDef[]> = { identity: IDENTITY_TABS, resource: RESOURCE_TABS, workload: WORKLOAD_TABS };

const LIST_TYPE = { identity: "identities", resource: "resources", workload: "workloads" } as const;
const KIND_WORD: Record<Kind, string> = { identity: "Identity", resource: "Resource", workload: "Workload" };

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** An ARM id without Microsoft's `#system` identity suffix, lowercased: how a Foundry project names its parent. */
const armBase = (id: string | undefined) => id?.toLowerCase().replace(/#system$/, "");

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
  const foundryQ = useListAzureFoundryQuery(undefined, { skip: kind !== "workload" });

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

  // An agent identity or blueprint opened from Entra Agent ID gets the pages the Entra admin center has for it.
  const agentKind = agentPageKind(identity);
  let header: ObjectHeaderData["kind"] | undefined;
  if (agentKind) {
    header = { label: agentKind === "agent" ? "Agent identity" : "Agent identity blueprint", category: "identity", icon: "service_account" };
  } else if (identity) {
    const agent = agentTypeLabel(identity);
    header = {
      label: agent ?? identityKindLabel(identity.kind),
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
          sweep: { context: [connectorLabel(connector)], line: `Last seen by AuthSec ${dayText(lastSeen)}` },
          copy: { value: nativeId, label: isIdentity ? "Copy object ID" : "Copy resource ID", what: isIdentity ? "Object ID" : "Resource ID" },
          plainNote: {
            short: "Recorded, not tested",
            long: "These are the permissions Azure has recorded. They have not been tested, so they do not prove a request would succeed.",
          },
        }
      : undefined;

  // A Foundry object shows its own facts (deployments, connections, trust, projects) instead of the raw attributes.
  const foundryTrusts = foundryQ.data?.trusts ?? [];
  const foundryNode: FoundryNode | undefined =
    workload && str(workload.attrs?.["foundry_kind"]) ? foundryNodeOf(workload, foundryTrusts) : undefined;
  const foundryProjects: FoundryNode[] = foundryNode
    ? (foundryQ.data?.rows ?? [])
        .filter((w) => {
          const self = armBase(workload?.native_id);
          return armBase(str(w.attrs?.["account_id"])) === self || armBase(str(w.attrs?.["hub_id"])) === self;
        })
        .map((w) => foundryNodeOf(w, foundryTrusts))
    : [];

  // An identity's tabs follow its kind once it is known: none is shown that Microsoft makes always empty.
  const tabs =
    agentKind === "agent"
      ? AGENT_TABS
      : agentKind === "blueprint"
        ? BLUEPRINT_TABS
        : identity
          ? IDENTITY_TABS.filter((t) => ALWAYS.has(t.key) || identityTabKeys(identity.kind).includes(t.key))
          : TABS[kind];
  const activeTab = activeTabOf(tabs, tab);
  const active = activeTab.state === "ready" ? activeTab.key : null;

  // A workload's "Runs as" links to the identity page: the graph's can_assume neighbour carries its Entra object id.
  const runsAs = rootQ.data && rootNode ? rootQ.data.nodes.find((n) => n.ref !== rootNode.ref && rootQ.data!.edges.some((e) => e.from === rootNode.ref && e.to === n.ref)) : undefined;
  const runsAsObjectId = str(runsAs?.attrs?.object_id);

  let body: React.ReactNode = null;
  if (identity && agentKind) {
    body =
      active === "overview" ? (
        agentKind === "agent" ? (
          <>
            <AgentIdentityOverview identity={identity} tenant={connector} />
            <AzurePolicySection ws={ws} what="identity" igaId={policyIgaId} />
          </>
        ) : (
          <BlueprintOverview identity={identity} tenant={connector} />
        )
      ) : active === "access" ? (
        agentKind === "agent" ? (
          <IdentityAccessTab id={identity.id} />
        ) : (
          <BlueprintPermissionsTab blueprint={identity} />
        )
      ) : active === "activity" ? (
        <IdentityActivityTab id={identity.id} />
      ) : active === "audit" ? (
        <AuditLogTab identity={identity} />
      ) : active === "agents" ? (
        <BlueprintAgentsTab blueprint={identity} />
      ) : active === "credentials" ? (
        <BlueprintCredentialsTab blueprint={identity} />
      ) : active === "graph" ? (
        <AzureGraphPanel kind="identity" id={id} name={name} objectId={id} />
      ) : null;
  } else if (record) {
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
      ) : workload && foundryNode ? (
        <FoundryOverview node={foundryNode} projects={foundryProjects} />
      ) : workload ? (
        <WorkloadOverview workload={workload} subscription={connector} identityHref={runsAsObjectId ? `/iga/azure/identity/${encodeURIComponent(runsAsObjectId)}` : undefined} />
      ) : null;
    } else if (active === "graph") {
      body = byArmId ? (
        <InventoryNotice icon={<Info />}>
          The Access Graph is not ready yet on this server, so this object can't be drawn. Open it again from Discovery once the Access Graph is ready.
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
      listType={agentKind ? "agents" : LIST_TYPE[kind]}
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
