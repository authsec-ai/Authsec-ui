/**
 * One scan: its status, timings, what it read per surface, and its errors.
 *
 * AWS runs are the cloud scan runs (queue → publication → graph build);
 * GitHub runs are repository scans. Google Cloud and Kubernetes have no run to
 * open: Google Cloud keeps its latest scan on the connection, and a cluster's
 * agent sweeps on its own.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import type { Connection } from "@/app/api/connectionsApi";
import { useGetAwsScanRunQuery, useListAwsScanRunsQuery } from "@/app/api/cloudDiscoveryApi";
import { isScanRunTerminal, useGetScanRunQuery } from "@/app/api/discoveryApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { loadFailureOf } from "@/components/console/load-failure";
import { LoadFailurePanel } from "@/components/console/load-state";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { Button } from "@/components/ui/button";
import { CloudPill } from "@/features/discovery/cloud/CloudPill";
import { RUN_LABEL, RUN_TONE, graphOutcome } from "@/features/discovery/cloud/aws/awsScanRunLabels";
import { RunReport } from "@/features/discovery/GitHubScanPanel";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { surfaceStateText } from "@/features/iga/shared/labels";

import { consequence } from "./coverageView";
import { detailHref } from "./connectionModel";
import { useConnection } from "./useConnection";
import { readableSurface } from "@/features/iga/coverage/surfaceNames";
import type { CloudCoverageState } from "@/app/api/cloudDiscoveryApi";

function duration(a?: string | null, b?: string | null): string | null {
  if (!a || !b) return null;
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** The run's row in the history, which carries what the single-run read does not: the surfaces. */
function useAwsRunItem(connectorId: string, runId: string, skip: boolean) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState(0);
  const q = useListAwsScanRunsQuery({ connectorId, cursor }, { skip });
  const item = q.currentData?.data.find((r) => r.id === runId);
  const next = q.currentData?.meta.next_cursor;
  useEffect(() => {
    if (!skip && !item && next && !q.isFetching && pages < 20) {
      setCursor(next);
      setPages((p) => p + 1);
    }
  }, [skip, item, next, q.isFetching, pages]);
  return { item, searching: !skip && !item && (q.isFetching || (!!next && pages < 20)), error: q.error, refetch: q.refetch };
}

