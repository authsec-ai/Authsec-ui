/**
 * Words for the Google Cloud inventory: identity kinds, resource kinds, binding
 * scope levels and the binding facts a reader needs (condition, expiry, role
 * state). Server values are free text, so every lookup falls back to the raw value.
 */

import type { GcpBinding } from "@/app/api/cloudDiscoveryApi";

/** Identity kinds, in the order the filter offers them. */
export const GCP_KIND_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "gcp_service_account", label: "Service accounts" },
  { key: "gcp_user", label: "Users" },
  { key: "gcp_group", label: "Groups" },
  { key: "gcp_service_agent", label: "Service agents" },
  { key: "gcp_federated", label: "Federated" },
  { key: "gcp_domain", label: "Domains" },
  { key: "gcp_public", label: "Public" },
  { key: "gcp_deleted", label: "Deleted" },
  { key: "gcp_project", label: "Projects" },
  { key: "gcp_folder", label: "Folders" },
  { key: "gcp_organization", label: "Organizations" },
];

export const GCP_IDENTITY_LABEL: Record<string, string> = {
  gcp_service_account: "Service account",
  gcp_user: "User",
  gcp_group: "Group",
  gcp_domain: "Domain",
  gcp_public: "Public",
  gcp_federated: "Federated principal",
  gcp_service_agent: "Google service agent",
  gcp_deleted: "Deleted principal",
  gcp_project: "Project",
  gcp_folder: "Folder",
  gcp_organization: "Organization",
};

/** Why a kind is in the list at all: service accounts are listed by Google; the rest are named by a binding. */
export const GCP_IDENTITY_SOURCE: Record<string, string> = {
  gcp_service_account: "Listed by Google Cloud IAM.",
  gcp_project: "A project, not a principal. It holds the project's API keys, and the grants that let someone become every service account in it.",
  gcp_folder: "A folder, not a principal. It holds grants that let someone become every service account beneath it.",
  gcp_organization: "An organization, not a principal. It holds grants that let someone become every service account in it.",
  gcp_user: "Named in an IAM binding. Google Cloud IAM does not list users; directory lookups come later.",
  gcp_group: "Named in an IAM binding. Its members are not expanded yet.",
  gcp_domain: "Named in an IAM binding: every account in the domain holds the role.",
  gcp_public: "Named in an IAM binding: allUsers or allAuthenticatedUsers, anyone on the internet or any Google account.",
  gcp_federated: "Named in an IAM binding: an identity from a workload identity pool (principal:// or principalSet://).",
  gcp_service_agent: "Named in an IAM binding: a Google-managed account that a Google service acts as.",
  gcp_deleted: "Named in an IAM binding, but deleted in Google Cloud. The binding still exists until someone removes it.",
};

export const GCP_RESOURCE_LABEL: Record<string, string> = {
  gcs_bucket: "Cloud Storage bucket",
  bq_dataset: "BigQuery dataset",
  bq_table: "BigQuery table",
  secret: "Secret Manager secret",
  kms_key: "KMS key",
  kms_keyring: "KMS key ring",
  pubsub_topic: "Pub/Sub topic",
  pubsub_subscription: "Pub/Sub subscription",
  run_service: "Cloud Run service",
  cloud_function: "Cloud Function",
  artifact_repo: "Artifact Registry repository",
  sql_instance: "Cloud SQL instance",
  spanner_instance: "Spanner instance",
  service_account: "Service account",
  gcp_resource: "Resource",
};

export const GCP_SCOPE_LABEL: Record<string, string> = {
  organization: "Organization",
  folder: "Folder",
  project: "Project",
  resource: "Resource",
};

