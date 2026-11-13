/**
 * Machines: laptops, workstations and servers running the AuthSec Agent Kit.
 *
 * Tabs: the machines; every agent on them (quarantine); the agent policies
 * machines apply; and the logs of what they decided and detected. One
 * machine's own page narrows each to it and adds Access and Enforcement.
 */

import { useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useListDiscoverySourcesQuery } from "@/app/api/discoveryApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConnPill } from "@/features/iga/connections/ConnPill";
import { agoText } from "@/features/iga/shared/labels";

import { AddMachineDialog } from "./AddMachineDialog";
import { AgentsPanel } from "./AgentsPanel";
import { LogsPanel } from "./LogsPanel";
import { MUTED } from "./MachineParts";
import { enforcementWord, machineStatus } from "./machinesModel";
import { PoliciesPanel } from "./PoliciesPanel";
import { TabBar } from "./TabBar";

const TABS = [
  { key: "machines", label: "Machines" },
  { key: "agents", label: "Agents" },
  { key: "policies", label: "Policies" },
  { key: "logs", label: "Logs" },
] as const;

export default function MachinesPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = TABS.find((t) => t.key === params.get("tab"))?.key ?? "machines";
  const agent = params.get("agent") ?? undefined;
  const sources = useListDiscoverySourcesQuery(
    { kind: "vm_sensor" },
    { pollingInterval: 15_000 },
  );
  const machines = sources.data ?? [];

  const go = useCallback(
    (next: string, agentId?: string) => {
      const p = new URLSearchParams(params);
      p.set("tab", next);
      if (agentId) p.set("agent", agentId);
      else p.delete("agent");
      p.delete("add");
      setParams(p);
    },
    [params, setParams],
  );
  const setAddOpen = (open: boolean) => {
    const p = new URLSearchParams(params);
    if (open) p.set("add", "1");
    else p.delete("add");
    setParams(p);
  };

  return (
    <ConsolePage
      title="Machines"
      description="AI agents on laptops, workstations and servers: what runs, what it reaches, and the policies that bound it."
      actions={<Button onClick={() => setAddOpen(true)}>Add machine</Button>}
    >
      <TabBar tabs={TABS} active={tab} onChange={(k) => go(k)} />
      {tab === "machines" ? (
        sources.isLoading ? (
          <p className={`py-6 text-sm ${MUTED}`}>Loading machines…</p>
        ) : sources.isError ? (
          <p className="py-6 text-sm text-(--color-danger-text)">
            Machines could not be loaded.
          </p>
        ) : !machines.length ? (
          <div className="space-y-2 py-6 text-sm">
            <p>No machines yet.</p>
            <p className={MUTED}>
              Add one: the console writes the three commands to run on it.
            </p>
            <Button onClick={() => setAddOpen(true)}>Add machine</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agents</TableHead>
                <TableHead>Enforcement</TableHead>
                <TableHead>authsec-cli</TableHead>
                <TableHead>Last report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machines.map((m) => {
                const st = machineStatus(m);
                return (
                  <TableRow
                    key={m.id}
                    onClick={() =>
                      navigate(`/iga/machines/${encodeURIComponent(m.id)}`)
                    }
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <Link
                        to={`/iga/machines/${encodeURIComponent(m.id)}`}
                        className="font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.display_name || m.cluster_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ConnPill
                        tone={st.tone === "neutral" ? "muted" : st.tone}
                      >
                        {st.word}
                      </ConnPill>
                    </TableCell>
                    <TableCell>{m.agent_count}</TableCell>
                    <TableCell className="text-xs">
                      {enforcementWord(m)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.agent_version}
                    </TableCell>
                    <TableCell className="text-xs">
                      {agoText(m.last_heartbeat_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )
      ) : null}
      {tab === "agents" ? (
        <AgentsPanel
          machines={machines}
          nav={{
            policy: (id) => go("policies", id),
            logs: (id) => go("logs", id),
          }}
        />
      ) : null}
      {tab === "policies" ? (
        <PoliciesPanel agent={agent} onAgent={(id) => go("policies", id)} />
      ) : null}
      {tab === "logs" ? (
        <LogsPanel
          machines={machines}
          agent={agent}
          onAgent={(id) => go("logs", id || undefined)}
          onPolicy={(id) => go("policies", id)}
        />
      ) : null}
      <AddMachineDialog
        open={params.get("add") === "1"}
        onOpenChange={setAddOpen}
      />
    </ConsolePage>
  );
}