function AwsScan({ c, runId }: { c: Connection; runId: string }) {
  // Follow the run while it is queued or running; a finished one is static.
  const [poll, setPoll] = useState(0);
  const run = useGetAwsScanRunQuery(runId, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const data = run.data;
  const live = data?.status === "queued" || data?.status === "running";
  useEffect(() => setPoll(live ? 3000 : 0), [live]);
  const hist = useAwsRunItem(c.id, runId, !data);

  if (run.isError && !data) {
    return <LoadFailurePanel failure={loadFailureOf(run.error) ?? "failed"} subject="this scan" permission="discovery:read" onRetry={() => void run.refetch()} />;
  }
  if (!data) return <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the scan" />;
  if (data.connector_id !== c.id) {
    return <LoadFailurePanel failure="not_found" subject="this scan" onRetry={() => undefined} />;
  }

  const item = hist.item;
  const graph = item ? graphOutcome(item) : null;
  const counts = item?.coverage?.counts ?? null;
  const notReached = item?.coverage?.not_reached ?? [];
  const finished = item?.finished_at ?? data.published_at ?? null;
  const took = duration(data.started_at, finished);

  return (
    <div className="space-y-4">
      <Panel title="Outcome" actions={<CloudPill tone={RUN_TONE[data.status]}>{RUN_LABEL[data.status]}</CloudPill>}>
        <Facts>
          <Fact label="Requested">
            <Timestamp iso={data.requested_at} /> · {data.trigger}
          </Fact>
          <Fact label="Started">{data.started_at ? <Timestamp iso={data.started_at} /> : "Not started yet"}</Fact>
          <Fact label="Finished">{finished ? <Timestamp iso={finished} /> : live ? "Still running" : "—"}</Fact>
          {took ? <Fact label="Duration">{took}</Fact> : null}
          <Fact label="Attempts">{data.attempts}</Fact>
          {graph ? <Fact label="Graph">{graph}</Fact> : null}
        </Facts>
        {data.last_error && (data.status === "failed" || data.status === "abandoned") ? (
          <p role="alert" className="mt-3 rounded-md bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
            {data.last_error}. Earlier results are still shown, and marked stale where affected.
          </p>
        ) : null}
        {live ? <Meta className="mt-3">This page updates while the scan runs. Scans in a workspace run one at a time, so a queued scan may wait for another.</Meta> : null}
      </Panel>

      <Panel
        title="What it read"
        description="Per surface, as this scan ended."
        actions={
          <Link className="font-medium text-(--color-primary-text) hover:underline" to={detailHref(c.id, "coverage")}>
            Coverage for the connection
          </Link>
        }
      >
        {hist.searching ? (
          <p className="text-[13px] text-(--color-text-muted)">Looking for this scan in the history…</p>
        ) : !item ? (
          <p className="text-[13px] text-(--color-text-muted)">
            {hist.error ? "The scan history could not be loaded, so what this scan read is unknown." : "This scan is no longer in the recent history, so what it read is not shown here."}
          </p>
        ) : !counts ? (
          <p className="text-[13px] text-(--color-text-muted)">Coverage is recorded when a scan publishes. This one has not.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px]">
              {Object.entries(counts)
                .filter(([, n]) => n > 0)
                .sort(([a], [b]) => (a === "reached" ? -1 : b === "reached" ? 1 : a.localeCompare(b)))
                .map(([state, n]) => `${n} ${surfaceStateText(state)}`)
                .join(" · ") || "No surfaces recorded."}
            </p>
            {notReached.length ? (
              <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                {notReached.map((g) => {
                  const s = readableSurface(g.surface);
                  const state = g.state as CloudCoverageState;
                  const cons = consequence("aws", s.service, s.region, state, 0);
                  return (
                    <li key={g.surface} className="px-3 py-2.5">
                      <p className="text-[13px] font-medium">
                        {s.service}
                        {s.region ? <span className="font-normal text-(--color-text-muted)"> · {s.region}</span> : null}
                      </p>
                      <p className="text-xs text-(--color-text-muted)">{cons.lead}</p>
                      {cons.todo ? <p className="text-xs">{cons.todo}</p> : null}
                      <details className="mt-1">
                        <summary className="inline cursor-pointer text-xs text-(--color-primary-text) hover:underline">Details</summary>
                        <dl className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs">
                          <dt className="text-(--color-text-muted)">Surface</dt>
                          <dd className="break-all font-mono">{g.surface}</dd>
                          <dt className="text-(--color-text-muted)">State</dt>
                          <dd>{surfaceStateText(g.state)}</dd>
                          {g.api ? (
                            <>
                              <dt className="text-(--color-text-muted)">API call</dt>
                              <dd className="break-all font-mono">{g.api}</dd>
                            </>
                          ) : null}
                          {g.error_code ? (
                            <>
                              <dt className="text-(--color-text-muted)">Error code</dt>
                              <dd className="break-all font-mono">{g.error_code}</dd>
                            </>
                          ) : null}
                        </dl>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-(--color-text-muted)">Every surface this scan was asked to read was read.</p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function GitHubScan({ c, runId }: { c: Connection; runId: string }) {
  const [poll, setPoll] = useState(0);
  const run = useGetScanRunQuery(runId, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const data = run.data;
  const live = !!data && !isScanRunTerminal(data.status);
  useEffect(() => setPoll(live ? 2500 : 0), [live]);
  if (run.isError && !data) {
    return <LoadFailurePanel failure={loadFailureOf(run.error) ?? "failed"} subject="this scan" permission="discovery:read" onRetry={() => void run.refetch()} />;
  }
  if (!data) return <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the scan" />;
  if (data.source_id !== c.id) return <LoadFailurePanel failure="not_found" subject="this scan" onRetry={() => undefined} />;
  return (
    <Panel title="Scan">
      <RunReport run={data} />
    </Panel>
  );
}

export default function ScanDetailPage() {
  const { id = "", runId = "" } = useParams<{ id?: string; runId?: string }>();
  const { connection: c, loading, failure, notFound, refetch } = useConnection(id);
  useBreadcrumbTail(c ? detailHref(id) : null, c?.name ?? null, { label: "Connections", href: "/iga/connections" });
  const back = useMemo(
    () => (
      <Button variant="outline" size="sm" asChild>
        <Link to={detailHref(id, "scans")}>
          <ArrowLeft className="size-4" /> Scans
        </Link>
      </Button>
    ),
    [id],
  );

  if (loading) {
    return (
      <ConsolePage title="Scan" description="Loading…" variant="object">
        <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the scan" />
      </ConsolePage>
    );
  }
  if (!c) {
    return (
      <ConsolePage title="Scan" variant="object">
        <LoadFailurePanel failure={failure ?? (notFound ? "not_found" : "failed")} subject="this connection" permission="discovery:read" onRetry={() => void refetch()} />
        <div>
          <Button variant="outline" asChild>
            <Link to="/iga/connections">All connections</Link>
          </Button>
        </div>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage title={`Scan of ${c.name}`} description={`${c.provider === "aws" ? "AWS" : "GitHub"} scan`} variant="object" actions={back}>
      {c.provider === "aws" ? (
        <AwsScan c={c} runId={runId} />
      ) : c.provider === "github" ? (
        <GitHubScan c={c} runId={runId} />
      ) : (
        <Panel title="No scan to open">
          <p className="text-[13px] text-(--color-text-muted)">
            {c.provider === "gcp"
              ? "Google Cloud keeps only its latest scan, on the connection. It is shown under Scans."
              : "A Kubernetes agent sweeps on its own schedule, so there are no scans to open. Heartbeat and inventory dates are shown under Scans."}
          </p>
        </Panel>
      )}
    </ConsolePage>
  );
}
