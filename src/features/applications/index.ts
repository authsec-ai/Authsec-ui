/**
 * Public surface of the `applications` feature.
 *
 * Phase 1: only types and the Launch-Control chrome components.
 * Pages (ApplicationsPage, ApplicationLayout, *Page) land in Phase 2/3.
 */

export type {
  Application,
  Readiness,
  ReadinessArea,
  ReadinessState,
  RuntimeBehavior,
  LaunchGate,
  ActivityEvent,
  NextBestAction,
} from "./types";

export { ApplicationHeader } from "./components/ApplicationHeader";
export { ReadinessRibbon } from "./components/ReadinessRibbon";
export { ApplicationDetailTabs } from "./components/ApplicationDetailTabs";
export { NextBestActionCard } from "./components/NextBestActionCard";
export { ReadinessGate } from "./components/ReadinessGate";

export { computeReadiness } from "./lib/computeReadiness";
export {
  computeNextBestAction,
  nextActionHref,
  nextActionLabel,
} from "./lib/computeNextBestAction";

export { default as ApplicationLayout } from "./ApplicationLayout";
export { useApplicationContext } from "./useApplicationContext";
export { default as ApplicationsPage } from "./ApplicationsPage";
export { default as CreateApplicationPage } from "./CreateApplicationPage";
export { default as ApplicationOverviewPage } from "./ApplicationOverviewPage";
export { default as ApplicationSetupPage } from "./ApplicationSetupPage";
export { default as ApplicationToolsPage } from "./ApplicationToolsPage";
export { default as ApplicationAccessPage } from "./ApplicationAccessPage";
export { default as ApplicationClientsPage } from "./ApplicationClientsPage";
export { default as ApplicationTestPage } from "./ApplicationTestPage";
export { default as ApplicationLaunchPage } from "./ApplicationLaunchPage";
export { default as ApplicationActivityPage } from "./ApplicationActivityPage";

export { ConfigRuntimeToggle } from "./components/ConfigRuntimeToggle";
