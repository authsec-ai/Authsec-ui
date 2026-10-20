import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import "./index.css";
import App from "./App.tsx";
import { store } from "./app/store.ts";
import { ThemeProvider } from "./components/theme-provider.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { captureLoginTicketFromUrl } from "./auth/loginTicket.ts";
import { reloadOnceForNewVersion } from "./utils/chunkReload.ts";

// Vite raises this when a lazily loaded page file no longer exists (a release
// replaced it while this tab was open). Load the new version once; if that has
// already been tried, let the error reach the boundary, which explains it.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault();
});

// A SAML sign-in hands its login ticket over in the redirect URL.
captureLoginTicketFromUrl();

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
