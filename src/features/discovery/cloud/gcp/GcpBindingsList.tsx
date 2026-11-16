/**
 * The IAM bindings of one Google Cloud identity or one resource (GCP-3).
 *
 * One row per (policy, role, member, condition), shown where it is ATTACHED.
 * Inherited access (a folder binding reaching its projects) is not expanded
 * here; the page says so. Conditions are shown verbatim and never evaluated:
 * an expiry is read from a simple `request.time` bound, nothing more.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { useListGcpBindingsQuery, AWS_DISCOVERY_MAX_LIMIT, type GcpBinding } from "@/app/api/cloudDiscoveryApi";
import { DrawerEmpty } from "@/components/console/detail";

import { CloudPill } from "../CloudPill";
import { attachedText, conditionOf, expiryOf, GCP_IDENTITY_LABEL, roleNote } from "./gcpInventoryLabels";

export function GcpBindingsList({ identityId, resourceId }: { identityId?: string; resourceId?: string }) {
  const q = useListGcpBindingsQuery({ identity_id: identityId, resource_id: resourceId, limit: AWS_DISCOVERY_MAX_LIMIT });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) {
    return (
      <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
        <strong className="font-medium">Could not load bindings.</strong> Nothing below is a statement about access: the request failed.{" "}
        <button className="underline" onClick={() => void q.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  const rows = q.data?.rows ?? [];
  const truncated = q.data ? q.data.totalKnown && q.data.total > rows.length : false;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        IAM allow bindings, shown where they are attached. A binding on a folder or organization also reaches what is under it; that inherited access is not repeated here.
        Conditions are recorded as Google returned them and are not evaluated.
      </p>
      {truncated ? (
        <p className="text-[11px] text-(--color-warning-text)">
          Showing {rows.length} of {q.data?.total} bindings.
        </p>
      ) : null}
      {!rows.length ? (
        <DrawerEmpty
          icon={<ShieldCheck />}
          title="No bindings found"
          description={
            resourceId
              ? "The last complete scan found no binding on this resource's own policy."
              : "The last scan found no IAM binding that names this identity. If the bindings surface was not reached, check the connection's coverage before reading this as no access."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {rows.map((b) => (
            <BindingRow key={b.id} b={b} showHolder={!!resourceId} />
          ))}
        </div>
      )}
    </div>
  );
}

function BindingRow({ b, showHolder }: { b: GcpBinding; showHolder: boolean }) {
  const [open, setOpen] = useState(false);
  const cond = conditionOf(b);
  const exp = expiryOf(b);
  const note = roleNote(b);
  const a = b.attrs ?? {};

  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground" title={b.role_name ?? ""}>
            {b.role_name ?? "(no role)"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {showHolder ? (
              <>
                <Link to={`/iga/gcp/identity/${encodeURIComponent(b.identity_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
                  {b.identity_name || b.identity_native_id}
                </Link>{" "}
                ({GCP_IDENTITY_LABEL[b.identity_kind] ?? b.identity_kind}) ·{" "}
              </>
            ) : null}
            on{" "}
            {b.resource_id ? (
              <Link to={`/iga/gcp/resource/${encodeURIComponent(b.resource_id)}`} className="text-(--color-primary-text) hover:underline">
                {attachedText(b)}
              </Link>
            ) : (
              attachedText(b)
            )}
            {a.ancestors?.length ? <span title={a.ancestors.join(" › ")}> · under {a.ancestors.length} level{a.ancestors.length > 1 ? "s" : ""}</span> : null}
          </p>
          {note ? <p className="text-[11px] text-muted-foreground">{note}</p> : null}
        </div>
        <div className="flex flex-none flex-wrap justify-end gap-1">
          {a.basic_role ? <CloudPill tone="warning">Basic role</CloudPill> : null}
          {a.role_unresolved ? <CloudPill tone="warning">Role not found</CloudPill> : null}
          {cond ? <CloudPill tone="muted">Conditional</CloudPill> : null}
          {exp.state === "expired" ? <CloudPill tone="muted">Expired {exp.at?.toLocaleDateString()}</CloudPill> : null}
          {exp.state === "expiring" ? <CloudPill tone="warning">Expires {exp.at?.toLocaleDateString()}</CloudPill> : null}
          {exp.state === "active" ? <CloudPill tone="muted">Until {exp.at?.toLocaleDateString()}</CloudPill> : null}
        </div>
      </div>
      {cond || b.actions?.length ? (
        <button className="mt-1 text-[11px] text-(--color-primary-text) hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide details" : `Details${b.actions?.length ? ` · ${b.actions.length} permissions` : ""}`}
        </button>
      ) : null}
      {open ? (
        <div className="mt-2 space-y-2 text-[11px]">
          {cond ? (
            <div>
              <p className="font-medium text-foreground">Condition{cond.title ? `: ${cond.title}` : ""}</p>
              {cond.description ? <p className="text-muted-foreground">{cond.description}</p> : null}
              {cond.expression ? <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 font-mono">{cond.expression}</pre> : null}
            </div>
          ) : null}
          {b.actions?.length ? (
            <div>
              <p className="font-medium text-foreground">Permissions in this role</p>
              <p className="mt-1 max-h-48 overflow-auto break-all font-mono text-muted-foreground">{b.actions.join(", ")}</p>
            </div>
          ) : null}
          {a.read_time ? <p className="text-muted-foreground">Read from Google Cloud {new Date(a.read_time).toLocaleString()}.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
