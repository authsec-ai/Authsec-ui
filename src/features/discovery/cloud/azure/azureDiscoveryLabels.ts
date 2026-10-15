import type { AzureIdentity, CloudConnector } from "@/app/api/cloudDiscoveryApi";

/** Identity kinds the Entra pass writes (`models.CloudIdentityEntra*`). */
export const AZURE_IDENTITY_KINDS = [
  "entra_user",
  "entra_group",
  "entra_application",
  "entra_service_principal",
  "entra_managed_identity",
  "entra_agent_identity",
  "entra_agent_user",
] as const;

const IDENTITY_KIND_LABEL: Record<string, string> = {
  entra_user: "User",
  entra_group: "Group",
  entra_application: "App registration",
  entra_service_principal: "Service principal",
  entra_managed_identity: "Managed identity",
  entra_agent_identity: "Agent identity",
  entra_agent_user: "Agent user",
};

/** The Identities filter: agents first, since they are what Agent ID adds, then
 * the directory's other kinds. A blueprint and its principal are an
 * application and a service principal marked by attrs.agent_type. */
export const IDENTITY_FILTERS: { key: string; label: string; kind: string; agentType?: string }[] = [
  { key: "entra_agent_identity", label: "Agent identities", kind: "entra_agent_identity" },
  { key: "agent_identity_blueprint", label: "Agent blueprints", kind: "entra_application", agentType: "agent_identity_blueprint" },
  {
    key: "agent_identity_blueprint_principal",
    label: "Agent blueprint principals",
    kind: "entra_service_principal",
    agentType: "agent_identity_blueprint_principal",
  },
  { key: "entra_agent_user", label: "Agent users", kind: "entra_agent_user" },
  { key: "entra_user", label: "Users", kind: "entra_user" },
  { key: "entra_group", label: "Groups", kind: "entra_group" },
  { key: "entra_application", label: "App registrations", kind: "entra_application" },
  { key: "entra_service_principal", label: "Service principals", kind: "entra_service_principal" },
  { key: "entra_managed_identity", label: "Managed identities", kind: "entra_managed_identity" },
];

export function identityKindLabel(kind: string): string {
  return IDENTITY_KIND_LABEL[kind] ?? kind;
}

/** A blueprint is an app registration and its principal a service principal;
 * Agent ID marks both in `attrs.agent_type`. */
// Microsoft's full names; "agent blueprint" is the short form its own
// Conditional Access picker uses, so the filters above use that.
const AGENT_TYPE_LABEL: Record<string, string> = {
  agent_identity_blueprint: "Agent identity blueprint",
  agent_identity_blueprint_principal: "Agent identity blueprint principal",
};

export function agentTypeLabel(identity: Pick<AzureIdentity, "attrs">): string | undefined {
  const t = identity.attrs?.["agent_type"];
  return typeof t === "string" ? AGENT_TYPE_LABEL[t] ?? t : undefined;
}

const GRANT_SOURCE_LABEL: Record<string, string> = {
  directory_role: "Microsoft Entra role",
  application_permission: "Application permission",
  delegated_permission: "Delegated permission",
  rbac_role_assignment: "Azure role assignment",
  key_vault_access_policy: "Key Vault access policy",
};

export function grantSourceLabel(source: string): string {
  return GRANT_SOURCE_LABEL[source] ?? source;
}

const MECHANISM_LABEL: Record<string, string> = {
  oidc_federation: "Federated credential",
  entra_app_owner: "Owner",
  entra_app_registration: "Its application's credentials",
  agent_identity_blueprint: "Agent identity blueprint",
  agent_user: "Agent's user account",
};

export function mechanismLabel(m: string): string {
  return MECHANISM_LABEL[m] ?? m;
}

/** An ARM resource type ("microsoft.keyvault/vaults") as its last segment
 * ("vaults") with the provider namespace beside it; the raw type is always in
 * the row's detail. */
export function armTypeLabel(type: string): string {
  const [ns, ...rest] = type.split("/");
  if (!rest.length) return type;
  return `${rest.join("/")} (${ns.replace(/^microsoft\./i, "")})`;
}

/** A connector's name for the Source filter and the Subscription column. */
export function connectorLabel(c: CloudConnector | undefined): string {
  if (!c) return "Unknown";
  const attrs = (c.attrs ?? {}) as Record<string, unknown>;
  const name = typeof attrs["display_name"] === "string" ? (attrs["display_name"] as string) : "";
  if (c.scope_kind === "tenant") return `Tenant ${c.scope_id}`;
  return name || c.scope_id;
}

/** Turns an attrs key into words: "user_principal_name" → "User principal name". */
export function attrLabel(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type AzureDiscoveryType = "agents" | "identities" | "resources" | "workloads";

/** The connectors that own rows of a type: the tenant for identities, subscriptions otherwise. */
export function azureSourcesFor(connectors: CloudConnector[], type: AzureDiscoveryType): CloudConnector[] {
  const kind = type === "identities" || type === "agents" ? "tenant" : "subscription";
  return connectors.filter((c) => c.scope_kind === kind && c.status !== "revoked");
}

/** The source in the URL, only when it is a connector of the right kind for this type. */
export function azureSourceFor(connectors: CloudConnector[], type: AzureDiscoveryType, source: string | null | undefined): string | undefined {
  return source && azureSourcesFor(connectors, type).some((c) => c.id === source) ? source : undefined;
}

/** A person or app recorded on an object: an owner, a sponsor, a creator. */
export interface DirectoryRef {
  id: string;
  kind?: string;
  name?: string;
  active?: boolean;
}

/** `attrs[key]` as a list of directory references; [] when absent or not a list. */
export function refsOf(attrs: Record<string, unknown> | null | undefined, key: string): DirectoryRef[] {
  const v = attrs?.[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is DirectoryRef => !!x && typeof x === "object" && typeof (x as DirectoryRef).id === "string");
}
