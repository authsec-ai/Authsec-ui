/**
 * `useHomeData` — every number, list item and chart on Home, derived only
 * from what the backend returns through the existing RTK Query slices.
 *
 * Sources:
 *   Workspace name        GET /authsec/workspaces                (useListMyWorkspacesQuery)
 *   MCPs                  GET /authsec/applications              (useListApplicationsQuery)
 *   Agents & clients      GET /authsec/clients                   (useListWorkspaceClientsQuery)
 *   Service accounts      GET /authsec/uflow/admin/service-accounts
 *   Users (end users)     GET authsec/uflow/v2/tenants/:ws/end-users
 *   Identity providers    GET /authsec/identity-providers
 *   Directory sync        GET sync configs
 *   Sign-ins              GET /authsec/logs/auth/paginated       (latest page)
 *   Requests chart/table  GET /authsec/logs/m2m/paginated        (latest page)
 *   Recent admin changes  GET /authsec/logs/audit/paginated      (latest page)
 *
 * Nothing here is sample data: a query that has not answered yet is
 * `undefined`, and a query that failed is reported as an error, never as 0.
 */

import { useMemo } from "react";
import { format, startOfDay, subDays } from "date-fns";

import { useListApplicationsQuery, type Application } from "@/app/api/applicationsApi";
import { useListWorkspaceClientsQuery, type WorkspaceClientItem } from "@/app/api/mcpClientsApi";
import { useListWorkspaceServiceAccountsQuery } from "@/app/api/agentIdentityApi";
import { useListEndUsersQuery } from "@/app/api/membershipApi";
import { useListIdentityProvidersQuery } from "@/app/api/authMethodApi";
import { useListSyncConfigsQuery } from "@/app/api/syncConfigsApi";
import { useGetAuditLogsQuery, useGetLogsQuery, useGetM2MLogsQuery } from "@/app/api/logsApi";
import { useListMyWorkspacesQuery } from "@/app/api/workspaceApi";
import { computeReadiness, isLaunched } from "@/features/applications/lib/computeReadiness";
import { computeOAuthIssuerURL } from "@/features/resource-servers/resource-server-utils";
import type { AuditLog } from "@/types/entities";
import { resolveWorkspaceId } from "@/utils/workspace";

/** Rows asked for from each log endpoint. Counts are computed from this one
 *  page; when it does not reach back far enough the UI says the figure is a
 *  lower bound. */
const M2M_PAGE = 500;
const AUTH_PAGE = 200;
const AUDIT_PAGE = 10;
const RECENT_ROWS = 6;

export interface AttentionItem {
  id: string;
  tone: "danger" | "warning";
  /** Bold lead: the MCP, agent or connection the item is about. */
  name: string;
  /** Plain-words reason after the name. */
  reason: string;
  /** The one action button. */
  action: string;
  to: string;
  primary: boolean;
}

export interface DayBucket {
  key: string;
  label: string;
  allowed: number;
  denied: number;
}

export interface McpRequestRow {
  id: string;
  name: string;
  requests: number;
  denied: number;
  /** The MCP is not launched yet, so its denials are expected. */
  notSetUp: boolean;
  topScope?: string;
}

export interface ActivityRow {
  id: string;
  at: number;
  who: string;
  event: string;
  ok: boolean;
  result: string;
}

export interface Loadable<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

function serverAttention(app: Application): AttentionItem | null {
  const readiness = computeReadiness(app);
  const setup = `/applications/${app.id}/setup`;
  const base = { id: `server:${app.id}`, name: app.name, to: setup };

  if (app.state === "scan_failed") {
    return { ...base, tone: "danger", reason: "AuthSec couldn't read its tools", action: "Finish setup", primary: true };
  }
  if (readiness.protection.state === "err") {
    return { ...base, tone: "danger", reason: "failed its last token check", action: "Test", primary: true };
  }
  if (app.state === "pending_scan") {
    return { ...base, tone: "warning", reason: "hasn't sent its tool list yet", action: "Finish setup", primary: true };
  }
  if (app.state === "needs_setup" || !isLaunched(app)) {
    return { ...base, tone: "warning", reason: "not enforcing yet", action: "Finish setup", primary: true };
  }
  return null;
}

