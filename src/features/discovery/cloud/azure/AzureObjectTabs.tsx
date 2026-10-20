/**
 * The tab bodies of an Azure object's page: what Azure discovery recorded about
 * one Entra object, resource or workload. Facts only: nothing here is rated or
 * judged. Each tab is read only while it is open.
 */

import { Link } from "react-router-dom";

import {
  useListAzureFederationQuery,
  useListAzureGrantsQuery,
  useListAzureSecretsQuery,
  useListAzureUsageQuery,
  useListAzureWorkloadsQuery,
  type AzureFederationEdge,
  type AzureGrant,
  type AzureIdentity,
  type AzureResource,
  type AzureSecret,
  type AzureUsage,
  type AzureWorkload,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import { DetailGrid, DetailRow } from "@/components/console/detail";
import { Fact, Facts, Panel, CopyValue } from "@/features/iga/shared/components/Panel";

import { CloudPill } from "../CloudPill";
import { AttrFacts, DrawerList, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { armTypeLabel, connectorLabel, grantSourceLabel, identityKindLabel, mechanismLabel, refsOf } from "./azureDiscoveryLabels";

/** Attributes shown in their own sections rather than as raw facts. */
const SHOWN_ELSEWHERE = ["owners", "sponsors", "created_by", "audit_changes", "agent_listed"];

interface AuditChange {
  id?: string;
  at?: string;
  by?: string;
  activity?: string;
  result?: string;
}
const LIST_LIMIT = 200;

export function GrantLine({ g, showHolder = false }: { g: AzureGrant; showHolder?: boolean }) {
  const what = g.role_name || (g.actions ?? []).join(", ") || g.native_id;
  const where = g.resource_name || (g.scope_kind ? g.scope_kind.replace(/_/g, " ") : "");
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{showHolder ? g.identity_name : what}</span>
        <CloudPill tone="muted" dot={false}>
          {grantSourceLabel(g.source)}
        </CloudPill>
        {g.inherited ? (
          <CloudPill tone="info" dot={false} title="Granted to its agent identity blueprint principal and inherited by this agent identity; not granted to the agent identity itself.">
            Inherited
          </CloudPill>
        ) : null}
        {g.condition ? (
          <CloudPill tone="muted" dot={false} title={g.condition}>
            Has a condition
          </CloudPill>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {showHolder ? `${what} · ${identityKindLabel(g.identity_kind)}` : where ? `On ${where}` : null}
        {g.last_exercised_at ? <> · last used <RelativeDate iso={g.last_exercised_at} /></> : null}
      </p>
    </div>
  );
}

const SECRET_KIND: Record<string, string> = { entra_client_secret: "Client secret", entra_certificate: "Certificate" };
const USAGE_SOURCE: Record<string, string> = { entra_sign_in: "Sign-ins", activity_log: "Activity log" };

function SecretLine({ s }: { s: AzureSecret }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{s.display_name || s.native_id}</span>
        <CloudPill tone="muted" dot={false}>
          {SECRET_KIND[s.kind] ?? s.kind}
        </CloudPill>
        {s.status ? (
          <CloudPill tone="muted" dot={false}>
            {s.status}
          </CloudPill>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Created <RelativeDate iso={s.created_at} /> · expires <RelativeDate iso={s.expires_at} />
        {s.last_used_at ? <> · last used <RelativeDate iso={s.last_used_at} /></> : null}
      </p>
    </div>
  );
}

function EdgeLine({ e }: { e: AzureFederationEdge }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 break-all font-medium">{e.subject_name || e.subject}</span>
        <CloudPill tone="muted" dot={false}>
          {mechanismLabel(e.mechanism)}
        </CloudPill>
      </div>
      {e.issuer ? <p className="break-all text-xs text-muted-foreground">Issuer {e.issuer}</p> : null}
      {e.subject_name ? <p className="break-all font-mono text-xs text-muted-foreground">{e.subject}</p> : null}
    </div>
  );
}

function UsageLine({ u }: { u: AzureUsage }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-all font-medium">{u.service}</span>
      <span className="text-xs text-muted-foreground">
        {USAGE_SOURCE[u.source] ?? u.source} · <RelativeDate iso={u.last_used_at} />
      </span>
    </div>
  );
}

function WorkloadLine({ w }: { w: AzureWorkload }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-all font-medium">{w.name || w.native_id}</span>
      <span className="text-xs text-muted-foreground">
        {armTypeLabel(w.runtime_kind)}
        {w.region ? ` · ${w.region}` : ""}
      </span>
    </div>
  );
}

/** `id` is the legacy cloud identity id the Azure list endpoints take. */
export function IdentityAccessTab({ id }: { id: string }) {
  const q = useListAzureGrantsQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel title="Roles and permissions" count={q.data ? `${q.data.rows.length}` : undefined}>
      <DrawerList query={q} empty="No roles or permissions were recorded for this identity." render={(g: AzureGrant) => <GrantLine g={g} />} />
    </Panel>
  );
}
export function IdentityCredentialsTab({ id }: { id: string }) {
  const q = useListAzureSecretsQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel title="Credentials" count={q.data ? `${q.data.rows.length}` : undefined} description="Metadata only: names, dates and status. AuthSec never holds a secret value.">
      <DrawerList query={q} empty="No client secrets or certificates were recorded for this identity." render={(s: AzureSecret) => <SecretLine s={s} />} />
    </Panel>
  );
}
export function IdentityTokensTab({ id }: { id: string }) {
  const q = useListAzureFederationQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel
      title="Who can obtain its tokens"
      count={q.data ? `${q.data.rows.length}` : undefined}
      description="Who can obtain this identity's tokens without holding its own secret: federated identity credentials, owners (who can add a credential) and agent identity blueprints."
    >
      <DrawerList query={q} empty="Nothing was recorded that can obtain this identity's tokens." render={(e: AzureFederationEdge) => <EdgeLine e={e} />} />
    </Panel>
  );
}
export function IdentityActivityTab({ id }: { id: string }) {
  const q = useListAzureUsageQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel
      title="Activity"
      count={q.data ? `${q.data.rows.length}` : undefined}
      description="From Microsoft Entra sign-in logs and the Azure Activity Log. Reading sign-in activity through Microsoft Graph needs Microsoft Entra ID P1 or P2."
    >
      <DrawerList query={q} empty="No activity was recorded for this identity." render={(u: AzureUsage) => <UsageLine u={u} />} />
    </Panel>
  );
}
export function IdentityWorkloadsTab({ id }: { id: string }) {
  const q = useListAzureWorkloadsQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel title="Workloads running as this identity" count={q.data ? `${q.data.rows.length}` : undefined}>
      <DrawerList query={q} empty="No workload was recorded running as this identity." render={(w: AzureWorkload) => <WorkloadLine w={w} />} />
    </Panel>
  );
}

