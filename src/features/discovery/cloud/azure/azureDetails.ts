/**
 * The facts worth showing about one Azure object, per kind, in Microsoft's
 * terms: what "Details from Microsoft" lists on an object's page. Each field
 * names the attribute discovery recorded, the label (explained on hover by the
 * Azure glossary) and how its value reads. A field with no value is left out;
 * everything Microsoft returned stays in the raw record below it.
 */

export type DetailFormat =
  | { as: "text" }
  | { as: "id" }
  | { as: "date" }
  | { as: "count" }
  | { as: "yes_no" }
  | { as: "words"; words: Record<string, string> };

export interface DetailField {
  key: string;
  label: string;
  format: DetailFormat;
  /** Only shown when this says so (e.g. a flag only when it is set). */
  when?: (v: unknown) => boolean;
}

const text: DetailFormat = { as: "text" };
const id: DetailFormat = { as: "id" };
const date: DetailFormat = { as: "date" };
const count: DetailFormat = { as: "count" };
const yesNo: DetailFormat = { as: "yes_no" };

const MANAGED_IDENTITY_TYPE: DetailFormat = { as: "words", words: { system_assigned: "System-assigned", user_assigned: "User-assigned" } };

const IDENTITY_FIELDS: Record<string, DetailField[]> = {
  entra_agent_identity: [
    { key: "agent_blueprint_name", label: "Agent identity blueprint", format: text },
    { key: "disabled_by_microsoft", label: "Disabled by Microsoft", format: yesNo, when: (v) => v === true },
  ],
  entra_service_principal: [
    { key: "app_id", label: "Application (client) ID", format: id },
    { key: "microsoft_first_party", label: "Microsoft app", format: yesNo },
    { key: "last_app_only_sign_in_at", label: "Last sign-in as itself", format: date },
    { key: "last_delegated_sign_in_at", label: "Last sign-in for a user", format: date },
  ],
  entra_application: [
    { key: "app_id", label: "Application (client) ID", format: id },
    {
      key: "sign_in_audience",
      label: "Who can sign in",
      format: {
        as: "words",
        words: {
          AzureADMyOrg: "This organization only",
          AzureADMultipleOrgs: "Any Microsoft Entra organization",
          AzureADandPersonalMicrosoftAccount: "Any organization and personal Microsoft accounts",
          PersonalMicrosoftAccount: "Personal Microsoft accounts only",
        },
      },
    },
    { key: "agent_count", label: "Agent identities", format: count },
    { key: "secret_count", label: "Client secrets", format: count },
    { key: "certificate_count", label: "Certificates", format: count },
    { key: "publisher_domain", label: "Publisher domain", format: text },
  ],
  entra_managed_identity: [
    { key: "managed_identity_assignment", label: "Managed identity type", format: MANAGED_IDENTITY_TYPE },
    { key: "managed_identity_resource", label: "Azure resource", format: id },
    { key: "app_id", label: "Application (client) ID", format: id },
    { key: "last_app_only_sign_in_at", label: "Last sign-in as itself", format: date },
  ],
  entra_user: [
    { key: "user_principal_name", label: "User principal name", format: text },
    { key: "mail", label: "Email", format: text },
    { key: "user_type", label: "User type", format: { as: "words", words: { Member: "Member", Guest: "Guest" } } },
    {
      key: "external_user_state",
      label: "Guest invitation",
      format: { as: "words", words: { PendingAcceptance: "Not accepted yet", Accepted: "Accepted" } },
      when: (v) => typeof v === "string" && v !== "",
    },
  ],
  entra_group: [
    { key: "description", label: "Description", format: text },
    { key: "member_count", label: "Members", format: count },
    { key: "role_assignable", label: "Can hold Microsoft Entra roles", format: yesNo },
  ],
};

const WORKLOAD_FIELDS: DetailField[] = [
  { key: "identity_assignment", label: "Managed identity type", format: MANAGED_IDENTITY_TYPE },
  { key: "endpoint", label: "Endpoint", format: id },
  { key: "sku", label: "Pricing tier", format: text },
  { key: "public_network_access", label: "Public network access", format: { as: "words", words: { Enabled: "Enabled", Disabled: "Disabled", SecuredByPerimeter: "Secured by a network perimeter" } } },
  { key: "network_default_action", label: "Network rules", format: { as: "words", words: { Allow: "All networks allowed", Deny: "Selected networks only" } } },
  { key: "local_auth_enabled", label: "API key access", format: { as: "words", words: { true: "Allowed", false: "Off: Microsoft Entra ID only" } } },
  { key: "restrict_outbound_network", label: "Outbound network restricted", format: yesNo },
  { key: "is_default", label: "Default project", format: yesNo },
];

export function identityDetailFields(kind: string): DetailField[] {
  return IDENTITY_FIELDS[kind] ?? [];
}

export function workloadDetailFields(): DetailField[] {
  return WORKLOAD_FIELDS;
}

/** A field's value as words, or null when it has none (or its `when` says no). */
export function detailText(field: DetailField, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (field.when && !field.when(v)) return null;
  switch (field.format.as) {
    case "yes_no":
      return typeof v === "boolean" ? (v ? "Yes" : "No") : null;
    case "count":
      return typeof v === "number" ? v.toLocaleString() : null;
    case "words":
      return field.format.words[String(v)] ?? String(v);
    default:
      return typeof v === "string" || typeof v === "number" ? String(v) : null;
  }
}

/**
 * Where Microsoft Foundry placed an agent identity, from the tags Foundry sets
 * on it ("projectName:…", "accountName:…", "resourceGroup:…", "subscriptionId:…").
 */
export function foundryPlacement(tags: unknown): { label: string; value: string }[] {
  if (!Array.isArray(tags)) return [];
  const byKey = new Map<string, string>();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const i = t.indexOf(":");
    if (i > 0) byKey.set(t.slice(0, i), t.slice(i + 1));
  }
  const out: { label: string; value: string }[] = [];
  const add = (key: string, label: string) => {
    const v = byKey.get(key);
    if (v) out.push({ label, value: v });
  };
  add("projectName", "Foundry project");
  add("accountName", "Foundry resource");
  add("resourceGroup", "Resource group");
  add("subscriptionId", "Subscription");
  return out;
}
