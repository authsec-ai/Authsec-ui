/**
 * What a failed request means, said plainly (SPEC-iga-phase2-graph.md
 * §2.14.2 *Every action says what actually happened*). A 404 is "not found";
 * a 403 is a missing permission; a 401 is a signed-out session; anything
 * else — a 500, a timeout, no network — is a failed request that Retry may
 * fix. A failed request is never presented as a missing object or an empty
 * list.
 */

import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

export type LoadFailure = "not_found" | "forbidden" | "unauthenticated" | "failed";

export function loadFailureOf(error: FetchBaseQueryError | SerializedError | undefined): LoadFailure | null {
  if (!error) return null;
  const status = "status" in error ? error.status : undefined;
  if (status === 404) return "not_found";
  if (status === 403) return "forbidden";
  if (status === 401) return "unauthenticated";
  return "failed";
}

/** An `AdaptiveTable` `failure` for a list that could not load: never an empty table. */
export function tableFailure(
  error: FetchBaseQueryError | SerializedError | undefined,
  subject: string,
  /** Return the refetch, so Retry shows it is busy until it settles. */
  onRetry: () => unknown,
  permission?: string,
): { message: string; onRetry: () => unknown } | undefined {
  const f = loadFailureOf(error);
  if (!f) return undefined;
  const message =
    f === "forbidden"
      ? `Your role is missing the permission to list ${subject}${permission ? ` (${permission})` : ""}.`
      : f === "unauthenticated"
        ? "Your session has ended. Sign in again to continue."
        : `Could not load ${subject}. This is a failed request, not an empty list.`;
  return { message, onRetry };
}