/** Owners, sponsors and creator, as Microsoft recorded them. Owners are
 * technical administrators; sponsors are the people accountable for an agent. */
function PeoplePanel({ identity }: { identity: AzureIdentity }) {
  const owners = refsOf(identity.attrs, "owners");
  const sponsors = refsOf(identity.attrs, "sponsors");
  const created = identity.attrs?.["created_by"] as AuditChange | undefined;
  const isAgent = identity.kind === "entra_agent_identity" || typeof identity.attrs?.["agent_type"] === "string";
  if (!owners.length && !sponsors.length && !created?.by && !isAgent) return null;
  return (
    <Panel title="People">
      <DetailGrid>
        {isAgent || sponsors.length ? <DetailRow label="Sponsors" value={<RefNames refs={sponsors} max={10} />} /> : null}
        <DetailRow label="Owners" value={<RefNames refs={owners} max={10} />} />
        {created?.by ? (
          <DetailRow
            label="Created by"
            value={
              <span>
                {created.by} <span className="text-muted-foreground">· <RelativeDate iso={created.at} /></span>
              </span>
            }
          />
        ) : null}
      </DetailGrid>
    </Panel>
  );
}

/** Directory changes to this object, from the Microsoft Entra audit log. */
function AuditPanel({ identity }: { identity: AzureIdentity }) {
  const raw = identity.attrs?.["audit_changes"];
  const changes = Array.isArray(raw) ? (raw as AuditChange[]) : [];
  if (!changes.length) return null;
  return (
    <Panel title="Recent directory changes" count={`${changes.length}`}>
      <ul className="divide-y rounded-md border text-[13px]">
        {changes.map((c, i) => (
          <li key={c.id ?? i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
            <span>{c.activity ?? "Change"}</span>
            <span className="text-xs text-muted-foreground">
              {c.by ? `${c.by} · ` : ""}
              <RelativeDate iso={c.at} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function IdentityOverview({ identity, tenant }: { identity: AzureIdentity; tenant?: CloudConnector }) {
  return (
    <div className="space-y-4">
      <Panel title="Identity">
        <Facts>
          <Fact label="Object ID">
            <CopyValue value={identity.native_id} what="Object ID" />
          </Fact>
          <Fact label="Kind">{identityKindLabel(identity.kind)}</Fact>
          <Fact label="Tenant">{connectorLabel(tenant)}</Fact>
          <Fact label="Enabled">{identity.enabled ? "Yes" : "No"}</Fact>
          <Fact label="Created in Microsoft Entra ID">
            <RelativeDate iso={identity.created_at} />
          </Fact>
          <Fact label="Last sign-in">
            <RelativeDate iso={identity.last_used_at} />
          </Fact>
          <Fact label="First seen by AuthSec">
            <RelativeDate iso={identity.first_seen_at} />
          </Fact>
          <Fact label="Last seen by AuthSec">
            <RelativeDate iso={identity.last_seen_at} />
          </Fact>
        </Facts>
      </Panel>
      <PeoplePanel identity={identity} />
      <Panel title="Attributes from Microsoft">
        <AttrFacts attrs={identity.attrs} skip={SHOWN_ELSEWHERE} />
      </Panel>
      <AuditPanel identity={identity} />
    </div>
  );
}

export function ResourceOverview({ resource, subscription }: { resource: AzureResource; subscription?: CloudConnector }) {
  return (
    <Panel title="Resource">
      <Facts>
        <Fact label="Resource ID">
          <CopyValue value={resource.native_id} what="Resource ID" />
        </Fact>
        <Fact label="Type" mono>
          {resource.kind}
        </Fact>
        <Fact label="Subscription">{connectorLabel(subscription)}</Fact>
        <Fact label="First seen by AuthSec">
          <RelativeDate iso={resource.first_seen_at} />
        </Fact>
        <Fact label="Last seen by AuthSec">
          <RelativeDate iso={resource.last_seen_at} />
        </Fact>
      </Facts>
    </Panel>
  );
}

/** Role assignments scoped to this resource directly; `resourceId` is the legacy cloud resource id. */
export function ResourceAccessTab({ resourceId }: { resourceId: string }) {
  const q = useListAzureGrantsQuery({ resource_id: resourceId, limit: LIST_LIMIT });
  return (
    <Panel title="Who can access" count={q.data ? `${q.data.rows.length}` : undefined}>
      <DrawerList
        query={q}
        empty="No Azure role assignment is scoped to this resource directly. Role assignments at the subscription or a resource group still apply to it and are listed on each identity."
        render={(g: AzureGrant) => <GrantLine g={g} showHolder />}
      />
    </Panel>
  );
}

export function WorkloadOverview({ workload, subscription, identityHref }: { workload: AzureWorkload; subscription?: CloudConnector; identityHref?: string }) {
  return (
    <div className="space-y-4">
      <Panel title="Workload">
        <Facts>
          <Fact label="Resource ID">
            <CopyValue value={workload.native_id} what="Resource ID" />
          </Fact>
          <Fact label="Type" mono>
            {workload.runtime_kind}
          </Fact>
          <Fact label="Region">{workload.region || "—"}</Fact>
          <Fact label="Subscription">{connectorLabel(subscription)}</Fact>
          <Fact label="Runs as">
            {workload.identity_name ? (
              identityHref ? (
                <Link to={identityHref} className="text-(--color-primary-text) hover:underline">
                  {workload.identity_name} ({identityKindLabel(workload.identity_kind)})
                </Link>
              ) : (
                `${workload.identity_name} (${identityKindLabel(workload.identity_kind)})`
              )
            ) : (
              "No identity recorded"
            )}
          </Fact>
          <Fact label="First seen by AuthSec">
            <RelativeDate iso={workload.first_seen_at} />
          </Fact>
          <Fact label="Last seen by AuthSec">
            <RelativeDate iso={workload.last_seen_at} />
          </Fact>
        </Facts>
      </Panel>
      <Panel title="Attributes from Microsoft">
        <AttrFacts attrs={workload.attrs} />
      </Panel>
    </div>
  );
}
