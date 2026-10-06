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
