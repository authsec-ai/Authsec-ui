import { useMemo } from "react";

import type { AuthLog } from "../../../../types/entities";
import type { PaginationMetadata } from "../../../../app/api/logsApi";
import { LogTable, type LogRow } from "../LogTable";
import { humanize, realmLabel } from "../logFormat";

interface AuthLogsViewProps {
  logs: AuthLog[];
  loading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  pagination?: PaginationMetadata;
  onPageChange?: (page: number) => void;
}

function result(log: AuthLog): LogRow["result"] {
  switch (log.status) {
    case "success":
      return { tone: "allowed", label: "Allowed" };
    case "denied":
      return { tone: "denied", label: "Denied", reason: log.failureReason };
    case "suspicious":
      return { tone: "pending", label: "Suspicious", reason: log.failureReason };
    default:
      return { tone: "failed", label: "Failed", reason: log.failureReason };
  }
}

/** Sign-ins: one row per authentication attempt. Only real backend fields. */
export function AuthLogsView({ logs, loading, onRefresh, isRefreshing, pagination, onPageChange }: AuthLogsViewProps) {
  const rows = useMemo<LogRow[]>(
    () =>
      logs.map((log) => ({
        id: log.id,
        time: log.timestamp,
        who: log.userId || "Unknown",
        whoDetail: realmLabel(log.actorRealm),
        event: log.action ? humanize(log.action) : "Sign-in",
        eventDetail: log.ipAddress || undefined,
        result: result(log),
        details: [
          ["User ID", log.userId],
          ["Realm", log.actorRealm],
          ["Action", log.action],
          ["Reason", log.failureReason],
          ["IP address", log.ipAddress],
          ["User agent", log.userAgent],
          ["Request ID", log.requestId],
        ],
      })),
    [logs],
  );

  return (
    <LogTable
      tableId="logs-sign-ins"
      rows={rows}
      loading={loading}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      pagination={pagination}
      onPageChange={onPageChange}
      emptyTitle="No sign-ins yet"
      emptyHint="Each time a person or agent signs in, the attempt appears here with whether it worked."
    />
  );
}
