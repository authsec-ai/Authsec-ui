/**
 * The tab bodies of an Azure object's page: what Azure discovery recorded about
 * one Entra object, resource or workload. Facts only: nothing here is rated or
 * judged. Each tab is read only while it is open.
 */

import { Link } from "react-router-dom";

import {
  useListAzureEvidenceQuery,
  useListAzureFederationQuery,
  useListAzureGrantsQuery,
  useListAzureSecretsQuery,
  useListAzureUsageQuery,
  useListAzureWorkloadsQuery,
  type AzureEvidence,
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
import { AttrFacts, ConnectorNameOrId, DrawerList, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { AzureTerm } from "./AzureTerm";
import { detailText, foundryPlacement, identityDetailFields, workloadDetailFields, type DetailField } from "./azureDetails";
import { armTypeLabel, grantSourceLabel, identityKindLabel, mechanismLabel, refsOf, surfaceLabel, OTHER_LABEL } from "./azureDiscoveryLabels";

/** Where a grant applies, in words. The raw scope kind is never shown. */
const SCOPE_WORDS: Record<string, string> = {
  resource: "this resource",
  resource_group: "its resource group",
  subscription: "its subscription",
  tenant: "the whole directory",
};

/** The service a Microsoft evidence line was read from, by its request path. */
function sourceServiceOf(api: string | null | undefined): string {
  if (!api) return "Microsoft";
  return /graph|\/v1\.0\/|\/beta\//i.test(api) ? "Microsoft Graph" : /authorization|management/i.test(api) ? "Azure Resource Manager" : "Microsoft";
}

const SURFACE_STATE_WORDS: Record<string, string> = {
  reached: "Read",
  partial: "Partly read",
  denied: "Access refused",
  throttled: "Slowed by Microsoft's limits",
  stale: "Not confirmed by the latest scan",
  unknown: "Not checked",
  revoked: "Connection switched off",
  not_selected: "Outside the scan",
  unsupported: "Not offered here",
};

/** Attributes shown in their own sections rather than as raw facts. `agent_listed`
 * used to be skipped here on the premise that it was shown elsewhere — it never
 * was, so it now falls through to the generic Details panel like anything else. */
const SHOWN_ELSEWHERE = ["owners", "sponsors", "created_by", "audit_changes"];

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
  const where = g.resource_name || (g.scope_kind ? SCOPE_WORDS[g.scope_kind] ?? OTHER_LABEL.toLowerCase() : "");
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{showHolder ? g.identity_name : what}</span>
        <AzureTerm term={grantSourceLabel(g.source)}>
          <CloudPill tone="muted" dot={false}>
            {grantSourceLabel(g.source)}
          </CloudPill>
        </AzureTerm>
        {g.inherited ? (
          <CloudPill tone="info" dot={false} title="Granted to the agent template's login and inherited by this agent. Not granted to the agent itself.">
            Inherited from its template
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
        <AzureTerm term={mechanismLabel(e.mechanism)}>
          <CloudPill tone="muted" dot={false}>
            {mechanismLabel(e.mechanism)}
          </CloudPill>
        </AzureTerm>
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
    <Panel title="Passwords and certificates" count={q.data ? `${q.data.rows.length}` : undefined} description="AuthSec only sees the name and dates of each password or certificate. It never sees the secret itself.">
      <DrawerList query={q} empty="No passwords or certificates are recorded for this identity." render={(s: AzureSecret) => <SecretLine s={s} />} />
    </Panel>
  );
}
export function IdentityTokensTab({ id }: { id: string }) {
  const q = useListAzureFederationQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel
      title="Who can act as it"
      count={q.data ? `${q.data.rows.length}` : undefined}
      description="People, apps and setups that can sign in as this identity without its password: trusted outside sign-in settings, owners who can add a credential, and the template it was made from."
    >
      <DrawerList query={q} empty="Nothing was recorded that can sign in as this identity." render={(e: AzureFederationEdge) => <EdgeLine e={e} />} />
    </Panel>
  );
}
export function IdentityActivityTab({ id }: { id: string }) {
  const q = useListAzureUsageQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel
      title="Sign-ins and activity"
      count={q.data ? `${q.data.rows.length}` : undefined}
      description="Sign-ins and Azure actions recorded by Microsoft. Reading the full sign-in history needs a paid Microsoft Entra licence (P1 or P2). Without one, this list can be empty."
    >
      <DrawerList query={q} empty="No activity was recorded for this identity." render={(u: AzureUsage) => <UsageLine u={u} />} />
    </Panel>
  );
}
export function IdentityWorkloadsTab({ id }: { id: string }) {
  const q = useListAzureWorkloadsQuery({ identity_id: id, limit: LIST_LIMIT });
  return (
    <Panel title="Azure resources that sign in as this identity" count={q.data ? `${q.data.rows.length}` : undefined}>
      <DrawerList query={q} empty="No Azure resource was recorded signing in as this identity." render={(w: AzureWorkload) => <WorkloadLine w={w} />} />
    </Panel>
  );
}

