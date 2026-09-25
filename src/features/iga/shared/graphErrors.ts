/**
 * One classification of graph API failures, so every screen renders the same
 * answer for the same situation (SPEC-iga-phase2-graph.md §2.14.7, §5.2).
 *
 * The distinctions are the point. "The route is not deployed", "you may not
 * see this", "a newer scan published" and "the request failed" are four
 * different answers, and none of them is ever rendered as an empty list.
 */

import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

import type { GraphErrorBody } from "@/app/api/igaGraphApi";

export type GraphFailure =
  | { kind: "unavailable"; reason?: string }
  | { kind: "unauthorized" }
  | { kind: "not_found" }
  | { kind: "revision_stale"; currentRev?: number; currentPublishedAt?: string }
  | { kind: "listing_changed" }
  | { kind: "timeout" }
  | { kind: "failed"; status?: number | string; message?: string };

function isFetchError(e: unknown): e is FetchBaseQueryError {
  return typeof e === "object" && e !== null && "status" in e;
}

function body(e: FetchBaseQueryError): GraphErrorBody["error"] | undefined {
  const d = e.data as Partial<GraphErrorBody> | undefined;
  return d && typeof d === "object" && d.error && typeof d.error === "object"
    ? d.error
    : undefined;
}

export function classifyGraphError(
  error: FetchBaseQueryError | SerializedError | undefined,
): GraphFailure | null {
  if (!error) return null;
  if (!isFetchError(error)) {
    return { kind: "failed", message: error.message };
  }
  const b = body(error);
  switch (error.status) {
    case 403:
      return { kind: "unauthorized" };
    case 404:
      // A graph 404 always carries `{error: {code: "not_found"}}`. A 404
      // WITHOUT that body is the router answering: the backend in front of us
      // does not have this route yet. That is "unavailable", not "not found"
      // — the UI and backend deploy separately (§2.14.14).
      return b?.code === "not_found" ? { kind: "not_found" } : { kind: "unavailable" };
    case 409:
      if (b?.code === "revision_stale") {
        return {
          kind: "revision_stale",
          currentRev: b.current_rev ?? undefined,
          currentPublishedAt: b.current_published_at ?? undefined,
        };
      }
      if (b?.code === "listing_changed") return { kind: "listing_changed" };
      return { kind: "failed", status: 409, message: b?.message };
    case 503:
      return b?.code === "graph_unavailable"
        ? { kind: "unavailable", reason: b.reason ?? undefined }
        : { kind: "failed", status: 503, message: b?.message };
    case 504:
      return { kind: "timeout" };
    case "TIMEOUT_ERROR":
      return { kind: "timeout" };
    default:
      return { kind: "failed", status: error.status, message: b?.message };
  }
}
