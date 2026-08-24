/**
 * The evidence panel for a single entitlement's provenance — who granted it, why,
 * under which approval, when it expires. Built once and reused two ways:
 *
 *   - inside the Provenance page's detail drawer, and
 *   - inline in a certification item, where a reviewer must decide from evidence
 *     rather than a name alone.
 *
 * Pass a loaded `EntitlementProvenance`, or an id to fetch it. Two flags get their
 * own visual treatment: `is_standing` (never expires) and `lapsed` (expired but the
 * row survives as the audit record).
 */

import { formatDistanceToNow } from "date-fns";

import {
  DetailGrid,
  DetailRow,
  CopyField,
} from "@/components/console/detail";
import {
  useGetProvenanceQuery,
  type EntitlementProvenance,
} from "@/app/api/governanceApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

export function ProvenanceFlags({ p }: { p: EntitlementProvenance }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {p.is_standing ? (
        <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
          Standing
        </span>
      ) : null}
      {p.lapsed ? (
        <span className={`${PILL} bg-muted text-muted-foreground`}>Lapsed</span>
      ) : null}
      {p.revoked_at ? (
        <span className={`${PILL} bg-(--color-danger-soft) text-(--color-danger-text)`}>
          Revoked
        </span>
      ) : null}
    </span>
  );
}

function ProvenanceBody({ p }: { p: EntitlementProvenance }) {
  return (
    <div className="space-y-3">
      <ProvenanceFlags p={p} />
      <DetailGrid>
        <DetailRow label="Entitlement" value={p.entitlement_label || p.entitlement_type} full />
        <DetailRow
          label="Subject"
          value={p.subject_label || p.subject_id}
        />
        <DetailRow label="Subject type" value={p.subject_type} />
        <DetailRow label="Origin" value={p.origin || "—"} />
        <DetailRow
          label="Granted"
          value={`${formatDistanceToNow(new Date(p.granted_at), { addSuffix: true })}${
            p.granted_by_label ? ` by ${p.granted_by_label}` : ""
          }`}
          full
        />
        <DetailRow
          label="Expires"
          value={
            p.is_standing
              ? "Never (standing)"
              : p.expires_at
                ? formatDistanceToNow(new Date(p.expires_at), { addSuffix: true })
                : "—"
          }
        />
        {p.access_request_id ? (
          <DetailRow
            label="Approval"
            value={<CopyField value={p.access_request_id} />}
            full
          />
        ) : null}
        {p.justification ? (
          <DetailRow label="Justification" value={p.justification} full />
        ) : null}
        {p.purpose ? <DetailRow label="Purpose" value={p.purpose} full /> : null}
        {p.revoked_at ? (
          <DetailRow
            label="Revoked"
            value={`${formatDistanceToNow(new Date(p.revoked_at), { addSuffix: true })}${
              p.revoked_by ? ` by ${p.revoked_by}` : ""
            }${p.revoked_reason ? ` — ${p.revoked_reason}` : ""}`}
            full
          />
        ) : null}
      </DetailGrid>

      {p.entitlement_snapshot != null ? (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Entitlement snapshot
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
            {JSON.stringify(p.entitlement_snapshot, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/** Render from a loaded object. */
export function ProvenanceEvidence({ provenance }: { provenance: EntitlementProvenance }) {
  return <ProvenanceBody p={provenance} />;
}

/** Fetch by id and render — for embedding where only the id is on hand. */
export function ProvenanceEvidenceById({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetProvenanceQuery(id, { skip: !id });
  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading provenance…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground">
        Could not load the provenance for this entitlement.
      </p>
    );
  }
  return <ProvenanceBody p={data} />;
}
