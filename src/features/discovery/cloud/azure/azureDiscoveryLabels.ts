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
  entra_user: "Person (user)",
  entra_group: "Team (group)",
  entra_application: "App definition (app registration)",
  entra_service_principal: "App login (service principal)",
  entra_managed_identity: "Azure-run login (managed identity)",
  entra_agent_identity: "AI agent",
  entra_agent_user: "User account of an AI agent",
};

/** The Identities filter: agents first, since they are what Agent ID adds, then
 * the directory's other kinds. A blueprint and its principal are an
 * application and a service principal marked by attrs.agent_type. */
export const IDENTITY_FILTERS: { key: string; label: string; kind: string; agentType?: string }[] = [
  { key: "entra_agent_identity", label: "AI agents", kind: "entra_agent_identity" },
  { key: "agent_identity_blueprint", label: "Agent templates", kind: "entra_application", agentType: "agent_identity_blueprint" },
  {
    key: "agent_identity_blueprint_principal",
    label: "Template logins",
    kind: "entra_service_principal",
    agentType: "agent_identity_blueprint_principal",
  },
  { key: "entra_agent_user", label: "AI agent user accounts", kind: "entra_agent_user" },
  { key: "entra_user", label: "People (users)", kind: "entra_user" },
  { key: "entra_group", label: "Teams (groups)", kind: "entra_group" },
  { key: "entra_application", label: "App definitions", kind: "entra_application" },
  { key: "entra_service_principal", label: "App logins", kind: "entra_service_principal" },
  { key: "entra_managed_identity", label: "Azure-run logins", kind: "entra_managed_identity" },
];

/** What a raw code shows as when it has no plain label: never the code itself. */
export const OTHER_LABEL = "Other (not yet described)";

export function identityKindLabel(kind: string): string {
  return IDENTITY_KIND_LABEL[kind] ?? OTHER_LABEL;
}

/** A blueprint is an app registration and its principal a service principal;
 * Agent ID marks both in `attrs.agent_type`. */
// Microsoft's full names; "agent blueprint" is the short form its own
// Conditional Access picker uses, so the filters above use that.
const AGENT_TYPE_LABEL: Record<string, string> = {
  agent_identity_blueprint: "Agent template",
  agent_identity_blueprint_principal: "Template login",
};

export function agentTypeLabel(identity: Pick<AzureIdentity, "attrs">): string | undefined {
  const t = identity.attrs?.["agent_type"];
  return typeof t === "string" ? AGENT_TYPE_LABEL[t] ?? t : undefined;
}

const GRANT_SOURCE_LABEL: Record<string, string> = {
  directory_role: "Directory role",
  application_permission: "Granted to the app itself",
  delegated_permission: "Granted by a person",
  rbac_role_assignment: "Azure permission",
  key_vault_access_policy: "Key Vault access list",
};

export function grantSourceLabel(source: string): string {
  return GRANT_SOURCE_LABEL[source] ?? OTHER_LABEL;
}

const MECHANISM_LABEL: Record<string, string> = {
  oidc_federation: "Trusted outside sign-in",
  entra_app_owner: "Owner",
  entra_app_registration: "The app's own password or certificate",
  agent_identity_blueprint: "Agent template",
  agent_user: "The agent's user account",
};

export function mechanismLabel(m: string): string {
  return MECHANISM_LABEL[m] ?? OTHER_LABEL;
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
  "microsoft.containerservice/managedclusters": "Kubernetes cluster (AKS)",
  "microsoft.compute/virtualmachines": "Virtual machine",
  "microsoft.compute/virtualmachinescalesets": "Virtual machine scale set",
  "microsoft.web/sites": "Web app or function app",
  "microsoft.app/containerapps": "Container app",
  "microsoft.app/jobs": "Container Apps job",
  "microsoft.logic/workflows": "Logic app",
  "microsoft.botservice/botservices": "Azure Bot",
  "microsoft.cognitiveservices/accounts": "AI service account (Microsoft Foundry)",
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
  return ARM_TYPE_NAME[type.toLowerCase()] ?? "Other Azure resource";
}

/** What each coverage surface of an Azure scan reads, in Microsoft's terms.
 * Keys are the backend's `Surface*` names; an unknown key shows as written. */
