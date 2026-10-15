/**
 * One Entra object and what Azure discovery recorded about it: its attributes,
 * the roles and permissions it holds, credential metadata, who can obtain its
 * tokens, its sign-in activity and the workloads running as it. Facts only:
 * nothing here is rated or judged. Each tab is read only while it is open.
 */

import { useEffect, useState } from "react";

import {
  useListAzureFederationQuery,
  useListAzureGrantsQuery,
  useListAzureSecretsQuery,
  useListAzureUsageQuery,
  useListAzureWorkloadsQuery,
  type AzureFederationEdge,
  type AzureGrant,
  type AzureIdentity,
  type AzureSecret,
  type AzureUsage,
  type AzureWorkload,
} from "@/app/api/cloudDiscoveryApi";
import { DrawerBody, DrawerFooter, DrawerHeader, DrawerSection, CopyField, DetailGrid, DetailRow } from "@/components/console/detail";
import { DrawerPrevNext } from "@/components/primitives/DrawerPrevNext";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CloudPill } from "../CloudPill";
import { AzureAccessGraph } from "./AzureAccessGraph";
import { AttrFacts, DrawerList, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { agentTypeLabel, armTypeLabel, grantSourceLabel, identityKindLabel, mechanismLabel, refsOf } from "./azureDiscoveryLabels";

type Tab = "overview" | "graph" | "access" | "credentials" | "tokens" | "activity" | "workloads";

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
      {e.subject_name ? <p className="break-all font-mono text-[11px] text-muted-foreground">{e.subject}</p> : null}
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

function AccessTab({ id }: { id: string }) {
  const q = useListAzureGrantsQuery({ identity_id: id, limit: LIST_LIMIT });
  return <DrawerList query={q} empty="No roles or permissions were recorded for this identity." render={(g: AzureGrant) => <GrantLine g={g} />} />;
}
function CredentialsTab({ id }: { id: string }) {
  const q = useListAzureSecretsQuery({ identity_id: id, limit: LIST_LIMIT });
  return <DrawerList query={q} empty="No client secrets or certificates were recorded for this identity." render={(s: AzureSecret) => <SecretLine s={s} />} />;
}
function TokensTab({ id }: { id: string }) {
  const q = useListAzureFederationQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Who can obtain this identity&apos;s tokens without holding its own secret: federated identity credentials, owners (who can add a credential) and agent identity blueprints.</p>
      <DrawerList query={q} empty="Nothing was recorded that can obtain this identity's tokens." render={(e: AzureFederationEdge) => <EdgeLine e={e} />} />
    </div>
  );
}
function ActivityTab({ id }: { id: string }) {
  const q = useListAzureUsageQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">From Microsoft Entra sign-in logs and the Azure Activity Log. Reading sign-in activity through Microsoft Graph needs Microsoft Entra ID P1 or P2.</p>
      <DrawerList query={q} empty="No activity was recorded for this identity." render={(u: AzureUsage) => <UsageLine u={u} />} />
    </div>
  );
}
function WorkloadsTab({ id }: { id: string }) {
  const q = useListAzureWorkloadsQuery({ identity_id: id, limit: LIST_LIMIT });
  return <DrawerList query={q} empty="No workload was recorded running as this identity." render={(w: AzureWorkload) => <WorkloadLine w={w} />} />;
}

/** Owners, sponsors and creator, as Microsoft recorded them. Owners are
 * technical administrators; sponsors are the people accountable for an agent. */
function PeopleSection({ identity }: { identity: AzureIdentity }) {
  const owners = refsOf(identity.attrs, "owners");
  const sponsors = refsOf(identity.attrs, "sponsors");
  const created = identity.attrs?.["created_by"] as AuditChange | undefined;
  const isAgent = identity.kind === "entra_agent_identity" || typeof identity.attrs?.["agent_type"] === "string";
  if (!owners.length && !sponsors.length && !created?.by && !isAgent) return null;
  return (
    <DrawerSection label="People">
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
    </DrawerSection>
  );
}

