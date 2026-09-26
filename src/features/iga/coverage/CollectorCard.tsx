/**
 * One collector, from `GET /api/iga/v2/collectors/:id`.
 *
 * The card is rendered only when a coverage or pipeline row names
 * `collector_id`. A 404 means ingest is off or the collector is not in this
 * workspace. Desired and applied revisions are not a protected signal.
 */

import { useGetCollectorQuery, type CollectorView } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { coverageStateLabel } from "./collectorCoverage";
import { ProtectionBadge } from "./ProtectionBadge";

export function CollectorCardView({
  phase,
  collector,
}: {
  phase: "loading" | "not_found" | "error" | "ready";
  collector?: CollectorView | null;
}) {
  if (phase === "loading") {
    return <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading collector" />;
  }
  if (phase === "not_found") {
    return (
      <Panel title="Collector">
        <p className="text-sm text-(--color-text-muted)">
          Collector ingest is not enabled, or this collector is not in the workspace.
        </p>
      </Panel>
    );
  }
  if (phase === "error" || !collector) {
    return (
      <Panel title="Collector">
        <p className="text-sm text-(--color-text-muted)">The collector could not be read.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Collector" count={collector.kind}>
      <Facts>
        <Fact label="Status">{collector.status}</Fact>
        <Fact label="Health">{collector.health?.status ?? "Unknown"}</Fact>
        <Fact label="Desired revision">{collector.desired_revision == null ? "Not configured" : String(collector.desired_revision)}</Fact>
        <Fact label="Applied revision">{collector.applied_revision == null ? "Not configured" : String(collector.applied_revision)}</Fact>
        <Fact label="Protection">
          <ProtectionBadge controls={null} />
        </Fact>
      </Facts>
      {collector.coverage?.length ? (
        <ul className="mt-3 space-y-1 text-sm" aria-label="Collector coverage">
          {collector.coverage.map((row) => (
            <li key={row.object_class} className="flex items-center justify-between gap-2">
              <span>{row.object_class}</span>
              <StatusBadge tone={row.state === "stale" || row.state === "unknown" ? "warning" : "neutral"}>
                {coverageStateLabel(row.state)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-(--color-text-muted)">Coverage is Unknown. No object class was reported.</p>
      )}
    </Panel>
  );
}

export function CollectorCard({ ws, id }: { ws: string; id: string }) {
  const q = useGetCollectorQuery({ ws, id });
  const status = (q.error as { status?: number } | undefined)?.status;
  const phase = q.isLoading ? "loading" : status === 404 ? "not_found" : q.isError ? "error" : "ready";
  return <CollectorCardView phase={phase} collector={q.data} />;
}
