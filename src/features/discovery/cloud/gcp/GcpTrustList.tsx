/**
 * GCP-4 trust edges for one Google Cloud identity.
 *
 * "Who can become this": edges on the identity itself, plus (for a service
 * account) grants stored once on its project, folders and organization, which
 * reach every service account beneath them. "What this can become": edges whose
 * subject is this identity.
 *
 * Everything here is derived from IAM bindings. Conditions are on the source
 * bindings and are not evaluated; an expiry comes from a simple request.time bound.
 */

import { Link } from "react-router-dom";
import { Fingerprint } from "lucide-react";

import { useListGcpEdgesQuery, AWS_DISCOVERY_MAX_LIMIT, type GcpEdge } from "@/app/api/cloudDiscoveryApi";
import { DrawerEmpty } from "@/components/console/detail";

import { CloudPill } from "../CloudPill";
import {
  capabilityText,
  GCP_IDENTITY_LABEL,
  GCP_MECHANISM_LABEL,
  GCP_SUBJECT_KIND_LABEL,
  shortAssetName,
} from "./gcpInventoryLabels";

export function GcpTrustList({ identityId, kind }: { identityId: string; kind: string }) {
  const inbound = useListGcpEdgesQuery({ identity_id: identityId, include_scopes: true, limit: AWS_DISCOVERY_MAX_LIMIT });
  const outbound = useListGcpEdgesQuery({ subject_identity_id: identityId, limit: AWS_DISCOVERY_MAX_LIMIT });
  const scopeRow = kind === "gcp_project" || kind === "gcp_folder" || kind === "gcp_organization";

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-muted-foreground">
        Derived from IAM bindings. A grant on a project, folder or organization reaches every service account beneath it. Conditions are recorded on the source
        bindings and are not evaluated.
      </p>
      <Section
        title={scopeRow ? "Who can become every service account here" : "Who can become this"}
        q={inbound}
        empty="No binding found in the last scan lets anyone act as this, mint its tokens or create its keys. If bindings were not read, check the connection's coverage first."
        render={(e) => <InboundRow key={e.id} e={e} self={identityId} />}
      />
      {scopeRow ? null : (
        <Section
          title="What this can become"
          q={outbound}
          empty="This identity holds no grant that lets it become another identity."
          render={(e) => <OutboundRow key={e.id} e={e} />}
        />
      )}
    </div>
  );
}

type EdgeQuery = ReturnType<typeof useListGcpEdgesQuery>;

function Section({ title, q, empty, render }: { title: string; q: EdgeQuery; empty: string; render: (e: GcpEdge) => React.ReactNode }) {
  const rows = q.data?.rows ?? [];
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load trust edges.</strong> Nothing here is a statement about access: the request failed.{" "}
          <button className="underline" onClick={() => void q.refetch()}>
            Retry
          </button>
        </div>
      ) : !rows.length ? (
        <DrawerEmpty icon={<Fingerprint />} title="None found" description={empty} />
      ) : (
        <div className="space-y-1.5">
          {q.data && q.data.totalKnown && q.data.total > rows.length ? (
            <p className="text-[11px] text-(--color-warning-text)">
              Showing {rows.length} of {q.data.total}.
            </p>
          ) : null}
          {rows.map(render)}
        </div>
      )}
    </section>
  );
}

function Flags({ e }: { e: GcpEdge }) {
  const a = e.attrs ?? {};
  return (
    <div className="flex flex-none flex-wrap justify-end gap-1">
      {a.unconditioned ? <CloudPill tone="warning">Provider has no condition</CloudPill> : null}
      {a.external ? <CloudPill tone="warning">Outside the scope</CloudPill> : null}
      {a.basic_role ? <CloudPill tone="warning">Basic role</CloudPill> : null}
      {a.conditional ? <CloudPill tone="muted">Conditional{a.expires_at ? ` until ${new Date(a.expires_at).toLocaleDateString()}` : ""}</CloudPill> : null}
      {a.provider_unknown ? <CloudPill tone="muted">Issuer not known</CloudPill> : null}
      {a.workforce ? <CloudPill tone="muted">Workforce pool</CloudPill> : null}
    </div>
  );
}

function Details({ e }: { e: GcpEdge }) {
  const a = e.attrs ?? {};
  return (
    <p className="text-[11px] text-muted-foreground">
      {GCP_MECHANISM_LABEL[e.mechanism] ?? e.mechanism}
      {a.roles?.length ? ` · ${a.roles.join(", ")}` : ""}
      {a.capabilities?.length ? ` · can ${capabilityText(a.capabilities)}` : ""}
      {e.issuer ? ` · issuer ${e.issuer}` : ""}
      {a.pool ? ` · pool ${a.pool}` : ""}
      {a.attribute_condition ? ` · condition ${a.attribute_condition}` : ""}
    </p>
  );
}

function InboundRow({ e, self }: { e: GcpEdge; self: string }) {
  const a = e.attrs ?? {};
  const viaScope = e.identity_id !== self && a.via_scope;
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground" title={e.subject}>
            {a.subject_identity_id ? (
              <Link to={`/iga/gcp/identity/${encodeURIComponent(a.subject_identity_id)}`} className="text-(--color-primary-text) hover:underline">
                {e.k8s_ref || a.member || e.subject}
              </Link>
            ) : (
              e.k8s_ref || e.subject
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {GCP_SUBJECT_KIND_LABEL[e.subject_kind] ?? e.subject_kind}
            {viaScope ? ` · through a grant on ${shortAssetName(String(a.via_scope)) || a.via_scope}` : a.via_scope ? ` · on ${a.via_scope}` : ""}
          </p>
          <Details e={e} />
        </div>
        <Flags e={e} />
      </div>
    </div>
  );
}

function OutboundRow({ e }: { e: GcpEdge }) {
  const a = e.attrs ?? {};
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">
            <Link to={`/iga/gcp/identity/${encodeURIComponent(e.identity_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
              {e.identity_name || e.identity_native_id}
            </Link>{" "}
            <span className="text-muted-foreground">({GCP_IDENTITY_LABEL[e.identity_kind] ?? e.identity_kind})</span>
          </p>
          {a.via_scope ? (
            <p className="text-[11px] text-muted-foreground">Every service account in {a.via_scope}</p>
          ) : null}
          <Details e={e} />
        </div>
        <Flags e={e} />
      </div>
    </div>
  );
}
