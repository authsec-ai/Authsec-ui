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

/**
 * The tabs an Azure identity's page shows past Overview, Access Graph and
 * Evidence: only those Microsoft makes possible for its kind, so no tab is
 * always empty.
 *   credentials   client secrets and certificates: app registrations and service
 *                 principals only (an agent identity has none of its own; its
 *                 blueprint holds them, and Azure manages a managed identity's)
 *   token-access  who can act as it: anything but a user or a group
 *   activity      sign-ins: anything that signs in (not a group or an app registration)
 *   workloads     Azure resources signing in as it: managed identities only
 */
export function identityTabKeys(kind: string): string[] {
  const keys = ["access"];
  if (kind === "entra_application" || kind === "entra_service_principal") keys.push("credentials");
  if (kind !== "entra_user" && kind !== "entra_group") keys.push("token-access");
  if (kind !== "entra_group" && kind !== "entra_application") keys.push("activity");
  if (kind === "entra_managed_identity") keys.push("workloads");
  return keys;
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

/** The ARM resource types Azure discovery reads, in Microsoft's own product
 * names. Keys are lowercased, as the backend writes types. */
const ARM_TYPE_NAME: Record<string, string> = {
  "microsoft.keyvault/vaults": "Key Vault",
  "microsoft.keyvault/managedhsms": "Key Vault Managed HSM",
  "microsoft.storage/storageaccounts": "Storage account",
  "microsoft.sql/servers": "SQL server",
  "microsoft.sql/servers/databases": "SQL database",
  "microsoft.sql/managedinstances": "SQL Managed Instance",
  "microsoft.dbforpostgresql/servers": "Azure Database for PostgreSQL server",
  "microsoft.dbforpostgresql/flexibleservers": "Azure Database for PostgreSQL flexible server",
  "microsoft.dbformysql/servers": "Azure Database for MySQL server",
  "microsoft.dbformysql/flexibleservers": "Azure Database for MySQL flexible server",
  "microsoft.documentdb/databaseaccounts": "Azure Cosmos DB account",
  "microsoft.cache/redis": "Azure Cache for Redis",
  "microsoft.servicebus/namespaces": "Service Bus namespace",
  "microsoft.eventhub/namespaces": "Event Hubs namespace",
  "microsoft.eventgrid/topics": "Event Grid topic",
  "microsoft.search/searchservices": "Azure AI Search service",
  "microsoft.containerregistry/registries": "Container registry",
  "microsoft.containerinstance/containergroups": "Container instance",
  "microsoft.containerservice/managedclusters": "AKS cluster",
  "microsoft.compute/virtualmachines": "Virtual machine",
  "microsoft.compute/virtualmachinescalesets": "Virtual machine scale set",
  "microsoft.web/sites": "App Service or Function app",
  "microsoft.app/containerapps": "Container app",
  "microsoft.app/jobs": "Container Apps job",
  "microsoft.logic/workflows": "Logic app",
  "microsoft.botservice/botservices": "Azure Bot",
  "microsoft.cognitiveservices/accounts": "Foundry or Azure AI services account",
  "microsoft.cognitiveservices/accounts/projects": "Foundry project",
  "microsoft.machinelearningservices/workspaces": "Machine Learning workspace",
  "microsoft.managedidentity/userassignedidentities": "User-assigned managed identity",
  "microsoft.network/publicipaddresses": "Public IP address",
  "microsoft.network/networkinterfaces": "Network interface",
  "microsoft.network/networksecuritygroups": "Network security group",
  "microsoft.network/virtualnetworks": "Virtual network",
  "microsoft.network/virtualnetworkgateways": "Virtual network gateway",
  "microsoft.network/natgateways": "NAT gateway",
  "microsoft.network/networkwatchers": "Network Watcher",
  "microsoft.network/loadbalancers": "Load balancer",
  "microsoft.network/applicationgateways": "Application gateway",
  "microsoft.network/privateendpoints": "Private endpoint",
  "microsoft.network/privatednszones": "Private DNS zone",
  "microsoft.network/dnszones": "DNS zone",
  "microsoft.network/routetables": "Route table",
  "microsoft.network/bastionhosts": "Azure Bastion",
  "microsoft.compute/disks": "Managed disk",
  "microsoft.compute/snapshots": "Disk snapshot",
  "microsoft.compute/sshpublickeys": "SSH public key",
  "microsoft.compute/availabilitysets": "Availability set",
  "microsoft.web/serverfarms": "App Service plan",
  "microsoft.insights/components": "Application Insights",
  "microsoft.operationalinsights/workspaces": "Log Analytics workspace",
};

/** An ARM resource type ("microsoft.keyvault/vaults") in words: Microsoft's
 * product name when it is one discovery reads ("Key Vault"), else its last
 * segment with the provider namespace beside it ("vaults (keyvault)"). The raw
 * type is always in the row's detail. */
export function armTypeLabel(type: string): string {
  const known = ARM_TYPE_NAME[type.toLowerCase()];
  if (known) return known;
  const [ns, ...rest] = type.split("/");
  if (!rest.length) return type;
  return `${rest.join("/")} (${ns.replace(/^microsoft\./i, "")})`;
}

/** What each coverage surface of an Azure scan reads, in Microsoft's terms.
 * Keys are the backend's `Surface*` names; an unknown key shows as written. */
const SURFACE_LABEL: Record<string, string> = {
  users: "Users",
  groups: "Groups",
  group_members: "Group memberships",
  applications: "Applications (app registrations)",
  service_principals: "Service principals (enterprise applications)",
  directory_roles: "Microsoft Entra role assignments",
  app_role_assignments: "Application permissions",
  delegated_permission_grants: "Delegated permissions",
  federated_credentials: "Federated identity credentials",
  sign_in_activity: "Sign-in activity",
  credential_activity: "Credential sign-in activity",
  sign_ins: "Service principal sign-ins",
  licenses: "Licences",
  app_management_policies: "App management policies",
  conditional_access: "Conditional Access policies",
  agent_identities: "Agent identities",
  agent_blueprints: "Agent identity blueprints",
  agent_blueprint_principals: "Agent identity blueprint principals",
  agent_users: "Agents' user accounts",
  owners: "Owners",
  agent_sponsors: "Agent sponsors",
  agent_inheritable_permissions: "Agent inheritable permissions",
  agent_registry: "Microsoft 365 agent registry (Copilot packages)",
  agent_audit: "Agent audit log",
  teams_apps: "Teams apps with a bot (Copilot Studio agents and custom bots)",
  resources: "Resources",
  resource_containers: "Subscription and resource group tags",
  role_assignments: "Azure role assignments",
  key_vault_access_policies: "Key Vault access policies",
  workloads: "Resources running as a managed identity",
  managed_identity_federated_credentials: "Managed identity federated identity credentials",
  foundry: "Microsoft Foundry",
  foundry_agents: "Microsoft Foundry project agents (data plane)",
  public_ips: "Public IP addresses",
  activity_log: "Azure Activity Log",
};

export function surfaceLabel(key: string): string {
  return SURFACE_LABEL[key] ?? key.replace(/_/g, " ");
}

/** `iga_entitlements.native_grant_kind` of an Azure entitlement. */
const ENTITLEMENT_KIND_LABEL: Record<string, string> = {
  entra_app_role: "Application permission",
  entra_delegated_scope: "Delegated permission",
  entra_directory_role: "Microsoft Entra role",
  key_vault_access_policy: "Key Vault access policy",
  azure_role_definition: "Azure role",
};

/** `iga_access_edges.path_kind` of an Azure grant. */
const GRANT_PATH_LABEL: Record<string, string> = {
  entra_app_permission: "Application permission",
  entra_delegated_permission: "Delegated permission",
  entra_directory_role: "Microsoft Entra role assignment",
  key_vault_access_policy: "Key Vault access policy",
  azure_rbac: "Azure role assignment",
};

/** `iga_relationship.relationship_type` written by Azure discovery. */
const RELATIONSHIP_LABEL: Record<string, string> = {
  member_of: "Group membership",
  executes_as: "Resource runs as an identity",
  can_assume: "Can obtain another identity's tokens",
};

const CREDENTIAL_KIND_LABEL: Record<string, string> = { entra_client_secret: "Client secret", entra_certificate: "Certificate" };

/** One kind of one table of the Azure graph summary, in words. */
export function graphKindLabel(table: string, kind: string): string {
  switch (table) {
    case "identity":
      return identityKindLabel(kind);
    case "resource":
      return ENTITLEMENT_KIND_LABEL[kind] ?? armTypeLabel(kind);
    case "workload":
      return armTypeLabel(kind);
    case "entitlement":
      return ENTITLEMENT_KIND_LABEL[kind] ?? kind;
    case "credential":
      return CREDENTIAL_KIND_LABEL[kind] ?? kind;
    case "access_edge":
      return GRANT_PATH_LABEL[kind] ?? kind;
    case "relationship":
      return RELATIONSHIP_LABEL[kind] ?? kind;
    default:
      return kind;
  }
}

/** `attrs.foundry_kind` of a Foundry workload. */
const FOUNDRY_KIND_LABEL: Record<string, string> = {
  account: "Foundry resource",
  project: "Foundry project",
  hub: "Foundry hub",
  hub_project: "Hub-based project",
  ml_workspace: "Machine Learning workspace",
};

export function foundryKindLabel(kind: string | undefined, runtimeKind: string): string {
  return (kind && FOUNDRY_KIND_LABEL[kind]) || armTypeLabel(runtimeKind);
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A full id as a readable stub: `3f1c6a52…1b0d7c3`. Anything that is not a GUID is returned as written. */
export function shortId(id: string): string {
  return GUID.test(id) ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

/** A connector's name for the Source filter and the Subscription column: a name where one was read, else the id as a stub. */
export function connectorLabel(c: CloudConnector | undefined): string {
  if (!c) return "Unknown";
  const attrs = (c.attrs ?? {}) as Record<string, unknown>;
  const name = typeof attrs["display_name"] === "string" ? (attrs["display_name"] as string) : "";
  if (c.scope_kind === "tenant") {
    const tenant = typeof attrs["tenant_display_name"] === "string" ? (attrs["tenant_display_name"] as string) : "";
    return tenant || `Tenant ${shortId(c.scope_id)}`;
  }
  return name || shortId(c.scope_id);
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
