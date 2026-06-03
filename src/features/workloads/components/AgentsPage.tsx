import { useMemo } from "react";
import { Activity, RefreshCw, Server } from "lucide-react";

import { SessionManager } from "../../../utils/sessionManager";
import {
  useListAgentsQuery,
  type AgentRecord,
} from "../../../app/api/workloadsApi";
import { useTourStep, TOUR_REGISTRY } from "@/features/guided-tour";

type AgentStats = { active: number; inactive: number; total: number };

function statusTone(status?: string): { tone: string; label: string } {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "healthy") return { tone: "badge--success", label: status || "Active" };
  if (s === "inactive" || s === "unhealthy") return { tone: "badge--danger", label: status || "Inactive" };
  return { tone: "badge--warning", label: status || "Unknown" };
}

function formatDate(dateString?: string): string {
  if (!dateString) return "—";
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return "Unknown";
  try {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return "Unknown";
  }
}

export function AgentsPage() {
  const sessionData = SessionManager.getSession();

  useTourStep({ tourConfig: TOUR_REGISTRY["spire-agents-intro"] });

  const {
    data: agentsData,
    isLoading: agentsLoading,
    isFetching: agentsFetching,
    error: agentsError,
    refetch,
  } = useListAgentsQuery(undefined, {
    skip: !sessionData?.token,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  const agents = useMemo<AgentRecord[]>(() => agentsData || [], [agentsData]);

  const stats: AgentStats = useMemo(() => {
    const active = agents.filter(
      (a) => a.status?.toLowerCase() === "active" || a.status?.toLowerCase() === "healthy",
    ).length;
    return { active, inactive: agents.length - active, total: agents.length };
  }, [agents]);

  const showInitialSkeleton = agentsLoading && !agentsData;
  const isTableLoading = !!agentsFetching && !!agentsData;

  return (
    <div data-cr>
      <div className="console-page">
        <div className="section-header">
          <div>
            <h1 className="sh-title">SPIRE Agents</h1>
            <p className="sh-desc">
              Monitor SPIRE agent nodes that attest workload identities and issue X.509-SVID
              certificates across your infrastructure.
            </p>
          </div>
          <button className="btn btn-secondary" data-tour-id="agents-refresh" onClick={() => refetch()}>
            <RefreshCw className={`icon-sm${isTableLoading ? " animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="metric-strip">
          <div className="metric">
            <span className="m-dot is-total" />
            <span className="m-val">{showInitialSkeleton ? "—" : stats.total}</span>
            <span className="m-label">agents</span>
          </div>
          <div className={`metric${stats.active === 0 ? " is-zero" : ""}`}>
            <span className="m-dot is-live" />
            <span className="m-val">{showInitialSkeleton ? "—" : stats.active}</span>
            <span className="m-label">active</span>
          </div>
          <div className={`metric${stats.inactive === 0 ? " is-zero" : ""}`}>
            <span className="m-dot is-blocked" />
            <span className="m-val">{showInitialSkeleton ? "—" : stats.inactive}</span>
            <span className="m-label">inactive</span>
          </div>
        </div>

        <div className="table-card" data-tour-id="agents-table">
          {agentsError ? (
            <div className="empty">
              <span className="empty-ic" style={{ background: "var(--color-danger-soft)", color: "var(--color-danger-text)", borderColor: "transparent" }}>
                <Server className="icon-lg" />
              </span>
              <h3 className="empty-title" style={{ color: "var(--color-danger-text)" }}>
                Unable to load agents
              </h3>
              <p className="empty-desc" style={{ color: "var(--color-danger-text)" }}>
                We hit an error fetching agent data. Try refreshing.
              </p>
              <button className="btn btn-secondary" onClick={() => refetch()}>
                <RefreshCw className="icon-sm" /> Retry
              </button>
            </div>
          ) : showInitialSkeleton ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="skeleton-row" key={i}>
                  <span className="sk sk-line" style={{ width: 18, height: 18, borderRadius: 5, flex: "none" }} />
                  <span style={{ flex: 1 }}>
                    <span className="sk sk-line" style={{ width: "30%" }} />
                  </span>
                  <span className="sk sk-line" style={{ width: 140, margin: "0 24px" }} />
                  <span className="sk sk-line" style={{ width: 72, height: 22, borderRadius: 999 }} />
                  <span className="sk sk-line" style={{ width: 90 }} />
                </div>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="empty">
              <span className="empty-ic">
                <Server className="icon-lg" />
              </span>
              <h3 className="empty-title">No agents found</h3>
              <p className="empty-desc">No SPIRE agents are currently registered in this workspace.</p>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th className="th-context">SPIFFE ID</th>
                    <th className="th-apps">Node</th>
                    <th>Attestation</th>
                    <th>Status</th>
                    <th className="th-signal">Last seen</th>
                    <th className="th-lastactive">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const st = statusTone(agent.status);
                    return (
                      <tr key={agent.id} style={{ cursor: "default" }}>
                        <td>
                          <div className="app-cell">
                            <span className="app-glyph tone-info">
                              <Activity className="icon-sm" />
                            </span>
                            <span className="ac-meta">
                              <span className="ac-name mono">{agent.id.substring(0, 12)}…</span>
                            </span>
                          </div>
                        </td>
                        <td className="col-context">
                          <span className="ctx-uri" title={agent.spiffe_id} style={{ maxWidth: 280 }}>
                            {agent.spiffe_id}
                          </span>
                        </td>
                        <td className="col-apps">
                          <span className="time-cell mono">{agent.node_id || "—"}</span>
                        </td>
                        <td>
                          <span className="badge badge--type">{agent.attestation_type || "unknown"}</span>
                        </td>
                        <td>
                          <span className={`badge ${st.tone}`}>
                            <span className="bdot" />
                            {st.label}
                          </span>
                        </td>
                        <td className="col-signal">
                          <span className="time-cell" title={formatDate(agent.last_seen)}>
                            {formatTimeAgo(agent.last_seen)}
                          </span>
                        </td>
                        <td className="col-lastactive">
                          <span className="time-cell">{formatDate(agent.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {isTableLoading && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "color-mix(in srgb, var(--color-surface-base) 50%, transparent)",
                    backdropFilter: "blur(2px)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <span className="time-cell" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <RefreshCw className="icon-sm animate-spin" /> Refreshing…
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
