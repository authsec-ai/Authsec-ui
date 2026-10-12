import type { SyncConfig } from "@/app/api/syncConfigsApi";
import type { ADConfigFormData } from "./ADConfigForm";
import type { EntraConfigFormData } from "./EntraConfigForm";

// Directory-sync form state. New configurations start secure (LDAPS on,
// certificates verified). Editing loads the stored row's flat columns; the
// secrets are write-only and start empty, and an empty secret on update keeps
// the stored one.

export const AD_DEFAULTS: ADConfigFormData = {
  config_name: "",
  description: "",
  server: "",
  username: "",
  password: "",
  base_dn: "CN=Users,DC=company,DC=com",
  filter: "(&(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
  use_ssl: true,
  skip_verify: false,
};

export const ENTRA_DEFAULTS: EntraConfigFormData = {
  config_name: "",
  description: "",
  workspace_id: "",
  client_id: "",
  client_secret: "",
};

export function hydrateADForm(source: SyncConfig): ADConfigFormData {
  const ad = source.ad_config;
  return {
    ...AD_DEFAULTS,
    config_name: source.config_name || "",
    description: source.description || "",
    server: ad?.server || source.ad_server || "",
    username: ad?.username || source.ad_username || "",
    password: "",
    base_dn: ad?.base_dn || source.ad_base_dn || AD_DEFAULTS.base_dn,
    filter: ad?.filter || source.ad_filter || AD_DEFAULTS.filter,
    use_ssl: ad?.use_ssl ?? source.ad_use_ssl ?? AD_DEFAULTS.use_ssl,
    skip_verify: ad?.skip_verify ?? source.ad_skip_verify ?? AD_DEFAULTS.skip_verify,
  };
}

/** The Entra form of a stored configuration. Its tenant is the Entra
 *  directory id (entra_tenant_id), never the AuthSec workspace id, and its
 *  client id is the app registration's, never the AuthSec client's. */
export function hydrateEntraForm(source: SyncConfig): EntraConfigFormData {
  const entra = source.entra_config;
  return {
    ...ENTRA_DEFAULTS,
    config_name: source.config_name || "",
    description: source.description || "",
    workspace_id: entra?.workspace_id || source.entra_tenant_id || "",
    client_id: entra?.client_id || source.entra_client_id || "",
    client_secret: "",
  };
}

/** The tenant or server a configuration points at, for the list. */
export function syncConfigTarget(cfg: SyncConfig): string {
  return cfg.sync_type === "entra_id"
    ? cfg.entra_config?.workspace_id || cfg.entra_tenant_id || ""
    : cfg.ad_config?.server || cfg.ad_server || "";
}
