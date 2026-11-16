/**
 * One Google Cloud service account from Discovery — `/iga/gcp/identity/:id[/:tab]`
 * — on the same shell as the AWS, Kubernetes and Azure object pages.
 *
 * It replaces the side drawer the Google Cloud list used to open. The drawer was
 * the AWS identity drawer, with seven AWS tabs (trust, permissions, compute,
 * activity, events…) that Google Cloud discovery does not collect yet, so most of
 * it read as empty. This page says only what the Google Cloud scan records: who
 * the service account is, where it lives, and its user-managed keys.
 *
 * THE ID IN THE URL is AuthSec's own `cloud_identity` id (not the email or the
 * unique id), read back through the identities list's `id` filter so a link opens
 * the same object whatever page of the list it was on.
 */

import { formatDistanceToNow } from "date-fns";
import { KeyRound } from "lucide-react";
import { useParams } from "react-router-dom";

import {
  useListGcpIdentitiesQuery,
  useListAwsSecretsQuery,
  useListGcpConnectorsQuery,
  AWS_DISCOVERY_MAX_LIMIT,
  type CloudIdentity,
  type CloudSecret,
} from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { DetailGrid, DetailRow, DrawerEmpty } from "@/components/console/detail";
import { ObjectShell, type ObjectHeaderData, type ObjectTabDef } from "@/features/iga/shared/components/ObjectShell";
import type { GraphFailure } from "@/features/iga/shared/graphErrors";
import { dayText } from "@/features/iga/shared/labels";
import { activeTabOf } from "@/features/iga/shared/links";
import { getWorkspaceId } from "@/utils/workspace";

import { CloudPill } from "../CloudPill";
import { GcpBindingsList } from "./GcpBindingsList";
import { GcpTrustList } from "./GcpTrustList";
import { GCP_IDENTITY_LABEL, GCP_IDENTITY_SOURCE, isExternalIdentity } from "./gcpInventoryLabels";

const TABS: ObjectTabDef[] = [
  {
    key: "overview",
    label: "Overview",
    path: "",
    hint: "Who and what it is: its email, ids, project and status, as Google Cloud records them.",
  },
  {
    key: "access",
    label: "Access",
    path: "/access",
    hint: "Its IAM bindings: which role, on what, under which condition, where the binding is attached.",
  },
  {
    key: "trust",
    label: "Trust",
    path: "/trust",
    hint: "Who can become it (impersonation, federation, GKE Workload Identity), and what it can become.",
  },
  {
    key: "keys",
    label: "Keys",
    path: "/keys",
    hint: "Its keys (service-account keys, HMAC keys, API keys): ids, dates and status only. AuthSec never holds a key value.",
  },
];

/** Kinds that can hold keys: a service account (SA and HMAC keys) and the project row that owns API keys. */
const KEY_HOLDERS = new Set(["gcp_service_account", "gcp_project"]);

/** What the Google Cloud scan stores on a service account (`models.GCPIdentityAttrs`). */
interface GcpIdentityAttrs {
  unique_id?: string;
  email?: string;
  project_id?: string;
  project_number?: string;
  description?: string;
  oauth2_client_id?: string;
  disabled?: boolean;
}

/** What it stores on a key (`models.GCPSecretAttrs`). */
interface GcpKeyAttrs {
  key_origin?: string;
  key_algorithm?: string;
  key_type?: string;
  disable_reason?: string;
}

/** An unknown date is "Unknown", never "never": a missing value is a gap in what was read. */
function relativeOrUnknown(iso: string | null | undefined): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Unknown";
}

function absolute(iso: string | null | undefined): string | undefined {
  return iso ? new Date(iso).toLocaleString() : undefined;
}

function failureOf(error: Parameters<typeof loadFailureOf>[0]): GraphFailure | null {
  const f = loadFailureOf(error);
  if (!f) return null;
  return f === "forbidden" ? { kind: "unauthorized" } : f === "not_found" ? { kind: "not_found" } : { kind: "failed" };
}

