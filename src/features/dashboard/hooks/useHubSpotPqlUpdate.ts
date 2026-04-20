import { useEffect, useRef } from "react";
import { SessionManager } from "../../../utils/sessionManager";
import { updateHubSpotContactAsPql } from "../../../utils/hubspot";

const PQL_SENT_KEY = "authsec_hubspot_pql_sent";

/**
 * Fires a one-time HubSpot PQL update when activation completes.
 * Uses localStorage to ensure the update is sent at most once per user,
 * even across page refreshes and sessions.
 */
export function useHubSpotPqlUpdate(
  isActivationComplete: boolean,
  isLoading: boolean,
): void {
  const sentRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isActivationComplete) {
      return;
    }

    if (localStorage.getItem(PQL_SENT_KEY)) {
      return;
    }

    if (sentRef.current) {
      return;
    }
    sentRef.current = true;

    const session = SessionManager.getSession();
    if (!session?.token) {
      sentRef.current = false;
      return;
    }

    const email = session.jwtPayload?.email_id || "";
    if (!email) {
      sentRef.current = false;
      return;
    }

    localStorage.setItem(PQL_SENT_KEY, email);

    void updateHubSpotContactAsPql(
      {
        email,
        tenant_id: session.tenant_id || "",
        tenant_domain: session.tenant_domain || window.location.hostname,
      },
      session.token,
    );
  }, [isActivationComplete, isLoading]);
}
