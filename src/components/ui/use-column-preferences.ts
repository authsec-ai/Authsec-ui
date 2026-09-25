/**
 * Which optional columns the customer chose for a fitted `AdaptiveTable`
 * (see `ColumnsMenu`). Column ids only — never row contents — kept per table
 * and per signed-in user and workspace, in this browser.
 */

import * as React from "react";

import { SessionManager } from "@/utils/sessionManager";

import type { AdaptiveColumn } from "./adaptive-table";

function storageKey(tableId: string): string {
  const s = SessionManager.getSession();
  return `table-columns:v1:${tableId}:${s?.workspace_id ?? "-"}:${s?.user_id ?? "-"}`;
}

/** The optional columns the customer chose for `tableId`, and a setter that remembers them. */
export function useColumnPreferences<TData>(tableId: string, columns: AdaptiveColumn<TData>[]) {
  const optional = React.useMemo(() => columns.filter((c) => !c.primary && !c.alwaysVisible && c.id !== "actions"), [columns]);
  const defaults = React.useMemo(() => optional.filter((c) => !c.defaultHidden).map((c) => c.id), [optional]);
  const [chosen, setChosenState] = React.useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(tableId));
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    } catch {
      // Unreadable or blocked storage: fall back to the defaults.
    }
    return defaults;
  });
  const setChosen = React.useCallback(
    (next: string[]) => {
      setChosenState(next);
      try {
        localStorage.setItem(storageKey(tableId), JSON.stringify(next));
      } catch {
        // Not remembered; the choice still applies now.
      }
    },
    [tableId],
  );
  const reset = React.useCallback(() => {
    setChosenState(defaults);
    try {
      localStorage.removeItem(storageKey(tableId));
    } catch {
      // Nothing stored.
    }
  }, [tableId, defaults]);
  // Only ids the table still has.
  const known = React.useMemo(() => chosen.filter((id) => optional.some((c) => c.id === id)), [chosen, optional]);
  return { chosen: known, setChosen, reset, optional };
}

