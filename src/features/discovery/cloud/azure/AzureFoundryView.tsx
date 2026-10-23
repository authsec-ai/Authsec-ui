/**
 * Microsoft Foundry on the Azure Agents tab: each Foundry resource with its
 * projects, each hub with its hub-based projects, and Machine Learning
 * workspaces; their model deployments, connections and agent applications, and
 * which identities their managed identities are trusted by. Read from
 * `/authsec/discovery/azure/foundry`. Facts as Microsoft returned them: nothing
 * is rated.
 */

import { Link } from "react-router-dom";

import type { AzureFoundry, AzureFoundryTrust, CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { Fact, Facts, Panel } from "@/features/iga/shared/components/Panel";

import { CloudPill } from "../CloudPill";
import { AzureTerm } from "./AzureTerm";
import { ListFrame, RelativeDate } from "./AzureDiscoveryShared";
import { agentTypeLabel, connectorLabel, foundryKindLabel, identityKindLabel } from "./azureDiscoveryLabels";
import type { FoundryConnection, FoundryDeployment, FoundryNode } from "./azureFoundry";

const MUTED = "text-xs text-muted-foreground";

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const identityHref = (objectId: string) => `/iga/azure/identity/${encodeURIComponent(objectId)}`;

function yesNo(v: unknown): string {
  return v === true ? "Yes" : v === false ? "No" : "Not recorded";
}

/** A Foundry connection's target service and how it signs in, in words; unknown values as Microsoft wrote them. */
const CONNECTION_CATEGORY: Record<string, string> = {
  AppInsights: "Application Insights",
  CognitiveSearch: "Azure AI Search",
  AzureBlob: "Azure Blob Storage",
  AzureStorageAccount: "Azure Storage",
  AzureOpenAI: "Azure OpenAI",
  AIServices: "Foundry Tools (Azure AI services)",
  CognitiveService: "Azure AI service",
  ApiKey: "API key service",
  CustomKeys: "Custom service",
  RemoteTool: "Remote tool",
  KeyVault: "Key Vault",
  CosmosDB: "Azure Cosmos DB",
};
const CONNECTION_AUTH: Record<string, string> = {
  AAD: "Microsoft Entra ID",
  ApiKey: "API key",
  ManagedIdentity: "Managed identity",
  AccountKey: "Account key",
  AccessKey: "Access key",
  CustomKeys: "Custom keys",
  ServicePrincipal: "Service principal",
  ProjectManagedIdentity: "Project managed identity",
  AgenticIdentity: "Agent identity",
  None: "No authentication",
};

function DeploymentLine({ d }: { d: FoundryDeployment }) {
  const model = [d.model, d.model_version].filter(Boolean).join(" ");
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="font-medium">{d.name}</span>
        {model ? <span className={`ml-2 ${MUTED}`}>{model}</span> : null}
      </span>
      <span className={MUTED}>
        {[d.publisher, d.sku, d.capacity !== undefined ? `capacity ${d.capacity}` : undefined, d.state].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function ConnectionLine({ c }: { c: FoundryConnection }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{c.name}</span>
        {c.category ? (
          <CloudPill tone="muted" dot={false}>
            {CONNECTION_CATEGORY[c.category] ?? c.category}
          </CloudPill>
        ) : null}
        {c.auth_type ? (
          <CloudPill tone="muted" dot={false}>
            Signs in with {CONNECTION_AUTH[c.auth_type] ?? c.auth_type}
          </CloudPill>
        ) : null}
      </div>
      <p className={MUTED}>
        {c.target ? <span className="break-all">{c.target}</span> : "No target recorded"}
        {c.secret_based ? " · uses a stored credential" : c.uses_project_identity ? " · uses the project's identity" : ""}
        {c.shared_to_all ? " · shared with every project" : ""}
      </p>
    </div>
  );
}

function TrustLine({ t }: { t: AzureFoundryTrust }) {
  const agentType = agentTypeLabel({ attrs: { agent_type: t.trusted_agent_type } });
  return (
    <div className="space-y-0.5">
      <p>
        <span className="font-medium">{t.trusted_name || t.trusted_identity_id}</span>
        <span className={`ml-2 ${MUTED}`}>{agentType ?? identityKindLabel(t.trusted_kind)}</span>
      </p>
      <p className={MUTED}>
        Its federated credential trusts this managed identity
        {t.agent_name ? (
          <>
            {" "}
            · so this resource can get the tokens of agent identity{" "}
            {t.agent_object_id ? (
              <Link to={identityHref(t.agent_object_id)} className="text-(--color-primary-text) hover:underline">
                {t.agent_name}
              </Link>
            ) : (
              t.agent_name
            )}
          </>
        ) : null}
      </p>
    </div>
  );
}

function Rows<T>({ title, rows, empty, render }: { title: string; rows: T[]; empty?: string; render: (r: T) => React.ReactNode }) {
  if (!rows.length && !empty) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-(--color-text)">
        <AzureTerm term={title} /> <span className="font-normal tabular-nums text-(--color-text-muted)">{rows.length}</span>
      </h4>
      {rows.length ? (
        <ul className="divide-y rounded-md border">
          {rows.map((r, i) => (
            <li key={i} className="px-3 py-2 text-[13px]">
              {render(r)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={MUTED}>{empty}</p>
      )}
    </div>
  );
}

function NodeBody({ n }: { n: FoundryNode }) {
  const a = n.workload.attrs ?? {};
  const isProject = n.foundryKind === "project" || n.foundryKind === "hub_project";
  return (
    <div className="space-y-3">
      <Facts>
        <Fact label={<AzureTerm term="Managed identity" />}>
          {n.principalId ? (
            <Link to={identityHref(n.principalId)} className="text-(--color-primary-text) hover:underline">
              {n.workload.identity_name || n.principalId}
            </Link>
          ) : (
            "No managed identity recorded"
          )}
        </Fact>
        {str(a["endpoint"]) ? (
          <Fact label={<AzureTerm term="Endpoint" />} mono>
            {str(a["endpoint"])!}
          </Fact>
        ) : null}
        {a["public_network_access"] !== undefined ? <Fact label={<AzureTerm term="Public network access" />}>{str(a["public_network_access"]) ?? "Not recorded"}</Fact> : null}
        {a["local_auth_enabled"] !== undefined ? (
          <Fact label={<AzureTerm term="API key access" />}>{a["local_auth_enabled"] === true ? "Allowed" : a["local_auth_enabled"] === false ? "Off: Microsoft Entra ID only" : "Not recorded"}</Fact>
        ) : null}
        {str(a["sku"]) ? <Fact label={<AzureTerm term="Pricing tier" />}>{str(a["sku"])!}</Fact> : null}
        {isProject && a["is_default"] !== undefined ? <Fact label={<AzureTerm term="Default project" />}>{yesNo(a["is_default"])}</Fact> : null}
        <Fact label={<AzureTerm term="Last seen" />}>
          <RelativeDate iso={n.workload.last_seen_at} />
        </Fact>
      </Facts>
      {n.incomplete ? <p className={MUTED}>Some of this object's detail could not be read in the last scan; what is shown is what was read.</p> : null}
      <Rows title="Model deployments" rows={n.deployments} render={(d) => <DeploymentLine d={d} />} />
      <Rows title="Connections" rows={n.connections} render={(c) => <ConnectionLine c={c} />} />
      {isProject ? (
        <Rows
          title="Agent applications"
          rows={n.agentApplications}
          empty={
            n.agentApplicationsUnavailable
              ? "Not readable: this project's agents are read from its data plane, which needs a Foundry data-plane role assigned to AuthSec."
              : "None recorded."
          }
          render={(app) => (
            <div className="space-y-0.5">
              <p className="font-medium">{app.display_name || app.name}</p>
              <p className={MUTED}>{app.agents?.length ? `Agents: ${app.agents.join(", ")}` : "No agents listed"}</p>
            </div>
          )}
        />
      ) : null}
      <Rows title="Agent blueprints that trust it" rows={n.trusts} render={(t) => <TrustLine t={t} />} />
    </div>
  );
}

export function AzureFoundryView({
  query,
  nodes,
  connectors,
}: {
  query: { isLoading: boolean; isError: boolean; error?: Parameters<typeof ListFrame>[0]["error"]; refetch: () => unknown; data?: AzureFoundry };
  nodes: FoundryNode[];
  connectors: CloudConnector[];
}) {
  const subscription = (id: string) => connectors.find((c) => c.id === id);
  return (
    <ListFrame
      loading={query.isLoading}
      failed={query.isError && !query.data}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={!nodes.length}
      noMatch={false}
      emptyText="No Microsoft Foundry resource, hub or Machine Learning workspace was recorded. They are read from each connected subscription with Reader; the connection's Coverage tab says whether that read ran."
    >
      <div className="space-y-4 p-4">
        {nodes.map((n) => (
          <Panel
            key={n.workload.id}
            title={n.workload.name || n.workload.native_id}
            count={[foundryKindLabel(n.foundryKind, n.workload.runtime_kind), n.workload.region].filter(Boolean).join(" · ")}
            description={<span className="break-all">{`Subscription ${connectorLabel(subscription(n.workload.connector_id))} · ${n.workload.native_id}`}</span>}
          >
            <div className="space-y-4">
              <NodeBody n={n} />
              {n.children.length ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-(--color-text)">
                    Projects <span className="font-normal tabular-nums text-(--color-text-muted)">{n.children.length}</span>
                  </h4>
                  {n.children.map((p) => (
                    <div key={p.workload.id} className="space-y-3 rounded-md border border-(--color-border-subtle) p-3">
                      <p className="text-[13px]">
                        <span className="font-semibold">{str(p.workload.attrs?.["display_name"]) || p.workload.name}</span>
                        <span className={`ml-2 ${MUTED}`}>{foundryKindLabel(p.foundryKind, p.workload.runtime_kind)}</span>
                      </p>
                      <NodeBody n={p} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>
        ))}
      </div>
    </ListFrame>
  );
}
