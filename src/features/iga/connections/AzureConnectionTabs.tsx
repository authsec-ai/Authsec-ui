/**
 * The Scans, Coverage and Scope tabs for an Azure tenant connection, read from
 * `/authsec/discovery/azure/*`. A tenant is one connector (the directory) with
 * one connector per subscription under it; each scan pass is a scan run.
 */

import type { Connection } from "@/app/api/connectionsApi";
import {
  useGetAzureConnectorQuery,
  useListAzureConnectorsQuery,
  useListAzureScanRunsQuery,
  type CloudConnector,
} from "@/app/api/cloudDiscoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { shortId, surfaceLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";
import { azureSurfaceErrorProse } from "@/features/discovery/cloud/azure/azureErrorCopy";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

function Loading({ label }: { label: string }) {
  return <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label={label} />;
}

const RUN_STATUS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "muted" }> = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "Running", tone: "info" },
  published: { label: "Complete", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  abandoned: { label: "Abandoned", tone: "muted" },
};

const TRIGGER: Record<string, string> = { connect: "Connect", verify: "Verify", schedule: "Scheduled" };

/** How long a run took, from its own timestamps — never invented when one is missing. */
function runDuration(r: { started_at?: string | null; requested_at: string; published_at?: string | null; updated_at: string }): string | null {
  const start = r.started_at ?? r.requested_at;
  const end = r.published_at ?? (r.updated_at !== start ? r.updated_at : null);
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** The total "reached" count across a run's surfaces — a plain-language stand-in
 * for "what did this scan actually find", shown next to the run instead of
 * leaving the user to open Coverage to learn whether anything came back. */
function runFoundCount(r: { coverage: { surfaces?: Record<string, { state: string; count: number }> } }): number | null {
  const surfaces = r.coverage?.surfaces;
  if (!surfaces) return null;
  const reached = Object.values(surfaces).filter((s) => s.state === "reached");
  if (!reached.length) return null;
  return reached.reduce((sum, s) => sum + (s.count || 0), 0);
}

export function AzureScans({ c }: { c: Connection }) {
  const q = useListAzureScanRunsQuery(c.id);
  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this tenant's scans" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading label="Loading the scans" />;
  const runs = q.data;
  return (
    <div className="space-y-4">
      <Meta>
        A scan starts when the tenant is connected or verified, and on a schedule (every 12 hours by default). This list is the directory scan; each
        subscription is scanned in the same pass.
      </Meta>
      <Panel title="Scan history" count={runs.length ? `${runs.length}` : undefined}>
        {!runs.length ? (
          <p className="text-[13px] text-(--color-text-muted)">No scans yet.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle)">
            {runs.map((r) => {
              const s = RUN_STATUS[r.status] ?? { label: r.status, tone: "muted" as const };
              const duration = runDuration(r);
              const found = runFoundCount(r);
              return (
                <li key={r.id} className="space-y-1 py-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <CloudPill tone={s.tone}>{s.label}</CloudPill>
                      <span className="text-(--color-text-muted)">
                        {TRIGGER[r.trigger] ?? r.trigger}
                        {r.trigger === "connect" || r.trigger === "verify" ? " (started by a person)" : ""}
                      </span>
                      {duration ? <span className="text-xs text-(--color-text-muted)">· {duration}</span> : null}
                      {found != null ? <span className="text-xs text-(--color-text-muted)">· {found.toLocaleString()} objects found</span> : null}
                    </span>
                    <span className="text-xs text-(--color-text-muted)">
                      Started <Timestamp iso={r.started_at ?? r.requested_at} />
                      {r.published_at ? (
                        <>
                          {" "}
                          · finished <Timestamp iso={r.published_at} />
                        </>
                      ) : null}
                    </span>
                  </div>
                  {r.last_error ? <p className="break-words text-xs text-(--color-danger-text)">{azureSurfaceErrorProse(r.last_error)}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

const SURFACE_TONE: Record<string, "success" | "info" | "warning" | "danger" | "muted"> = {
  reached: "success",
  partial: "warning",
  denied: "danger",
  throttled: "warning",
  unsupported: "muted",
  not_selected: "muted",
  not_configured: "muted",
  unknown: "muted",
};

/** A plain word for each coverage state — never the raw backend token. */
const SURFACE_STATE_LABEL: Record<string, string> = {
  reached: "Read",
  partial: "Partly read",
  denied: "Access refused",
  throttled: "Slowed down by Microsoft",
  unsupported: "Not supported for this tenant",
  not_selected: "Not turned on",
  not_configured: "Not set up",
  unknown: "Unknown",
};

/**
 * Items needing attention sort first, so a user scanning the list top-down
 * meets "Access refused" before fifteen rows of "Read" — the audit's
 * "Issues to Resolve at the top" ask, without a second, duplicate section.
 */
const SURFACE_SEVERITY: Record<string, number> = {
  denied: 0,
  throttled: 1,
  partial: 2,
  not_configured: 3,
  not_selected: 4,
  unknown: 5,
  unsupported: 6,
  reached: 7,
};

function SurfaceList({ connector }: { connector: CloudConnector }) {
  const label = surfaceLabel;
  const surfaces = Object.entries(connector.coverage?.surfaces ?? {}).sort(([a, sa], [b, sb]) => {
    const sev = (SURFACE_SEVERITY[sa.state] ?? 9) - (SURFACE_SEVERITY[sb.state] ?? 9);
    return sev !== 0 ? sev : label(a).localeCompare(label(b));
  });
  if (connector.coverage?.status === "running" && surfaces.every(([, s]) => s.state === "unknown")) {
    return <p className="text-[13px] text-(--color-text-muted)">A scan is running. Coverage is written when it finishes.</p>;
  }
  if (!surfaces.length) return <p className="text-[13px] text-(--color-text-muted)">No coverage report yet. It is written when a scan pass finishes.</p>;
  return (
    <ul className="divide-y divide-(--color-border-subtle)">
      {surfaces.map(([name, s]) => {
        // "0" against "Read" means nothing of that kind exists in the tenant —
        // never ambiguous with "0" because the read failed (that is "denied"
        // or "throttled", a different state and a different pill).
        const countLabel = s.state === "reached" ? (s.count > 0 ? s.count.toLocaleString() : "None found") : s.count > 0 ? `at least ${s.count.toLocaleString()}` : null;
        const plainError = azureSurfaceErrorProse(s.error);
        return (
          <li key={name} className="flex flex-wrap items-start justify-between gap-2 py-2 text-[13px]">
            <span className="min-w-0">
              <span className="font-medium">{label(name)}</span>
              {plainError ? <span className="block break-words text-xs text-(--color-text-muted)">{plainError}</span> : null}
            </span>
            <span className="flex items-center gap-2">
              {countLabel ? <span className="text-xs text-(--color-text-muted)">{countLabel}</span> : null}
              <CloudPill tone={SURFACE_TONE[s.state] ?? "muted"}>{SURFACE_STATE_LABEL[s.state] ?? s.state.replace(/_/g, " ")}</CloudPill>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AzureCoverage({ c }: { c: Connection }) {
  const tenant = useGetAzureConnectorQuery(c.id);
  const all = useListAzureConnectorsQuery();
  if (tenant.isError && !tenant.data) {
    return <LoadFailurePanel failure={loadFailureOf(tenant.error) ?? "failed"} subject="this tenant's coverage" permission="discovery:read" onRetry={() => void tenant.refetch()} />;
  }
  if (!tenant.data) return <Loading label="Loading coverage" />;
  const subs = (all.data ?? []).filter((s) => s.scope_kind === "subscription" && s.parent_scope_id === c.native_id && s.status === "active");
  return (
    <div className="space-y-4">
      <Meta>
        What the last scan could read, for Microsoft Entra ID and each subscription. Items needing attention are listed first; a count next to
        anything other than "Read" is a minimum, because AuthSec stopped counting once it hit a limit.
      </Meta>
      <Panel title="Microsoft Entra ID (read through Microsoft Graph)">
        <SurfaceList connector={tenant.data} />
      </Panel>
      {subs.map((s) => (
        <Panel key={s.id} title={`Subscription ${subscriptionName(s)}`}>
          <SurfaceList connector={s} />
        </Panel>
      ))}
    </div>
  );
}

function subscriptionName(s: CloudConnector): string {
  const n = (s.attrs as Record<string, unknown> | undefined)?.["display_name"];
  // Microsoft did not return a subscription name: a short id reads better than
  // the full GUID, same as every other unnamed technical reference on this page.
  return typeof n === "string" && n ? n : shortId(s.scope_id);
}

const READER_LABEL: Record<string, string> = {
  created: "Reader assigned by AuthSec",
  already_assigned: "Reader already assigned",
  inherited: "Reader inherited",
  permission_denied: "Reader not assigned: no permission",
  skipped: "Skipped",
  failed: "Reader not assigned",
  not_checked: "Not checked yet: Azure was busy, verify again",
};

export function AzureScope({ c }: { c: Connection }) {
  const q = useListAzureConnectorsQuery();
  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this tenant's subscriptions" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading label="Loading subscriptions" />;
  const subs = q.data.filter((s) => s.scope_kind === "subscription" && s.parent_scope_id === c.native_id);
  return (
    <div className="space-y-4">
      <Panel title="Tenant">
        <Facts>
          <Fact label="Tenant ID" mono>
            {c.native_id}
          </Fact>
        </Facts>
      </Panel>
      <Panel title="Subscriptions" count={`${subs.length}`}>
        {!subs.length ? (
          <p className="text-[13px] text-(--color-text-muted)">No subscription is connected. The directory is still discovered.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle)">
            {subs.map((s) => {
              const reader = ((s.attrs as Record<string, unknown> | undefined)?.["reader"] ?? {}) as { status?: string; verified?: boolean };
              const state = ((s.attrs as Record<string, unknown> | undefined)?.["state"] as string | undefined) ?? "";
              return (
                <li key={s.id} className="space-y-1 py-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium">{subscriptionName(s)}</span>
                      <span className="ml-2 font-mono text-xs text-(--color-text-muted)">{s.scope_id}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {state ? <span className="text-xs text-(--color-text-muted)">{state}</span> : null}
                      <CloudPill tone={reader.verified ? "success" : "muted"}>{reader.verified ? "Readable" : "Not readable"}</CloudPill>
                    </span>
                  </div>
                  <p className="text-xs text-(--color-text-muted)">
                    {READER_LABEL[reader.status ?? ""] ?? "Reader status unknown"}
                    {s.verified_at ? (
                      <>
                        {" "}
                        · permissions verified <Timestamp iso={s.verified_at} />
                      </>
                    ) : null}
                  </p>
                  {s.last_error ? <p className="break-words text-xs text-(--color-text-muted)">{azureSurfaceErrorProse(s.last_error)}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Meta>
        To add or remove subscriptions, run "Connect" on this tenant again and pick the subscriptions you want — this re-checks permissions, it does
        not remove anything already discovered. To stop AuthSec from reading this tenant entirely, delete its enterprise application in Azure.
      </Meta>
    </div>
  );
}
