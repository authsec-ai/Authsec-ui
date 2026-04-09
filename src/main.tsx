import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App.tsx";
import { store } from "./app/store.ts";
import { ThemeProvider } from "./components/theme-provider.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { checkAndShowTokenInjector } from "./utils/devTokenInjector.ts";
import { initTelemetry, logJSError } from "./utils/telemetry.ts";
import * as amplitude from "@amplitude/analytics-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";
import clarity from "@microsoft/clarity";
import config from "./config.ts";
import { SessionManager } from "./utils/sessionManager.ts";
import { initializeXPixel } from "./utils/xPixel.ts";

// Initialize Amplitude Analytics with Session Replay
// Use runtime configuration (window.ENV) with fallback to build-time environment variable
const amplitudeApiKey = config.VITE_AMPLITUDE_API_KEY;

if (amplitudeApiKey) {
  amplitude.add(sessionReplayPlugin({ sampleRate: 1 }));

  // Enrich element click events with meaningful descriptions
  amplitude.add({
    name: "enrich-button-clicks",
    type: "enrichment" as amplitude.Types.EnrichmentPlugin["type"],
    setup: async () => undefined,
    execute: async (event: amplitude.Types.Event) => {
      // Block noisy events
      const blocklist = [
        "[Amplitude] Web Vitals",
        "[Amplitude] Network Request",
        "[Amplitude] Element Changed",
        "Replay Captured",
      ];
      if (
        event.event_type &&
        blocklist.some((b) => event.event_type?.includes(b))
      ) {
        return undefined;
      }

      // Rename generic "Element Clicked" events to meaningful names
      if (event.event_type === "[Amplitude] Element Clicked") {
        const text =
          (event.event_properties?.["[Amplitude] Element Text"] as string) ||
          "";
        const tag =
          (event.event_properties?.["[Amplitude] Element Tag"] as string) || "";
        const id =
          (event.event_properties?.["[Amplitude] Element ID"] as string) || "";
        const href =
          (event.event_properties?.["[Amplitude] Element Href"] as string) ||
          "";

        // Only track button/link clicks with text
        if ((tag === "button" || tag === "a") && text) {
          return {
            ...event,
            event_type: `Clicked: ${text}`,
            event_properties: {
              ...event.event_properties,
              element_tag: tag,
              element_id: id,
              element_href: href,
            },
          };
        }

        // Filter out clicks without meaningful text
        return undefined;
      }

      return event;
    },
  });

  amplitude.init(amplitudeApiKey, {
    autocapture: {
      pageViews: false,
      sessions: true,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: true, // ENABLE to capture button clicks
      frustrationInteractions: false,
      networkTracking: false,
      webVitals: false,
    },
  });

  // Restore userId from existing session so returning users are identified
  if (SessionManager.isSessionValid()) {
    const session = SessionManager.getSession();
    const userId = session?.user?.email || session?.user?.email_id;
    if (userId) {
      amplitude.setUserId(userId);
    }
  }

} else {
}

// Initialize Microsoft Clarity
const clarityProjectId = config.VITE_CLARITY_PROJECT_ID;

if (clarityProjectId) {
  clarity.init(clarityProjectId);

  // Restore userId from existing session so returning users are identified
  if (SessionManager.isSessionValid()) {
    const session = SessionManager.getSession();
    const userId = session?.user?.email || session?.user?.email_id;
    if (userId) {
      clarity.identify(userId);
    }
  }

} else {
}

// Initialize OpenTelemetry error logging → Loki → Grafana
const otelEndpoint = config.VITE_OTEL_ENDPOINT;

if (otelEndpoint) {
  initTelemetry(otelEndpoint);
  window.addEventListener("error", logJSError);
} else {
}

initializeXPixel();

// Check if running on localhost and show token injector if needed
checkAndShowTokenInjector();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <ErrorBoundary>
        <ThemeProvider
          defaultTheme="dark"
          storageKey="authsec-ui-theme"
          enableSystem
        >
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </Provider>
  </StrictMode>,
);