/** Directory changes to this object, from the Microsoft Entra audit log. */
function AuditSection({ identity }: { identity: AzureIdentity }) {
  const raw = identity.attrs?.["audit_changes"];
  const changes = Array.isArray(raw) ? (raw as AuditChange[]) : [];
  if (!changes.length) return null;
  return (
    <DrawerSection label="Recent directory changes">
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
    </DrawerSection>
  );
}

export function AzureIdentityDrawer({
  identity,
  onClose,
  onPrev,
  onNext,
  index,
  total,
}: {
  identity: AzureIdentity | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  index: number;
  total: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => setTab("overview"), [identity?.id]);
  const agent = identity ? agentTypeLabel(identity) : undefined;

  return (
    <RightDrawer
      open={identity !== null}
      onClose={onClose}
      width={640}
      ariaTitle={identity ? `Azure identity ${identity.name || identity.native_id}` : "Azure identity"}
      ariaDescription="Attributes, roles and permissions, credential metadata, token access, activity and workloads for one Microsoft Entra ID object."
    >
      {!identity ? null : (
        <>
          <DrawerHeader
            title={identity.name || identity.native_id}
            subtitle={agent ? `${identityKindLabel(identity.kind)} · ${agent}` : identityKindLabel(identity.kind)}
            badge={identity.enabled ? <CloudPill tone="success">Enabled</CloudPill> : <CloudPill tone="muted">Disabled</CloudPill>}
          />
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex flex-1 flex-col gap-0 overflow-hidden">
            <div className="overflow-x-auto border-b px-6 pt-3">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="graph">Access graph</TabsTrigger>
                <TabsTrigger value="access">Access</TabsTrigger>
                <TabsTrigger value="credentials">Credentials</TabsTrigger>
                <TabsTrigger value="tokens">Token access</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="workloads">Workloads</TabsTrigger>
              </TabsList>
            </div>
            <DrawerBody>
              <TabsContent value="overview" className="space-y-6">
                <DrawerSection label="Identity">
                  <CopyField label="Object ID" value={identity.native_id} />
                  <DetailGrid>
                    <DetailRow label="Kind" value={identityKindLabel(identity.kind)} />
                    <DetailRow label="Enabled" value={identity.enabled ? "Yes" : "No"} />
                    <DetailRow label="Created in Microsoft Entra ID" value={<RelativeDate iso={identity.created_at} />} />
                    <DetailRow label="Last sign-in" value={<RelativeDate iso={identity.last_used_at} />} />
                    <DetailRow label="First seen by AuthSec" value={<RelativeDate iso={identity.first_seen_at} />} />
                    <DetailRow label="Last seen by AuthSec" value={<RelativeDate iso={identity.last_seen_at} />} />
                  </DetailGrid>
                </DrawerSection>
                <PeopleSection identity={identity} />
                <DrawerSection label="Attributes from Microsoft">
                  <AttrFacts attrs={identity.attrs} skip={SHOWN_ELSEWHERE} />
                </DrawerSection>
                <AuditSection identity={identity} />
              </TabsContent>
              <TabsContent value="graph">
                {tab === "graph" ? <AzureAccessGraph objectId={identity.native_id} name={identity.name || identity.native_id} /> : null}
              </TabsContent>
              <TabsContent value="access">{tab === "access" ? <AccessTab id={identity.id} /> : null}</TabsContent>
              <TabsContent value="credentials">{tab === "credentials" ? <CredentialsTab id={identity.id} /> : null}</TabsContent>
              <TabsContent value="tokens">{tab === "tokens" ? <TokensTab id={identity.id} /> : null}</TabsContent>
              <TabsContent value="activity">{tab === "activity" ? <ActivityTab id={identity.id} /> : null}</TabsContent>
              <TabsContent value="workloads">{tab === "workloads" ? <WorkloadsTab id={identity.id} /> : null}</TabsContent>
            </DrawerBody>
          </Tabs>
          <DrawerFooter>
            <div className="ml-auto" />
            <DrawerPrevNext onPrev={onPrev} onNext={onNext} hasPrev={index > 0} hasNext={index < total - 1} currentIndex={index} total={total} />
          </DrawerFooter>
        </>
      )}
    </RightDrawer>
  );
}
