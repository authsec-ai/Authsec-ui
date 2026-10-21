import { useMemo } from "react";

import type { AuditLog } from "../../../../types/entities";
import type { PaginationMetadata } from "../../../../app/api/logsApi";
import { LogTable, type LogRow } from "../LogTable";
import { realmLabel } from "../logFormat";

interface AuditLogsViewProps {
  logs: AuditLog[];
  loading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  pagination?: PaginationMetadata;
  onPageChange?: (page: number) => void;
}

const ACTION_LABEL: Record<AuditLog["action"], string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  enabled: "Enabled",
  disabled: "Disabled",
};

const RESOURCE_LABEL: Record<AuditLog["resourceType"], string> = {
  user: "user",
  group: "group",
  role: "role",
  client: "client",
  resource: "resource",
  auth_method: "sign-in method",
  config: "setting",
};

function result(log: AuditLog): LogRow["result"] {
  if (log.status === "success") return { tone: "recorded", label: "Recorded" };
  if (log.status === "pending") return { tone: "pending", label: "Pending" };
  return { tone: "failed", label: "Failed", reason: log.reason };
}

/** Admin changes: one row per change made in this console. Only real backend fields. */
export function AuditLogsView({ logs, loading, onRefresh, isRefreshing, pagination, onPageChange }: AuditLogsViewProps) {
  const rows = useMemo<LogRow[]>(
    () =>
      logs.map((log) => {
        const meta = log.metadata ?? {};
        const request = [meta.method, meta.path].filter(Boolean).join(" ");
        return {
          id: log.id,
          time: log.timestamp,
          who: log.actor.email || log.actor.username || log.actor.userId || "Unknown",
          whoDetail: realmLabel(log.actor.role),
          event: `${ACTION_LABEL[log.action] ?? log.action} ${RESOURCE_LABEL[log.resourceType] ?? log.resourceType}`,
          eventDetail: log.resourceId || undefined,
          result: result(log),
          details: [
            ["User ID", log.actor.userId],
            ["Resource ID", log.resourceId],
            ["Request", request],
            ["HTTP status", meta.statusCode ? String(meta.statusCode) : undefined],
            ["Reason", log.reason],
            ["IP address", log.ipAddress],
            ["User agent", log.userAgent],
            ["Request ID", meta.requestId],
          ],
        };
      }),
    [logs],
  );

  return (
    <LogTable
      tableId="logs-admin-changes"
      rows={rows}
      loading={loading}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      pagination={pagination}
      onPageChange={onPageChange}
      emptyTitle="No admin changes yet"
      emptyHint="Each change made in this console, such as creating a role or adding a provider, appears here."
    />
  );
}
