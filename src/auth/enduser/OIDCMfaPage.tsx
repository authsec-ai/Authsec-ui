import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import type { RootState } from "@/app/store";
import {
  setClientId,
  setClientType,
  setLoginData,
  setRedirectUris,
} from "../slices/oidcWebAuthnSlice";
import { useCompleteLocalLoginMutation } from "@/app/api/oidcApi";
import { OIDCWebAuthnRouter } from "./OIDCWebAuthnRouter";

const parseBoolean = (value: string | null) => value === "true";

export function OIDCMfaPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [completeLocalLogin] = useCompleteLocalLoginMutation();
  const oidcState = useSelector((state: RootState) => state.oidcWebAuthn);
  const completionStartedRef = useRef(false);

  const loginChallenge =
    searchParams.get("login_challenge") ||
    sessionStorage.getItem("login_challenge") ||
    "";
  const redirectTo = searchParams.get("redirect_to");

  const redirectUrisFromQuery = useMemo(
    () =>
      searchParams
        .getAll("redirect_uri")
        .concat(
          searchParams
            .get("redirect_uris")
            ?.split(",")
            .map((item) => item.trim())
            .filter(Boolean) ?? [],
        ),
    [searchParams],
  );

  useEffect(() => {
    const tenantId = searchParams.get("tenant_id");
    const email = searchParams.get("email");
    const clientId = searchParams.get("client_id");
    const clientType = searchParams.get("client_type");
    const firstLogin = parseBoolean(searchParams.get("first_login"));

    if (tenantId && email) {
      dispatch(
        setLoginData({
          tenantId,
          email,
          isFirstLogin: firstLogin,
          clientId: clientId || undefined,
        }),
      );
    }

    if (clientId) dispatch(setClientId(clientId));
    if (clientType) dispatch(setClientType(clientType));
    if (redirectUrisFromQuery.length > 0) {
      dispatch(setRedirectUris(redirectUrisFromQuery));
    }
  }, [dispatch, redirectUrisFromQuery, searchParams]);

  const moveToError = (message: string) => {
    navigate(`/oidc/error?message=${encodeURIComponent(message)}`, {
      replace: true,
    });
  };

  const handleAuthComplete = async () => {
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;

    const token = oidcState.displayToken;
    if (!token) {
      moveToError("MFA completed but no OAuth continuation token was available.");
      return;
    }

    if (redirectTo) {
      window.location.replace(redirectTo);
      return;
    }

    if (!loginChallenge) {
      moveToError("Missing login challenge. The OAuth flow cannot continue.");
      return;
    }

    try {
      const response = await completeLocalLogin({
        login_challenge: loginChallenge,
        access_token: token,
      }).unwrap();

      if (response?.success && response.redirect_to) {
        window.location.replace(response.redirect_to);
        return;
      }

      moveToError(
        response?.error || "Authentication completed but failed to continue the OAuth flow.",
      );
    } catch (error: any) {
      moveToError(error?.data?.error || "Failed to continue the OAuth flow after MFA.");
    }
  };

  const handleAuthError = (error: string) => {
    toast.error(error);
    moveToError(error);
  };

  const handleTokenDisplay = (token: string) => {
    const redirectUris = oidcState.redirectUris ?? redirectUrisFromQuery;
    if (!redirectUris || redirectUris.length < 2) {
      moveToError("Missing claw_auth redirect URI for token handoff.");
      return;
    }

    let baseUrl = redirectUris[1];
    try {
      baseUrl = new URL(redirectUris[1]).origin;
    } catch {
      // Keep raw URL
    }
    window.location.replace(
      `${baseUrl}/?auth_token=${encodeURIComponent(token)}`,
    );
  };

  return (
    <OIDCWebAuthnRouter
      onAuthComplete={handleAuthComplete}
      onAuthError={handleAuthError}
      onTokenDisplay={handleTokenDisplay}
    />
  );
}

export default OIDCMfaPage;
