/**
 * The agents on machines: what runs where, and quarantine or release. A row's
 * right-click (or ⋯) menu also opens its policy, logs and access.
 *
 * Quarantine is the existing discovery decision (discovery:quarantine,
 * audited, a reason required). The server queues it to the machine, whose
 * daemon freezes the agent and cuts its network; "Quarantine pending" means
 * decided but not yet applied (the machine has enforcement off, is not
 * reporting, or does not run as root).
 */

import { useCallback, useState } from "react";
import { toast } from "react-hot-toast";

import {
  useListDiscoveredAgentsQuery,
  useQuarantineAgentMutation,
  useUnquarantineAgentMutation,
  type DiscoveredAgent,
  type DiscoverySource,
} from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { ContextMenu, MUTED, RowMenuButton } from "./MachineParts";
import { menuAt, type MenuItem, type MenuState } from "./menu";
import {
  machineAgentId,
  machineInstances,
  machineUsers,
  quarantineState,
} from "./machinesModel";

const POLL_MS = 10_000;

export interface AgentNav {
  policy: (agentId: string) => void;
  logs: (agentId: string) => void;
  access?: (agentId: string) => void;
}

export function AgentsPanel({
  sourceId,
  machines,
  nav,
}: {
  sourceId?: string;
  machines?: DiscoverySource[];
  nav: AgentNav;
}) {
  const q = useListDiscoveredAgentsQuery(
    { source: "vm_sensor", discovery_source_id: sourceId, limit: 200 },
    { pollingInterval: POLL_MS },
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [target, setTarget] = useState<DiscoveredAgent | null>(null);
  const [release] = useUnquarantineAgentMutation();
  const closeMenu = useCallback(() => setMenu(null), []);
  const machineName = (id?: string) =>
    machines?.find((m) => m.id === id)?.display_name ||
    machines?.find((m) => m.id === id)?.cluster_name ||
    "";

  const items = (a: DiscoveredAgent): MenuItem[] => {
    const id = machineAgentId(a);
    const out: MenuItem[] = [];
    if (a.status === "quarantined")
      out.push({
        label: "Release",
        onSelect: () =>
          void release({ id: a.id })
            .unwrap()
            .then(() =>
              toast.success(
                `${a.display_name} released. The machine lets it run again within seconds.`,
              ),
            )
            .catch((e: { status?: number }) =>
              toast.error(
                e.status === 403
                  ? "Your role cannot release agents."
                  : "Release failed.",
              ),
            ),
      });
    else
      out.push({
        label: "Quarantine…",
        danger: true,
        onSelect: () => setTarget(a),
      });
    if (id) {
      out.push({ label: "Edit policy", onSelect: () => nav.policy(id) });
      out.push({ label: "Show logs", onSelect: () => nav.logs(id) });
      if (nav.access)
        out.push({ label: "Show access", onSelect: () => nav.access?.(id) });
    }
    return out;
  };

  if (q.isLoading)
    return <p className={`py-6 text-sm ${MUTED}`}>Loading agents…</p>;
  if (q.isError)
    return (
      <p className="py-6 text-sm text-(--color-danger-text)">
        The agents could not be loaded.
      </p>
    );
  const agents = q.data?.agents ?? [];
  if (!agents.length)
    return (
      <p className={`py-6 text-sm ${MUTED}`}>
        No agents reported yet. A connected machine reports the AI agents it
        runs within a minute.
      </p>
    );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            {!sourceId ? <TableHead>Machine</TableHead> : null}
            <TableHead>Running</TableHead>
            <TableHead>Users</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((a) => {
            const qs = quarantineState(a);
            return (
              <TableRow
                key={a.id}
                onContextMenu={(e) => setMenu(menuAt(e, items(a)))}
              >
                <TableCell>
                  <div className="font-medium">
                    {machineAgentId(a)
                      ? a.display_name.replace(/ on .*$/, "")
                      : a.display_name}
                  </div>
                  <div className={`font-mono text-xs ${MUTED}`}>
                    {machineAgentId(a)}
                  </div>
                </TableCell>
                {!sourceId ? (
                  <TableCell>{machineName(a.discovery_source_id)}</TableCell>
                ) : null}
                <TableCell>
                  {a.runtime_status === "running"
                    ? `${machineInstances(a) || 1} instance${machineInstances(a) === 1 ? "" : "s"}`
                    : a.runtime_status}
                </TableCell>
                <TableCell className="text-xs">
                  {machineUsers(a).join(", ")}
                </TableCell>
                <TableCell>
                  {qs.word ? (
                    <ConnPill
                      tone={qs.tone === "danger" ? "danger" : "warning"}
                      title={
                        a.quarantine_enforcement_error || a.quarantine_reason
                      }
                    >
                      {qs.word}
                    </ConnPill>
                  ) : (
                    <span className={`text-xs ${MUTED}`}>{a.status}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  {agoText(a.last_seen_at)}
                </TableCell>
                <TableCell>
                  <RowMenuButton
                    label={`Actions for ${a.display_name}`}
                    onOpen={(e) => setMenu(menuAt(e, items(a)))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className={`mt-2 text-xs ${MUTED}`}>
        Right-click an agent for quarantine, its policy and its logs.
      </p>
      <ContextMenu menu={menu} onClose={closeMenu} />
      <QuarantineDialog agent={target} onClose={() => setTarget(null)} />
    </>
  );
}

function QuarantineDialog({
  agent,
  onClose,
}: {
  agent: DiscoveredAgent | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [quarantine, state] = useQuarantineAgentMutation();
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    setReason("");
    setError(null);
    onClose();
  };
  const submit = async () => {
    if (!agent) return;
    try {
      await quarantine({ id: agent.id, reason: reason.trim() }).unwrap();
      toast.success(
        `${agent.display_name} quarantined. The machine freezes it and cuts its network once it picks this up.`,
      );
      done();
    } catch (e) {
      const err = e as { status?: number; data?: { error?: string } };
      setError(
        err.status === 403
          ? "Your role cannot quarantine agents: it needs discovery:quarantine."
          : (err.data?.error ?? "Quarantine failed."),
      );
    }
  };
  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && done()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quarantine {agent?.display_name}</DialogTitle>
          <DialogDescription>
            The machine freezes every instance of this agent and cuts its
            network, and does the same to new ones, until it is released. The
            machine needs enforcement turned on (Enforcement tab) and its daemon
            running as root.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="q-reason">Reason</Label>
          <Input
            id="q-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reached a production database"
          />
        </div>
        {error ? (
          <p className="text-xs text-(--color-danger-text)">{error}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={done}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || state.isLoading}
            onClick={() => void submit()}
          >
            {state.isLoading ? "Quarantining…" : "Quarantine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
