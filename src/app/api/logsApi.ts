import { baseApi } from "./baseApi";
import type { AuthLog, AuditLog, M2MLog } from "@/types/entities";

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationMetadata {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

function buildPagination(
  page: number,
  limit: number,
  total: number
): PaginationMetadata {
  const total_pages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    page_size: limit,
    total_items: total,
    total_pages,
    has_prev: page > 1,
    has_next: page < total_pages,
  };
}

// ---------------------------------------------------------------------------
// Auth logs
// ---------------------------------------------------------------------------

/** Raw row from GET /authsec/logs/auth/paginated */
interface RawAuthRow {
  id: number;
  timestamp: string;
  requestId: string;
  workspaceId: string;
  actorRealm: string;
  userId: string;
  action: string;
  status: "success" | "failure";
  ipAddress: string;
  userAgent: string;
  error?: string;
}

/** Flat envelope returned by auth log endpoints */
interface AuthLogEnvelope {
  logs: RawAuthRow[];
  page: number;
  limit: number;
  total: number;
}

function mapAuthRow(row: RawAuthRow): AuthLog {
  return {
    id: String(row.id),
    timestamp: row.timestamp,
    logType: "authn",
    userId: row.userId,
    requestId: row.requestId,
    actorRealm: row.actorRealm,
    workspaceId: row.workspaceId,
    status: row.status === "success" ? "success" : "failure",
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    action: row.action,
    failureReason: row.error,
    metadata: {
      requestId: row.requestId,
      actorRealm: row.actorRealm,
      workspaceId: row.workspaceId,
    },
  };
}

