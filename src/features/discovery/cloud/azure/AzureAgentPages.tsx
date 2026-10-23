/**
 * The pages of a Microsoft Entra Agent ID agent identity and agent identity
 * blueprint, opened from Discovery's Entra Agent ID tab. They show what the
 * Entra admin center shows for each, and nothing generic:
 *
 *   agent identity  status, its blueprint, created, last sign-in, sponsors and
 *                   owners, where Foundry placed it; its roles and permissions,
 *                   sign-in logs and audit logs.
 *   blueprint       status, IDs, publisher, created, sponsors and owners; the
 *                   agent identities made from it, the credentials that get
 *                   their tokens, the permissions it holds (inheritable ones pass
 *                   to its agents) and audit logs.
 *
 * Microsoft keeps a blueprint's federated credentials and permissions on its
 * blueprint principal (its service principal in the tenant, same app ID), so
 * those tabs read the principal.
 */

import { Link } from "react-router-dom";

import {
  useListAzureFederationQuery,
  useListAzureGrantsQuery,
  useListAzureIdentitiesQuery,
  useListAzureSecretsQuery,
  type AzureFederationEdge,
  type AzureGrant,
  type AzureIdentity,
  type AzureSecret,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import { CopyValue, Fact, Facts, Panel } from "@/features/iga/shared/components/Panel";

import { CloudPill } from "../CloudPill";
import { DrawerList, RefNames, RelativeDate } from "./AzureDiscoveryShared";
import { GrantLine } from "./AzureObjectTabs";
import { AzureTerm } from "./AzureTerm";
import { foundryPlacement } from "./azureDetails";
import { refsOf } from "./azureDiscoveryLabels";

const LIST_LIMIT = 200;
const MUTED = "text-xs text-muted-foreground";

interface AuditChange {
  id?: string;
  at?: string;
  by?: string;
  activity?: string;
  result?: string;
}

export const identityHref = (objectId: string) => `/iga/azure/identity/${encodeURIComponent(objectId)}`;

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Is this identity an Entra Agent ID object with a page of its own? */
export function agentPageKind(identity: AzureIdentity | undefined): "agent" | "blueprint" | null {
  if (!identity) return null;
  if (identity.kind === "entra_agent_identity") return "agent";
  if (identity.kind === "entra_application" && identity.attrs?.["agent_type"] === "agent_identity_blueprint") return "blueprint";
  return null;
}

/** Active or Disabled, as the Entra admin center says it. */
function StatusValue({ enabled }: { enabled: boolean }) {
  return (
    <AzureTerm term="Status">
      <CloudPill tone={enabled ? "success" : "muted"} dot={false}>
        {enabled ? "Active" : "Disabled"}
      </CloudPill>
    </AzureTerm>
  );
}

function TenantValue({ tenant }: { tenant?: CloudConnector }) {
  const name = (tenant?.attrs as Record<string, unknown> | undefined)?.["tenant_display_name"];
  if (typeof name === "string" && name) return <>{name}</>;
  return tenant ? <CopyValue value={tenant.scope_id} what="Tenant ID" /> : <span className="text-muted-foreground">Not recorded</span>;
}

function CreatedValue({ identity }: { identity: AzureIdentity }) {
  const by = (identity.attrs?.["created_by"] as AuditChange | undefined)?.by;
  return (
    <span>
      <RelativeDate iso={identity.created_at} />
      {by ? (
        <span className="text-muted-foreground">
          {" "}
          · by <AzureTerm term={by} />
        </span>
      ) : null}
    </span>
  );
}

function PeoplePanel({ identity }: { identity: AzureIdentity }) {
  return (
    <Panel title="Sponsors and owners">
      <Facts>
        <Fact label={<AzureTerm term="Sponsors" />}>
          <RefNames refs={refsOf(identity.attrs, "sponsors")} max={10} />
        </Fact>
        <Fact label={<AzureTerm term="Owners" />}>
          <RefNames refs={refsOf(identity.attrs, "owners")} max={10} />
        </Fact>
      </Facts>
    </Panel>
  );
}

/** Where Microsoft Foundry placed it, from the tags Foundry sets; nothing when it wasn't made by Foundry. */
function FoundryPanel({ identity }: { identity: AzureIdentity }) {
  const placement = foundryPlacement(identity.attrs?.["tags"]);
  if (!placement.length) return null;
  return (
    <Panel title={<AzureTerm term="Microsoft Foundry" />} description="Foundry created this automatically for an agent in this project.">
      <Facts>
        {placement.map((p) => (
          <Fact key={p.label} label={<AzureTerm term={p.label} />}>
            {p.value}
          </Fact>
        ))}
      </Facts>
    </Panel>
  );
}

export function AgentIdentityOverview({ identity, tenant }: { identity: AzureIdentity; tenant?: CloudConnector }) {
  const blueprintId = str(identity.attrs?.["agent_blueprint_id"]);
  const blueprintName = str(identity.attrs?.["agent_blueprint_name"]);
  return (
    <div className="space-y-4">
      <Panel title="Agent identity">
        <Facts>
          <Fact label={<AzureTerm term="Status" />}>
            <StatusValue enabled={identity.enabled} />
          </Fact>
          <Fact label={<AzureTerm term="Agent identity blueprint" />}>
            {blueprintId ? (
              <Link to={identityHref(blueprintId)} className="text-(--color-primary-text) hover:underline">
                {blueprintName ?? blueprintId}
              </Link>
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </Fact>
          <Fact label={<AzureTerm term="Object ID" />}>
            <CopyValue value={identity.native_id} what="Object ID" />
          </Fact>
          <Fact label={<AzureTerm term="Created" />}>
            <CreatedValue identity={identity} />
          </Fact>
          <Fact label={<AzureTerm term="Last sign-in" />}>{identity.last_used_at ? <RelativeDate iso={identity.last_used_at} /> : "No sign-in recorded"}</Fact>
          <Fact label={<AzureTerm term="Tenant" />}>
            <TenantValue tenant={tenant} />
          </Fact>
          {identity.attrs?.["disabled_by_microsoft"] === true ? <Fact label={<AzureTerm term="Disabled by Microsoft" />}>Yes</Fact> : null}
        </Facts>
      </Panel>
      <PeoplePanel identity={identity} />
      <FoundryPanel identity={identity} />
    </div>
  );
}

export function BlueprintOverview({ identity, tenant }: { identity: AzureIdentity; tenant?: CloudConnector }) {
  const appId = str(identity.attrs?.["app_id"]) ?? identity.native_id;
  const agents = identity.attrs?.["agent_count"];
  return (
    <div className="space-y-4">
      <Panel title="Agent identity blueprint">
        <Facts>
          <Fact label={<AzureTerm term="Status" />}>
            <StatusValue enabled={identity.enabled} />
          </Fact>
          <Fact label={<AzureTerm term="Agent identities" />}>{typeof agents === "number" ? agents : "Not recorded"}</Fact>
          <Fact label={<AzureTerm term="Application (client) ID" />}>
            <CopyValue value={appId} what="Application (client) ID" />
          </Fact>
          <Fact label={<AzureTerm term="Object ID" />}>
            <CopyValue value={identity.native_id} what="Object ID" />
          </Fact>
          {str(identity.attrs?.["publisher_domain"]) ? <Fact label={<AzureTerm term="Publisher domain" />}>{str(identity.attrs?.["publisher_domain"])}</Fact> : null}
          <Fact label={<AzureTerm term="Created" />}>
            <CreatedValue identity={identity} />
          </Fact>
          <Fact label={<AzureTerm term="Tenant" />}>
            <TenantValue tenant={tenant} />
          </Fact>
          {identity.attrs?.["disabled_by_microsoft"] === true ? <Fact label={<AzureTerm term="Disabled by Microsoft" />}>Yes</Fact> : null}
        </Facts>
      </Panel>
      <PeoplePanel identity={identity} />
      <FoundryPanel identity={identity} />
    </div>
  );
}

/** The agent identities made from this blueprint. */
export function BlueprintAgentsTab({ blueprint }: { blueprint: AzureIdentity }) {
  const q = useListAzureIdentitiesQuery({ kind: "entra_agent_identity", limit: 500 });
  const agents = (q.data?.rows ?? []).filter((a) => a.attrs?.["agent_blueprint_id"] === blueprint.native_id);
  return (
    <Panel title="Agent identities" count={q.data ? `${agents.length}` : undefined} description="The agent identities made from this blueprint. Its credentials get their tokens, and its inheritable permissions pass to them.">
      {q.isLoading ? (
        <p className={MUTED}>Loading…</p>
      ) : agents.length ? (
        <ul className="divide-y rounded-md border text-[13px]">
          {agents.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <Link to={identityHref(a.native_id)} className="min-w-0 break-all font-medium text-(--color-primary-text) hover:underline">
                {a.name || a.native_id}
              </Link>
              <span className="flex items-center gap-2">
                <StatusValue enabled={a.enabled} />
                <span className={MUTED}>
                  created <RelativeDate iso={a.created_at} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={MUTED}>No agent identity made from this blueprint was recorded.</p>
      )}
    </Panel>
  );
}

/** The blueprint principal: the blueprint's service principal in this tenant (same app ID). */
function useBlueprintPrincipal(blueprint: AzureIdentity) {
  const appId = str(blueprint.attrs?.["app_id"]) ?? blueprint.native_id;
  const q = useListAzureIdentitiesQuery({ kind: "entra_service_principal", agent_type: "agent_identity_blueprint_principal", limit: 500 });
  return { principal: (q.data?.rows ?? []).find((p) => p.attrs?.["app_id"] === appId), loading: q.isLoading };
}

const SECRET_KIND: Record<string, string> = { entra_client_secret: "Client secret", entra_certificate: "Certificate" };

function SecretLine({ s }: { s: AzureSecret }) {
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{s.display_name || s.native_id}</span>
        <AzureTerm term={(SECRET_KIND[s.kind] ?? s.kind) === "Client secret" ? "Client secrets" : "Certificates"}>
          <CloudPill tone="muted" dot={false}>
            {SECRET_KIND[s.kind] ?? s.kind}
          </CloudPill>
        </AzureTerm>
      </div>
      <p className={MUTED}>
        Created <RelativeDate iso={s.created_at} /> · expires <RelativeDate iso={s.expires_at} />
      </p>
    </div>
  );
}

function FederatedLine({ e }: { e: AzureFederationEdge }) {
  const a = (e.attrs ?? {}) as Record<string, unknown>;
  const issuer = str(a["issuer_url"]) ?? e.issuer ?? "";
  const ownTenant = /login\.microsoftonline\.com\//i.test(issuer);
  return (
    <div className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{str(a["credential_name"]) ?? "Federated credential"}</span>
        <AzureTerm term="Federated credential">
          <CloudPill tone="muted" dot={false}>
            Federated credential
          </CloudPill>
        </AzureTerm>
      </div>
      <p className={MUTED}>Trusts tokens from {ownTenant ? "Microsoft Entra ID (a managed identity in this tenant)" : issuer || "an issuer not recorded"}</p>
      <p className="break-all font-mono text-[11px] text-muted-foreground">{e.subject}</p>
    </div>
  );
}

/** How the blueprint gets its agents' tokens: its secrets and certificates, and its federated credentials. */
export function BlueprintCredentialsTab({ blueprint }: { blueprint: AzureIdentity }) {
  const secrets = useListAzureSecretsQuery({ identity_id: blueprint.id, limit: LIST_LIMIT });
  const { principal, loading } = useBlueprintPrincipal(blueprint);
  const fed = useListAzureFederationQuery({ identity_id: principal?.id, limit: LIST_LIMIT }, { skip: !principal });
  const federated = (fed.data?.rows ?? []).filter((e) => e.mechanism === "oidc_federation");
  return (
    <div className="space-y-4">
      <Panel
        title={<AzureTerm term="Federated credential">Federated credentials</AzureTerm>}
        count={fed.data ? `${federated.length}` : undefined}
        description="Trust rules that let another identity get this blueprint's tokens without a secret. Foundry uses one that trusts its project's managed identity."
      >
        {loading || fed.isLoading ? (
          <p className={MUTED}>Loading…</p>
        ) : federated.length ? (
          <ul className="divide-y rounded-md border text-[13px]">
            {federated.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <FederatedLine e={e} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={MUTED}>No federated credential was recorded.</p>
        )}
      </Panel>
      <Panel title="Client secrets and certificates" count={secrets.data ? `${secrets.data.rows.length}` : undefined} description="Names and dates only. AuthSec never holds a secret value.">
        <DrawerList query={secrets} empty="None. This blueprint has no client secret or certificate." render={(s: AzureSecret) => <SecretLine s={s} />} />
      </Panel>
    </div>
  );
}

/** The permissions the blueprint holds; inheritable ones pass to every agent identity made from it. */
export function BlueprintPermissionsTab({ blueprint }: { blueprint: AzureIdentity }) {
  const { principal, loading } = useBlueprintPrincipal(blueprint);
  const q = useListAzureGrantsQuery({ identity_id: principal?.id, limit: LIST_LIMIT }, { skip: !principal });
  return (
    <Panel
      title="Permissions"
      count={q.data ? `${q.data.rows.length}` : undefined}
      description="Roles and API permissions granted to this blueprint. Ones it marks inheritable pass to every agent identity made from it."
    >
      {loading ? (
        <p className={MUTED}>Loading…</p>
      ) : principal ? (
        <DrawerList query={q} empty="No role or permission was granted to this blueprint." render={(g: AzureGrant) => <GrantLine g={g} />} />
      ) : (
        <p className={MUTED}>This blueprint has no blueprint principal recorded in this tenant, so it holds no permissions here.</p>
      )}
    </Panel>
  );
}

/** Changes to it, from the Microsoft Entra audit log. */
export function AuditLogTab({ identity }: { identity: AzureIdentity }) {
  const raw = identity.attrs?.["audit_changes"];
  const changes = Array.isArray(raw) ? (raw as AuditChange[]) : [];
  return (
    <Panel title="Audit logs" count={`${changes.length}`} description="Changes to it, from the Microsoft Entra audit log.">
      {changes.length ? (
        <ul className="divide-y rounded-md border text-[13px]">
          {changes.map((c, i) => (
            <li key={c.id ?? i} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>{c.activity ?? "Change"}</span>
              <span className={MUTED}>
                {c.by ? (
                  <>
                    <AzureTerm term={c.by} /> ·{" "}
                  </>
                ) : null}
                <RelativeDate iso={c.at} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={MUTED}>No change was recorded in the audit log.</p>
      )}
    </Panel>
  );
}
