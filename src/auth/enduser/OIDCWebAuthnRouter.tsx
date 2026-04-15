/**
 * OIDC WebAuthn Router - For end-user authentication flow
 *
 * Orchestrates the OIDC WebAuthn authentication flow.
 * After MFA completes, the Context dispatches setDisplayToken which sets
 * currentStep = "token_display".  This Router then decides what to do:
 *
 *   • claw_auth  → call onTokenDisplay(token) so the parent can redirect externally
 *   • everything → call onAuthComplete() so the PAR-backed browser flow continues
 *
 * IMPORTANT: onAuthComplete must NOT call executeCallback again — the token
 * is already available via Redux (displayToken).  This eliminates the duplicate-
 * callback race condition that existed before.
 */

import React, { useEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../app/store";
import { setCurrentStep } from "../slices/oidcWebAuthnSlice";
import { useEndUserAuth } from "../context/EndUserAuthContext";
import { MFASelectionPage } from "../webauthn/MFASelectionPage";
import { WebAuthnSetupComponent } from "../webauthn/WebAuthnSetupComponent";
import { TOTPSetupComponent } from "../webauthn/TOTPSetupComponent";
import { WebAuthnAuthComponent } from "../webauthn/WebAuthnAuthComponent";
import { TOTPAuthComponent } from "../webauthn/TOTPAuthComponent";
import { AuthSplitFrame } from "../components/AuthSplitFrame";
import { AuthValuePanel } from "../components/AuthValuePanel";
import { AuthActionPanel } from "../components/AuthActionPanel";
import { AuthStepHeader } from "../components/AuthStepHeader";

interface OIDCWebAuthnRouterProps {
  /** Called for non-claw_auth clients after token is received. Token is in Redux displayToken. */
  onAuthComplete: () => void;
  onAuthError?: (error: string) => void;
  /** Called for claw_auth clients with the JWT token for external redirect. */
  onTokenDisplay?: (token: string) => void;
}

export function OIDCWebAuthnRouter({
  onAuthComplete,
  onAuthError,
  onTokenDisplay,
}: OIDCWebAuthnRouterProps) {
  const oidcWebauthn = useEndUserAuth();
  const dispatch = useDispatch();
  const reduxClientType = useSelector((state: RootState) => state.oidcWebAuthn.clientType);

  // Guard: ensure we only fire the completion callback once
  const completionFiredRef = useRef(false);

  // ── Token Display / Completion Handler ──
  // Fires exactly once when currentStep transitions to "token_display".
  useEffect(() => {
    if (oidcWebauthn.currentStep !== "token_display" || !oidcWebauthn.displayToken) return;
    if (completionFiredRef.current) return; // already handled
    completionFiredRef.current = true;

    const token = oidcWebauthn.displayToken;

    if (reduxClientType === "claw_auth" && onTokenDisplay) {
      // Claw auth: redirect to external URL with the token
      console.log("[Router] claw_auth → onTokenDisplay, token length:", token.length);
      onTokenDisplay(token);
    } else {
      console.log("[Router] client_type:", reduxClientType, "→ continuing browser login flow");
      onAuthComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oidcWebauthn.currentStep, oidcWebauthn.displayToken]);
  // ↑ Intentionally minimal deps — callbacks read via closure at fire-time,
  //   and completionFiredRef prevents re-entry even if deps change.

  // ── Error Forwarding ──
  useEffect(() => {
    if (oidcWebauthn.authenticationError && onAuthError) {
      onAuthError(oidcWebauthn.authenticationError);
    }
  }, [oidcWebauthn.authenticationError, onAuthError]);

  // ── Step Auto-Routing (login → mfa_selection / authentication) ──
  useEffect(() => {
    if (oidcWebauthn.currentStep === "login" && oidcWebauthn.email && oidcWebauthn.tenantId) {
      dispatch(setCurrentStep(oidcWebauthn.isFirstLogin ? "mfa_selection" : "authentication"));
    }
  }, [oidcWebauthn.currentStep, oidcWebauthn.email, oidcWebauthn.tenantId, oidcWebauthn.isFirstLogin, dispatch]);

  // ── MFA Method Prefetch ──
  const mfaPrefetchedRef = useRef(false);
  useEffect(() => {
    if (!oidcWebauthn.email || !oidcWebauthn.tenantId) return;
    if (oidcWebauthn.currentStep !== "authentication" && oidcWebauthn.currentStep !== "mfa_selection") return;
    if (oidcWebauthn.availableMFAMethods.length > 0) return;
    if (mfaPrefetchedRef.current) return;
    mfaPrefetchedRef.current = true;
    void oidcWebauthn.getMFAMethods();
  }, [oidcWebauthn.currentStep, oidcWebauthn.email, oidcWebauthn.tenantId]);

  // ── Loader while step is still "login" ──
  if (oidcWebauthn.currentStep === "login") {
    return (
      <AuthSplitFrame
        shellVariant="enduser-single-card"
        valuePanel={
          <AuthValuePanel
            eyebrow="MFA Security"
            title="Preparing multi-factor authentication."
            subtitle="Getting your verification options ready."
            points={[
              "Available WebAuthn/TOTP methods are fetched per user.",
              "Step routing remains inside the OIDC auth context.",
            ]}
          />
        }
      >
        <AuthActionPanel className="space-y-4">
          <AuthStepHeader
            title="Preparing authentication"
            subtitle="Loading your verification options..."
          />
          <div className="auth-inline-note flex items-center gap-3 text-sm text-slate-700">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <span>Preparing authentication...</span>
          </div>
        </AuthActionPanel>
      </AuthSplitFrame>
    );
  }

  return (
    <AuthSplitFrame
      shellVariant="enduser-single-card"
      valuePanel={
        <AuthValuePanel
          eyebrow="MFA Security"
          title="Verify your identity."
          subtitle="Choose a passkey or authenticator app to finish sign-in."
          points={[
            "Method availability is tenant and user specific.",
            "Passkey and authenticator app setup are both supported.",
            "Successful verification continues the browser login flow.",
          ]}
        />
      }
    >
      <AuthActionPanel className="relative space-y-4">
        {oidcWebauthn.currentStep === "mfa_selection" && (
          <MFASelectionPage
            contextType="oidc"
            availableMethods={oidcWebauthn.availableMFAMethods}
            onMethodSelect={oidcWebauthn.selectMFAMethod}
            onGetMethods={oidcWebauthn.getMFAMethods}
          />
        )}

        {oidcWebauthn.currentStep === "webauthn_setup" && (
          <WebAuthnSetupComponent
            contextType="oidc"
            email={oidcWebauthn.email || ""}
            tenantId={oidcWebauthn.tenantId || ""}
            onSuccess={() => {}}
            onError={onAuthError}
            onBack={oidcWebauthn.backToSelection}
            onSetup={oidcWebauthn.setupWebAuthn}
          />
        )}

        {oidcWebauthn.currentStep === "totp_setup" && (
          <TOTPSetupComponent
            contextType="oidc"
            email={oidcWebauthn.email || ""}
            tenantId={oidcWebauthn.tenantId || ""}
            totpData={oidcWebauthn.totpSetupData}
            onSuccess={() => {}}
            onError={onAuthError}
            onBack={oidcWebauthn.backToSelection}
            onSetup={oidcWebauthn.setupTOTP}
            onConfirm={oidcWebauthn.confirmTOTPSetup}
          />
        )}

        {oidcWebauthn.currentStep === "authentication" && (
          <>
            {oidcWebauthn.selectedMFAMethod === "webauthn" ? (
              <WebAuthnAuthComponent
                contextType="oidc"
                email={oidcWebauthn.email || ""}
                tenantId={oidcWebauthn.tenantId || ""}
                onSuccess={() => {}}
                onError={(error) => onAuthError?.(error)}
                onAuthenticate={oidcWebauthn.authenticateWithWebAuthn}
              />
            ) : oidcWebauthn.selectedMFAMethod === "totp" ? (
              <TOTPAuthComponent
                contextType="oidc"
                email={oidcWebauthn.email || ""}
                tenantId={oidcWebauthn.tenantId || ""}
                onSuccess={() => {}}
                onError={(error) => onAuthError?.(error)}
                onAuthenticate={oidcWebauthn.authenticateWithTOTP}
              />
            ) : (
              <>
                {oidcWebauthn.availableMFAMethods.length > 0 ? (
                  oidcWebauthn.availableMFAMethods.some(
                    (method) => method.type === "webauthn" && method.enabled,
                  ) ? (
                    <WebAuthnAuthComponent
                      contextType="oidc"
                      email={oidcWebauthn.email || ""}
                      tenantId={oidcWebauthn.tenantId || ""}
                      onSuccess={() => {}}
                      onError={(error) => onAuthError?.(error)}
                      onAuthenticate={oidcWebauthn.authenticateWithWebAuthn}
                    />
                  ) : (
                    <TOTPAuthComponent
                      contextType="oidc"
                      email={oidcWebauthn.email || ""}
                      tenantId={oidcWebauthn.tenantId || ""}
                      onSuccess={() => {}}
                      onError={(error) => onAuthError?.(error)}
                      onAuthenticate={oidcWebauthn.authenticateWithTOTP}
                    />
                  )
                ) : (
                  <TOTPAuthComponent
                    contextType="oidc"
                    email={oidcWebauthn.email || ""}
                    tenantId={oidcWebauthn.tenantId || ""}
                    onSuccess={() => {}}
                    onError={(error) => onAuthError?.(error)}
                    onAuthenticate={oidcWebauthn.authenticateWithTOTP}
                  />
                )}
              </>
            )}
          </>
        )}

        {oidcWebauthn.currentStep === "token_display" && reduxClientType !== "claw_auth" && (
          <div className="auth-inline-note flex items-center gap-3 text-sm text-slate-700">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <span>Finalizing secure sign-in…</span>
          </div>
        )}

        {oidcWebauthn.isLoading && (
          <div className="auth-loading-overlay">
            <div className="auth-loading-box">
              <div className="flex items-center space-x-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                <span className="text-slate-900">Processing...</span>
              </div>
            </div>
          </div>
        )}
      </AuthActionPanel>
    </AuthSplitFrame>
  );
}
