/**
 * `ServerOverviewSummary` — the top of the MCP Overview: count cards and the
 * "Agents with access" table. Every number comes from an existing endpoint
 * (scope matrix, connections, role bindings); a value that hasn't loaded yet
 * shows "—" rather than a guess.
 *
 * Not shown, for lack of a backend source: per-MCP tool request counts
 * (allowed / denied today), users who signed in this week, and an agent's
 * last request time.
 */

import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

import type { AgentConnection } from "@/app/api/agentIdentityApi";
import { cn } from "@/lib/utils";
import { Surface } from "./ApplicationConsole";
import { formatApplicationRoleName } from "../lib/formatRoleName";
import { agentTypeLabel } from "../lib/mcpSignals";

export interface ToolLevelCounts {
  total: number;
  read: number;
  write: number;
  admin: number;
  public: number;
  /** Tools with no permission yet — denied until one is assigned. */
  none: number;
}

export interface ServerOverviewSummaryProps {
  applicationId: string;
  tools?: ToolLevelCounts;
  /** Approved agent connections; undefined while loading. */
  agents?: AgentConnection[];
  /** People with a role on this MCP; undefined while loading. */
  usersWithAccess?: number;
}

function CountCard({
  value,
  label,
  sub,
  to,
}: {
  value?: number;
  label: string;
  sub: string;
  to?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "text-[length:30px] font-bold tabular-nums leading-9",
          value === undefined || value === 0 ? "text-(--color-text-muted)" : "text-(--color-text)",
        )}
      >
        {value ?? "—"}
      </span>
      <span className="text-[length:15px] font-semibold text-(--color-text) group-hover:underline">{label}</span>
      <span className="mt-1 text-[length:13.5px] leading-5 text-(--color-text-muted)">{sub}</span>
    </>
  );
  return (
    <Surface className="flex min-w-0 flex-col px-6 py-5">
      {to ? (
        <Link to={to} className="group flex min-w-0 flex-col">
          {body}
        </Link>
      ) : (
        body
      )}
    </Surface>
  );
}

function toolsSub(tools?: ToolLevelCounts): string {
  if (!tools) return "Loading…";
  if (tools.total === 0) return "No tools discovered yet";
  const parts = [`Read: ${tools.read}`, `Write: ${tools.write}`, `Admin: ${tools.admin}`];
  if (tools.public > 0) parts.push(`Public: ${tools.public}`);
  if (tools.none > 0) parts.push(`No permission: ${tools.none}`);
  return parts.join(" · ");
}

function relative(ts?: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : formatDistanceToNow(d, { addSuffix: true });
}

export function ServerOverviewSummary({
  applicationId,
  tools,
  agents,
  usersWithAccess,
}: ServerOverviewSummaryProps) {
  const base = `/applications/${applicationId}`;
  const agentNames = agents?.map((a) => a.client_name || a.client_id) ?? [];
  const agentsSub =
    agents === undefined
      ? "Loading…"
      : agents.length === 0
        ? "None registered yet"
        : agentNames.length > 3
          ? `${agentNames.slice(0, 3).join(" · ")} +${agentNames.length - 3}`
          : agentNames.join(" · ");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <CountCard value={tools?.total} label="Tools" sub={toolsSub(tools)} to={`${base}/tools`} />
        <CountCard value={agents?.length} label="Agents" sub={agentsSub} />
        <CountCard
          value={usersWithAccess}
          label="Users"
          sub={
            usersWithAccess === undefined
              ? "Loading…"
              : "With a role on this MCP"
          }
          to={`${base}/access-assignments`}
        />
      </div>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="sec-title">Agents with access</h2>
          <Link
            to="/access/roles"
            className="text-[length:13.5px] font-medium text-(--color-primary-text) underline underline-offset-2 hover:decoration-2"
          >
            Manage in Policies
          </Link>
        </div>
        {agents === undefined ? (
          <p className="border-t border-(--color-border-subtle) px-5 py-6 text-[length:13.5px] text-(--color-text-muted)">
            Loading agents…
          </p>
        ) : agents.length === 0 ? (
          <p className="border-t border-(--color-border-subtle) px-5 py-6 text-[length:13.5px] text-(--color-text-muted)">
            No agent can call this MCP yet. Register an agent, then give it a role.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-t border-(--color-border-subtle) text-[length:13.5px]">
              <thead className="bg-(--color-surface-subtle) text-left text-[length:13px] text-(--color-text-muted)">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Agent</th>
                  <th className="px-5 py-2.5 font-semibold">Type</th>
                  <th className="px-5 py-2.5 font-semibold">Role</th>
                  <th className="px-5 py-2.5 font-semibold">Connected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border-subtle)">
                {agents.map((a) => (
                  <tr key={a.connection_id}>
                    <td className="px-5 py-3 font-semibold text-(--color-text)">
                      {a.client_name || <span className="font-mono">{a.client_id}</span>}
                    </td>
                    <td className="px-5 py-3 text-(--color-text)">{agentTypeLabel(a)}</td>
                    <td className="px-5 py-3 text-(--color-text)">
                      {a.granted_through?.role_name
                        ? formatApplicationRoleName(a.granted_through.role_name)
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-(--color-text-muted)">{relative(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
