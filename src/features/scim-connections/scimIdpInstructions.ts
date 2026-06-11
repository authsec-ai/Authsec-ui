export interface ScimIdpInstruction {
  label: string;
  steps: string[]; // ordered list of where to paste
}

export const SCIM_IDP_INSTRUCTIONS: Record<string, ScimIdpInstruction> = {
  okta: {
    label: "Okta",
    steps: [
      "Go to Applications → your app → Provisioning → Integration",
      "Set SCIM connector base URL to the endpoint shown above",
      "Set Authentication Mode to HTTP Header, paste the token as Bearer value",
      "Enable provisioning features: Push New Users, Push Profile Updates",
    ],
  },
  azure: {
    label: "Azure AD / Entra",
    steps: [
      "Go to Azure Portal → Entra ID → Enterprise Apps → your app → Provisioning",
      "Set Provisioning Mode to Automatic",
      "Paste the endpoint into Tenant URL, paste the token into Secret Token",
      "Click Test Connection, then Save",
    ],
  },
  onelogin: {
    label: "OneLogin",
    steps: [
      "Go to Administration → Applications → your app → Configuration",
      "Set SCIM Base URL to the endpoint shown above",
      "Set SCIM Bearer Token to the token shown above",
      "Enable Provisioning → Save",
    ],
  },
  jumpcloud: {
    label: "JumpCloud",
    steps: [
      "Go to JumpCloud Admin → SSO Applications → your app → Identity Management",
      "Set Base URL to the endpoint, set Token Key to the token",
      "Enable provisioning and save",
    ],
  },
  generic: {
    label: "Generic / Other",
    steps: [
      "Set the SCIM base URL to the endpoint shown above",
      "Set the Authorization header to: Bearer <token>",
      "The endpoint is SCIM 2.0 compatible — no path suffix needed",
    ],
  },
};
