/**
 * AuditLogsPage — Monitor → Audit Logs. Rebuilt to the Console Refresh
 * prototype (`[data-cr]`): section-header, filter toolbar, bespoke table with
 * severity/status badges, server pagination. Preserves the real query, filters,
 * export, and refetch.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ScrollText, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";

import type { AuditLog } from "../../types/entities";
import { useGetAuditLogsQuery } from "../../app/api/logsApi";
import { SessionManager } from "../../utils/sessionManager";
import { AuditLogsView } from "./components/audit-logs/AuditLogsView";

interface AuditFilters {
  /** Maps to backend `action` param (keyword filter) */
  action?: string;
  severity?: string;
}

export function AuditLogsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const sessionData = SessionManager.getSession();
  const workspaceId = sessionData?.workspace_id;

  const { data, isLoading, isFetching, isError, refetch } =
    useGetAuditLogsQuery(
      {
        workspace_id: workspaceId || "",
        page,
        page_size: pageSize,
        action:
          filters.action && filters.action !== "all"
            ? filters.action
            : undefined,
      },
      { skip: !workspaceId }
    );

  const auditLogs = useMemo<AuditLog[]>(() => data?.logs ?? [], [data]);

  // Client-side severity filter (derived field, backend doesn't store severity)
  const rows = useMemo(
    () =>
      auditLogs.filter((log) =>
        !filters.severity || filters.severity === "all"
          ? true
          : log.severity === filters.severity
      ),
    [auditLogs, filters.severity]
  );

  const handleExport = () => {
    const text = rows.map((log) => JSON.stringify(log, null, 2)).join("\n\n");
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const setFilter = (patch: Partial<AuditFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return (
    <ConsolePage
      title="Audit Logs"
      description="Track configuration changes, admin actions, and system modifications across this workspace."
      actions={
        /* Refresh + Export live inside the log viewer's own control bar. */
        <Button onClick={() => navigate("/logs/configure")} className="text-white">
          <Settings className="icon-sm" /> Configure
        </Button>
      }
    >
      <div className="roles-toolbar">
        <div className="filterset">
          <span className="filterset-label">Action</span>
          <div className="segmented">
            {[
              ["all", "All"],
              ["create", "Created"],
              ["update", "Updated"],
              ["delete", "Deleted"],
            ].map(([v, label]) => (
              <button
                key={v}
                data-on={(filters.action ?? "all") === v}
                onClick={() => setFilter({ action: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="select">
          <select
            value={filters.severity ?? "all"}
            onChange={(e) => setFilter({ severity: e.target.value })}
            aria-label="Severity"
            style={{ minWidth: 130 }}
          >
            <option value="all">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <span className="chev">
            <ChevronDown className="icon-sm" />
          </span>
        </div>
      </div>

      {isError ? (
        <div className="table-card">
          <div className="empty">
            <span
              className="empty-ic"
              style={{
                background: "var(--color-danger-soft)",
                color: "var(--color-danger-text)",
                borderColor: "transparent",
              }}
            >
              <ScrollText className="icon-lg" />
            </span>
            <h3
              className="empty-title"
              style={{ color: "var(--color-danger-text)" }}
            >
              Failed to load audit logs
            </h3>
            <p
              className="empty-desc"
              style={{ color: "var(--color-danger-text)" }}
            >
              Please try again later.
            </p>
          </div>
        </div>
      ) : (
        // Legacy console-style log viewer: expandable rows, severity icons,
        // live/paused, its own refresh/export/pagination controls.
        <AuditLogsView
          logs={rows}
          onExport={handleExport}
          onRefresh={() => refetch()}
          isRefreshing={isLoading || isFetching}
          pagination={data?.pagination}
          onPageChange={(p) => setPage(p)}
        />
      )}
    </ConsolePage>
  );
}
