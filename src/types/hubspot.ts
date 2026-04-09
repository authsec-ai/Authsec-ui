/**
 * HubSpot CRM Integration Type Definitions
 *
 * Provides TypeScript interfaces for HubSpot contact sync via backend API.
 * Used for automatic contact sync during user registration.
 */

/**
 * Contact data collected from registration flow
 * This is sent to our backend API, which then syncs to HubSpot
 */
export interface HubSpotContactData {
  email: string;
  tenant_domain?: string;
  tenant_id?: string;
}
