/**
 * Hook used by `/applications/:id/*` tab pages to read the parent
 * `ApplicationLayout`'s loaded application + readiness without
 * re-fetching. Lives in its own file so React Fast Refresh stays happy.
 */

import { useOutletContext } from "react-router-dom";
import type { Application, Readiness } from "./types";

export interface ApplicationOutletContext {
  application: Application;
  readiness: Readiness;
}

export function useApplicationContext(): ApplicationOutletContext {
  return useOutletContext<ApplicationOutletContext>();
}
