import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from "react-router-dom";
import { Provider } from "react-redux";
import { Toaster } from "react-hot-toast";
import { store } from "./app/store";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthProvider } from "./auth/context/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { useSessionInit } from "./hooks/useSessionInit";
import { RbacAudienceProvider } from "./contexts/RbacAudienceContext";
import { GuidedTourProvider, GuidedTourOverlay } from "./features/guided-tour";
import { WizardProvider } from "./contexts/WizardContext";
import { DensityProvider } from "./contexts/DensityContext";
import React from "react";

import { DashboardPage } from "./features/dashboard/DashboardPage";
import AccessControlPage from "./features/access/AccessControlPage";

import { UsersPage } from "./features/users/UsersPage";
import NotFoundPage from "./components/shared/NotFoundPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import EndUsersPage from "./features/end-users/EndUsersPage";
import TeamPage from "./features/team/TeamPage";
import TrustedIssuersPage from "./features/settings/TrustedIssuersPage";


const DevBypassPage = import.meta.env.DEV
  ? React.lazy(() =>
      import("./features/dev-bypass/DevBypassPage").then((m) => ({
        default: m.DevBypassPage,
      })),
    )
  : null;
import ScopeCatalogPage from "./features/scope-catalog/ScopeCatalogPage";
// import { GroupsPage } from "./features/groups/GroupsPage";
// import ResourcesPage from "./features/resources/ResourcesPage";

// Resource server is now a backend/API term. User-facing legacy
// `/resource-servers/*` URLs redirect into the Applications console.
import ApplicationsPage from "./features/applications/ApplicationsPage";
import CreateApplicationPage from "./features/applications/CreateApplicationPage";
import ApplicationLayout from "./features/applications/ApplicationLayout";
import ApplicationSetupPage from "./features/applications/ApplicationSetupPage";
import ApplicationToolsPage from "./features/applications/ApplicationToolsPage";
import ApplicationScopesPage from "./features/applications/ApplicationScopesPage";
import ApplicationAccessPageV2 from "./features/applications/ApplicationAccessPageV2";
import ApplicationConnectionsPage from "./features/applications/ApplicationConnectionsPage";
import ApplicationRolesPage from "./features/applications/ApplicationRolesPage";
import ApplicationConsentGrantsPage from "./features/applications/ApplicationConsentGrantsPage";
import ApplicationClientsPage from "./features/applications/ApplicationClientsPage";
import ApplicationTestPage from "./features/applications/ApplicationTestPage";
import ApplicationLaunchPage from "./features/applications/ApplicationLaunchPage";
import ApplicationActivityPage from "./features/applications/ApplicationActivityPage";
import AgentsPage from "./features/agents/AgentsPage";
import ServiceAccountsPage from "./features/service-accounts/ServiceAccountsPage";
import DiscoveryIntegrationsPage from "./features/discovery/DiscoveryIntegrationsPage";
import DiscoveredAgentsPage from "./features/discovery/DiscoveredAgentsPage";
import IdentitiesPage from "./features/discovery/IdentitiesPage";
import RuleCatalogPage from "./features/discovery/RuleCatalogPage";
import IntegrationDetailPage from "./features/discovery/IntegrationDetailPage";
import GoogleOAuthCallbackPage from "./features/discovery/cloud/gcp/GoogleOAuthCallbackPage";
import AWSIdentitiesPage from "./features/discovery/cloud/aws/AWSIdentitiesPage";
import AWSComputePage from "./features/discovery/cloud/aws/AWSComputePage";
import ProvenancePage from "./features/governance/ProvenancePage";
import CertificationPage from "./features/governance/CertificationPage";
import CampaignDetailPage from "./features/governance/CampaignDetailPage";
import SoDPage from "./features/governance/SoDPage";
import BirthrightsPage from "./features/governance/BirthrightsPage";
import InstructionsPage from "./features/governance/InstructionsPage";
import { IgaLayout } from "./components/layout/IgaLayout";
import { AdminVoiceAgentPage } from "./features/voice-auth/AdminVoiceAgentPage";
import { LogsConfigurationPage } from "./features/logging/LogsConfigurationPage";
import { AuthLogsPage } from "./features/logging/AuthLogsPage";
import { AuditLogsPage } from "./features/logging/AuditLogsPage";
import { M2MLogsPage } from "./features/logging/M2MLogsPage";
import { VaultPage } from "./features/vault/VaultPage";

