/**
 * AuditLogsPage — Monitor → Audit Logs. Rebuilt to the Console Refresh
 * prototype (`[data-cr]`): section-header, filter toolbar, bespoke table with
 * severity/status badges, server pagination. Preserves the real query, filters,
 * export, and refetch.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Download, ScrollText, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";

import type { AuditLog } from "../../types/entities";
import { useGetAuditLogsQuery } from "../../app/api/logsApi";
import { SessionManager } from "../../utils/sessionManager";
import { AuditLogsView } from "./components/audit-logs/AuditLogsView";
import { downloadJson } from "./components/logFormat";

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

  const handleExport = () => downloadJson(rows, "admin-change-logs");

  const setFilter = (patch: Partial<AuditFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  return (
    <ConsolePage
      title="Admin changes"
      description="Every change made in this console: who changed what, and whether it worked."
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate("/logs/configure")} className="gap-2">
            <Settings className="h-4 w-4" />
            Log forwarding
          </Button>
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </>
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
        // The shared log table: Time, Who, Event, Result; rows open to show
        // every real field of the entry.
        <AuditLogsView
          logs={rows}
          loading={isLoading}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          pagination={data?.pagination}
          onPageChange={(p) => setPage(p)}
        />
      )}
    </ConsolePage>
  );
}
