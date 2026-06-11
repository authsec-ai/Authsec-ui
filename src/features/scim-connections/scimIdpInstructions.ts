// Per-IdP SCIM configuration cheatsheets.
// Each entry gives the exact admin-console navigation path, field labels,
// and the top gotchas so operators can set up SCIM in one session.
// Last verified: 2026-06-11.

export interface ScimIdpInstruction {
  label: string;
  freeTierSupport: boolean;
  freeTierNote?: string;
  endpointFieldLabel: string; // what the IdP calls "SCIM base URL"
  tokenFieldLabel: string;    // what the IdP calls the bearer token
  steps: string[];
  gotchas: string[];
}

export const SCIM_IDP_INSTRUCTIONS: Record<string, ScimIdpInstruction> = {
  okta: {
    label: "Okta",
    freeTierSupport: true,
    freeTierNote: "Requires an Okta Developer org (free). Sign up at developer.okta.com.",
    endpointFieldLabel: "SCIM connector base URL",
    tokenFieldLabel: "HTTP Header (Bearer token)",
    steps: [
      "In Okta Admin, go to Applications → Applications and open your app (create one if needed).",
      "Click the Provisioning tab, then click Configure API Integration.",
      "Check Enable API Integration.",
      "Set SCIM connector base URL to the endpoint shown above (e.g. https://…/authsec/uflow/scim/v2/c/<id>).",
      "Set Unique identifier field for users to userName.",
      "Under Authentication Mode choose HTTP Header. Paste the token from above as the bearer value.",
      "Click Test API Credentials. Okta sends a GET /Users?count=1 to validate; it must return 200.",
      "Click Save, then enable the provisioning actions you want under To App: Create Users, Update User Attributes, Deactivate Users.",
    ],
    gotchas: [
      "Do not include a trailing slash on the base URL — Okta appends /Users, /Groups, etc. itself.",
      "Click Test API Credentials before saving; Okta will silently reject a broken endpoint and leave provisioning in a broken state with no visible error.",
      "If users are imported but show Pending Activation in Okta, check that your SCIM /Users response includes a 'userName' that matches the Okta user's login.",
      "Provisioning feature flags (Create, Update, Deactivate) are OFF by default even after you save — you must explicitly enable each one.",
    ],
  },

  azure: {
    label: "Azure AD / Entra ID",
    freeTierSupport: true,
    freeTierNote: "Provisioning is available on Microsoft Entra ID Free tier for gallery apps. Custom (non-gallery) apps require Entra ID P1 or P2.",
    endpointFieldLabel: "Tenant URL",
    tokenFieldLabel: "Secret Token",
    steps: [
      "In Microsoft Entra admin center (entra.microsoft.com), go to Entra ID → Enterprise applications.",
      "Open your app (or create a new Non-gallery application if it is not in the gallery).",
      "Click Provisioning in the left panel, then click Get started (or New configuration).",
      "Set Provisioning Mode to Automatic.",
      "In the Admin Credentials section, paste the endpoint shown above into the Tenant URL field.",
      "Paste the token shown above into the Secret Token field.",
      "Click Test Connection. Entra issues a few GET requests (including GET /Users) to your endpoint.",
      "If the test passes, click Save. Then under Mappings, verify the attribute mappings match your schema.",
      "Set Provisioning Status to On and click Save.",
    ],
    gotchas: [
      "Entra expects the Tenant URL WITHOUT a path suffix — do not append /Users or /v2/ yourself. The endpoint shown above is already in the correct form.",
      "After Test Connection succeeds, Entra runs a full sync cycle in the background. The first cycle can take 20–40 minutes for large directories.",
      "Entra only supports the 'eq' and 'and' filter operators. Do not use 'ne', 'co', or 'sw' in your SCIM filter responses.",
      "If provisioning stops with 'SystemForCrossDomainIdentityManagement request was invalid', your endpoint is likely returning a non-JSON or non-SCIM content-type. Always return Content-Type: application/scim+json.",
      "Group provisioning requires 'displayName' to be unique — duplicate group names cause silent conflicts.",
    ],
  },

  onelogin: {
    label: "OneLogin",
    freeTierSupport: true,
    freeTierNote: "Available on OneLogin's free Developer tier.",
    endpointFieldLabel: "SCIM Base URL",
    tokenFieldLabel: "SCIM Bearer Token",
    steps: [
      "In OneLogin Admin, go to Administration → Applications → your app.",
      "Click the Configuration tab, then scroll to the Provisioning section.",
      "Set SCIM Base URL to the endpoint shown above.",
      "Set SCIM Bearer Token to the token shown above.",
      "Click Enable API Connection, then click Save.",
      "Click the Provisioning tab (separate from Configuration) and enable Provisioning.",
      "Under User Provisioning, enable Create User, Delete User, and Update User as needed.",
      "Click Save.",
    ],
    gotchas: [
      "There are two separate tabs — Configuration (where you paste the endpoint + token) and Provisioning (where you enable the actual sync). Saving Configuration alone does nothing until Provisioning is also enabled.",
      "OneLogin sends a GET /ServiceProviderConfig request during the initial save; your endpoint must respond 200 for the connection to validate.",
      "If users fail to push, check that your SCIM response includes the 'id' attribute — OneLogin requires a stable SCIM resource ID per user.",
      "Deprovisioning (deleting or suspending users in OneLogin) maps to SCIM PATCH active=false by default, not DELETE. Handle both.",
    ],
  },

  jumpcloud: {
    label: "JumpCloud",
    freeTierSupport: true,
    freeTierNote: "JumpCloud has a free tier for up to 10 users and 10 devices.",
    endpointFieldLabel: "Base URL",
    tokenFieldLabel: "Token Key",
    steps: [
      "In JumpCloud Admin Console, go to SSO Applications → your app (create one under the SAML or SCIM app catalog if needed).",
      "Click the Identity Management tab.",
      "Under SCIM Version, select SCIM 2.0.",
      "Paste the endpoint shown above into the Base URL field.",
      "Paste the token shown above into the Token Key field.",
      "Click Activate. JumpCloud sends a GET /Users to validate the connection.",
      "Enable the user attributes you want to sync under Attribute Mapping.",
      "Click Save.",
    ],
    gotchas: [
      "JumpCloud calls the provisioning tab 'Identity Management' — not 'Provisioning' as most IdPs label it.",
      "If Activate fails with 'Connection test failed', ensure your SCIM endpoint returns a valid 200 on GET /Users even when the user list is empty. Return {totalResults: 0, Resources: []}.",
      "JumpCloud sends the token in the Authorization header as 'Bearer <token>' — verify your endpoint accepts that format, not 'token <token>'.",
      "Group (Directory Group) sync requires your SCIM endpoint to expose /Groups — JumpCloud calls it during initial validation.",
    ],
  },

  generic: {
    label: "Generic / Other",
    freeTierSupport: true,
    endpointFieldLabel: "SCIM base URL",
    tokenFieldLabel: "Bearer token",
    steps: [
      "Locate the SCIM or Provisioning configuration section in your IdP's admin console.",
      "Set the SCIM base URL (or 'Tenant URL', 'SCIM connector base URL') to the endpoint shown above.",
      "Set the bearer token field ('Secret Token', 'API Token', 'Token Key') to the token shown above.",
      "Trigger a connection test — most IdPs send GET /Users or GET /ServiceProviderConfig to validate.",
      "Enable the user lifecycle operations you want: Create, Update, Deactivate.",
      "Save and verify the first sync cycle completes without errors.",
    ],
    gotchas: [
      "Always include the trailing path exactly as shown — do not add /Users, /v2, or /scim yourself unless the IdP documentation says to.",
      "The Authorization header format is 'Bearer <token>' (capital B, space, then token). Some IdPs call it 'HTTP Header auth', others call the field 'Secret Token' or 'API Token' — they all mean the same Bearer token.",
      "Your SCIM endpoint must return Content-Type: application/scim+json (not application/json) for most IdPs to accept responses.",
      "Empty user lists must return HTTP 200 with {totalResults: 0, Resources: [], schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse']}, not an empty 200 body.",
    ],
  },
};
