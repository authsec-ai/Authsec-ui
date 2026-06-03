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

interface AuditFilters {
  action?: string;
  severity?: string;
  timeRange?: string;
  sort_desc?: boolean;
}

function getTimeRangeTimestamps(timeRange?: string): { start_time?: string; end_time?: string } {
  if (!timeRange || timeRange === "all") return {};
  const now = new Date();
  const end_time = now.toISOString();
  const offsets: Record<string, number> = {
    "5m": 5 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  };
  const ms = offsets[timeRange];
  if (!ms) return {};
  return { start_time: new Date(now.getTime() - ms).toISOString(), end_time };
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
const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "—");

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
  const [filters, setFilters] = useState<AuditFilters>({ sort_desc: true });
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const sessionData = SessionManager.getSession();
  const workspaceId = sessionData?.workspace_id;
  const { start_time, end_time } = getTimeRangeTimestamps(filters.timeRange);

  const { data, isLoading, isFetching, isError, refetch } = useGetAuditLogsQuery(
    {
      workspace_id: workspaceId || "",
      page,
      page_size: pageSize,
      sort_desc: filters.sort_desc ?? true,
      operation:
        filters.action && filters.action !== "all"
          ? (filters.action as "create" | "update" | "delete")
          : undefined,
      start_time,
      end_time,
    },
    { skip: !workspaceId },
  );

  const auditLogs = useMemo<AuditLog[]>(() => data?.logs ?? [], [data]);
  const pagination = data?.pagination as { page?: number; total_pages?: number; total_items?: number } | undefined;

  const rows = useMemo(
    () =>
      auditLogs.filter((log) =>
        !filters.severity || filters.severity === "all" ? true : log.severity === filters.severity,
      ),
    [auditLogs, filters.severity],
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
              Track configuration changes, admin actions, and system modifications across this
              workspace.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-secondary" onClick={() => refetch()}>
              <RefreshCw className={`icon-sm${isFetching ? " animate-spin" : ""}`} /> Refresh
            </button>
            <button className="btn btn-secondary" onClick={handleExport}>
              <Download className="icon-sm" /> Export
            </button>
            <button className="btn btn-primary" onClick={() => navigate("/logs/configure")}>
              <Settings className="icon-sm" /> Configure
            </button>
          </div>
        </div>

        <div className="roles-toolbar">
          <div className="filterset">
            <span className="filterset-label">Action</span>
            <div className="segmented">
              {[["all", "All"], ["create", "Created"], ["update", "Updated"], ["delete", "Deleted"]].map(([v, label]) => (
                <button key={v} data-on={(filters.action ?? "all") === v} onClick={() => setFilter({ action: v })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="select">
            <select value={filters.severity ?? "all"} onChange={(e) => setFilter({ severity: e.target.value })} aria-label="Severity" style={{ minWidth: 130 }}>
              <option value="all">All severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          <div className="select">
            <select value={filters.timeRange ?? "all"} onChange={(e) => setFilter({ timeRange: e.target.value })} aria-label="Time range" style={{ minWidth: 130 }}>
              <option value="all">All time</option>
              <option value="5m">Last 5 minutes</option>
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
            <span className="chev"><ChevronDown className="icon-sm" /></span>
          </div>
          <div className="filterset">
            <span className="filterset-label">Order</span>
            <div className="segmented">
              <button data-on={filters.sort_desc !== false} onClick={() => setFilter({ sort_desc: true })}>Newest</button>
              <button data-on={filters.sort_desc === false} onClick={() => setFilter({ sort_desc: false })}>Oldest</button>
            </div>
          </div>
        </div>

        <div className="table-card">
          {isError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <ScrollText className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>Failed to load audit logs</h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>Please try again later.</p>
            </div>
          ) : isLoading ? (
            <div>
              {Array.from({ length: 10 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk sk-line" style={{ width: 80 }} />
                  <span style={{ flex: 1 }}><span className="sk sk-line" style={{ width: "30%" }} /></span>
                  <span className="sk sk-line" style={{ width: 64, height: 22, borderRadius: 999, margin: "0 20px" }} />
                  <span className="sk sk-line" style={{ width: 64, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 64, height: 22, borderRadius: 999, margin: "0 20px" }} />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic"><ScrollText className="icon-lg" /></span>
              <h3 className="empty-title">No audit logs to display</h3>
              <p className="empty-desc">Configuration changes and admin actions will appear here.</p>
            </div>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th className="th-context">Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th className="th-apps">Resource</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th className="th-signal">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log) => (
                    <tr key={log.id} style={{ cursor: "default" }}>
                      <td className="col-context">
                        <span className="time-cell" title={fullDate(log.timestamp)}>{timeAgo(log.timestamp)}</span>
                      </td>
                      <td>
                        <div className="user-meta">
                          <span className="user-email">{log.actor?.email ?? log.actor?.username ?? "—"}</span>
                          {log.actor?.role && <span className="user-name" style={{ fontFamily: "var(--font-family-sans)" }}>{log.actor.role}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${ACTION_TONE[log.action] ?? "badge--muted"}`}>
                          <span className="bdot" />{cap(log.action)}
                        </span>
                      </td>
                      <td className="col-apps">
                        <span className="signal-cell">
                          <span style={{ color: "var(--color-text-subtle)" }}>{log.resourceType}/</span>
                          {log.resourceName}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${SEVERITY_TONE[log.severity] ?? "badge--muted"}`}>
                          <span className="bdot" />{cap(log.severity)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_TONE[log.status] ?? "badge--muted"}`}>
                          <span className="bdot" />{cap(log.status)}
                        </span>
                      </td>
                      <td className="col-signal">
                        <span className="time-cell mono">{log.ipAddress || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span className="foot-count">
                  {pagination?.total_items != null ? <><b>{pagination.total_items}</b> total events</> : <><b>{rows.length}</b> events</>}
                </span>
                <div className="pager">
                  <span className="pager-label">Page</span>
                  <div className="pager-btns">
                    <button className="pager-btn" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                      <ChevronLeft className="icon-sm" />
                    </button>
                    <span className="pager-label mono">{currentPage} / {totalPages}</span>
                    <button className="pager-btn" aria-label="Next page" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="icon-sm" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