const SURFACE_STATE_TONE: Record<string, "success" | "warning" | "danger" | "muted"> = { reached: "success", partial: "warning", denied: "danger", throttled: "warning" };
function EvidenceLine({ e }: { e: AzureEvidence }) {
  const facts = e.facts && typeof e.facts === "object" ? e.facts : {};
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{surfaceLabel(e.surface)}</span>
          <CloudPill tone="muted" dot={false}>
            {e.subject === "grant" ? "A role or permission it holds" : "The object itself"}
          </CloudPill>
          {e.surface_state ? (
            <CloudPill tone={SURFACE_STATE_TONE[e.surface_state] ?? "muted"} dot={false}>
              {SURFACE_STATE_WORDS[e.surface_state] ?? OTHER_LABEL}
            </CloudPill>
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground">
          Found in {e.confirmation_count} {e.confirmation_count === 1 ? "scan" : "scans"} · last <RelativeDate iso={e.last_confirmed_at ?? e.observed_at} />
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Read from {sourceServiceOf(e.source_api)} · first seen <RelativeDate iso={e.observed_at} />
        {e.subject_native_id ? <span className="break-all"> · {e.subject_native_id}</span> : null}
      </p>
      {Object.keys(facts).length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-(--color-primary-text)">Details as Microsoft returned them</summary>
          <div className="mt-2">
            <AttrFacts attrs={facts} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** `objectId` is the Entra object id: evidence is keyed by it, not by the legacy cloud id. */
export function IdentityEvidenceTab({ objectId }: { objectId: string }) {
  const q = useListAzureEvidenceQuery({ object_id: objectId, limit: LIST_LIMIT });
  return (
    <Panel
      title="Evidence"
      count={q.data ? `${q.data.rows.length}` : undefined}
      description="Where each fact about this object and its roles and permissions came from: which Microsoft API returned it, how many scans found it, and what it said (never a secret value)."
    >
      <DrawerList query={q} empty="Nothing was recorded for this object yet. Evidence is written when a scan finishes." render={(e: AzureEvidence) => <EvidenceLine e={e} />} />
    </Panel>
  );
}

/**
 * The facts that matter for this kind, named and explained in Azure's terms,
 * then everything Microsoft returned, collapsed, for whoever needs the rest.
 */
function MicrosoftDetails({ fields, attrs, placement = [] }: { fields: DetailField[]; attrs: Record<string, unknown> | null | undefined; placement?: { label: string; value: string }[] }) {
  const rows = fields
    .map((f) => {
      const v = attrs?.[f.key];
      const shown = detailText(f, v);
      if (shown === null) return null;
      const value = f.format.as === "date" ? <RelativeDate iso={String(v)} /> : f.format.as === "id" ? <CopyValue value={shown} what={f.label} /> : shown;
      return (
        <Fact key={f.key} label={<AzureTerm term={f.label} />}>
          {value}
        </Fact>
      );
    })
    .filter(Boolean);
  return (
    <Panel title="Details from Microsoft">
      {rows.length || placement.length ? (
        <Facts>
          {placement.map((pl) => (
            <Fact key={pl.label} label={<AzureTerm term={pl.label} />}>
              {pl.value}
            </Fact>
          ))}
          {rows}
        </Facts>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing more to show for this type.</p>
      )}
      <details className="mt-4 text-xs">
        <summary className="cursor-pointer text-(--color-primary-text)">Show everything Microsoft returned</summary>
        <div className="mt-3">
          <AttrFacts attrs={attrs} skip={SHOWN_ELSEWHERE} />
        </div>
      </details>
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
        {isAgent || sponsors.length ? <DetailRow label={<AzureTerm term="Sponsors" />} value={<RefNames refs={sponsors} max={10} empty="No sponsor listed" />} /> : null}
        <DetailRow label={<AzureTerm term="Owners" />} value={<RefNames refs={owners} max={10} empty="No owner listed" />} />
        {created?.by ? (
          <DetailRow
            label={<AzureTerm term="Created by" />}
            value={
              <span>
                <AzureTerm term={created.by} /> <span className="text-muted-foreground">· <RelativeDate iso={created.at} /></span>
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
    <Panel title="Recent changes" count={`${changes.length}`} description="From the Microsoft Entra audit log.">
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

/** A tenant by its name where one was read, else its full tenant ID to copy (never a cut-down ID). */
function TenantValue({ tenant }: { tenant?: CloudConnector }) {
  const name = (tenant?.attrs as Record<string, unknown> | undefined)?.["tenant_display_name"];
  if (typeof name === "string" && name) return <>{name}</>;
  return tenant ? <CopyValue value={tenant.scope_id} what="Tenant ID" /> : <span className="text-muted-foreground">Not recorded</span>;
}

/** Groups and app registrations never sign in themselves (an app signs in through its service principal). */
const signsIn = (kind: string) => kind !== "entra_group" && kind !== "entra_application";

export function IdentityOverview({ identity, tenant }: { identity: AzureIdentity; tenant?: CloudConnector }) {
  const isAgentIdentity = identity.kind === "entra_agent_identity";
  return (
    <div className="space-y-4">
      <Panel title="Identity">
        <Facts>
          <Fact label={<AzureTerm term="Object ID" />}>
            <CopyValue value={identity.native_id} what="Object ID" />
          </Fact>
          <Fact label="Type">
            <AzureTerm term={identityKindLabel(identity.kind)} />
          </Fact>
          <Fact label={<AzureTerm term="Tenant" />}>
            <TenantValue tenant={tenant} />
          </Fact>
          <Fact label={<AzureTerm term="Account enabled" />}>{identity.enabled ? "Yes" : "No"}</Fact>
          <Fact label="Created">
            <RelativeDate iso={identity.created_at} />
          </Fact>
          {signsIn(identity.kind) ? (
            <Fact label={<AzureTerm term="Last sign-in" />}>{identity.last_used_at ? <RelativeDate iso={identity.last_used_at} /> : "No sign-in recorded"}</Fact>
          ) : null}
          <Fact label="First found by AuthSec">
            <RelativeDate iso={identity.first_seen_at} />
          </Fact>
          <Fact label="Last checked by AuthSec">
            <RelativeDate iso={identity.last_seen_at} />
          </Fact>
        </Facts>
      </Panel>
      <PeoplePanel identity={identity} />
      <MicrosoftDetails fields={identityDetailFields(identity.kind)} attrs={identity.attrs} placement={isAgentIdentity ? foundryPlacement(identity.attrs?.["tags"]) : []} />
      <AuditPanel identity={identity} />
    </div>
  );
}

export function ResourceOverview({ resource, subscription }: { resource: AzureResource; subscription?: CloudConnector }) {
  return (
    <div className="space-y-4">
      <Panel title="Resource">
        <Facts>
          <Fact label={<AzureTerm term="Resource ID" />}>
            <CopyValue value={resource.native_id} what="Resource ID" />
          </Fact>
          <Fact label="Type">
            <AzureTerm term={armTypeLabel(resource.kind)} /> <span className="font-mono text-xs text-muted-foreground">{resource.kind}</span>
          </Fact>
          <Fact label={<AzureTerm term="Subscription" />}><ConnectorNameOrId c={subscription} what="Subscription ID" /></Fact>
          <Fact label="First found by AuthSec">
            <RelativeDate iso={resource.first_seen_at} />
          </Fact>
          <Fact label="Last checked by AuthSec">
            <RelativeDate iso={resource.last_seen_at} />
          </Fact>
        </Facts>
      </Panel>
      <Panel title="Details from Microsoft" description="The other details Microsoft returned, as read. Nothing here is rated.">
        {/* resource_id duplicates the Resource ID fact above, same as the Workload overview. */}
        <AttrFacts attrs={resource.attrs} skip={["resource_id"]} />
      </Panel>
    </div>
  );
}

/** Role assignments scoped to this resource directly; `resourceId` is the legacy cloud resource id. */
export function ResourceAccessTab({ resourceId }: { resourceId: string }) {
  const q = useListAzureGrantsQuery({ resource_id: resourceId, limit: LIST_LIMIT });
  return (
    <Panel title="Who can access" count={q.data ? `${q.data.rows.length}` : undefined}>
      <DrawerList
        query={q}
        empty="No role was set on this resource itself. Roles given on its subscription or resource group still reach it, and they appear under each identity."
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
          <Fact label={<AzureTerm term="Resource ID" />}>
            <CopyValue value={workload.native_id} what="Resource ID" />
          </Fact>
          <Fact label="Type">
            <AzureTerm term={armTypeLabel(workload.runtime_kind)} /> <span className="font-mono text-xs text-muted-foreground">{workload.runtime_kind}</span>
          </Fact>
          <Fact label={<AzureTerm term="Region" />}>{workload.region === "global" ? "Worldwide" : workload.region || "Region not read"}</Fact>
          <Fact label={<AzureTerm term="Subscription" />}><ConnectorNameOrId c={subscription} what="Subscription ID" /></Fact>
          <Fact label={<AzureTerm term="Managed identity" />}>
            {workload.identity_name ? (
              identityHref ? (
                <Link to={identityHref} className="text-(--color-primary-text) hover:underline">
                  {workload.identity_name} ({identityKindLabel(workload.identity_kind)})
                </Link>
              ) : (
                `${workload.identity_name} (${identityKindLabel(workload.identity_kind)})`
              )
            ) : (
              "No login recorded"
            )}
          </Fact>
          <Fact label="First found by AuthSec">
            <RelativeDate iso={workload.first_seen_at} />
          </Fact>
          <Fact label="Last checked by AuthSec">
            <RelativeDate iso={workload.last_seen_at} />
          </Fact>
        </Facts>
      </Panel>
      <MicrosoftDetails fields={workloadDetailFields()} attrs={workload.attrs} />
    </div>
  );
}
