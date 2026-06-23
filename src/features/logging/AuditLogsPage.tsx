/**
 * AuditLogsPage — Monitor → Audit Logs. Rebuilt to the Console Refresh
 * prototype (`[data-cr]`): section-header, filter toolbar, bespoke table with
 * severity/status badges, server pagination. Preserves the real query, filters,
 * export, and refetch.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  ScrollText,
  Settings,
} from "lucide-react";

import type { AuditLog } from "../../types/entities";
import { useGetAuditLogsQuery } from "../../app/api/logsApi";
import { SessionManager } from "../../utils/sessionManager";
import { AuditLogsView } from "./components/audit-logs/AuditLogsView";

interface AuditFilters {
  /** Maps to backend `action` param (keyword filter) */
  action?: string;
  severity?: string;
}

const ACTION_TONE: Record<string, string> = {
  created: "badge--success",
  updated: "badge--info",
  deleted: "badge--danger",
  enabled: "badge--success",
  disabled: "badge--muted",
};
const SEVERITY_TONE: Record<string, string> = {
  low: "badge--risk-low",
  medium: "badge--risk-medium",
  high: "badge--risk-high",
  critical: "badge--risk-critical",
};
const STATUS_TONE: Record<string, string> = {
  success: "badge--success",
  failed: "badge--danger",
  pending: "badge--warning",
};
const cap = (s?: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return "—";
  }
}
function fullDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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
  const pagination = data?.pagination as
    | { page?: number; total_pages?: number; total_items?: number }
    | undefined;

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

  const currentPage = pagination?.page ?? page;
  const totalPages = pagination?.total_pages ?? 1;

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
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">Audit Logs</h1>
            <p className="sh-desc">
              Track configuration changes, admin actions, and system
              modifications across this workspace.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {/* Refresh + Export live inside the log viewer's own control bar. */}
            <button
              className="btn btn-primary"
              onClick={() => navigate("/logs/configure")}
            >
              <Settings className="icon-sm" /> Configure
            </button>
          </div>
        </div>

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
      </div>
    </div>
  );
}
