/**
 * HubSpot CRM Integration Utility
 *
 * Provides functions to create/update HubSpot contacts during user registration.
 * Follows non-blocking pattern similar to Amplitude analytics.
 *
 * This utility now calls our backend API, which then communicates with HubSpot.
 * This approach avoids CORS issues and keeps the HubSpot access token secure.
 */

import config from "../config";
import type { HubSpotContactData } from "../types/hubspot";

/**
 * Backend API response for HubSpot sync
 */
interface HubSpotSyncResponse {
  success: boolean;
  hubspot_contact_id?: string;
  message: string;
}

/**
 * Creates or updates a HubSpot contact for a newly registered user
 * by calling our backend API endpoint
 *
 * @param contactData - User registration data to sync to HubSpot
 * @returns Promise that resolves when contact is synced (or logs error)
 *
 * This function is non-blocking and will not throw errors to the caller.
 * All errors are logged and handled internally to prevent disrupting user flow.
 */
export async function createHubSpotContact(
  contactData: HubSpotContactData,
  sessionToken: string,
): Promise<void> {
  try {
    if (!sessionToken) {
      console.warn("[HubSpot] Missing session token, skipping contact sync");
      return;
    }

    console.log("[HubSpot] Syncing contact via backend:", contactData.email);

    // Call our backend API endpoint
    const response = await fetch(
      `${config.VITE_API_URL}/uflow/hubspot/contacts/sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        credentials: "include", // Include cookies for session-based auth
        body: JSON.stringify({
          email: contactData.email,
          tenant_domain: contactData.tenant_domain || "",
          tenant_id: contactData.tenant_id || "",
        }),
      },
    );

    if (!response.ok) {
      console.error("[HubSpot] Backend API error:", {
        status: response.status,
        statusText: response.statusText,
      });
      return;
    }

    const result = (await response.json()) as HubSpotSyncResponse;

    if (result.success) {
      console.log(
        "[HubSpot] ✓ Contact synced successfully:",
        result.hubspot_contact_id || "existing",
      );
    } else {
      console.warn("[HubSpot] Sync reported failure:", result.message);
    }
  } catch (error) {
    // Log error but don't throw - this is non-blocking
    console.error("[HubSpot] Error syncing contact:", error);
  }
}

/**
 * Updates a HubSpot contact as Product Qualified Lead (PQL)
 * by calling the backend sync endpoint with lifecycle_stage.
 *
 * Called when a user completes activation (client + auth provider + SDK integration).
 *
 * This function is non-blocking and will not throw errors to the caller.
 * All errors are logged and handled internally to prevent disrupting user flow.
 */
export async function updateHubSpotContactAsPql(
  contactData: HubSpotContactData,
  sessionToken: string,
): Promise<void> {
  try {
    if (!sessionToken) {
      console.warn("[HubSpot] Missing session token, skipping PQL update");
      return;
    }

    console.log("[HubSpot] Updating contact as PQL:", contactData.email);

    const response = await fetch(
      `${config.VITE_API_URL}/uflow/hubspot/contacts/sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          email: contactData.email,
          tenant_domain: contactData.tenant_domain || "",
          tenant_id: contactData.tenant_id || "",
          lifecycle_stage: "opportunity",
        }),
      },
    );

    if (!response.ok) {
      console.error("[HubSpot] PQL update API error:", {
        status: response.status,
        statusText: response.statusText,
      });
      return;
    }

    const result = (await response.json()) as HubSpotSyncResponse;

    if (result.success) {
      console.log("[HubSpot] ✓ Contact marked as PQL successfully");
    } else {
      console.warn("[HubSpot] PQL update reported failure:", result.message);
    }
  } catch (error) {
    console.error("[HubSpot] Error updating contact as PQL:", error);
  }
}
