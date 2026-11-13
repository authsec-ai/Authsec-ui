/**
 * What each agent reached in the last hour, per machine: files (sensitive
 * ones marked), network destinations and the services behind them (database,
 * Redis, Vault, GitHub, cloud APIs, LLM APIs), and programs it ran. Right-click
 * a row (or ⋯) to block it for that agent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useListAgentKitAccessQuery } from "@/app/api/agentkitApi";
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

import {
  BlockDialog,
  ContextMenu,
  MUTED,
  RowMenuButton,
  type PendingBlock,
} from "./MachineParts";
import { menuAt, type MenuItem, type MenuState } from "./menu";
import { accessRows, type AccessRow } from "./machinesModel";

const CATEGORY: Record<AccessRow["category"], string> = {
  file: "Files",
  network: "Network",
  service: "Services",
  command: "Programs",
};

export function AccessPanel({
  sourceId,
  agent,
  onAgent,
}: {
  sourceId: string;
  agent?: string;
  onAgent: (id: string) => void;
}) {
  const q = useListAgentKitAccessQuery(
    { discovery_source_id: sourceId },
    { pollingInterval: 60_000 },
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pending, setPending] = useState<PendingBlock | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const list = q.data ?? [];
  const selected = list.find((a) => a.agent_id === agent) ?? list[0];

  useEffect(() => {
    if (!agent && selected) onAgent(selected.agent_id);
  }, [agent, selected, onAgent]);

  const rows = useMemo(() => accessRows(selected?.record.summary), [selected]);

  if (q.isLoading)
    return <p className={`py-6 text-sm ${MUTED}`}>Loading access…</p>;
  if (q.isError)
    return (
      <p className="py-6 text-sm text-(--color-danger-text)">
        Access could not be loaded.
      </p>
    );
  if (!list.length)
    return (
      <p className={`py-6 text-sm ${MUTED}`}>
        No access summary yet. The machine sends one every 10 minutes, covering
        the last hour. File access needs the eBPF sensor (Linux, root).
      </p>
    );

  const items = (r: AccessRow): MenuItem[] => [
    {
      label: r.block
        ? `Block for ${selected.agent_id}`
        : "Block (not available for this row)",
      danger: true,
      disabled: !r.block,
      onSelect: () =>
        r.block && setPending({ agent: selected.agent_id, block: r.block }),
    },
    {
      label: "Block for every agent",
      disabled: !r.block,
      hint: "Adds the rule to the default (*) policy, used by agents without their own.",
      onSelect: () => r.block && setPending({ agent: "*", block: r.block }),
    },
    {
      label: "Copy",
      onSelect: () => void navigator.clipboard?.writeText(r.label),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {list.map((a) => (
          <button
            key={a.agent_id}
            type="button"
            onClick={() => onAgent(a.agent_id)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              a.agent_id === selected.agent_id
                ? "border-(--color-primary) bg-(--color-surface-subtle) font-medium"
                : "border-(--color-border-subtle) hover:border-(--color-border-strong)"
            }`}
          >
            {a.agent_name || a.agent_id}
          </button>
        ))}
        <span className={`ml-auto text-xs ${MUTED}`}>
          Summary from {agoText(selected.observed_at)}, covering the hour before
          it.
        </span>
      </div>
      {(["file", "network", "service", "command"] as const).map((cat) => {
        const rs = rows.filter((r) => r.category === cat);
        if (!rs.length) return null;
        return (
          <section key={cat} className="space-y-1">
            <h3 className="text-sm font-semibold">
              {CATEGORY[cat]}{" "}
              <span className={`font-normal ${MUTED}`}>({rs.length})</span>
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {cat === "file"
                      ? "Path"
                      : cat === "network"
                        ? "Destination"
                        : cat === "command"
                          ? "Program"
                          : "Service"}
                  </TableHead>
                  <TableHead>
                    {cat === "file"
                      ? "Access"
                      : cat === "network"
                        ? "Service"
                        : ""}
                  </TableHead>
                  <TableHead className="w-20 text-right">Times</TableHead>
                  <TableHead className="w-32">Last</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rs.map((r) => (
                  <TableRow
                    key={r.key}
                    onContextMenu={(e) => setMenu(menuAt(e, items(r)))}
                  >
                    <TableCell className="font-mono text-xs break-all">
                      {r.label}{" "}
                      {r.sensitive ? (
                        <ConnPill tone="warning">sensitive</ConnPill>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">{r.detail}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.count || ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.last ? agoText(r.last) : ""}
                    </TableCell>
                    <TableCell>
                      <RowMenuButton
                        label={`Actions for ${r.label}`}
                        onOpen={(e) => setMenu(menuAt(e, items(r)))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
      <p className={`text-xs ${MUTED}`}>
        Right-click a row to block it for this agent or for every agent.
      </p>
      <ContextMenu menu={menu} onClose={closeMenu} />
      <BlockDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}
