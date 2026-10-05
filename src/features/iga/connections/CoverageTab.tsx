/**
 * Coverage: a proper screen, not a tooltip. Grouped by account (or project,
 * cluster), then region, then collection surface. Each row leads with what its
 * state means for the reader and what to do; the API name and the raw error sit
 * behind an expansion. A surface that was not read is never presented as empty.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { Connection } from "@/app/api/connectionsApi";
import { useGetAwsConnectorQuery, useGetGcpConnectorQuery, useListAwsScanRunsQuery } from "@/app/api/cloudDiscoveryApi";
import { useListScanRunsQuery } from "@/app/api/discoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { RunReport } from "@/features/discovery/GitHubScanPanel";
import {
  PROBE_REASON,
  SURFACE_LABEL as GCP_SURFACE_LABEL,
} from "@/features/discovery/cloud/gcp/gcpConnectorCopy";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { buildCoverage, COVERAGE_TONE, COVERAGE_WORD, type CoverageRow, type RawSurface } from "./coverageView";
import { coverageText, detailHref, scanHref } from "./connectionModel";
import { gcpAttrs } from "./providerData";

function Skeleton({ label }: { label: string }) {
  return <div className="h-32 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label={label} />;
}

function Row({ r }: { r: CoverageRow }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[13px] font-medium text-(--color-text)">{r.service}</p>
          <p className="text-xs leading-relaxed text-(--color-text-muted)">{r.lead}</p>
          {r.todo ? <p className="text-xs leading-relaxed text-(--color-text)">{r.todo}</p> : null}
        </div>
        <CloudPill tone={COVERAGE_TONE[r.state]}>{COVERAGE_WORD[r.state]}</CloudPill>
      </div>
      <details className="mt-1.5">
        <summary className="inline cursor-pointer text-xs text-(--color-primary-text) hover:underline">Details</summary>
        <dl className="mt-1.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
          <dt className="text-(--color-text-muted)">Surface</dt>
          <dd className="break-all font-mono">{r.key}</dd>
          <dt className="text-(--color-text-muted)">{r.state === "reached" ? "Found" : "Found at least"}</dt>
          <dd>{r.count}</dd>
          {r.api ? (
            <>
              <dt className="text-(--color-text-muted)">API call</dt>
              <dd className="break-all font-mono">{r.api}</dd>
            </>
          ) : null}
          {r.errorCode ? (
            <>
              <dt className="text-(--color-text-muted)">Error code</dt>
              <dd className="break-all font-mono">{r.errorCode}</dd>
            </>
          ) : null}
          {r.error ? (
            <>
              <dt className="text-(--color-text-muted)">Error</dt>
              <dd className="break-words">{r.error}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </li>
  );
}

function Groups({ c, surfaces, gaps }: { c: Connection; surfaces: Record<string, RawSurface> | undefined; gaps?: Parameters<typeof buildCoverage>[2] }) {
  const { groups, notSelected } = useMemo(() => buildCoverage(c.provider, surfaces, gaps), [c.provider, surfaces, gaps]);
  const [showUnselected, setShowUnselected] = useState(false);
  const everyUnchecked = groups.length > 0 && groups.every((g) => g.rows.every((r) => r.state === "unknown"));

  if (!groups.length && !notSelected.length) {
    return (
      <Panel title="Surfaces">
        <p className="text-[13px] text-(--color-text-muted)">No coverage recorded. Nothing has scanned this connection yet.</p>
      </Panel>
    );
  }
  if (everyUnchecked) {
    return (
      <Panel title="Surfaces">
        <p className="text-[13px] text-(--color-text-muted)">
          Every surface is listed the moment a scope is connected, so this is the full set AuthSec would look at — not a result. Nothing here has been
          read yet.
        </p>
      </Panel>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <Panel key={g.id} title={g.title} count={`${g.rows.length} ${g.rows.length === 1 ? "surface" : "surfaces"}`} flush>
          <ul className="divide-y divide-(--color-border-subtle)">
            {g.rows.map((r) => (
              <Row key={r.key} r={r} />
            ))}
          </ul>
        </Panel>
      ))}
      {notSelected.length ? (
        <Panel
          title="Not selected"
          count={`${notSelected.length}`}
          description="Deliberately outside the scan scope. Earlier results for these are kept and not reconfirmed."
          actions={
            <button type="button" className="font-medium text-(--color-primary-text) hover:underline" aria-expanded={showUnselected} onClick={() => setShowUnselected((v) => !v)}>
              {showUnselected ? "Hide" : "Show"}
            </button>
          }
          flush={showUnselected}
        >
          {showUnselected ? (
            <ul className="divide-y divide-(--color-border-subtle)">
              {notSelected.map((r) => (
                <Row key={r.key} r={r} />
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}

function Summary({ c, asOf, note }: { c: Connection; asOf?: string | null; note?: string }) {
  return (
    <Panel title="Summary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CloudPill tone={c.coverage.state === "complete" ? "success" : c.coverage.state === "unknown" ? "muted" : "warning"}>{coverageText(c)}</CloudPill>
        {asOf ? (
          <span className="text-xs text-(--color-text-muted)">
            Last scan finished <Timestamp iso={asOf} />
          </span>
        ) : null}
      </div>
      {note ? <Meta className="mt-2">{note}</Meta> : null}
    </Panel>
  );
}

function SurfaceCoverage({ c }: { c: Connection }) {
  const aws = useGetAwsConnectorQuery(c.id, { skip: c.provider !== "aws" });
  const gcp = useGetGcpConnectorQuery(c.id, { skip: c.provider !== "gcp" });
  const runs = useListAwsScanRunsQuery({ connectorId: c.id }, { skip: c.provider !== "aws" });
  const q = c.provider === "aws" ? aws : gcp;
  const gaps = useMemo(() => runs.data?.data.find((r) => r.coverage)?.coverage?.not_reached, [runs.data]);

  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this connection's coverage" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Skeleton label="Loading coverage" />;

  const cov = q.data.coverage;
  return (
    <div className="space-y-4">
      <Summary
        c={c}
        asOf={cov?.finished_at}
        note="It reports every phase of the last completed scan, and is written when that scan publishes. While a new scan runs, these are still the previous scan's results."
      />
      {c.provider === "aws" && runs.isError && !runs.data ? (
        <p role="alert" className="text-xs text-(--color-warning-text)">
          The API names behind denied surfaces could not be loaded.{" "}
          <button className="underline" onClick={() => void runs.refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      <Groups c={c} surfaces={cov?.surfaces as Record<string, RawSurface> | undefined} gaps={gaps} />
      {c.provider === "gcp" ? <GcpReach c={c} /> : null}
    </div>
  );
}

/** What the Google Cloud reader was PROVED able to reach: a different question from what a scan read. */
function GcpReach({ c }: { c: Connection }) {
  const q = useGetGcpConnectorQuery(c.id);
  if (!q.data) return null;
  const attrs = gcpAttrs(q.data);
  const profile = attrs.capability_profile ?? {};
  const keys = Object.keys(profile);
  const enablement = attrs.api_enablement ?? {};
  const disabled = Object.entries(enablement).filter(([, v]) => v === "not_enabled").map(([k]) => k);
  const unknown = Object.entries(enablement).filter(([, v]) => v === "unknown").map(([k]) => k);
  return (
    <>
      <Panel title="What the reader can reach" description="Proved by a live permission check when the connection was verified — a different question from what the last scan read.">
        {keys.length === 0 ? (
          <p className="text-[13px] text-(--color-text-muted)">Never probed. Verify the connection to find out; nothing here means “no access”, only that nobody has checked.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle)">
            {keys.map((k) => {
              const cap = profile[k];
              const tone = cap.unknown ? "muted" : cap.can ? "success" : "warning";
              return (
                <li key={k} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[13px]">{GCP_SURFACE_LABEL[k] ?? k}</p>
                    {cap.unknown && cap.reason ? <p className="text-xs text-(--color-text-muted)">{PROBE_REASON[cap.reason] ?? cap.reason}</p> : null}
                    {!cap.unknown && cap.missing?.length ? <p className="text-xs text-(--color-text-muted)">Missing: {cap.missing.join(", ")}</p> : null}
                  </div>
                  <CloudPill tone={tone}>{cap.unknown ? "Unknown" : cap.can ? "Readable" : "Not readable"}</CloudPill>
                </li>
              );
            })}
          </ul>
        )}
        {attrs.probed_at ? (
          <Meta className="mt-2">
            Last checked <Timestamp iso={attrs.probed_at} />
            {attrs.role_set_version ? ` · role set ${attrs.role_set_version}` : ""}
          </Meta>
        ) : null}
      </Panel>
      <Panel title="APIs">
        {Object.keys(enablement).length === 0 ? (
          <p className="text-[13px] text-(--color-text-muted)">Not checked yet.</p>
        ) : (
          <div className="space-y-2 text-[13px]">
            {!disabled.length && !unknown.length ? <p className="text-(--color-text-muted)">All {Object.keys(enablement).length} APIs discovery reads are enabled.</p> : null}
            {disabled.length ? (
              <div>
                <p className="font-medium">Not enabled</p>
                <ul className="list-disc pl-5 text-(--color-text-muted)">
                  {disabled.map((a) => (
                    <li key={a}>
                      <code>{a}</code>
                    </li>
                  ))}
                </ul>
                {attrs.api_enablement_repaired === false ? (
                  <p className="pt-1 text-xs text-(--color-text-muted)">
                    This connection was set up with the script, which holds no credential that can enable an API. Enable these in the project, or reconnect with Google
                    Authentication.
                  </p>
                ) : null}
              </div>
            ) : null}
            {unknown.length ? (
              <div>
                <p className="font-medium">Unknown</p>
                <p className="text-(--color-text-muted)">The reader cannot list services in the quota project, so these could not be checked. Unknown is not the same as off.</p>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
      {attrs.probed_permissions?.length ? (
        <Panel title="Permissions proved">
          <details>
            <summary className="cursor-pointer text-[13px] text-(--color-text-muted)">
              {attrs.probed_permissions.length} permission{attrs.probed_permissions.length === 1 ? "" : "s"} confirmed held
            </summary>
            <ul className="mt-2 space-y-1">
              {attrs.probed_permissions.map((p) => (
                <li key={p}>
                  <code className="text-xs text-(--color-text-muted)">{p}</code>
                </li>
              ))}
            </ul>
          </details>
          <Meta className="mt-2">
            Proved by a live permission check, not read from the roles granted — a custom role can carry a permission, and a deny policy can remove one the role appears to give.
          </Meta>
        </Panel>
      ) : null}
    </>
  );
}

function K8sCoverage({ c }: { c: Connection }) {
  const surfaces = useMemo(() => Object.fromEntries(c.coverage.gaps.map((g) => [g.surface, { state: g.state, count: 0 }])), [c.coverage.gaps]);
  return (
    <div className="space-y-4">
      <Summary
        c={c}
        asOf={c.scan.at}
        note="The agent reports the parts of its latest sweep it could not read. Anything not listed below was not reported as a gap."
      />
      {c.coverage.gaps.length ? (
        <Groups c={c} surfaces={surfaces} />
      ) : (
        <Panel title="Gaps">
          <p className="text-[13px] text-(--color-text-muted)">
            {c.coverage.state === "unknown" ? "No coverage has been reported yet." : "The latest sweep reported no gaps."}
          </p>
        </Panel>
      )}
    </div>
  );
}

function GitHubCoverage({ c }: { c: Connection }) {
  const runs = useListScanRunsQuery(c.id);
  const latest = runs.data?.[0];
  return (
    <div className="space-y-4">
      <Summary c={c} note="For GitHub, coverage is the repositories a scan read out of the repositories in scope." />
      {runs.isError && !runs.data ? (
        <LoadFailurePanel failure={loadFailureOf(runs.error) ?? "failed"} subject="the latest scan" permission="discovery:read" onRetry={() => void runs.refetch()} />
      ) : runs.isLoading ? (
        <Skeleton label="Loading the latest scan" />
      ) : !latest ? (
        <Panel title="Repositories">
          <p className="text-[13px] text-(--color-text-muted)">No scan has run, so there is no coverage to report. Coverage is unknown, not complete.</p>
        </Panel>
      ) : (
        <Panel
          title="Latest scan"
          actions={
            <Link className="font-medium text-(--color-primary-text) hover:underline" to={scanHref(c.id, latest.id)}>
              Open the scan
            </Link>
          }
        >
          <RunReport run={latest} />
        </Panel>
      )}
      <Meta>
        Repositories outside the selection are not coverage gaps. <Link className="font-medium text-(--color-primary-text) hover:underline" to={detailHref(c.id, "scope")}>Change the scope</Link>
      </Meta>
    </div>
  );
}

export function CoverageTab({ c }: { c: Connection }) {
  if (c.provider === "k8s") return <K8sCoverage c={c} />;
  if (c.provider === "github") return <GitHubCoverage c={c} />;
  return <SurfaceCoverage c={c} />;
}