/** The short tail of a Cloud Asset name: `//storage.googleapis.com/projects/_/buckets/x` → `buckets/x`. */
export function shortAssetName(full: string | undefined): string {
  if (!full) return "";
  const parts = full.replace(/^\/\/[^/]+\//, "").split("/");
  return parts.length >= 2 ? parts.slice(-2).join("/") : full;
}

/** What a binding is attached to, in words. */
export function attachedText(b: GcpBinding): string {
  const a = b.attrs ?? {};
  if (b.resource_id && (b.resource_name || b.resource_native_id)) {
    return `${GCP_RESOURCE_LABEL[b.resource_kind ?? ""] ?? b.resource_kind ?? "Resource"} ${b.resource_name || shortAssetName(b.resource_native_id)}`;
  }
  const kind = GCP_SCOPE_LABEL[a.gcp_scope_kind ?? ""] ?? a.gcp_scope_kind ?? "Scope";
  return `${kind} ${shortAssetName(a.attached_to) || a.project || ""}`.trim();
}

export type ExpiryState = "none" | "expired" | "expiring" | "active";

/** Expiry from the condition's request.time bound. Recorded, never evaluated: AuthSec does not decide whether Google would allow it. */
export function expiryOf(b: GcpBinding, now = Date.now()): { state: ExpiryState; at?: Date } {
  const raw = b.attrs?.expires_at;
  if (!raw) return { state: "none" };
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return { state: "none" };
  if (at.getTime() <= now) return { state: "expired", at };
  if (at.getTime() - now < 30 * 24 * 3600 * 1000) return { state: "expiring", at };
  return { state: "active", at };
}

/** The condition block as stored: `{title, description, expression}`. */
export function conditionOf(b: GcpBinding): { title?: string; description?: string; expression?: string } | null {
  if (!b.condition) return null;
  try {
    const c = typeof b.condition === "string" ? JSON.parse(b.condition) : b.condition;
    return c && typeof c === "object" ? (c as { title?: string; description?: string; expression?: string }) : null;
  } catch {
    return { expression: String(b.condition) };
  }
}

/** How the role's permissions are known, in words. */
export function roleNote(b: GcpBinding): string | null {
  const a = b.attrs ?? {};
  if (a.role_unresolved) return "Role not found: a deleted or unknown custom role. Its permissions are unknown.";
  if (a.basic_role) return "Basic role: thousands of permissions, not expanded here.";
  if (a.role_state === "unavailable") return "The role could not be read this scan, so its permissions are not listed.";
  return null;
}

/* ─────────────────────────── GCP-4: trust edges ─────────────────────────── */

export const GCP_MECHANISM_LABEL: Record<string, string> = {
  gcp_sa_impersonation: "Impersonation",
  oidc_federation: "Workload identity federation",
  gke_workload_identity: "GKE Workload Identity",
};

export const GCP_SUBJECT_KIND_LABEL: Record<string, string> = {
  identity: "Google identity",
  external_account: "Outside identity",
  ci_pipeline: "CI pipeline",
  k8s_service_account: "Kubernetes service account",
};

export const GCP_CAPABILITY_LABEL: Record<string, string> = {
  act_as: "run workloads as it",
  mint_token: "mint its tokens",
  create_key: "create its keys",
  federate: "exchange an outside token for it",
};

/** What the subject can do, in words: "run workloads as it, mint its tokens". */
export function capabilityText(caps: string[] | undefined): string {
  return (caps ?? []).map((c) => GCP_CAPABILITY_LABEL[c] ?? c).join(", ");
}

/** Whether an identity lies outside the connected scope (kept in attrs for GCP). */
export function isExternalIdentity(attrs: unknown): boolean {
  return !!(attrs && typeof attrs === "object" && (attrs as { is_external?: boolean }).is_external);
}

/* ────────────────────────────── Sensitivity ratings ────────────────────────── */

export const SENSITIVITY_LABEL: Record<string, string> = {
  high: "High",
  med: "Medium",
  low: "Low",
};

/* ──────────────────────────────── Metric tiles ─────────────────────────────── */

/** Build a metric tile label with truncation qualifier when needed. */
export function metricLabel(base: string, truncated: boolean, loadedCount: number): string {
  if (!truncated) return base;
  return `${base} (${loadedCount} loaded)`;
}

/** Extract a readable name from a GCP identity's native_id (resource path). */
export function readableIdentityName(name: string | null | undefined, nativeId: string): string {
  if (name) return name;
  if (!nativeId) return "Unknown";
  if (nativeId.includes("@")) return nativeId;
  const parts = nativeId.split("/");
  return parts[parts.length - 1] || nativeId;
}

/** Extract a short display identifier from a GCP resource path for CopyableId detail. */
export function shortResourceId(nativeId: string): string {
  if (!nativeId) return "";
  // If it's an email, return it as-is
  if (nativeId.includes("@")) return nativeId;
  // For long paths, show the meaningful parts: e.g., "serviceAccount/123" or just "123"
  const parts = nativeId.split("/").filter(p => p && p !== "");
  // Take the last 2 meaningful parts, or just the last 1 if that's all we have
  if (parts.length >= 2 && parts[parts.length - 2] !== "gcp" && parts[parts.length - 2] !== "principal") {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1] || nativeId;
}
