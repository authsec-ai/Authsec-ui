/**
 * The lifecycle trail for one discovered agent — the only place a user sees WHO
 * removed an agent and HOW it was noticed.
 *
 *   pod_terminated  a rollout, not a removal. Changes no governance state; styled
 *                   as routine, never alarming.
 *   deleted         came from admission and carries an attributed actor.
 *   absent          came from a resync sweep — the agent is gone but nobody knows
 *                   who removed it. An empty actor is NOT "unknown user"; the
 *                   channel simply could not attribute it, and we say so.
 */

import { formatDistanceToNow } from "date-fns";

import {
  useGetAgentEventsQuery,
  type DiscoveredAgentEvent,
} from "@/app/api/discoveryApi";

const EVENT_LABEL: Record<DiscoveredAgentEvent["event"], string> = {
  observed: "Observed",
  deleted: "Deleted",
  pod_terminated: "Pod terminated",
  absent: "Absent from sweep",
  reappeared: "Reappeared",
};

// pod_terminated is routine (a reschedule); deleted/absent are the removals.
function tone(event: DiscoveredAgentEvent["event"]): string {
  switch (event) {
    case "deleted":
    case "absent":
      return "text-(--color-warning-text)";
    case "reappeared":
      return "text-(--color-success-text)";
    default:
      return "text-muted-foreground";
  }
}

/** Attribution line that never invents an actor for a channel that can't attribute. */
function attribution(e: DiscoveredAgentEvent): string {
  if (e.actor) return `by ${e.actor}`;
  if (e.event === "absent") return "the resync sweep could not attribute who removed it";
  if (e.channel) return `via ${e.channel}`;
  return "";
}

export function AgentLifecycleTrail({ agentId }: { agentId: string }) {
  const { data, isLoading, isError, error } = useGetAgentEventsQuery(agentId, {
    skip: !agentId,
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading lifecycle trail…</p>;
  }
  if (isError) {
    return (
      <p className="text-xs text-muted-foreground">
        {(error as { status?: number })?.status === 403
          ? "Your role is missing the discovery:read permission."
          : "Could not load the lifecycle trail."}
      </p>
    );
  }
  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No lifecycle events recorded yet. Deletions and disappearances appear here as they are
        observed.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const attr = attribution(e);
        return (
          <li key={e.id} className="flex gap-3 text-xs">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-current text-muted-foreground" />
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-medium ${tone(e.event)}`}>{EVENT_LABEL[e.event]}</span>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(e.observed_at), { addSuffix: true })}
                </span>
                {e.channel ? (
                  <span className="font-mono text-[10px] text-muted-foreground">{e.channel}</span>
                ) : null}
              </div>
              {attr ? <div className="text-muted-foreground">{attr}</div> : null}
              {e.reason ? <div className="text-foreground/80">{e.reason}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