export interface FetchLogsParams {
  workspace_id: string;
  page?: number;
  /** Maps to the backend `limit` param */
  page_size?: number;
  status?: "success" | "failure";
  action?: string;
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

/** Raw row from GET /authsec/logs/audit/paginated */
interface RawAuditRow {
  id: number;
  timestamp: string;
  requestId: string;
  workspaceId: string;
  actorRealm: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  method: string;
  path: string;
  statusCode: number;
  status: "success" | "failure";
  ipAddress: string;
  userAgent: string;
  error?: string;
}

interface AuditLogEnvelope {
  logs: RawAuditRow[];
  page: number;
  limit: number;
  total: number;
}

function mapAuditRow(row: RawAuditRow): AuditLog {
  // Derive display action from backend action string
  let action: AuditLog["action"] = "updated";
  const a = row.action.toLowerCase();
  if (a.includes("creat") || a.includes("add") || a.includes("register"))
    action = "created";
  else if (a.includes("delet") || a.includes("remov")) action = "deleted";
  else if (a.includes("enabl") || a.includes("activ")) action = "enabled";
  else if (a.includes("disabl") || a.includes("deactiv")) action = "disabled";

  // Derive resourceType from resource string
  let resourceType: AuditLog["resourceType"] = "config";
  const r = row.resource.toLowerCase();
  if (r.includes("user")) resourceType = "user";
  else if (r.includes("group")) resourceType = "group";
  else if (r.includes("role")) resourceType = "role";
  else if (r.includes("client") || r.includes("workload"))
    resourceType = "client";
  else if (r.includes("resource") || r.includes("entry"))
    resourceType = "resource";
  else if (r.includes("auth")) resourceType = "auth_method";

  // Severity heuristic (presentation only)
  let severity: AuditLog["severity"] = "low";
  if (action === "deleted") severity = "high";
  else if (action === "disabled") severity = "medium";
  if (row.status === "failure") severity = "high";

  // Category heuristic
  let category: AuditLog["category"] = "configuration";
  if (resourceType === "user" || resourceType === "auth_method")
    category = "identity";
  else if (resourceType === "role" || resourceType === "client")
    category = "access";

  const status: AuditLog["status"] =
    row.status === "success" ? "success" : "failed";

  return {
    id: String(row.id),
    timestamp: row.timestamp,
    actor: {
      userId: row.userId,
      username: row.userId,
      email: "",
      role: row.actorRealm,
    },
    action,
    resourceType,
    resourceId: row.resourceId,
    resourceName: row.resourceId,
    severity,
    category,
    reason: row.error,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    status,
    rollbackAvailable: false,
    metadata: {
      requestId: row.requestId,
      actorRealm: row.actorRealm,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
    },
  };
}

export interface FetchAuditLogsParams {
  workspace_id: string;
  page?: number;
  page_size?: number;
  action?: string;
  resource?: string;
}

// ---------------------------------------------------------------------------
// M2M logs
// ---------------------------------------------------------------------------

/** Raw row from GET /authsec/logs/m2m/paginated */
interface RawM2MRow {
  id: string;
  createdAt: string;
  workspaceId: string;
  tokenFamily: string;
  clientId: string;
  subjectType: string;
  subjectId?: string;
  resourceServerId: string;
  pdpEffect: "permit" | "deny" | "no_policy";
  gateEffect: "permit" | "deny";
  pdpAgrees: boolean;
  scopesRequested: string;
  scopesGranted: string;
  pdpReason?: string;
}

interface M2MLogEnvelope {
  logs: RawM2MRow[];
  page: number;
  limit: number;
  total: number;
}

function mapM2MRow(row: RawM2MRow): M2MLog {
  return {
    id: row.id,
    createdAt: row.createdAt,
    workspaceId: row.workspaceId,
    tokenFamily: row.tokenFamily,
    clientId: row.clientId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    resourceServerId: row.resourceServerId,
    pdpEffect: row.pdpEffect,
    gateEffect: row.gateEffect,
    pdpAgrees: row.pdpAgrees,
    scopesRequested: row.scopesRequested,
    scopesGranted: row.scopesGranted,
    pdpReason: row.pdpReason,
  };
}

export interface FetchM2MLogsParams {
  workspace_id: string;
  page?: number;
  page_size?: number;
  client_id?: string;
}

// ---------------------------------------------------------------------------
// Log status / configuration
// ---------------------------------------------------------------------------

/** Shape of GET /authsec/logs/status */
interface LogStatusResponse {
  enabled: boolean;
  backend: string;
  sources: {
    auth: string;
    audit: string;
    m2m: string;
    spire: string;
  };
}

/** What the config page components expect */
export interface LogConfigurationStatus {
  splunk: boolean;
  fluentbit: boolean;
  syslog: boolean;
  elasticsearch: boolean;
  /** True when logs are database-backed (read-only informational) */
  databaseBacked?: boolean;
  backend?: string;
}

export interface GetLogConfigurationStatusParams {
  workspace_id: string;
}

export interface ConfigureLogServiceRequest {
  host: string;
  workspace_id: string;
  name: "splunk" | "fluentbit" | "elasticsearch" | "syslog";
}

export interface ConfigureLogServiceResponse {
  success: boolean;
  message?: string;
}

export interface ConfigureFluentbitRequest {
  host: string;
}

export interface ConfigureFluentbitResponse {
  success: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Deprecated interfaces kept for backward compatibility
// ---------------------------------------------------------------------------

export interface FetchLogsResponse {
  logs?: AuthLog[];
  pagination?: PaginationMetadata;
}

export interface FetchAuditLogsResponse {
  logs?: AuditLog[];
  pagination?: PaginationMetadata;
}

export interface FetchM2MLogsResponse {
  logs?: M2MLog[];
  pagination?: PaginationMetadata;
}

export interface LogAnalytics {
  total: number;
  errors: number;
  warnings: number;
  success?: number;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// RTK Query endpoints
// ---------------------------------------------------------------------------

export const logsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Auth logs — GET /authsec/logs/auth/paginated
    getLogs: builder.query<
      { logs: AuthLog[]; pagination?: PaginationMetadata },
      FetchLogsParams
    >({
      query: ({ workspace_id, page, page_size, status, action }) => {
        const params = new URLSearchParams();
        params.append("workspace_id", workspace_id);
        if (page !== undefined) params.append("page", String(page));
        // Backend uses `limit`, not `page_size`
        if (page_size !== undefined) params.append("limit", String(page_size));
        // Backend expects lowercase status
        if (status) params.append("status", status.toLowerCase());
        if (action) params.append("action", action);
        return { url: `/authsec/logs/auth/paginated?${params}`, method: "GET" };
      },
      transformResponse: (response: AuthLogEnvelope) => {
        const rows = response.logs ?? [];
        const pagination = buildPagination(
          response.page,
          response.limit,
          response.total
        );
        return { logs: rows.map(mapAuthRow), pagination };
      },
      providesTags: ["Log"],
    }),

    // Placeholder stubs kept so consumers don't break
    getLog: builder.query<AuthLog, string>({
      queryFn: () => ({ data: null as any }),
      providesTags: (result, error, id) => [{ type: "Log", id }],
    }),