export default function GcpIdentityPage() {
  const { id = "", tab } = useParams<{ id: string; tab?: string }>();
  const ws = getWorkspaceId() ?? "";

  const idQ = useListGcpIdentitiesQuery({ id, limit: 1 }, { skip: !id });
  const connectorsQ = useListGcpConnectorsQuery();

  const identity: CloudIdentity | undefined = idQ.data?.rows.find((r) => r.id === id);
  const connector = (connectorsQ.data ?? []).find((c) => c.id === identity?.connector_id);
  const attrs = (identity?.attrs ?? {}) as GcpIdentityAttrs;

  // Not found is only said once the read has succeeded and the row is not in it: a
  // failed request is never "Not found".
  const failure: GraphFailure | null = failureOf(idQ.error) ?? (idQ.isSuccess && !identity ? { kind: "not_found" } : null);
  const retry = () => void idQ.refetch();

  const tabs = identity && !KEY_HOLDERS.has(identity.kind) ? TABS.filter((t) => t.key !== "keys") : TABS;
  const activeTab = activeTabOf(tabs, tab);
  const kindLabel = identity ? (GCP_IDENTITY_LABEL[identity.kind] ?? identity.kind) : "Identity";
  const active = activeTab.state === "ready" ? activeTab.key : null;

  const object: ObjectHeaderData | undefined = identity
    ? {
        name: identity.name || attrs.email || identity.native_id,
        kind: {
          label: kindLabel,
          category: identity.kind === "gcp_public" || isExternalIdentity(identity.attrs) ? "external" : "identity",
          icon: identity.kind === "gcp_user" ? "user" : identity.kind === "gcp_group" || identity.kind === "gcp_domain" ? "group" : identity.kind === "gcp_public" || identity.kind === "gcp_federated" ? "external" : "service_account",
        },
        context: [],
        sweep: {
          context: [connector?.scope_id ?? attrs.project_id ?? "Google Cloud project"],
          line: `Last seen by AuthSec ${dayText(identity.last_seen_at)}`,
        },
        copy: attrs.email ? { value: attrs.email, label: "Copy email", what: "Email" } : { value: identity.native_id, label: "Copy ID", what: "ID" },
        plainNote: {
          short: "Recorded, not tested",
          long: `This is what Google Cloud has recorded about this ${kindLabel.toLowerCase()}. AuthSec has not tested what it can do.`,
        },
      }
    : undefined;

  return (
    <ObjectShell
      ws={ws}
      listType="identities"
      provider="gcp"
      kindLabel={kindLabel}
      base={`/iga/gcp/identity/${encodeURIComponent(id)}`}
      tabs={tabs}
      activeTab={activeTab}
      failure={failure}
      permission="discovery:read"
      onRetry={retry}
      onRefresh={retry}
      object={object}
    >
      {identity && active === "overview" ? <Overview identity={identity} project={connector?.scope_id} /> : null}
      {identity && active === "access" ? <GcpBindingsList identityId={identity.id} /> : null}
      {identity && active === "trust" ? <GcpTrustList identityId={identity.id} kind={identity.kind} /> : null}
      {identity && active === "keys" ? <Keys identity={identity} /> : null}
    </ObjectShell>
  );
}

/* ─────────────────────────────── Overview ─────────────────────────────────── */

function Overview({ identity, project }: { identity: CloudIdentity; project: string | undefined }) {
  const a = (identity.attrs ?? {}) as GcpIdentityAttrs;
  if (identity.kind !== "gcp_service_account") return <PrincipalOverview identity={identity} project={project} />;
  return (
    <div className="space-y-6">
      <DetailGrid>
        <DetailRow
          label="Status"
          value={
            identity.enabled ? (
              <CloudPill tone="success">Enabled</CloudPill>
            ) : (
              <CloudPill tone="muted">Disabled</CloudPill>
            )
          }
        />
        <DetailRow label="Project" value={a.project_id || project || "Unknown"} mono />
        {a.email ? <DetailRow label="Email" value={a.email} mono full /> : null}
        {a.unique_id ? <DetailRow label="Unique ID" value={a.unique_id} mono full /> : null}
        {a.project_number ? <DetailRow label="Project number" value={a.project_number} mono /> : null}
        {a.oauth2_client_id ? <DetailRow label="OAuth2 client ID" value={a.oauth2_client_id} mono full /> : null}
        {a.description ? <DetailRow label="Description" value={a.description} full /> : null}
        <DetailRow label="Created in Google Cloud" value={<span title={absolute(identity.created_at)}>{relativeOrUnknown(identity.created_at)}</span>} />
        {/* Google Cloud reports no last-used time for a service account, so this stays Unknown. */}
        <DetailRow label="Last used" value={<span title={absolute(identity.last_used_at)}>{relativeOrUnknown(identity.last_used_at)}</span>} />
        <DetailRow label="First seen by AuthSec" value={<span title={absolute(identity.first_seen_at)}>{relativeOrUnknown(identity.first_seen_at)}</span>} />
        <DetailRow label="Last seen by AuthSec" value={<span title={absolute(identity.last_seen_at)}>{relativeOrUnknown(identity.last_seen_at)}</span>} />
      </DetailGrid>
      <p className="text-[11px] text-muted-foreground">
        A candidate identity, not classified as an agent. The email is how bindings refer to it; the unique ID is what AuthSec recognises it by, so deleting a service account and creating
        another at the same address is not mistaken for the same one.
      </p>
    </div>
  );
}

/* ───────────────────────────────── Keys ───────────────────────────────────── */

