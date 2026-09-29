/**
 * Is this cluster actually enforcing what we decided?
 *
 * The control plane publishes a plan; the agent polls it and reports back the
 * version it is enforcing. The difference between those two numbers IS the
 * enforcement gap — "decided at v43, enforcing v42" — and it is the one fact
 * that separates a governance decision from its effect.
 *
 * Two states are easy to confuse and are rendered differently on purpose:
 *
 *   never reported   no agent has ever polled. Enforcement is not running here.
 *   behind           an agent is polling, but on an older plan than the latest.
 *
 * The first is a deployment problem, the second usually resolves itself within
 * one poll interval. Showing them the same way would send someone to debug the
 * wrong thing.
 */

import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { useListEnforcementPlansQuery } from "@/app/api/governanceApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

export function EnforcementStatusCard({ connectorId }: { connectorId: string }) {
  const { data, isLoading, error } = useListEnforcementPlansQuery({ connectorId, limit: 10 });

  if (isLoading || error || !data) return null;

  const neverReported = !data.enforcement_mode;
  const published = data.published_version;
  const enforced = data.enforced_plan_version ?? null;

  return (
    <Card>
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Enforcement</h3>
          {neverReported ? (
            <span className={`${PILL} bg-muted text-muted-foreground`}>not reporting</span>
          ) : data.behind ? (
            <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
              behind
            </span>
          ) : (
            <span className={`${PILL} bg-(--color-success-soft) text-(--color-success-text)`}>
              in step
            </span>
          )}
        </div>

        {neverReported ? (
          <p className="text-[11px] text-muted-foreground">
            No agent in this cluster has ever reported an enforcement mode. Containment decisions
            are recorded here but nothing applies them — install the agent with the actuation role
            to close that gap.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <dt className="text-muted-foreground">Decided at</dt>
              <dd className="text-foreground">v{published}</dd>

              <dt className="text-muted-foreground">Enforcing</dt>
              <dd className={data.behind ? "text-(--color-warning-text)" : "text-foreground"}>
                {enforced === null ? "—" : `v${enforced}`}
              </dd>

              <dt className="text-muted-foreground">Mode</dt>
              <dd className="text-foreground">{data.enforcement_mode}</dd>

              {data.enforced_plan_at ? (
                <>
                  <dt className="text-muted-foreground">Last poll</dt>
                  <dd className="text-foreground">
                    {formatDistanceToNow(new Date(data.enforced_plan_at), { addSuffix: true })}
                  </dd>
                </>
              ) : null}

              <dt className="text-muted-foreground">Would-deny count</dt>
              <dd className="text-foreground">{data.enforcement_denials_total}</dd>
            </dl>

            {data.enforcement_mode === "observe" ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                This cluster is in <span className="font-mono">observe</span> mode: it counts what
                it would have refused and blocks nothing. Watch that count against real traffic
                before enabling deny for a namespace.
              </p>
            ) : null}

            {data.behind ? (
              <p className="text-[11px] text-(--color-warning-text)">
                The cluster is enforcing an older plan than the one published. That usually clears
                within one poll interval; if it persists, the agent cannot reach the control plane
                — and a release decided here has not taken effect there.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