    createLog: builder.mutation<AuthLog, Partial<AuthLog>>({
      queryFn: () => ({ data: null as any }),
      invalidatesTags: ["Log"],
    }),

    exportLogs: builder.mutation<
      Blob,
      FetchLogsParams & { format?: "csv" | "json" }
    >({
      queryFn: () => ({ data: new Blob() }),
    }),

    getLogAnalytics: builder.query<LogAnalytics, FetchLogsParams>({
      queryFn: () => ({ data: { total: 0, errors: 0, warnings: 0 } }),
      providesTags: ["Log"],
    }),

    // Audit logs — GET /authsec/logs/audit/paginated
    getAuditLogs: builder.query<
      { logs: AuditLog[]; pagination?: PaginationMetadata },
      FetchAuditLogsParams
    >({
      query: ({ workspace_id, page, page_size, action, resource }) => {
        const params = new URLSearchParams();
        params.append("workspace_id", workspace_id);
        if (page !== undefined) params.append("page", String(page));
        if (page_size !== undefined) params.append("limit", String(page_size));
        if (action) params.append("action", action);
        if (resource) params.append("resource", resource);
        return {
          url: `/authsec/logs/audit/paginated?${params}`,
          method: "GET",
        };
      },
      transformResponse: (response: AuditLogEnvelope) => {
        const rows = response.logs ?? [];
        const pagination = buildPagination(
          response.page,
          response.limit,
          response.total
        );
        return { logs: rows.map(mapAuditRow), pagination };
      },
      providesTags: ["Log"],
    }),

    // M2M logs — GET /authsec/logs/m2m/paginated
    getM2MLogs: builder.query<
      { logs: M2MLog[]; pagination?: PaginationMetadata },
      FetchM2MLogsParams
    >({
      query: ({ workspace_id, page, page_size, client_id }) => {
        const params = new URLSearchParams();
        params.append("workspace_id", workspace_id);
        if (page !== undefined) params.append("page", String(page));
        if (page_size !== undefined) params.append("limit", String(page_size));
        if (client_id) params.append("client_id", client_id);
        return { url: `/authsec/logs/m2m/paginated?${params}`, method: "GET" };
      },
      transformResponse: (response: M2MLogEnvelope) => {
        const rows = response.logs ?? [];
        const pagination = buildPagination(
          response.page,
          response.limit,
          response.total
        );
        return { logs: rows.map(mapM2MRow), pagination };
      },
      providesTags: ["Log"],
    }),

    // Log status — GET /authsec/logs/status
    getLogConfigurationStatus: builder.query<
      LogConfigurationStatus,
      GetLogConfigurationStatusParams
    >({
      query: ({ workspace_id }) => ({
        url: `/authsec/logs/status?workspace_id=${workspace_id}`,
        method: "GET",
      }),
      transformResponse: (response: LogStatusResponse): LogConfigurationStatus => {
        return {
          // External forwarding config is deploy-layer only; surface as all false
          splunk: false,
          fluentbit: false,
          syslog: false,
          elasticsearch: false,
          databaseBacked: response.backend === "database",
          backend: response.backend,
        };
      },
      providesTags: ["LogConfigurationStatus"],
    }),

    // Fluent-bit forwarding (deploy-layer no-op from product side)
    configureLogService: builder.mutation<
      ConfigureLogServiceResponse,
      ConfigureLogServiceRequest
    >({
      query: (config) => ({
        url: "/authsec/logs/admin/fluent-bit",
        method: "POST",
        body: config,
      }),
      invalidatesTags: ["LogConfigurationStatus"],
    }),

    configureFluentbit: builder.mutation<
      ConfigureFluentbitResponse,
      ConfigureFluentbitRequest
    >({
      query: (config) => ({
        url: "/authsec/logs/admin/fluent-bit",
        method: "POST",
        body: config,
      }),
    }),
  }),
});

export const {
  useGetLogsQuery,
  useGetLogQuery,
  useCreateLogMutation,
  useExportLogsMutation,
  useGetLogAnalyticsQuery,
  useGetAuditLogsQuery,
  useGetM2MLogsQuery,
  useGetLogConfigurationStatusQuery,
  useConfigureLogServiceMutation,
  useConfigureFluentbitMutation,
} = logsApi;
