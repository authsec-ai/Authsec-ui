/**
 * Which Discovery-page source notices the reader has already dismissed this
 * session. Dismissal is sessionStorage, not localStorage: closing a notice
 * says "I've seen this for now", not "never tell me again" — an unresolved
 * connection problem returns on the next visit, rather than staying hidden
 * forever once it has been swiped away once.
 *
 * One key for every notice that uses it — SourceNotices.tsx (shared across
 * every provider) and discovery/cloud/azure/AzureCoverageSummary.tsx — so
 * dismissing one does not clash with the other's storage.
 */

import { useCallback, useState } from "react";

const STORAGE_KEY = "iga.discovery.dismissedNotices";

function read(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function write(keys: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Private browsing or a full quota: the notice just cannot be dismissed.
  }
}

export function useDismissedNotices() {
  const [dismissed, setDismissed] = useState<Set<string>>(read);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      write(next);
      return next;
    });
  }, []);

  return { isDismissed: (key: string) => dismissed.has(key), dismiss };
}
