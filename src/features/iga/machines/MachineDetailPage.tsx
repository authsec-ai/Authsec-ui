/**
 * One machine: its agents (quarantine), what each reached (block), the
 * policies it applies, its logs, and enforcement and SIEM forwarding.
 * A machine is a connection: ConnectionDetailPage renders this for one of
 * provider `machine`, at /iga/connections/:id, and names it in the
 * breadcrumb. Another workspace's machine, or one that does not exist, is
 * "not found".
 */

import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useGetDiscoverySourceQuery } from "@/app/api/discoveryApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { ConnPill } from "@/features/iga/connections/ConnPill";
import { agoText } from "@/features/iga/shared/labels";

import { AccessPanel } from "./AccessPanel";
import { AgentsPanel } from "./AgentsPanel";
import { EnforcementPanel } from "./EnforcementPanel";
import { LogsPanel } from "./LogsPanel";
import { MUTED } from "./MachineParts";
import { machineStatus } from "./machinesModel";
import { PoliciesPanel } from "./PoliciesPanel";
import { TabBar } from "./TabBar";

const TABS = [
  { key: "agents", label: "Agents" },
  { key: "access", label: "Access" },
  { key: "policies", label: "Policies" },
  { key: "logs", label: "Logs" },
  { key: "enforcement", label: "Enforcement and SIEM" },
] as const;

export default function MachineDetailPage({ id }: { id: string }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "agents";
  const agent = params.get("agent") ?? undefined;
  const q = useGetDiscoverySourceQuery(id, { pollingInterval: 15_000 });

  const go = useCallback(
    (next: string, agentId?: string) => {
      const p = new URLSearchParams(params);
      p.set("tab", next);
      if (agentId) p.set("agent", agentId);
      else p.delete("agent");
      setParams(p);
    },
    [params, setParams],
  );

  if (q.isLoading)
    return (
      <ConsolePage title="Machine">
        {<p className={`text-sm ${MUTED}`}>Loading…</p>}
      </ConsolePage>
    );
  const status = (q.error as { status?: number } | undefined)?.status;
  if (q.isError || !q.data || q.data.kind !== "vm_sensor")
    return (
      <ConsolePage title="Machine">
        <p className="text-sm">
          {status === 404 || (q.data && q.data.kind !== "vm_sensor")
            ? "This machine was not found."
            : "The machine could not be loaded."}{" "}
          <Link
            to="/iga/connections"
            className="text-(--color-primary-text) hover:underline"
          >
            All connections
          </Link>
        </p>
      </ConsolePage>
    );

  const m = q.data;
  const st = machineStatus(m);
  return (
    <ConsolePage
      variant="object"
      title={m.display_name || m.cluster_name}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <ConnPill tone={st.tone === "neutral" ? "muted" : st.tone}>
            {st.word}
          </ConnPill>
          <span>
            last report {agoText(m.last_heartbeat_at)} · authsec-cli{" "}
            {m.agent_version || "unknown"} · {m.agent_count} agents
          </span>
        </span>
      }
    >
      <TabBar tabs={TABS} active={tab} onChange={(k) => go(k)} />
      {tab === "agents" ? (
        <AgentsPanel
          sourceId={m.id}
          nav={{
            policy: (a) => go("policies", a),
            logs: (a) => go("logs", a),
            access: (a) => go("access", a),
          }}
        />
      ) : null}
      {tab === "access" ? (
        <AccessPanel
          sourceId={m.id}
          agent={agent}
          onAgent={(a) => go("access", a)}
        />
      ) : null}
      {tab === "policies" ? (
        <>
          <p className={`text-xs ${MUTED}`}>
            Policies are kept for the whole workspace: every connected machine
            applies the same ones.
          </p>
          <PoliciesPanel agent={agent} onAgent={(a) => go("policies", a)} />
        </>
      ) : null}
      {tab === "logs" ? (
        <LogsPanel
          sourceId={m.id}
          agent={agent}
          onAgent={(a) => go("logs", a || undefined)}
          onPolicy={(a) => go("policies", a)}
        />
      ) : null}
      {tab === "enforcement" ? <EnforcementPanel source={m} /> : null}
    </ConsolePage>
  );
}
