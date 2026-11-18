/**
 * What machines decided and detected: blocked connections, files and
 * commands, quarantines, threat detections (ARTEX, offensive tools), agents
 * starting and stopping, with their OWASP compliance tags. Newest first,
 * filtered on the server, paged by cursor. Right-click a row to block what it
 * names or open the agent's policy.
 *
 * The same records can go straight from each machine to a SIEM (Enforcement
 * tab); this view is the console's copy.
 */

import { useCallback, useEffect, useState } from "react";

import {
  useListAgentKitEventsQuery,
  type AgentKitEvent,
  type AgentKitEventType,
  type BlockRequest,
} from "@/app/api/agentkitApi";
import type { DiscoverySource } from "@/app/api/discoveryApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConnPill } from "@/features/iga/connections/ConnPill";

import {
  BlockDialog,
  ContextMenu,
  MUTED,
  RowMenuButton,
  type PendingBlock,
} from "./MachineParts";
import { menuAt, type MenuItem, type MenuState } from "./menu";
import {
  complianceTags,
  eventTarget,
  eventTitle,
  eventTone,
  TAG_FILTERS,
} from "./machinesModel";

const TYPES: { key: string; label: string; types?: AgentKitEventType[] }[] = [
  {
    key: "impact",
    label: "Decisions and detections",
    types: ["decision", "detection"],
  },
  { key: "decision", label: "Decisions", types: ["decision"] },
  { key: "detection", label: "Detections", types: ["detection"] },
  {
    key: "lifecycle",
    label: "Agents started and stopped",
    types: ["agent_started", "agent_stopped"],
  },
  { key: "sensor", label: "Sensor", types: ["sensor"] },
  { key: "all", label: "Everything" },
];

const SELECT =
  "h-8 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-2 text-xs";

function blockOf(e: AgentKitEvent): BlockRequest | null {
  const r = e.record ?? {};
  if (r.dst?.host) return { type: "host", value: r.dst.host, port: r.dst.port };
  if (r.dst?.ip) return { type: "cidr", value: r.dst.ip, port: r.dst.port };
  if (r.path) return { type: "path", value: r.path };
  if (e.kind === "command" && r.comm)
    return { type: "command", value: `${r.comm}*` };
  return null;
}

export function LogsPanel({
  sourceId,
  machines,
  agent,
  onAgent,
  onPolicy,
}: {
  sourceId?: string;
  machines?: DiscoverySource[];
  agent?: string;
  onAgent: (id: string) => void;
  onPolicy: (id: string) => void;
}) {
  const [type, setType] = useState("impact");
  const [severity, setSeverity] = useState("");
  const [tag, setTag] = useState("");
  const [enforced, setEnforced] = useState(false);
  const [agentText, setAgentText] = useState(agent ?? "");
  const [before, setBefore] = useState<string | undefined>();
  const [pages, setPages] = useState<AgentKitEvent[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pending, setPending] = useState<PendingBlock | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => setAgentText(agent ?? ""), [agent]);
  const filters = {
    discovery_source_id: sourceId,
    type: TYPES.find((t) => t.key === type)?.types,
    agent_id: agent || undefined,
    severity: severity || undefined,
    tag: tag || undefined,
    enforced,
    limit: 100,
  };
  const key = JSON.stringify(filters);
  // A new filter starts from the newest page again.
  useEffect(() => {
    setBefore(undefined);
    setPages([]);
  }, [key]);
  const q = useListAgentKitEventsQuery(
    { ...filters, before },
    { pollingInterval: before ? 0 : 15_000 },
  );
  const rows = before
    ? [...pages, ...(q.data?.events ?? [])]
    : (q.data?.events ?? []);
  const machineName = (id: string) =>
    machines?.find((m) => m.id === id)?.display_name || "";

  const items = (e: AgentKitEvent): MenuItem[] => {
    const b = blockOf(e);
    const out: MenuItem[] = [];
    if (e.agent_id) {
      out.push({
        label: b
          ? `Block for ${e.agent_id}`
          : "Block (nothing to block in this record)",
        danger: true,
        disabled: !b,
        onSelect: () => b && setPending({ agent: e.agent_id, block: b }),
      });
      out.push({
        label: `Open ${e.agent_id}'s policy`,
        onSelect: () => onPolicy(e.agent_id),
      });
      out.push({
        label: `Only ${e.agent_id}`,
        onSelect: () => onAgent(e.agent_id),
      });
    }
    out.push({
      label: "Copy record (JSON)",
      onSelect: () =>
        void navigator.clipboard?.writeText(JSON.stringify(e.record, null, 2)),
    });
    return out;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Type"
          className={SELECT}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Severity"
          className={SELECT}
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">Any severity</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          aria-label="Compliance tag"
          className={SELECT}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">Any compliance tag</option>
          {TAG_FILTERS.map((t) => (
            <option key={t.id} value={t.tag}>
              {t.label}
            </option>
          ))}
        </select>
        <Input
          aria-label="Agent"
          placeholder="Agent id"
          value={agentText}
          className="h-8 w-40 text-xs"
          onChange={(e) => setAgentText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAgent(agentText.trim())}
          onBlur={() =>
            agentText.trim() !== (agent ?? "") && onAgent(agentText.trim())
          }
        />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={enforced}
            onChange={(e) => setEnforced(e.target.checked)}
          />
          Blocked only
        </label>
      </div>
      {q.isError ? (
        <p className="text-sm text-(--color-danger-text)">
          The logs could not be loaded.
        </p>
      ) : null}
      {!q.isLoading && !rows.length ? (
        <p className={`py-6 text-sm ${MUTED}`}>
          Nothing matches. Machines send their records every few seconds.
        </p>
      ) : null}
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Time</TableHead>
              <TableHead>What</TableHead>
              <TableHead>Agent</TableHead>
              {!sourceId ? <TableHead>Machine</TableHead> : null}
              <TableHead>Target</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const tone = eventTone(e);
              return (
                <TableRow
                  key={e.id}
                  onContextMenu={(ev) => setMenu(menuAt(ev, items(e)))}
                >
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(e.observed_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <ConnPill tone={tone === "neutral" ? "muted" : tone}>
                      {eventTitle(e)}
                    </ConnPill>
                    {e.rule && e.type === "decision" ? (
                      <div className={`mt-0.5 text-xs ${MUTED}`}>{e.rule}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {e.agent_name || e.agent_id}
                  </TableCell>
                  {!sourceId ? (
                    <TableCell className="text-xs">
                      {machineName(e.discovery_source_id) || e.record.host}
                    </TableCell>
                  ) : null}
                  <TableCell className="max-w-[28rem] font-mono text-xs break-all">
                    {eventTarget(e)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {complianceTags(e).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          title={t.label}
                          onClick={() => setTag(t.tag)}
                          className="rounded border border-(--color-border-subtle) px-1.5 text-[11px] hover:border-(--color-primary)"
                        >
                          {t.id}
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RowMenuButton
                      label="Actions"
                      onOpen={(ev) => setMenu(menuAt(ev, items(e)))}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}
      {q.data?.next_cursor ? (
        <Button
          variant="outline"
          size="sm"
          disabled={q.isFetching}
          onClick={() => {
            setPages(rows);
            setBefore(q.data?.next_cursor ?? undefined);
          }}
        >
          {q.isFetching ? "Loading…" : "Older"}
        </Button>
      ) : null}
      <ContextMenu menu={menu} onClose={closeMenu} />
      <BlockDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}
