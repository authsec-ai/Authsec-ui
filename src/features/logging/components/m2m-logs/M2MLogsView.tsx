import { useMemo } from "react";

import type { M2MLog } from "../../../../types/entities";
import type { PaginationMetadata } from "../../../../app/api/logsApi";
import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import { LogTable, type LogRow } from "../LogTable";
import { humanize } from "../logFormat";

interface M2MLogsViewProps {
  logs: M2MLog[];
  loading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  pagination?: PaginationMetadata;
  onPageChange?: (page: number) => void;
}

const POLICY_LABEL: Record<string, string> = {
  permit: "Permit",
  deny: "Deny",
  no_policy: "No policy",
};

/**
 * The gate decides whether the token is issued. A denial shows the policy's
 * reason only when the policy also denied, so the reason matches the result.
 */
function result(log: M2MLog): LogRow["result"] {
  if (log.gateEffect === "permit") return { tone: "allowed", label: "Allowed" };
  return {
    tone: "denied",
    label: "Denied",
    reason: log.pdpEffect === "deny" ? log.pdpReason || undefined : undefined,
  };
}

/** Machine tokens: one row per token a service account asked for. Only real backend fields. */
export function M2MLogsView({ logs, loading, onRefresh, isRefreshing, pagination, onPageChange }: M2MLogsViewProps) {
  const { data: resourceServers } = useListResourceServersQuery();
  const serverName = useMemo(() => {
    const m = new Map<string, string>();
    (resourceServers ?? []).forEach((rs) => m.set(rs.id, rs.name));
    return m;
  }, [resourceServers]);

  const rows = useMemo<LogRow[]>(
    () =>
      logs.map((log) => {
        const server = serverName.get(log.resourceServerId) ?? log.resourceServerId;
        return {
          id: log.id,
          time: log.createdAt,
          who: log.clientId,
          whoDetail: log.subjectType ? humanize(log.subjectType) : undefined,
          event: server ? `Token for ${server}` : "Token request",
          eventDetail: log.scopesGranted || log.scopesRequested || undefined,
          result: result(log),
          details: [
            ["Client ID", log.clientId],
            ["Subject", [log.subjectType, log.subjectId].filter(Boolean).join(" · ")],
            ["MCP server", server],
            ["Scopes requested", log.scopesRequested],
            ["Scopes granted", log.scopesGranted],
            ["Gate decision", POLICY_LABEL[log.gateEffect] ?? log.gateEffect],
            ["Policy decision", POLICY_LABEL[log.pdpEffect] ?? log.pdpEffect],
            ["Policy agrees with gate", log.pdpAgrees ? "Yes" : "No"],
            ["Policy reason", log.pdpReason],
            ["Token family", log.tokenFamily],
          ],
        };
      }),
    [logs, serverName],
  );

  return (
    <LogTable
      tableId="logs-machine-tokens"
      rows={rows}
      loading={loading}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      pagination={pagination}
      onPageChange={onPageChange}
      emptyTitle="No machine tokens yet"
      emptyHint="Each time a service account asks for a token to call an MCP server, it appears here."
    />
  );
}
