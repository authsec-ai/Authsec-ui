import * as React from "react";

/** Which columns a fitted `AdaptiveTable` is drawing, for cells that adapt to it (a name cell adding the account when its column is hidden). */
export const AdaptiveVisibleContext = React.createContext<ReadonlySet<string> | null>(null);

/** Whether column `id` is drawn in the enclosing fitted table (true outside one). */
export function useAdaptiveColumnShown(id: string): boolean {
  const shown = React.useContext(AdaptiveVisibleContext);
  return shown ? shown.has(id) : true;
}
