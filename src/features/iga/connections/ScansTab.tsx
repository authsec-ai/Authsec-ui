/**
 * Scans: the history of how this connection was read, by provider.
 *
 * AWS has a run per scan (queue, publication, graph build); GitHub has a run
 * per repository scan; Google Cloud keeps only its latest scan on the
 * connector; a Kubernetes agent has no scans to start, only a heartbeat
 * (connection health) and sweeps (the inventory date), shown as separate
 * facts and said plainly when they disagree.
 */

import { Link } from "react-router-dom";

import type { Connection } from "@/app/api/connectionsApi";
import { useGetGcpConnectorQuery } from "@/app/api/cloudDiscoveryApi";
import { useListScanRunsQuery } from "@/app/api/discoveryApi";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { AWSScanHistory } from "@/features/discovery/cloud/aws/AWSScanHistory";
import { GitHubScanPanel, StatusPill as GitHubRunPill } from "@/features/discovery/GitHubScanPanel";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { ago, day, inventoryLagsHeartbeat, heartbeatRecent, scanHref } from "./connectionModel";

function K8sScans({ c }: { c: Connection }) {
  return (
    <Panel
      title="Heartbeat and inventory"
      description="The agent scans on its own schedule; there is no scan to start from here. Two different things are reported, and they are not the same date."
    >
      <Facts>
        <Fact label="Connection health">
          {c.scan.heartbeat_at ? (
            <span>
              {heartbeatRecent(c) ? "Agent online" : "Agent not heard from recently"}, heartbeat <Timestamp iso={c.scan.heartbeat_at} />
            </span>
          ) : (
            "No heartbeat received yet"
          )}
        </Fact>
        <Fact label="Inventory date">
          {c.scan.at ? (
            <span>
              Sweep on {day(c.scan.at)} (<Timestamp iso={c.scan.at} />)
            </span>
          ) : (
            "No inventory received yet"
          )}
        </Fact>
        {c.scan.reports_every_seconds ? (
          <Fact label="Reports">Every {Math.max(1, Math.round(c.scan.reports_every_seconds / 60))} min</Fact>
        ) : null}
      </Facts>
      {inventoryLagsHeartbeat(c) ? (
        <Meta className="mt-3">Agent online; its last inventory is from {day(c.scan.at)}. A heartbeat shows the agent is alive; only a sweep shows what is in the cluster.</Meta>
      ) : null}
    </Panel>
  );
}

function GcpScans({ c }: { c: Connection }) {
  const q = useGetGcpConnectorQuery(c.id);
  if (q.isError && !q.data) {
    return <LoadFailurePanel failure={loadFailureOf(q.error) ?? "failed"} subject="this project's scan" permission="discovery:read" onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the scan" />;
  const cov = q.data.coverage;
  return (
    <Panel title="Latest scan" description="Google Cloud keeps its latest scan on the connection; earlier scans are not kept as runs.">
      {cov?.status ? (
        <Facts>
          <Fact label="Outcome">
            <CloudPill tone={cov.status === "complete" ? "success" : cov.status === "running" ? "info" : cov.status === "partial" ? "warning" : "danger"}>
              {cov.status === "complete" ? "Complete" : cov.status === "running" ? "Running" : cov.status === "partial" ? "Partial" : "Failed"}
            </CloudPill>
          </Fact>
          <Fact label="Started">{cov.started_at ? <Timestamp iso={cov.started_at} /> : "—"}</Fact>
          <Fact label="Finished">{cov.finished_at ? <Timestamp iso={cov.finished_at} /> : cov.status === "running" ? "Still running" : "—"}</Fact>
          <Fact label="Scan generation">{q.data.scan_generation}</Fact>
          {cov.error ? <Fact label="Error">{cov.error}</Fact> : null}
        </Facts>
      ) : (
        <p className="text-[13px] text-(--color-text-muted)">This project has not been scanned yet.</p>
      )}
      <Meta className="mt-3">
        <Link className="font-medium text-(--color-primary-text) hover:underline" to={`/iga/connections/${encodeURIComponent(c.id)}/coverage`}>
          See what the scan read
        </Link>
      </Meta>
    </Panel>
  );
}

function GitHubScans({ c }: { c: Connection }) {
  const runs = useListScanRunsQuery(c.id);
  return (
    <div className="space-y-4">
      <GitHubScanPanel sourceId={c.id} />
      <Panel title="Scan history" flush>
        {runs.isError && !runs.data ? (
          <div className="p-4">
            <LoadFailurePanel failure={loadFailureOf(runs.error) ?? "failed"} subject="the scan history" permission="discovery:read" onRetry={() => void runs.refetch()} />
          </div>
        ) : runs.isLoading ? (
          <p className="px-4 py-3 text-xs text-(--color-text-muted)">Loading the scan history…</p>
        ) : !runs.data?.length ? (
          <p className="px-4 py-3 text-xs text-(--color-text-muted)">No scans yet.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle)">
            {runs.data.slice(0, 20).map((r) => (
              <li key={r.id}>
                <Link
                  to={scanHref(c.id, r.id)}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-(--color-surface-subtle)"
                >
                  <span className="flex items-center gap-2">
                    <GitHubRunPill run={r} />
                    <span className="text-(--color-text-muted)">
                      {r.repos_scanned}/{r.repos_selected} repositories · {r.sightings_new} new
                    </span>
                  </span>
                  <span className="text-(--color-text-muted)">{ago(r.finished_at ?? r.queued_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function ScansTab({ c }: { c: Connection }) {
  switch (c.provider) {
    case "aws":
      return (
        <Panel title="Scan history" description="How each scan ended, what it could read, and whether it reached the graph. A failed scan keeps the earlier results.">
          <AWSScanHistory connectorId={c.id} runHref={(runId) => scanHref(c.id, runId)} />
        </Panel>
      );
    case "gcp":
      return <GcpScans c={c} />;
    case "k8s":
      return <K8sScans c={c} />;
    default:
      return <GitHubScans c={c} />;
  }
}
