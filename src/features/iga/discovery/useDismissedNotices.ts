/**
 * Which Discovery-page source notices the reader has already dismissed this
 * session. Dismissal is sessionStorage, not localStorage: closing a notice
 * says "I've seen this for now", not "never tell me again" — an unresolved
 * connection problem returns on the next visit, rather than staying hidden
 * forever once it has been swiped away once.
 *
 * Kept per signed-in user and workspace, both read from the session's token:
 * a sign-out, another user or a workspace switch in the same tab starts with
 * nothing dismissed. Some notice keys are not unique across workspaces (a
 * Kubernetes sweep's is the cluster's name), so one shared key could hide a
 * notice in a workspace where it was never seen.
 */

import { useCallback, useMemo, useState } from "react";

import { SessionManager } from "@/utils/sessionManager";
import { getWorkspaceId } from "@/utils/workspace";

const STORAGE_PREFIX = "iga.discovery.dismissedNotices";

function storageKey(): string {
  const s = SessionManager.getSession();
  return `${STORAGE_PREFIX}:${(s?.token && s.user_id) || "-"}:${getWorkspaceId() ?? "-"}`;
}

function read(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function write(key: string, keys: Set<string>) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...keys]));
  } catch {
    // Private browsing or a full quota: the notice just cannot be dismissed.
  }
}

export function useDismissedNotices() {
  // Read on every render, so a session that changes under a mounted list
  // switches to its own dismissals instead of keeping the previous one's.
  const key = storageKey();
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` re-reads after a dismissal
  const dismissed = useMemo(() => read(key), [key, version]);

  const dismiss = useCallback(
    (notice: string) => {
      const next = read(key);
      next.add(notice);
      write(key, next);
      setVersion((v) => v + 1);
    },
    [key],
  );

  return { isDismissed: (notice: string) => dismissed.has(notice), dismiss };
}
