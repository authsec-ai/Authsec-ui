import { createContext, useContext } from "react";

/**
 * Set by `ConsoleHub` around the page it hosts as a tab. A `ConsolePage`
 * inside a hub drops its own title (the hub has one) and sends its header
 * actions to the hub header, so a tab's primary button sits where every
 * other page's does.
 */
export interface ConsoleHubValue {
  actionsSlot: HTMLElement | null;
}

export const ConsoleHubContext = createContext<ConsoleHubValue | null>(null);

export function useConsoleHub(): ConsoleHubValue | null {
  return useContext(ConsoleHubContext);
}