import { ImportSecretsPage } from "./features/vault/ImportSecretsPage";
import ScimConnectionsPage from "./features/scim-connections/ScimConnectionsPage";
import DirectorySyncPage from "./features/directory-sync/DirectorySyncPage";
import { RolesPage } from "./features/roles/RolesPage";
import { RoleTemplatesPage } from "./features/roles/RoleTemplatesPage";
import { AuthenticationPage } from "./features/authentication/AuthenticationPage";
import { CreateAuthMethodPage } from "./features/authentication/CreateAuthMethodPage";
import { CreateSamlMethodPage } from "./features/authentication/CreateSamlMethodPage";
import { EditSamlMethodPage } from "./features/authentication/EditSamlMethodPage";

// External services and secrets management
import { ExternalServicesPage } from "./features/external-services/ExternalServicesPage";
import { AddExternalServicePage } from "./features/external-services/AddExternalServicePage";

// Custom Domains
import { CustomDomainsPage } from "./features/custom-domains";
import {
  TrustDelegationPoliciesPage,
  TrustDelegationPolicyDetailPage,
  TrustDelegationPolicyFormPage,
} from "./features/trust-delegation";

// LEGACY/OBSOLETE: SDK Manager has been deprecated
// import { SDKManagerPage } from "./features/_LEGACY_sdk-manager/SDKManagerPage";

// New pages
// import CreateGroupPage from "./features/groups/CreateGroupPage";
// import { AddResourcePage } from "./features/resources/AddResourcePage";

// RBAC pages
import { PermissionsPage } from "./features/permissions/PermissionsPage";
import { RoleBindingsPage } from "./features/role-bindings/RoleBindingsPage";
import { PermissionResourcesPage } from "./features/resources/PermissionResourcesPage";
import EffectiveAccessPage from "./features/effective-access/EffectiveAccessPage";

import { UnifiedAuthFlowPage } from "./auth/app/UnifiedAuthFlowPage";

// Other pages
import { LandingPage } from "./pages/LandingPage";
import { ClientsPage } from "./features/clients/ClientsPage";

function LegacyTrustDelegationPolicyDetailRedirect() {
  const { policyId = "" } = useParams();
  return <Navigate to={`/trust-delegation/${policyId}`} replace />;
}

function LegacyTrustDelegationPolicyEditRedirect() {
  const { policyId = "" } = useParams();
  return <Navigate to={`/trust-delegation/${policyId}/edit`} replace />;
}

function LegacyClientOnboardRedirect() {
  const { clientId } = useParams<{ clientId?: string }>();
  const target = clientId
    ? `/applications/${encodeURIComponent(clientId)}/overview`
    : "/applications/new";

  return <Navigate to={target} replace />;
}

function LegacyResourceServerRedirect({
  section = "overview",
}: {
  section?: string;
}) {
  const { id = "" } = useParams<{ id?: string }>();
  const encoded = encodeURIComponent(id);
  return <Navigate to={`/applications/${encoded}/${section}`} replace />;
}

function LegacySDKGuidesRedirect() {
  return <Navigate to="/applications" replace />;
}

