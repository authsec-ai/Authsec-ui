/**
 * Small JSON client for feature modules that call the API directly.
 * Sends the same session token and origin as the RTK Query base API.
 */

import config from "@/config";
import { SessionManager } from "@/utils/sessionManager";

export interface ApiResult<T> {
  data: T;
}

function origin(): string {
  return (config.VITE_API_URL || "http://localhost:7468").replace(/\/$/, "");
}

function messageFrom(body: unknown, status: number, statusText: string): string {
  if (body && typeof body === "object") {
    const record = body as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message) return record.message;
    if (typeof record.error === "string" && record.error) return record.error;
  }
  return statusText || `Request failed (${status})`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const url = path.startsWith("http") ? path : `${origin()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers();
  const token = SessionManager.getSession()?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    throw new Error(messageFrom(parsed, response.status, response.statusText));
  }
  return { data: parsed as T };
}

export const apiClient = {
  get<T = unknown>(path: string): Promise<ApiResult<T>> {
    return request<T>("GET", path);
  },
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return request<T>("POST", path, body ?? {});
  },
  put<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
    return request<T>("PUT", path, body ?? {});
  },
};
