import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
  FetchBaseQueryMeta,
} from "@reduxjs/toolkit/query";
import config from '../../config';

// Define base types for the API
export interface ApiResponse<T> {
  data: T;
  error?: string;
  count?: number;
}

export interface ApiError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface FilterParams {
  search?: string;
  status?: string;
  type?: string;
  [key: string]: string | number | boolean | undefined;
}

// Helper function to get session data
export const getSessionData = () => {
  const sessionData = localStorage.getItem("authsec_session_v2");
  if (sessionData) {
    try {
      return JSON.parse(sessionData);
    } catch {
      console.error("Session data parsing failed - invalid JSON format");
    }
  }
  return null;
};

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export const normalizeApiPath = (url: string) => {
  if (!url || ABSOLUTE_URL_PATTERN.test(url)) {
    return url;
  }

  return url
    .replace(/^\/?authsec\/+/i, "")
    .replace(/^\/+/, "");
};

export const normalizeBaseQueryArgs = (args: string | FetchArgs) => {
  if (typeof args === "string") {
    return normalizeApiPath(args);
  }

  const normalizedUrl = normalizeApiPath(args.url);
  if (normalizedUrl === args.url) {
    return args;
  }

  return {
    ...args,
    url: normalizedUrl,
  };
};

export const prepareAuthSecHeaders = (headers: Headers) => {
  const session = getSessionData();
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
};

export const createAuthSecBaseQuery = (
  overrides: Partial<Parameters<typeof fetchBaseQuery>[0]> = {}
): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError, {}, FetchBaseQueryMeta> => {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl: config.VITE_API_URL || "https://test.api.authsec.dev",
    timeout: 30000,
    credentials: "include",
    prepareHeaders: prepareAuthSecHeaders,
    ...overrides,
  });

  return async (args, api, extraOptions) =>
    rawBaseQuery(normalizeBaseQueryArgs(args), api, extraOptions);
};

// Standard AuthSec API query function (clean, no auto-injection)
const baseQuery = createAuthSecBaseQuery();

// Helper function to inject session data when needed
export const withSessionData = (body: any) => {
  const session = getSessionData();
  return {
    ...body,
    tenant_id: body.tenant_id || session?.tenant_id || "",
    client_id: body.client_id || session?.client_id || "",
    project_id: body.project_id || session?.project_id || "",
  };
};

// Create the base API (stage.api.authsec.dev) - using clean baseQuery
export const baseApi = createApi({
  reducerPath: "baseApi",
  baseQuery,
  tagTypes: [
    "Auth",
    "AdminAuth",
    "MFAAuth",
    "AuthMethod",
    // Legacy RBAC tags (deprecated - use namespaced versions)
    "AuthSecRole",
    "AuthSecGroup",
    "AuthSecResource",
    "AuthSecScope",
    "AuthSecPermission",
    "AuthSecResourceMethod",
    // Admin RBAC tags (namespaced)
    "AdminRBACRole",
    "AdminRBACGroup",
    "AdminRBACResource",
    "AdminRBACScope",
    "AdminRBACPermission",
    // EndUser RBAC tags (namespaced)
    "EndUserRBACRole",
    "EndUserRBACGroup",
    "EndUserRBACResource",
    "EndUserRBACScope",
    "EndUserRBACPermission",
    // Unified RBAC tags (namespaced)
    "UnifiedRBACRole",
    "UnifiedRBACGroup",
    "UnifiedRBACResource",
    "UnifiedRBACScope",
    "UnifiedRBACPermission",
    // Non-RBAC tags
    "AuthSecClient",
    "Client",
    "OIDCProvider",
    "AuthMethodOIDCProvider",
    "SamlProvider",
    "SamlMetadata",
    "ClientAuthMethods",
    "AuthSecTenant",
    "User",
    "Resource",
    "Scope",
    "Role",
    "Group",
    "RolePermission",
    "UserStats",
    "UserAnalytics",
    "RoleAnalytics",
    "ResourceAnalytics",
    "UserIdentity",
    "MFA",
    "WebAuthn",
    "TOTP",
    "ExternalService",
    "Workload",
    "Entry",
    "Agent",
    "DashboardEndUser",
    "DashboardStats",
    "Dashboard",
    "DashboardUserStats",
    "DashboardUserAnalytics",
    "AdminUser",
    "EndUser",
    "UnifiedUser",
    "UserAuth",
    "SyncConfig",
    "Log",
    "LogConfigurationStatus",
    "AdminApiOAuthScope",
    "EndUserApiOAuthScope",
    "CustomDomain",
    "DelegationPolicy",
  ],
  endpoints: () => ({}),
});

// Export types for use in other API slices
export type BaseQueryFn = typeof baseQuery;
