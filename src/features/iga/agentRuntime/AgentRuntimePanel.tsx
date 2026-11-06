/**
 * The agent-runtime picture of one identity or workload, as the graph read
 * carries it (`agent_runtime`, internal/igaread/agent_runtime.go:161), for the
 * identity and workload detail pages. Renders nothing when the backend sends
 * nothing.
 */

import { Link } from "react-router-dom";

import type { GraphAgentRuntime } from "@/app/api/igaGraphApi";

import { Fact, Facts, Panel } from "../shared/components/Panel";
import { CONTAIN_LEVEL_TEXT, shortTime } from "./model";
import { LabelChip } from "./parts";

export function AgentRuntimePanel({ ar }: { ar: GraphAgentRuntime | undefined }) {
  if (!ar) return null;
  const calls = ar.model_calls;
  return (
    <Panel
      title="Agent runtime"
      actions={<Link to="/iga/discovery?provider=aws&type=ai_workloads" className="font-medium text-(--color-primary-text) hover:underline">AI workloads</Link>}
    >
      <Facts>
        <Fact label="Label">{ar.label ? <LabelChip label={ar.label} /> : <span className="text-(--color-text-muted)">None</span>}</Fact>
        <Fact label="Model calls">
          {calls ? (
            <>
              {calls.calls} calls, {calls.denied} refused, last {shortTime(calls.last_call_at)}
              {calls.models.length ? <span className="block text-xs text-(--color-text-muted)">{calls.models.map((m) => `${m.model} (${m.calls})`).join(", ")}</span> : null}
            </>
          ) : (
            <span className="text-(--color-text-muted)">None in the evidence read</span>
          )}
        </Fact>
        <Fact label="Open alerts">
          {ar.open_alerts.count ? (
            <Link to="/iga/agent-runtime/alerts" className="text-(--color-primary-text) hover:underline">
              {ar.open_alerts.count}
              {ar.open_alerts.highest_severity ? `, highest ${ar.open_alerts.highest_severity}` : ""}
            </Link>
          ) : (
            "None"
          )}
        </Fact>
        <Fact label="Open findings">{ar.open_findings || "None"}</Fact>
        {ar.suggestion ? <Fact label="Suggestion">{ar.suggestion.state.replace(/_/g, " ")}</Fact> : null}
        {ar.containment ? (
          <Fact label="Containment">
            <Link to="/iga/agent-runtime/containments" className="text-(--color-primary-text) hover:underline">
              {CONTAIN_LEVEL_TEXT[ar.containment.level]?.title ?? ar.containment.level}, {ar.containment.state.replace(/_/g, " ")}
            </Link>
            {ar.containment.effective === false ? <span className="block text-xs text-(--color-warning-text)">Not yet verified as effective</span> : null}
          </Fact>
        ) : null}
      </Facts>
    </Panel>
  );
}