const SURFACE_LABEL: Record<string, string> = {
  users: "People (user accounts)",
  groups: "Teams (groups)",
  group_members: "Team memberships",
  applications: "Apps (app definitions)",
  service_principals: "App logins (enterprise apps)",
  directory_roles: "Directory admin roles",
  app_role_assignments: "Permissions granted to apps",
  delegated_permission_grants: "Permissions granted by users",
  federated_credentials: "Outside sign-ins trusted to act as a login",
  sign_in_activity: "Sign-in activity",
  credential_activity: "Sign-ins using passwords or certificates",
  sign_ins: "Sign-ins by app logins",
  licenses: "Licences",
  app_management_policies: "App security rules",
  conditional_access: "Sign-in rules (Conditional Access)",
  agent_identities: "AI agent logins",
  agent_blueprints: "Agent templates",
  agent_blueprint_principals: "Template logins",
  agent_users: "User accounts of AI agents",
  owners: "Owners",
  agent_sponsors: "Sponsors of AI agents",
  agent_inheritable_permissions: "Permissions agents inherit from their template",
  agent_registry: "Microsoft 365 agent list (Copilot)",
  agent_audit: "Changes made to AI agents",
  teams_apps: "Teams bots (includes Copilot Studio agents)",
  resources: "Resources",
  resource_containers: "Labels on subscriptions and resource groups",
  role_assignments: "Azure permissions",
  key_vault_access_policies: "Key Vault access rules",
  workloads: "Resources running as an Azure-run login",
  managed_identity_federated_credentials: "Outside sign-ins trusted by Azure-run logins",
  foundry: "Microsoft Foundry (AI projects)",
  foundry_agents: "AI agents in Microsoft Foundry projects",
  public_ips: "Public IP addresses",
  activity_log: "Azure activity log",
};

export function surfaceLabel(key: string): string {
  return SURFACE_LABEL[key] ?? "Other area (not yet described)";
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
  account: "AI service account",
  project: "AI project",
  hub: "AI hub",
  hub_project: "AI project in a hub",
  ml_workspace: "Machine learning workspace",
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
    return tenant || `Directory ${shortId(c.scope_id)} (name not read)`;
  }
  return name || shortId(c.scope_id);
}

/** Plain labels for the attribute keys Microsoft returns (the copy dictionary, section 4). */
const ATTR_LABEL: Record<string, string> = {
  object_id: "Technical ID",
  agent_blueprint_app_id: "Template app ID (technical)",
  agent_blueprint_id: "Template ID (technical)",
  owners: "Owners",
  sponsors: "Sponsors",
  created_by: "Created by",
  audit_changes: "Recent directory changes",
  agent_listed: "Listed as an agent",
  agent_type: "Agent type",
  agent_blueprint_name: "Template name",
  agent_count: "AI agents created",
  app_id: "App ID",
  publisher_domain: "Publisher website",
  enabled: "Switched on",
  last_sign_in_at: "Last sign-in",
  region: "Region",
  tenant_display_name: "Directory name",
  display_name: "Name",
  user_principal_name: "Sign-in name",
  principal_id: "Technical ID",
  account_id: "AI service account",
  hub_id: "Hub",
  resource_id: "Resource ID",
  foundry_kind: "AI type",
  deployments: "AI models deployed",
  connections: "Connections",
  agent_applications: "Agent apps",
  agent_applications_unavailable: "Agent apps not readable",
  detail_incomplete: "Some detail not read",
  public_network_access: "Reachable from the internet",
  local_auth_enabled: "Shared-key sign-in allowed",
  sku: "Pricing tier",
  sku_name: "Pricing tier",
  is_default: "Default project",
  endpoint: "Endpoint",
  trusted_agent_type: "Agent type of the trusted login",
  trusted_kind: "Kind of the trusted login",
  trusted_identity_id: "Trusted login ID",
  subject: "Subject",
  issuer: "Issuer",
  mechanism: "How it is trusted",
  expires_at: "Expires",
  created_at: "Created",
  source_api: "Source (Microsoft service)",
  scope: "Scope",
  role_definition_id: "Azure role",
  principal_type: "Kind of login",
  custom_security_attributes: "Custom attributes",
  sign_in_audience: "Who can sign in",
  identifier_uris: "Identifier addresses",
  redirect_uris: "Return addresses",
  tags: "Tags",
  kind: "Kind",
};

/** An attribute key in plain words; a key with no label is spelled out, never shown as code. */
export function attrLabel(key: string): string {
  if (ATTR_LABEL[key]) return ATTR_LABEL[key];
  const s = key.replace(/_/g, " ").trim();
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