function RedirectWithQuery({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}


/**
 * App content component that uses session initialization
 */
/**
 * Route-scoped error boundary. Keying by pathname remounts the boundary on
 * navigation, so a crash on one page clears itself when the user navigates
 * away instead of wedging the whole app until a manual reload.
 */
function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

function AppContent() {
  useSessionInit();

  return (
    <AuthProvider>
      <RbacAudienceProvider>
        <Router>
          <DensityProvider>
          <WizardProvider>
            <GuidedTourProvider>
              <div className="min-h-screen bg-background text-foreground">
                <RoutedErrorBoundary>
                <Routes>
                  {/* Auth routes - accessible without authentication */}
                  <Route path="/admin/login" element={<UnifiedAuthFlowPage />} />
                  <Route
                    path="/authsec/admin/login"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route
                    path="/admin/signin"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/authsec/admin/signin"
                    element={<Navigate to="/authsec/admin/login" replace />}
                  />
                  <Route
                    path="/admin/signup"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/authsec/admin/signup"
                    element={<Navigate to="/authsec/admin/login" replace />}
                  />
                  <Route
                    path="/admin/verify-otp"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route
                    path="/authsec/admin/verify-otp"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route path="/admin/webauthn" element={<UnifiedAuthFlowPage />} />
                  <Route
                    path="/authsec/admin/webauthn"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route
                    path="/admin/auth/callback"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route
                    path="/authsec/admin/auth/callback"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route
                    path="/auth/callback"
                    element={<RedirectWithQuery to="/admin/auth/callback" />}
                  />
                  <Route
                    path="/authsec/auth/callback"
                    element={<RedirectWithQuery to="/authsec/admin/auth/callback" />}
                  />
                  <Route
                    path="/uflow/oidc/callback"
                    element={<RedirectWithQuery to="/admin/auth/callback" />}
                  />
                  <Route
                    path="/authsec/uflow/oidc/callback"
                    element={<RedirectWithQuery to="/authsec/admin/auth/callback" />}
                  />
                  <Route
                    path="/admin/create-workspace"
                    element={
                      <ProtectedRoute requireProject={false}>
                        <UnifiedAuthFlowPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/authsec/admin/create-workspace"
                    element={
                      <ProtectedRoute requireProject={false}>
                        <UnifiedAuthFlowPage />
                      </ProtectedRoute>
                    }
                  />

                  {/* Redirect incorrect hyphenated URLs to correct routes */}
                  <Route
                    path="/admin/sign-up"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/admin/sign-in"
                    element={<Navigate to="/admin/login" replace />}
                  />

                  {/* Backwards compatibility redirects */}
                  <Route
                    path="/auth/signin"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/auth/signup"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/auth/sign-in"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/auth/sign-up"
                    element={<Navigate to="/admin/login" replace />}
                  />
                  <Route
                    path="/auth/verify-otp"
                    element={<Navigate to="/admin/verify-otp" replace />}
                  />
                  <Route
                    path="/auth/webauthn"
                    element={<Navigate to="/admin/webauthn" replace />}
                  />
                  <Route
                    path="/auth/create-workspace"
                    element={<Navigate to="/admin/create-workspace" replace />}
                  />
                  <Route
                    path="/obsolete/login"
                    element={<Navigate to="/admin/login" replace />}
                  />

                  {/* OIDC login page matching backend template design */}
                  <Route path="/oidc/login" element={<UnifiedAuthFlowPage />} />
                  <Route path="/authsec/oidc/login" element={<UnifiedAuthFlowPage />} />
                  <Route
                    path="/oidc/auth/callback"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route
                    path="/authsec/oidc/auth/callback"
                    element={<UnifiedAuthFlowPage />}
                  />
                  <Route path="/oidc/mfa" element={<UnifiedAuthFlowPage />} />
                  <Route path="/authsec/oidc/mfa" element={<UnifiedAuthFlowPage />} />
                  <Route path="/oidc/error" element={<UnifiedAuthFlowPage />} />
                  <Route
                    path="/authsec/oidc/error"
                    element={<UnifiedAuthFlowPage />}
                  />

                  {/* Root route - handles authentication redirect */}
                  <Route path="/" element={<LandingPage />} />

                  {/* Protected routes - require authentication and workspace */}

                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <DashboardPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* ───── Legacy URL redirects ────────────────────────────
                       Pre-Launch-Control bookmarks resolve to their new
                       /applications/* equivalent. The SDK / Prompt /
                       Onboarding sub-pages are still real surfaces (the
                       new Setup tab links to them) so they stay registered
                       with their original components below. */}
                  <Route
                    path="/clients"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ClientsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/resource-servers"
                    element={<Navigate to="/applications" replace />}
                  />
                  <Route
                    path="/resource-servers/new"
                    element={<Navigate to="/applications/new" replace />}
                  />
                  <Route
                    path="/resource-servers/:id"
                    element={<LegacyResourceServerRedirect section="overview" />}
                  />
                  <Route
                    path="/resource-servers/:id/clients"
                    element={<LegacyResourceServerRedirect section="clients" />}
                  />

                  {/* Legacy resource-server sub-pages now resolve into the
                       Applications lifecycle. */}
                  <Route
                    path="/resource-servers/:id/onboarding"
                    element={<LegacyResourceServerRedirect section="overview" />}
                  />
                  <Route
                    path="/resource-servers/:id/sdk"
                    element={<LegacyResourceServerRedirect section="setup" />}
                  />
                  <Route
                    path="/resource-servers/:id/prompt"
                    element={<LegacyResourceServerRedirect section="setup" />}
                  />
                  <Route
                    path="/resource-servers/:id/scope-matrix"
                    element={<LegacyResourceServerRedirect section="tools" />}
                  />

                  {/* ───── Launch Control ──────────────────────────────────
                       The chrome (header + readiness ribbon + tabs) renders
                       once via `ApplicationLayout`; nested routes only
                       swap the <Outlet> content. */}
                  <Route
                    path="/applications"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ApplicationsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/applications/new"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <CreateApplicationPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/applications/:id"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ApplicationLayout />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="overview" replace />} />
                    <Route path="launch" element={<Navigate to="../overview" replace />} />
                    <Route path="overview" element={<ApplicationLaunchPage />} />
                    <Route path="setup" element={<ApplicationSetupPage />} />
                    <Route path="tools" element={<ApplicationToolsPage />} />
                    <Route path="scopes" element={<ApplicationScopesPage />} />
                    <Route path="access" element={<Navigate to="../access-assignments" replace />} />
                    <Route path="role-bindings" element={<Navigate to="../access-assignments" replace />} />
                    <Route path="workloads" element={<Navigate to="../connections" replace />} />
                    <Route path="requests" element={<Navigate to="../connections" replace />} />
                    <Route path="roles" element={<ApplicationRolesPage />} />
                    <Route path="access-assignments" element={<ApplicationAccessPageV2 />} />
                    <Route path="connections" element={<ApplicationConnectionsPage />} />
                    <Route path="consent-grants" element={<ApplicationConsentGrantsPage />} />
                    <Route path="clients" element={<ApplicationClientsPage />} />
                    <Route path="test" element={<ApplicationTestPage />} />
                    <Route path="activity" element={<ApplicationActivityPage />} />
                    {/* Any unknown application subpath falls back to overview instead
                        of a silent blank screen (previously an unmatched nested route
                        rendered nothing and logged nothing). */}
                    <Route path="*" element={<Navigate to="overview" replace />} />
                  </Route>

                  <Route
                    path="/clients/onboard"
                    element={<Navigate to="/applications/new" replace />}
                  />

                  <Route
                    path="/clients/onboard/:clientId"
                    element={<LegacyClientOnboardRedirect />}
                  />

                  <Route
                    path="/clients/voice-agent"
                    element={<Navigate to="/agents" replace />}
                  />

                  <Route
                    path="/admin/voice-agent"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AdminVoiceAgentPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* <Route
                path="/clients/workloads"
                element={
                  <ProtectedRoute requireProject>
                    <AppLayout>
                      <WorkloadsPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              /> */}
                  <Route
                    path="/clients/agents"
                    element={<Navigate to="/agents" replace />}
                  />

                  <Route
                    path="/agents"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AgentsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* <Route
                path="/clients/workloads/create"
                element={
                  <ProtectedRoute requireProject>
                    <AppLayout>
                      <CreateWorkloadPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              /> */}

                  {/* <Route
                path="/clients/workloads/edit/:id"
                element={
                  <ProtectedRoute requireProject>
                    <AppLayout>
                      <CreateWorkloadPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              /> */}

                  <Route
                    path="/clients/workloads/create"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/clients/workloads/edit/:id"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/clients/workloads"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/workloads"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/workloads/create"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/workloads/edit/:id"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/workloads/certificates"
                    element={<Navigate to="/service-accounts" replace />}
                  />

                  <Route
                    path="/service-accounts"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ServiceAccountsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* ── Agentic IGA console (prototype) ──────────────────────
                      A separate product from the authorization console above:
                      its own shell (IgaLayout) and its own sidebar. Reached via
                      the product switcher in the bottom-left user menu. */}
                  <Route
                    path="/iga"
                    element={<Navigate to="/iga/integrations" replace />}
                  />
                  <Route
                    path="/iga/integrations"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <DiscoveryIntegrationsPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/integrations/:id"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <IntegrationDetailPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  {/* Google Authentication's OAuth popup landing page — see
                      controllers/platform/cloud_gcp_oauth_controller.go's
                      GoogleOAuthCallback, which redirects here with
                      ?session_id=... (never a token) after Google's own
                      redirect. No layout chrome: this page only relays a
                      message to its opener window and closes itself.
                      Deliberately UNAUTHENTICATED, matching every other
                      OAuth/OIDC bounce-back route above (/oidc/auth/callback,
                      etc.) — the browser arrives here having just navigated
                      through Google's own origin, and a popup in that state
                      cannot be relied on to carry this app's first-party
                      session reliably in every browser. Wrapping this in
                      ProtectedRoute was the actual bug behind "Continue with
                      Google opens /admin/login": ProtectedRoute correctly
                      redirects to login whenever isAuthenticated reads false,
                      which it can after this exact kind of cross-origin
                      round trip, and this page reads no session-scoped data
                      (only session_id/error query params, never a token) so
                      it never needed the guard at all. */}
                  <Route
                    path="/discovery/cloud/gcp/google-oauth/callback"
                    element={<GoogleOAuthCallbackPage />}
                  />
                  <Route
                    path="/iga/agents"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <DiscoveredAgentsPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/detection-rules"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <RuleCatalogPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/identities"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <IdentitiesPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  {/* ── AWS cloud discovery inventory ───────────────────────
                      The CONTENTS of a connected AWS account, as opposed to
                      the connection itself — which stays where it is, as a row
                      in the Integrations table with its own drawer.

                      Separate routes rather than more tabs on
                      AWSConnectorDrawer: that panel is 560px and answers "is
                      this connection healthy", while these need table width,
                      search, paging and a shareable URL. The split follows the
                      backend's own boundary between the connector endpoints
                      and the seven list endpoints under
                      /authsec/discovery/aws/*.

                      Deliberately NOT folded into /iga/identities above: that
                      page covers every identity channel (SPIFFE, OAuth
                      clients, service accounts), and filling it with AWS-only
                      rows would make its name wrong the moment GCP discovery
                      ships. */}
                  <Route
                    path="/iga/cloud/aws/identities"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <AWSIdentitiesPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/cloud/aws/compute"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <AWSComputePage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  {/* ── Governance surfaces ── */}
                  <Route
                    path="/iga/provenance"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <ProvenancePage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/certification"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <CertificationPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/certification/:id"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <CampaignDetailPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/sod"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <SoDPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/birthrights"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <BirthrightsPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/iga/enforcement"
                    element={
                      <ProtectedRoute requireProject>
                        <IgaLayout>
                          <InstructionsPage />
                        </IgaLayout>
                      </ProtectedRoute>
                    }
                  />
                  {/* Old flat paths, before IGA became its own console */}
                  <Route path="/discovery/integrations" element={<Navigate to="/iga/integrations" replace />} />
                  <Route path="/discovery/agents" element={<Navigate to="/iga/agents" replace />} />

                  {/* Redirects for legacy non-context routes */}
                  <Route
                    path="/users"
                    element={<Navigate to="/admin/users" replace />}
                  />

                  {/* ── Phase A: object-first routes (no /admin or /enduser prefix) ── */}
                  <Route
                    path="/end-users"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <EndUsersPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/end-users/:userId"
                    element={<Navigate to="/end-users" replace />}
                  />

                  {/* ── Phase I-G: Access Control routes ─────────────── */}
                  <Route
                    path="/access"
                    element={<Navigate to="/access/roles" replace />}
                  />
                  <Route
                    path="/access/roles"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AccessControlPage initialTab="roles" />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/access/scopes"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AccessControlPage initialTab="scopes" />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/access/assignments"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AccessControlPage initialTab="assignments" />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Legacy authz redirects */}
                  <Route
                    path="/authz/role-bindings"
                    element={<Navigate to="/access/assignments" replace />}
                  />
                  <Route
                    path="/authz/roles"
                    element={<Navigate to="/access/roles" replace />}
                  />
                  <Route
                    path="/authz/application-scopes"
                    element={<Navigate to="/access/scopes" replace />}
                  />

                  <Route
                    path="/settings/team"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <TeamPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings/trusted-issuers"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <TrustedIssuersPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  {import.meta.env.DEV && DevBypassPage && (
                    <Route
                      path="/dev/bypass"
                      element={
                        <React.Suspense
                          fallback={<div className="p-6">Loading…</div>}
                        >
                          <DevBypassPage />
                        </React.Suspense>
                      }
                    />
                  )}
                  <Route
                    path="/authz/effective-access"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <EffectiveAccessPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/effective-access"
                    element={<Navigate to="/authz/effective-access" replace />}
                  />
                  <Route
                    path="/authz/application-scopes"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ScopeCatalogPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/authz/scope-catalog"
                    element={<Navigate to="/authz/application-scopes" replace />}
                  />
                  <Route
                    path="/consent-grants"
                    element={<Navigate to="/applications" replace />}
                  />

                  {/* Context-aware RBAC and OAuth routes (legacy — kept while Phase A→F migrates each surface) */}
                  <Route path="/:context">
                    <Route
                      path="users"
                      element={
                        <ProtectedRoute requireProject>
                          <AppLayout>
                            <UsersPage />
                          </AppLayout>
                        </ProtectedRoute>
                      }
                    />

                    {/* <Route
                  path="groups"
                  element={
                    <ProtectedRoute requireProject>
                      <AppLayout>
                        <GroupsPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="groups/create"
                  element={
                    <ProtectedRoute requireProject>
                      <AppLayout>
                        <CreateGroupPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="groups/edit/:id"
                  element={
                    <ProtectedRoute requireProject>
                      <AppLayout>
                        <CreateGroupPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                /> */}

                    <Route path="roles" element={<Navigate to="authz/roles" replace />} />
                    <Route
                      path="scopes"
                      element={<Navigate to="/applications" replace />}
                    />
                    <Route
                      path="api-oauth-scopes"
                      element={<Navigate to="/applications" replace />}
                    />
                    <Route
                      path="permissions"
                      element={<Navigate to="authz/permissions" replace />}
                    />
                    <Route
                      path="resources"
                      element={<Navigate to="authz/resources" replace />}
                    />
                    <Route
                      path="role-bindings"
                      element={<Navigate to="authz/role-bindings" replace />}
                    />

                    <Route path="authz">
                      <Route
                        path="roles"
                        element={
                          <ProtectedRoute requireProject>
                            <AppLayout>
                              <RolesPage />
                            </AppLayout>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="internal-scopes"
                        element={<Navigate to="/applications" replace />}
                      />
                      <Route
                        path="permissions"
                        element={
                          <ProtectedRoute requireProject>
                            <AppLayout>
                              <PermissionsPage />
                            </AppLayout>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="resources"
                        element={
                          <ProtectedRoute requireProject>
                            <AppLayout>
                              <PermissionResourcesPage />
                            </AppLayout>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="role-bindings"
                        element={
                          <ProtectedRoute requireProject>
                            <AppLayout>
                              <RoleBindingsPage />
                            </AppLayout>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="scope-catalog"
                        element={<Navigate to="/authz/application-scopes" replace />}
                      />
                      <Route
                        path="application-scopes"
                        element={<Navigate to="/authz/application-scopes" replace />}
                      />
                    </Route>

                    <Route path="oauth">
                      <Route
                        path="resource-scopes"
                        element={<Navigate to="/applications" replace />}
                      />
                    </Route>

                    <Route
                      path="consent-grants"
                      element={<Navigate to="/applications" replace />}
                    />

                    {/* Bare or unknown context paths must not render a blank page */}
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>

                  {/* Legacy redirects - redirect old paths to admin context */}
                  <Route
                    path="/roles"
                    element={<Navigate to="/admin/authz/roles" replace />}
                  />
                  <Route
                    path="/scopes"
                    element={<Navigate to="/applications" replace />}
                  />
                  <Route
                    path="/api-oauth-scopes"
                    element={<Navigate to="/applications" replace />}
                  />
                  <Route
                    path="/permissions"
                    element={<Navigate to="/admin/authz/permissions" replace />}
                  />
                  <Route
                    path="/resources"
                    element={<Navigate to="/admin/authz/resources" replace />}
                  />
                  <Route
                    path="/mappings"
                    element={<Navigate to="/admin/authz/role-bindings" replace />}
                  />
                  <Route
                    path="/role-bindings"
                    element={<Navigate to="/admin/authz/role-bindings" replace />}
                  />

                  <Route
                    path="/authentication"
                    element={<Navigate to="/identity-providers" replace />}
                  />

                  <Route
                    path="/identity-providers"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AuthenticationPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/authentication/create"
                    element={<Navigate to="/identity-providers/create" replace />}
                  />

                  <Route
                    path="/identity-providers/create"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <CreateAuthMethodPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/authentication/saml/create"
                    element={<Navigate to="/identity-providers/saml/create" replace />}
                  />

                  <Route
                    path="/identity-providers/saml/create"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <CreateSamlMethodPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/authentication/saml/edit/:id"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <EditSamlMethodPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/identity-providers/saml/edit/:id"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <EditSamlMethodPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/scim-connections"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ScimConnectionsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/directory-sync"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <DirectorySyncPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/vault"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <VaultPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/vault/import"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ImportSecretsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/logs"
                    element={<Navigate to="/logs/auth" replace />}
                  />

                  <Route
                    path="/logs/auth"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AuthLogsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/logs/audit"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AuditLogsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/logs/m2m"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <M2MLogsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/logs/configure"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <LogsConfigurationPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/roles"
                    element={<Navigate to="/admin/authz/roles" replace />}
                  />

                  <Route
                    path="/roles/templates"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <RoleTemplatesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* RBAC Routes */}
                  <Route
                    path="/scopes"
                    element={<Navigate to="/applications" replace />}
                  />

                  <Route
                    path="/permissions"
                    element={<Navigate to="/admin/authz/permissions" replace />}
                  />

                  <Route
                    path="/external-services"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <ExternalServicesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/external-services/add"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <AddExternalServicePage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/external-services/:serviceId/sdk"
                    element={<Navigate to="/external-services" replace />}
                  />

                  <Route
                    path="/sdk"
                    element={<LegacySDKGuidesRedirect />}
                  />

                  <Route
                    path="/sdk/:surface"
                    element={<LegacySDKGuidesRedirect />}
                  />

                  <Route
                    path="/sdk/:surface/:entityId"
                    element={<LegacySDKGuidesRedirect />}
                  />

                  <Route
                    path="/developer/sdk-guides"
                    element={<Navigate to="/applications" replace />}
                  />

                  <Route
                    path="/developer/sdk-guides/:surface"
                    element={<Navigate to="/applications" replace />}
                  />

                  <Route
                    path="/developer/sdk-guides/:surface/:entityId"
                    element={<Navigate to="/applications" replace />}
                  />

                  {/* Custom Domains */}
                  <Route
                    path="/custom-domains"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <CustomDomainsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <TrustDelegationPoliciesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/active"
                    element={
                      <ProtectedRoute requireProject>
                        <Navigate to="/trust-delegation" replace />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/new"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <TrustDelegationPolicyFormPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/:policyId"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <TrustDelegationPolicyDetailPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/:policyId/edit"
                    element={
                      <ProtectedRoute requireProject>
                        <AppLayout>
                          <TrustDelegationPolicyFormPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/policies"
                    element={
                      <ProtectedRoute requireProject>
                        <Navigate to="/trust-delegation" replace />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/policies/new"
                    element={
                      <ProtectedRoute requireProject>
                        <Navigate to="/trust-delegation/new" replace />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/policies/:policyId"
                    element={
                      <ProtectedRoute requireProject>
                        <LegacyTrustDelegationPolicyDetailRedirect />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/policies/:policyId/edit"
                    element={
                      <ProtectedRoute requireProject>
                        <LegacyTrustDelegationPolicyEditRedirect />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/trust-delegation/logs"
                    element={
                      <ProtectedRoute requireProject>
                        <Navigate to="/trust-delegation" replace />
                      </ProtectedRoute>
                    }
                  />

                  {/* LEGACY/OBSOLETE: SDK Manager route has been deprecated */}
                  {/* <Route
                path="/sdk/manager"
                element={
                  <ProtectedRoute requireProject>
                    <AppLayout>
                      <SDKManagerPage />
                    </AppLayout>
                  </ProtectedRoute>
                }
              /> */}

                  {/* Global catch-all — unmatched URLs must never render a blank page */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
                </RoutedErrorBoundary>

                {/* Professional toast notification system */}
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      fontSize: "14px",
                      fontWeight: "500",
                      maxWidth: "500px",
                    },
                  }}
                />

                {/* Guided tour overlay */}
                <GuidedTourOverlay />
              </div>
            </GuidedTourProvider>
          </WizardProvider>
          </DensityProvider>
        </Router>
      </RbacAudienceProvider>
    </AuthProvider>
  );
}

/**
 * Main App component with routing and state management
 *
 * Provides:
 * - Redux store provider
 * - Session initialization
 * - React Router for navigation
 * - Main application layout
 * - Route definitions for all pages
 * - Toast notifications system
 */
function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;
