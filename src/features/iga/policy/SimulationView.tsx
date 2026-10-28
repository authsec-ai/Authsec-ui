/**
 * SimulationPanel — displays simulation results for a runtime policy.
 *
 * Fetches a single simulation by ID and renders key fields (state, policy_id,
 * revision, graph_revision, target_digest) plus the result_summary as
 * formatted JSON inside a Panel / Facts layout.
 */

import {
  useGetSimulationQuery,
  type SimulationView as SimViewType,
} from "./policyApi";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";

// ── Helpers ──────────────────────────────────────────────────────────────────

function simulationTone(state: string): ConsoleTone {
  switch (state) {
    case "completed":
    case "passed":
      return "success";
    case "running":
    case "pending":
    case "queued":
      return "info";
    case "failed":
    case "error":
      return "danger";
    default:
      return "neutral";
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

interface SimulationPanelProps {
  simulationId: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SimulationPanel({ simulationId }: SimulationPanelProps) {
  const { data, isLoading, isError } = useGetSimulationQuery(simulationId);

  if (isLoading) {
    return (
      <Panel title="Simulation">
        <p className="py-4 text-center text-xs text-muted-foreground">
          Loading simulation...
        </p>
      </Panel>
    );
  }

  if (isError || !data) {
    return (
      <Panel title="Simulation">
        <p className="py-4 text-center text-xs text-muted-foreground">
          Failed to load simulation data.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Simulation" count={simulationId.slice(0, 8)}>
      <Facts>
        <Fact label="State">
          <StatusBadge tone={simulationTone(data.state)}>
            {data.state}
          </StatusBadge>
        </Fact>

        <Fact label="Policy ID" mono>
          {data.policy_id}
        </Fact>

        <Fact label="Revision">
          <span className="tabular-nums">v{data.revision}</span>
        </Fact>

        <Fact label="Graph revision">
          <span className="tabular-nums">{data.graph_revision}</span>
        </Fact>

        <Fact label="Target digest" mono>
          {data.target_digest}
        </Fact>

        <Fact label="Result summary">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-(--color-border-subtle) bg-(--color-surface-subtle) p-2 font-mono text-xs leading-relaxed">
            {JSON.stringify(data.result_summary, null, 2)}
          </pre>
        </Fact>
      </Facts>
    </Panel>
  );
}
