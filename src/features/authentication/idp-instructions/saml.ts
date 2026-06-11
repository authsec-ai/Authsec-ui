/**
 * Per-IdP SAML setup instructions. Each entry tells the operator exactly
 * where to paste the SP values in their IdP admin console, where to find
 * the IdP certificate, and the top gotchas that cause login failures.
 *
 * spMetadata is passed at render time so fields that show the actual
 * values (entity_id, acs_url) can be formatted correctly.
 */

export interface SamlIdpField {
  /** Label shown in the AuthSec field reference panel */
  authsecLabel: string;
  /** Where to paste this value in the IdP — shown as a hint */
  idpFieldName: string;
  /** The actual value — supplied at render time from spMetadata */
  value: string;
  /** Copy-button hint */
  copyable?: boolean;
}

export interface SamlIdpInstruction {
  label: string;
  /** Primary navigation path in the IdP admin console */
  navPath: string;
  /** Step-by-step setup instructions */
  steps: string[];
  /** Where to obtain the IdP-side certificate to paste into AuthSec */
  certLocation: string;
  /** Common mistakes that cause login failures */
  gotchas: string[];
}

export type SamlIdpKey = "auth0" | "okta" | "azure" | "generic";

export const SAML_IDP_INSTRUCTIONS: Record<SamlIdpKey, SamlIdpInstruction> = {
  auth0: {
    label: "Auth0",
    navPath: "Dashboard → Applications → [app] → Addons → SAML2 Web App",
    steps: [
      "Open Auth0 Dashboard and go to Applications → Applications.",
      "Select your application (must be type Regular Web Application).",
      "Click the Addons tab and enable SAML2 Web App.",
      "On the Settings tab, paste the Settings JSON shown in the panel below — this configures the ACS URL, audience, and attribute mapping in one shot.",
      "Click Save.",
      "Go to the Usage tab to find the Identity Provider metadata (Issuer, SSO URL, and certificate for step 2 below).",
    ],
    certLocation:
      "Auth0 Dashboard → Applications → [app] → Addons → SAML2 Web App → Usage tab → Download Certificate",
    gotchas: [
      "The application must be Regular Web Application, not Single Page Application — SPAs cannot use SAML.",
      "Auth0 appends a trailing slash to the callback URL by default. Make sure the ACS URL in the Settings JSON exactly matches what AuthSec shows.",
      'If you see "the audience is invalid", the audience value in the JSON must match AuthSec\'s Entity ID exactly (no trailing slash).',
    ],
  },

  okta: {
    label: "Okta",
    navPath: "Admin → Applications → Create App Integration → SAML 2.0",
    steps: [
      "Open the Okta Admin console and navigate to Applications → Applications.",
      "Click Create App Integration, select SAML 2.0, click Next.",
      "App name: anything descriptive (e.g. AuthSec). Click Next.",
      'In "Configure SAML": paste the AuthSec ACS URL into "Single sign-on URL".',
      'Paste the AuthSec Entity ID into "Audience URI (SP Entity ID)".',
      'Set Name ID format to "EmailAddress" and Application username to "Email".',
      "Click Next → Finish.",
      "On the Sign On tab, click View SAML setup instructions — copy the SSO URL, Entity ID, and certificate from there for step 2 in AuthSec.",
    ],
    certLocation:
      "Okta Admin → Applications → [app] → Sign On tab → View SAML setup instructions → Download certificate, OR right-click the certificate text and copy",
    gotchas: [
      '"Audience URI" in Okta = "SP Entity ID" in AuthSec. These names differ between vendors but are the same value.',
      "Okta's SSO URL ends in /sso/saml — make sure to copy it from the setup instructions page, not from the app's general settings.",
      "If attribute statements are needed (e.g. email, name), add them in the SAML settings step under Attribute Statements before finishing.",
      "Trailing whitespace in the Issuer URL (copied from browser address bar) causes silent entity ID mismatches — paste and trim.",
    ],
  },

  azure: {
    label: "Azure / Entra",
    navPath:
      "Azure Portal → Entra ID → Enterprise Applications → [app] → Single sign-on → SAML",
    steps: [
      "Open the Azure Portal and go to Microsoft Entra ID → Enterprise Applications.",
      "Select your application (create one via New application → Create your own application if needed).",
      "Click Single sign-on in the left sidebar, then select SAML.",
      'In "Basic SAML Configuration", click Edit.',
      'Set Identifier (Entity ID) to the AuthSec Entity ID shown below.',
      'Set Reply URL (Assertion Consumer Service URL) to the AuthSec ACS URL shown below.',
      'Set Sign on URL to the same ACS URL (required for SP-initiated login).',
      "Click Save.",
      "Under section 3 (SAML Signing Certificate), download Certificate (Base64) — you will paste this into AuthSec.",
      "From section 4, copy the Login URL — this is the SSO URL for AuthSec.",
    ],
    certLocation:
      "Azure Portal → Entra ID → Enterprise Applications → [app] → Single sign-on → section 3 SAML Signing Certificate → Download Certificate (Base64)",
    gotchas: [
      '"AADSTS50011: The redirect URI does not match" → Reply URL must match the AuthSec ACS URL exactly, including scheme and path.',
      "Azure requires the Identifier (Entity ID) to be unique across all apps in the tenant. If you get a collision, append a unique suffix.",
      'The certificate downloaded from Azure is Base64 — you need the content BETWEEN "-----BEGIN CERTIFICATE-----" and "-----END CERTIFICATE-----" (or paste the whole PEM, AuthSec strips the header/footer).',
      "App Registrations ≠ Enterprise Applications. SAML SSO is configured under Enterprise Applications → Single sign-on, not under App Registrations.",
    ],
  },

  generic: {
    label: "Generic / Other",
    navPath: "Your IdP admin console → SSO / SAML application settings",
    steps: [
      'Create a new SAML 2.0 application in your IdP (look for "Add SAML App", "Create SSO Integration", or similar).',
      'Paste the AuthSec ACS URL into the field your IdP calls "ACS URL", "Recipient URL", "Reply URL", or "Callback URL".',
      'Paste the AuthSec Entity ID into the field your IdP calls "Audience URI", "SP Entity ID", "SP Issuer", or "Audience".',
      'Set Name ID / Subject format to "EmailAddress" (urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress).',
      "Save the app, then export the IdP metadata XML — or copy the SSO URL and X.509 signing certificate individually.",
      "Paste the metadata XML (or the individual values) into step 2 of the AuthSec wizard.",
    ],
    certLocation:
      "Your IdP app settings → Signing certificate / X.509 certificate — download or copy as PEM",
    gotchas: [
      '"ACS URL" and "Reply URL" and "Callback URL" and "Recipient URL" are all the same thing — different IdPs use different names.',
      '"Audience URI" and "SP Entity ID" and "SP Issuer" are all the same thing.',
      "The certificate must be the IdP signing certificate (the IdP uses it to sign the SAML response), NOT the SP certificate.",
      "If you paste metadata XML in step 2, AuthSec will auto-fill the Entity ID, SSO URL, and certificate — you do not need to fill them manually.",
    ],
  },
};