/** One entry per OAuth client (the list has one row per client × server). */
function groupClients(rows: WorkspaceClientItem[]) {
  const byId = new Map<string, WorkspaceClientItem[]>();
  for (const row of rows) {
    const list = byId.get(row.client_id) ?? [];
    list.push(row);
    byId.set(row.client_id, list);
  }
  return byId;
}

/** True when the page we fetched might not reach back to `since`: more pages
 *  exist and even the oldest row we got is newer than `since`. */
function truncatedBefore(stamps: string[], since: Date, hasNext: boolean | undefined) {
  if (!hasNext || stamps.length === 0) return false;
  const times = stamps.map((s) => Date.parse(s)).filter(Number.isFinite);
  if (times.length === 0) return false;
  return Math.min(...times) >= since.getTime();
}

function humanize(s: string) {
  const t = s.replace(/[._-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : s;
}

function authEvent(action: string | undefined) {
  const a = (action ?? "").toLowerCase();
  if (/log ?in|sign ?in|authenticat/.test(a)) return "Signed in";
  if (/log ?out|sign ?out/.test(a)) return "Signed out";
  if (/mfa|totp|webauthn/.test(a)) return "Second-factor check";
  if (/token/.test(a)) return "Token request";
  return action ? humanize(action) : "Sign-in event";
}

const RESOURCE_LABEL: Record<AuditLog["resourceType"], string> = {
  user: "User",
  group: "Group",
  role: "Role",
  client: "Client",
  resource: "Resource",
  auth_method: "Sign-in method",
  config: "Setting",
};

function shortReason(r: string | undefined) {
  if (!r) return "";
  const first = r.split(/[.;\n]/)[0].trim();
  return first.length > 40 ? `${first.slice(0, 39)}…` : first;
}

export function useHomeData() {
  const workspaceId = resolveWorkspaceId() ?? "";
  const noWs = !workspaceId;

  const workspaces = useListMyWorkspacesQuery();
  const apps = useListApplicationsQuery();
  const clients = useListWorkspaceClientsQuery();
  const serviceAccounts = useListWorkspaceServiceAccountsQuery();
  const endUsers = useListEndUsersQuery({ workspaceId }, { skip: noWs });
  const idps = useListIdentityProvidersQuery();
  const syncConfigs = useListSyncConfigsQuery();
  const authLogs = useGetLogsQuery({ workspace_id: workspaceId, page: 1, page_size: AUTH_PAGE }, { skip: noWs });
  const m2mLogs = useGetM2MLogsQuery({ workspace_id: workspaceId, page: 1, page_size: M2M_PAGE }, { skip: noWs });
  const auditLogs = useGetAuditLogsQuery({ workspace_id: workspaceId, page: 1, page_size: AUDIT_PAGE }, { skip: noWs });

  // Midnight today. Recomputed only when the date changes, so the derived
  // values below stay memoised between renders.
  const todayKey = format(new Date(), "yyyy-MM-dd");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => startOfDay(new Date()), [todayKey]);
  const weekStart = useMemo(() => subDays(today, 6), [today]);

  const workspaceName = useMemo(() => {
    const current = workspaces.data?.workspaces?.find((w) => w.current);
    return current?.name || current?.workspace_domain || undefined;
  }, [workspaces.data]);

  /* ── lookups ─────────────────────────────────────────────────────────── */

  const appName = useMemo(() => new Map((apps.data ?? []).map((a) => [a.id, a.name])), [apps.data]);

  const clientName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients.data ?? []) if (c.client_name) m.set(c.client_id, c.client_name);
    for (const s of serviceAccounts.data ?? []) if (s.oauth_client_id) m.set(s.oauth_client_id, s.name);
    return m;
  }, [clients.data, serviceAccounts.data]);

  const userLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of endUsers.data?.items ?? []) {
      const label = u.user_email || u.user_name || u.user_username;
      if (label) m.set(u.user_id, label);
    }
    return m;
  }, [endUsers.data]);

  /* ── count cards ─────────────────────────────────────────────────────── */

  const mcps = useMemo(() => {
    const list = apps.data ?? [];
    const enforcing = list.filter((a) => isLaunched(a)).length;
    return { total: list.length, enforcing, needsSetup: list.length - enforcing };
  }, [apps.data]);

  const agents = useMemo(() => {
    if (!clients.data && !serviceAccounts.data) return undefined;
    const sas = serviceAccounts.data ?? [];
    const saClientIds = new Set(sas.map((s) => s.oauth_client_id).filter(Boolean));
    const grouped = groupClients((clients.data ?? []).filter((c) => !saClientIds.has(c.client_id)));
    let active = 0;
    let waiting = 0;
    for (const rows of grouped.values()) {
      if (rows.some((r) => r.status === "approved")) active += 1;
      else if (rows.some((r) => r.status === "pending_approval")) waiting += 1;
    }
    active += sas.filter((s) => s.status === "active").length;
    return { total: grouped.size + sas.length, active, waiting };
  }, [clients.data, serviceAccounts.data]);

  const usersThisWeek = useMemo(() => {
    const r = endUsers.data;
    if (!r) return undefined;
    const since = weekStart.getTime();
    const items = r.items ?? [];
    const count = items.filter((u) => {
      const seen = [u.last_seen_at, u.user_last_login]
        .map((s) => (s ? Date.parse(s) : NaN))
        .filter(Number.isFinite);
      return seen.some((t) => t >= since);
    }).length;
    return { count, atLeast: typeof r.count === "number" && r.count > items.length };
  }, [endUsers.data, weekStart]);

  const signInsToday = useMemo(() => {
    if (!authLogs.data) return undefined;
    const t = today.getTime();
    const todays = authLogs.data.logs.filter((l) => {
      const v = Date.parse(l.timestamp);
      return Number.isFinite(v) && v >= t;
    });
    return {
      count: todays.length,
      failed: todays.filter((l) => l.status !== "success").length,
      atLeast: truncatedBefore(
        authLogs.data.logs.map((l) => l.timestamp),
        today,
        authLogs.data.pagination?.has_next,
      ),
    };
  }, [authLogs.data, today]);

  /* ── requests checked by AuthSec (M2M token decisions) ──────────────── */

  const requests = useMemo(() => {
    if (!m2mLogs.data) return undefined;
    const days: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      return { key: format(d, "yyyy-MM-dd"), label: i === 6 ? "Today" : format(d, "EEE"), allowed: 0, denied: 0 };
    });
    const index = new Map(days.map((d, i) => [d.key, i]));
    const perMcp = new Map<string, { requests: number; denied: number; scopes: Map<string, number> }>();
    const inWindow = m2mLogs.data.logs.filter((l) => {
      const t = Date.parse(l.createdAt);
      return Number.isFinite(t) && t >= weekStart.getTime();
    });
    for (const log of inWindow) {
      const i = index.get(format(new Date(Date.parse(log.createdAt)), "yyyy-MM-dd"));
      if (i === undefined) continue;
      const denied = log.gateEffect === "deny";
      if (denied) days[i].denied += 1;
      else days[i].allowed += 1;
      const key = log.resourceServerId || "unknown";
      const row = perMcp.get(key) ?? { requests: 0, denied: 0, scopes: new Map<string, number>() };
      row.requests += 1;
      if (denied) row.denied += 1;
      for (const s of (log.scopesRequested ?? "").split(/[\s,]+/).filter(Boolean)) {
        row.scopes.set(s, (row.scopes.get(s) ?? 0) + 1);
      }
      perMcp.set(key, row);
    }
    const launched = new Map((apps.data ?? []).map((a) => [a.id, isLaunched(a)]));
    const rows: McpRequestRow[] = [...perMcp.entries()]
      .map(([id, r]) => {
        let topScope: string | undefined;
        let best = 0;
        for (const [s, n] of r.scopes) if (n > best) [topScope, best] = [s, n];
        return {
          id,
          name: appName.get(id) ?? (id === "unknown" ? "Unknown MCP" : id),
          requests: r.requests,
          denied: r.denied,
          notSetUp: launched.get(id) === false,
          topScope,
        };
      })
      .sort((a, b) => b.requests - a.requests);
    const allowed = days.reduce((n, d) => n + d.allowed, 0);
    const denied = days.reduce((n, d) => n + d.denied, 0);
    const latest = inWindow.reduce<(typeof inWindow)[number] | undefined>(
      (best, l) => (!best || Date.parse(l.createdAt) > Date.parse(best.createdAt) ? l : best),
      undefined,
    );
    return {
      days,
      allowed,
      denied,
      total: allowed + denied,
      rows,
      example: latest
        ? {
            who: clientName.get(latest.clientId) ?? latest.clientId,
            mcp: appName.get(latest.resourceServerId) ?? latest.resourceServerId,
          }
        : undefined,
      partial: truncatedBefore(
        m2mLogs.data.logs.map((l) => l.createdAt),
        weekStart,
        m2mLogs.data.pagination?.has_next,
      ),
      sampled: m2mLogs.data.logs.length,
    };
  }, [m2mLogs.data, today, weekStart, apps.data, appName, clientName]);

  /* ── needs attention ─────────────────────────────────────────────────── */

  const attention = useMemo(() => {
    const items: AttentionItem[] = [];
    for (const app of apps.data ?? []) {
      const item = serverAttention(app);
      if (item) items.push(item);
    }
    const saClientIds = new Set((serviceAccounts.data ?? []).map((s) => s.oauth_client_id).filter(Boolean));
    for (const [clientId, rows] of groupClients(clients.data ?? [])) {
      if (saClientIds.has(clientId)) continue;
      const name = rows[0].client_name || clientId;
      const pending = rows.filter((r) => r.status === "pending_approval");
      if (pending.length > 0 && !rows.some((r) => r.status === "approved")) {
        const servers = pending.map((r) => r.resource_server_name).filter(Boolean);
        items.push({
          id: `client-pending:${clientId}`,
          tone: "warning",
          name,
          reason: `waiting for approval to reach ${servers.length ? servers.join(", ") : "an MCP"}`,
          action: "Approve",
          to: "/clients",
          primary: true,
        });
      }
      const broken = rows.filter((r) => r.sync_status === "sync_error" && r.status !== "revoked");
      if (broken.length > 0) {
        items.push({
          id: `client-sync:${clientId}`,
          tone: "warning",
          name,
          reason: `registration didn't sync to ${broken.map((r) => r.resource_server_name).filter(Boolean).join(", ") || "an MCP"}`,
          action: "Open",
          to: "/clients",
          primary: false,
        });
      }
    }
    for (const cfg of syncConfigs.data ?? []) {
      if (cfg.is_active === false) continue;
      if (cfg.last_sync_status !== "error" && cfg.last_sync_status !== "failed") continue;
      items.push({
        id: `sync:${cfg.id ?? cfg.config_name}`,
        tone: "danger",
        name: cfg.config_name,
        reason: "last directory sync failed",
        action: "Open",
        to: "/directory-sync",
        primary: false,
      });
    }
    return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));
  }, [apps.data, clients.data, serviceAccounts.data, syncConfigs.data]);

  /* ── recent activity (auth + M2M + admin logs, newest first) ────────── */

  const recent = useMemo(() => {
    const rows: ActivityRow[] = [];
    for (const l of authLogs.data?.logs ?? []) {
      const at = Date.parse(l.timestamp);
      if (!Number.isFinite(at)) continue;
      const ok = l.status === "success";
      rows.push({
        id: `auth:${l.id}`,
        at,
        who: (l.userId && userLabel.get(l.userId)) || l.email || l.username || l.userId || "Unknown user",
        event: authEvent(l.action),
        ok,
        result: ok ? "Succeeded" : ["Failed", shortReason(l.failureReason)].filter(Boolean).join(" · "),
      });
    }
    for (const l of m2mLogs.data?.logs ?? []) {
      const at = Date.parse(l.createdAt);
      if (!Number.isFinite(at)) continue;
      const ok = l.gateEffect !== "deny";
      rows.push({
        id: `m2m:${l.id}`,
        at,
        who: clientName.get(l.clientId) ?? l.clientId,
        event: `Token requested for ${appName.get(l.resourceServerId) ?? l.resourceServerId}`,
        ok,
        result: ok ? "Allowed" : ["Denied", shortReason(l.pdpReason)].filter(Boolean).join(" · "),
      });
    }
    for (const l of auditLogs.data?.logs ?? []) {
      const at = Date.parse(l.timestamp);
      if (!Number.isFinite(at)) continue;
      const ok = l.status !== "failed";
      rows.push({
        id: `audit:${l.id}`,
        at,
        who: l.actor.email || l.actor.username || "Admin",
        event: `${RESOURCE_LABEL[l.resourceType]} ${l.action}${l.resourceId ? ` · ${l.resourceId}` : ""}`,
        ok,
        result: ok ? "Done" : "Failed",
      });
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, RECENT_ROWS);
  }, [authLogs.data, m2mLogs.data, auditLogs.data, userLabel, clientName, appName]);

  const recentLoading = authLogs.isLoading || m2mLogs.isLoading || auditLogs.isLoading;
  const recentFailed = [
    (authLogs.isError || noWs) && "sign-ins",
    (m2mLogs.isError || noWs) && "token requests",
    (auditLogs.isError || noWs) && "admin changes",
  ].filter(Boolean) as string[];

  /* ── welcome vs home ─────────────────────────────────────────────────── */

  const setupLoading = apps.isLoading || clients.isLoading || serviceAccounts.isLoading || idps.isLoading;
  const hasSomething =
    (apps.data?.length ?? 0) > 0 ||
    (clients.data?.length ?? 0) > 0 ||
    (serviceAccounts.data?.length ?? 0) > 0 ||
    (idps.data?.length ?? 0) > 0;
  // Welcome only when every source answered and all are empty; a failed
  // source sends the admin to Home, where each card reports its own error.
  const allAnswered = !apps.isError && !clients.isError && !serviceAccounts.isError && !idps.isError;
  const showWelcome = !setupLoading && allAnswered && !hasSomething;

  return {
    workspaceId,
    workspaceName,
    issuerUrl: computeOAuthIssuerURL(),
    setupLoading,
    showWelcome,
    apps,
    mcps,
    agents: {
      data: agents,
      isLoading: clients.isLoading || serviceAccounts.isLoading,
      isError: clients.isError || serviceAccounts.isError,
      refetch: () => {
        void clients.refetch();
        void serviceAccounts.refetch();
      },
    } satisfies Loadable<typeof agents>,
    usersThisWeek: {
      data: usersThisWeek,
      isLoading: endUsers.isLoading,
      isError: endUsers.isError || noWs,
      refetch: () => void endUsers.refetch(),
    } satisfies Loadable<typeof usersThisWeek>,
    signInsToday: {
      data: signInsToday,
      isLoading: authLogs.isLoading,
      isError: authLogs.isError || noWs,
      refetch: () => void authLogs.refetch(),
    } satisfies Loadable<typeof signInsToday>,
    requests: {
      data: requests,
      isLoading: m2mLogs.isLoading,
      isError: m2mLogs.isError || noWs,
      refetch: () => void m2mLogs.refetch(),
    } satisfies Loadable<typeof requests>,
    attention: {
      items: attention,
      /** Still waiting on a source that can add items. */
      isLoading: apps.isLoading || clients.isLoading || syncConfigs.isLoading,
      /** Sources that failed, so the list may be incomplete. */
      failed: [
        apps.isError && "MCPs",
        clients.isError && "agents",
        syncConfigs.isError && "directory sync",
      ].filter(Boolean) as string[],
    },
    recent: {
      rows: recent,
      isLoading: recentLoading,
      failed: recentFailed,
      refetch: () => {
        void authLogs.refetch();
        void m2mLogs.refetch();
        void auditLogs.refetch();
      },
    },
  };
}

export type HomeData = ReturnType<typeof useHomeData>;
