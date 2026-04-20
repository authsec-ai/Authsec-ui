import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackPageViewed } from "@/utils/analytics";

// Map routes to friendly page names
const ROUTE_TO_PAGE_NAME: Record<string, string> = {
  "/": "Landing Page",
  "/dashboard": "Dashboard",
  "/admin/login": "Admin Login",
  "/admin/verify-otp": "OTP Verification",
  "/admin/webauthn": "WebAuthn Authentication",
  "/admin/create-workspace": "Create Workspace",
  "/oidc/login": "OIDC Login",
  "/oidc/auth/callback": "OIDC Callback",
  "/authsec/uflow/oidc/callback": "Admin OIDC Callback",
  "/admin/users": "Admin Users",
  "/enduser/users": "End Users",
  "/admin/roles": "Admin Roles",
  "/enduser/roles": "End User Roles",
  "/admin/scopes": "Admin Scopes",
  "/enduser/scopes": "End User Scopes",
  "/admin/api-oauth-scopes": "Admin API OAuth Scopes",
  "/enduser/api-oauth-scopes": "End User API OAuth Scopes",
  "/admin/permissions": "Admin Permissions",
  "/enduser/permissions": "End User Permissions",
  "/admin/resources": "Admin Resources",
  "/enduser/resources": "End User Resources",
  "/admin/role-bindings": "Admin Role Bindings",
  "/enduser/role-bindings": "End User Role Bindings",
  "/clients/mcp": "Clients (MCP Servers)",
  "/clients/onboard": "Onboard Client",
  "/sdk": "SDK Hub",
  "/clients/agents": "Agents",
  "/clients/workloads": "Workload Certificates",
  "/clients/voice-agent": "Voice Agent Configuration",
  "/admin/voice-agent": "Admin Voice Agent",
  "/authentication": "Authentication Methods",
  "/authentication/create": "Add Authentication Method",
  "/authentication/saml/create": "Create SAML Provider",
  "/vault": "Vault (Secrets)",
  "/vault/import": "Import Secrets",
  "/logs/auth": "Authentication Logs",
  "/logs/audit": "Audit Logs",
  "/logs/m2m": "Machine-to-Machine Logs",
  "/logs/configure": "Logs Configuration",
  "/external-services": "External Services",
  "/external-services/add": "Add External Service",
  "/custom-domains": "Custom Domains",
};

/**
 * Custom hook to track page views in Amplitude with friendly page names.
 * Automatically fires on route changes.
 */
export function usePageViewTracking() {
  const location = useLocation();
  const previousPathRef = useRef<string>();

  useEffect(() => {
    const currentPath = location.pathname;

    // Don't track if path hasn't changed (prevents duplicate tracking on re-renders)
    if (previousPathRef.current === currentPath) {
      return;
    }

    previousPathRef.current = currentPath;

    // Get friendly page name from mapping or default to path
    let pageName = ROUTE_TO_PAGE_NAME[currentPath];

    if (!pageName) {
      // Handle dynamic routes like /sdk/*, /clients/onboard/:clientId or /authentication/saml/edit/:id
      if (currentPath.startsWith("/sdk/")) {
        pageName = "SDK Hub";
      } else if (currentPath.startsWith("/clients/onboard/")) {
        pageName = "Client Onboarding SDK Integration";
      } else if (currentPath.startsWith("/authentication/saml/edit/")) {
        pageName = "Edit SAML Provider";
      } else if (currentPath.startsWith("/authentication/oidc/edit/")) {
        pageName = "Edit OIDC Provider";
      } else {
        // Fallback: convert path to title case (e.g., /admin/some-page -> Admin Some Page)
        pageName = currentPath
          .split("/")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "))
          .join(" ");
      }
    }

    trackPageViewed(pageName, currentPath);
  }, [location.pathname]);
}