function Keys({ identity }: { identity: CloudIdentity }) {
  const q = useListAwsSecretsQuery({ identity_id: identity.id, limit: AWS_DISCOVERY_MAX_LIMIT });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) {
    return (
      <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
        <strong className="font-medium">Could not load keys.</strong> Nothing below is a statement about this service account: the request failed.{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  // Service-account keys, HMAC keys (on a service account) and API keys (on the
  // project row). Each is a different credential; the kind is said on the row.
  const keys: CloudSecret[] = (q.data?.rows ?? []).filter((k) => KEY_KIND_LABEL[k.kind] !== undefined);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        {identity.kind === "gcp_project"
          ? "API keys in this project. Names, dates and restrictions, never a key string. An API key with no restrictions works for any enabled API."
          : "User-managed and HMAC keys. Key IDs and dates, never a key value. Google manages its own keys, and they are not listed. For a key with no expiry, its age is the finding."}
      </p>
      {!keys.length ? (
        <DrawerEmpty
          icon={<KeyRound />}
          title={identity.kind === "gcp_project" ? "No API keys" : "No user-managed keys"}
          description={
            identity.kind === "gcp_project"
              ? "The last scan found no API keys in this project."
              : "This service account has no downloadable or HMAC keys. That is the expected and safer result: it authenticates through Google-managed credentials or federation instead."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {keys.map((k) => {
            const ka = (k.attrs ?? {}) as GcpKeyAttrs;
            return (
              <div key={k.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-foreground">
                    <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-sans text-[10.5px] text-muted-foreground">{KEY_KIND_LABEL[k.kind]}</span>
                    {((k.attrs ?? {}) as { display_name?: string }).display_name || k.native_id}
                  </p>
                  {k.kind === "gcp_api_key" ? <p className="text-[11px] text-muted-foreground">{apiKeyRestrictions(k)}</p> : null}
                  <p className="text-[11px] text-muted-foreground">
                    Created <span title={absolute(k.created_at)}>{relativeOrUnknown(k.created_at)}</span> ·{" "}
                    {k.expires_at ? (
                      <>
                        expires <span title={absolute(k.expires_at)}>{relativeOrUnknown(k.expires_at)}</span>
                      </>
                    ) : (
                      "never expires"
                    )}{" "}
                    · last used <span title={absolute(k.last_used_at)}>{relativeOrUnknown(k.last_used_at)}</span>
                    {ka.key_algorithm ? ` · ${ka.key_algorithm}` : ""}
                  </p>
                  {ka.disable_reason ? <p className="text-[11px] text-muted-foreground">Disabled: {ka.disable_reason}</p> : null}
                </div>
                <CloudPill tone={k.status === "active" ? "success" : "muted"}>{k.status === "active" ? "Active" : "Inactive"}</CloudPill>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const KEY_KIND_LABEL: Record<string, string> = {
  gcp_service_account_key: "SA key",
  gcp_hmac_key: "HMAC key",
  gcp_api_key: "API key",
};

/** An API key's restrictions as stored (`models.GCPAPIKeyRestrictions`), in words. */
function apiKeyRestrictions(k: CloudSecret): string {
  type R = { unrestricted?: boolean; api_targets?: string[]; referrers?: string[]; ips?: string[]; android?: string[]; ios?: string[] };
  const r = ((k.attrs ?? {}) as { restrictions?: R | null }).restrictions;
  if (!r || r.unrestricted) return "No restrictions: usable from anywhere, for any enabled API.";
  const parts: string[] = [];
  if (r.api_targets?.length) parts.push(`APIs: ${r.api_targets.join(", ")}`);
  if (r.referrers?.length) parts.push(`${r.referrers.length} referrer${r.referrers.length > 1 ? "s" : ""}`);
  if (r.ips?.length) parts.push(`${r.ips.length} IP range${r.ips.length > 1 ? "s" : ""}`);
  if (r.android?.length) parts.push("Android apps");
  if (r.ios?.length) parts.push("iOS apps");
  return parts.length ? `Restricted to ${parts.join("; ")}.` : "Restricted.";
}

/* ─────────────────────── Principals named in bindings ─────────────────────── */

function PrincipalOverview({ identity, project }: { identity: CloudIdentity; project: string | undefined }) {
  const a = (identity.attrs ?? {}) as { member_type?: string; project?: string; project_id?: string; email?: string };
  return (
    <div className="space-y-6">
      <DetailGrid>
        <DetailRow label="Kind" value={GCP_IDENTITY_LABEL[identity.kind] ?? identity.kind} />
        <DetailRow
          label="Scope"
          value={isExternalIdentity(identity.attrs) ? <CloudPill tone="warning">Outside the connected scope</CloudPill> : <CloudPill tone="muted">Not shown to be outside</CloudPill>}
        />
        {a.member_type ? <DetailRow label="Member type" value={a.member_type} mono /> : null}
        <DetailRow label="Principal" value={identity.name || identity.native_id} mono full />
        <DetailRow label="AuthSec ID" value={identity.native_id} mono full />
        {a.email ? <DetailRow label="Email" value={a.email} mono full /> : null}
        <DetailRow label="Project" value={a.project_id || a.project || project || "Unknown"} mono />
        <DetailRow label="First seen by AuthSec" value={<span title={absolute(identity.first_seen_at)}>{relativeOrUnknown(identity.first_seen_at)}</span>} />
        <DetailRow label="Last seen by AuthSec" value={<span title={absolute(identity.last_seen_at)}>{relativeOrUnknown(identity.last_seen_at)}</span>} />
      </DetailGrid>
      <p className="text-[11px] text-muted-foreground">{GCP_IDENTITY_SOURCE[identity.kind] ?? "Named in an IAM binding."} See Access for what it holds.</p>
    </div>
  );
}
