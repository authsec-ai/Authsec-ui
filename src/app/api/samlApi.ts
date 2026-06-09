// samlApi — SAML helpers for the workspace IDP flow (v4)
//
// SAML provider CRUD lives on the unified /authsec/identity-providers
// endpoints (see authMethodApi for the shared Create mutation). This file
// exposes the workspace-scoped Service Provider helpers, a SAML-specific
// Edit-flow Get/Update pair that reads the full saml_providers row, an IdP
// federation-metadata XML parser used by the Create form's "Paste IdP
// metadata" shortcut, and per-provider attribute-mapping presets.
//
// Routes touched:
//   GET    /authsec/identity-providers/:id            (returns config + idp row)
//   PUT    /authsec/identity-providers/:id            (full saml_providers update)
//   PUT    /authsec/identity-providers/:id/status     (active/disabled toggle)
//   DELETE /authsec/identity-providers/:id
//   GET    /saml/metadata/:workspace_id               (SP metadata XML)

import { baseApi } from "./baseApi";
import config from "../../config";

// ---------------------------------------------------------------------------
// SAML provider — payload shapes
// ---------------------------------------------------------------------------

export interface SamlAttributeMapping {
  email: string;
  first_name: string;
  last_name: string;
  [key: string]: string;
}

export interface SamlProviderResponseRow {
  id: string;
  workspace_id: string;
  provider_name: string;
  display_name: string;
  entity_id: string;
  sso_url: string;
  slo_url?: string;
  certificate: string;
  metadata_url?: string;
  name_id_format: string;
  attribute_mapping: SamlAttributeMapping;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ListSamlProvidersResponse {
  success: boolean;
  providers: SamlProviderResponseRow[];
}

export interface GetSamlProviderRequest {
  workspace_id: string;
  provider_id: string;
}

export interface GetSamlProviderResponse {
  success: boolean;
  provider: SamlProviderResponseRow;
}

export interface UpdateSamlProviderRequest {
  workspace_id?: string;
  provider_id: string;
  display_name?: string;
  provider_name?: string;
  entity_id?: string;
  sso_url?: string;
  slo_url?: string;
  certificate?: string;
  name_id_format?: string;
  attribute_mapping?: Record<string, string>;
  is_active?: boolean;
}

export interface DeleteSamlProviderRequest {
  workspace_id?: string;
  provider_id?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// SP-metadata helpers — paste into your IdP admin console
// ---------------------------------------------------------------------------

export interface SamlSPMetadata {
  xml: string;
  entity_id: string;
  acs_url: string;
}

export interface SamlSPMetadataRequest {
  workspaceId: string;
}

// Backend mounts SAML endpoints under `/authsec/hmgr/saml/*` on the API host
// (VITE_API_URL), NOT on the UI origin. Earlier helpers used
// `window.location.origin` + `/saml/...` — wrong on both counts (UI subdomain
// ≠ API host, and the path was missing `/authsec/hmgr/`).
//
// The backend's CreateSAMLRequest (internal/hydra/models/saml_methods.go)
// embeds the workspace-LESS audience + ACS URL in the AuthnRequest:
//
//   spEntityID = `${apiBase}/authsec/hmgr/saml/metadata`
//   acsURL     = `${apiBase}/authsec/hmgr/saml/acs`
//
// Workspace context is carried in the SAML relay state, not the URL path.
// So the Audience + ACS the operator pastes into Auth0/Okta are workspace-less.
// Only the SP metadata XML URL is workspace-scoped (the GET handler needs
// `:workspace_id` to look up the right cert).

const apiOrigin = (): string =>
  config.VITE_API_URL.replace(/\/+$/, "");

/** SP Entity ID / Audience URI — paste in your IdP's Audience field.
 *  Workspace-less: matches what the backend embeds in the SAML AuthnRequest. */
export const samlEntityId = (_workspaceId: string): string =>
  `${apiOrigin()}/authsec/hmgr/saml/metadata`;

/** Assertion Consumer Service URL — paste in your IdP's ACS / Reply URL.
 *  Workspace-less: the workspace is carried in the SAML RelayState. */
export const samlAcsUrl = (_workspaceId: string): string =>
  `${apiOrigin()}/authsec/hmgr/saml/acs`;

/** SP metadata XML URL — IdPs that import metadata XML can fetch this.
 *  Workspace-scoped because the metadata GET handler needs to know which
 *  workspace's cert + display name to render. */
export const samlMetadataUrl = (workspaceId: string): string =>
  `${apiOrigin()}/authsec/hmgr/saml/metadata/${workspaceId}`;

// ---------------------------------------------------------------------------
// XML parsers — SP metadata + IdP federation metadata
// ---------------------------------------------------------------------------

/** Parse OUR Service Provider metadata XML (what the IdP admin pastes in). */
export const parseMetadataXml = (
  xml: string,
): { entity_id: string; acs_url: string } => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, "text/xml");

  const entityDescriptor = xmlDoc.querySelector(
    "EntityDescriptor, md\\:EntityDescriptor",
  );
  const entity_id = entityDescriptor?.getAttribute("entityID") || "";

  const acsServices = xmlDoc.querySelectorAll(
    "AssertionConsumerService, md\\:AssertionConsumerService",
  );
  let acs_url = "";
  for (let i = 0; i < acsServices.length; i++) {
    const service = acsServices[i];
    const isDefault = service.getAttribute("isDefault") === "true";
    const index = service.getAttribute("index") === "1";
    if (isDefault || index) {
      acs_url = service.getAttribute("Location") || "";
      break;
    }
  }
  if (!acs_url && acsServices.length > 0) {
    acs_url = acsServices[0].getAttribute("Location") || "";
  }
  return { entity_id, acs_url };
};

export interface ParsedIdpMetadata {
  entity_id: string;
  sso_url: string;
  slo_url?: string;
  certificate: string;
  name_id_format?: string;
}

/**
 * Parse the IdP's federation metadata XML (what the operator downloads from
 * Okta / Azure AD / AD FS / OneLogin). Extracts the four fields the SAML
 * Create form would otherwise require manual typing:
 *
 *   - entity_id     = IDPSSODescriptor's parent <EntityDescriptor entityID="…">
 *   - sso_url       = <SingleSignOnService Location="…"> (prefer HTTP-Redirect)
 *   - slo_url       = <SingleLogoutService Location="…"> if present
 *   - certificate   = base64 from <KeyDescriptor use="signing"><X509Certificate>
 *   - name_id_format = first <NameIDFormat>
 *
 * Returns nulls for fields not found rather than throwing — the caller will
 * surface "couldn't parse X" inline so the operator can fix the XML and retry.
 */
export const parseIdpMetadataXml = (xml: string): ParsedIdpMetadata | null => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) return null;

  // EntityID lives on the <EntityDescriptor> root.
  const entityDescriptor = doc.querySelector(
    "EntityDescriptor, md\\:EntityDescriptor",
  );
  const entity_id = entityDescriptor?.getAttribute("entityID") || "";

  // Find the IDPSSODescriptor — that's the section we care about (vs SPSSODescriptor).
  const idpDescriptor =
    doc.querySelector("IDPSSODescriptor, md\\:IDPSSODescriptor") ||
    entityDescriptor;
  if (!idpDescriptor) return null;

  // SSO URL — prefer HTTP-Redirect binding, fall back to HTTP-POST, then first available.
  const ssoServices = idpDescriptor.querySelectorAll(
    "SingleSignOnService, md\\:SingleSignOnService",
  );
  let sso_url = "";
  const findBinding = (token: string): string => {
    for (let i = 0; i < ssoServices.length; i++) {
      const node = ssoServices[i];
      const binding = node.getAttribute("Binding") || "";
      if (binding.includes(token)) {
        return node.getAttribute("Location") || "";
      }
    }
    return "";
  };
  sso_url =
    findBinding("HTTP-Redirect") ||
    findBinding("HTTP-POST") ||
    ssoServices[0]?.getAttribute("Location") ||
    "";

  // SLO URL — optional.
  const sloServices = idpDescriptor.querySelectorAll(
    "SingleLogoutService, md\\:SingleLogoutService",
  );
  let slo_url: string | undefined;
  for (let i = 0; i < sloServices.length; i++) {
    const node = sloServices[i];
    const binding = node.getAttribute("Binding") || "";
    if (binding.includes("HTTP-Redirect") || binding.includes("HTTP-POST")) {
      slo_url = node.getAttribute("Location") || undefined;
      break;
    }
  }
  if (!slo_url && sloServices.length > 0) {
    slo_url = sloServices[0].getAttribute("Location") || undefined;
  }

  // Signing certificate — prefer use="signing", fall back to first KeyDescriptor.
  const keyDescriptors = idpDescriptor.querySelectorAll(
    "KeyDescriptor, md\\:KeyDescriptor",
  );
  let certificate = "";
  const extractCertFromNode = (node: Element): string => {
    const certEl = node.querySelector(
      "X509Certificate, ds\\:X509Certificate",
    );
    if (!certEl?.textContent) return "";
    // Normalize: strip whitespace, then wrap as PEM so the backend's parser is happy
    // either way (it accepts raw base64 too, but PEM is the cleaner default).
    const b64 = certEl.textContent.replace(/\s+/g, "");
    if (!b64) return "";
    const wrapped = b64.match(/.{1,64}/g)?.join("\n") || b64;
    return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
  };
  for (let i = 0; i < keyDescriptors.length; i++) {
    const node = keyDescriptors[i];
    if (node.getAttribute("use") === "signing") {
      certificate = extractCertFromNode(node);
      if (certificate) break;
    }
  }
  if (!certificate && keyDescriptors.length > 0) {
    certificate = extractCertFromNode(keyDescriptors[0]);
  }

  // NameIDFormat — optional, take the first.
  const nameIDFormatEl = idpDescriptor.querySelector(
    "NameIDFormat, md\\:NameIDFormat",
  );
  const name_id_format = nameIDFormatEl?.textContent?.trim() || undefined;

  if (!entity_id && !sso_url && !certificate) return null;
  return { entity_id, sso_url, slo_url, certificate, name_id_format };
};

// ---------------------------------------------------------------------------
// Attribute-mapping presets — keyed by provider slug
// ---------------------------------------------------------------------------

export const ATTRIBUTE_MAPPING_PRESETS: Record<string, SamlAttributeMapping> = {
  okta: {
    email: "email",
    first_name: "firstName",
    last_name: "lastName",
  },
  "azure-ad": {
    email:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    first_name:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    last_name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  },
  azure: {
    email:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    first_name:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    last_name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  },
  entra: {
    email:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    first_name:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    last_name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  },
  adfs: {
    email:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    first_name:
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    last_name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  },
  onelogin: {
    email: "User.email",
    first_name: "User.FirstName",
    last_name: "User.LastName",
  },
  google: {
    email: "email",
    first_name: "firstName",
    last_name: "lastName",
  },
};

/** Resolve a preset for a given provider slug; returns the Okta default if unknown. */
export const presetForSlug = (slug: string): SamlAttributeMapping => {
  const key = slug.toLowerCase().trim();
  return ATTRIBUTE_MAPPING_PRESETS[key] || ATTRIBUTE_MAPPING_PRESETS.okta;
};

// ---------------------------------------------------------------------------
// Auth0 SAML2 Web App "Settings" JSON generator
// ---------------------------------------------------------------------------

/**
 * Auth0's SAML2 Web App addon takes a JSON "Settings" blob (Dashboard →
 * Applications → My App → Addons → SAML2 Web App → Settings tab). Operators
 * usually have to construct this by hand — wrong audience/recipient is the
 * top source of "InvalidAudience" failures we've seen.
 *
 * This helper builds the canonical Settings JSON for a given workspace so
 * the operator can copy it straight in. Values come from samlEntityId /
 * samlAcsUrl so they automatically reflect any future backend route changes.
 *
 * Auth0 reference:
 *   https://auth0.com/docs/authenticate/protocols/saml/saml-configuration/configure-auth0-saml-identity-provider
 */
export const buildAuth0SettingsJson = (workspaceId: string): string => {
  const audience = samlEntityId(workspaceId);
  const acs = samlAcsUrl(workspaceId);
  const settings = {
    audience,
    recipient: acs,
    destination: acs,
    mappings: {
      email:
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      given_name:
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
      family_name:
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
      name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
      upn: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
      groups: "http://schemas.xmlsoap.org/claims/Group",
    },
    nameIdentifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    nameIdentifierProbes: [
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    ],
    signatureAlgorithm: "rsa-sha256",
    digestAlgorithm: "sha256",
    signResponse: false,
    typedAttributes: true,
  };
  return JSON.stringify(settings, null, 2);
};

// ---------------------------------------------------------------------------
// IDP-API response shape (what the backend returns from GET /identity-providers/:id)
// ---------------------------------------------------------------------------

interface IdentityProviderGetResponse {
  id: string;
  workspace_id: string;
  provider_type: string;
  display_name: string;
  status: string;
  redirect_uri?: string;
  saml_provider_id?: string | null;
  oidc_provider_id?: string | null;
  created_at?: string;
  updated_at?: string;
  config?: {
    id?: string;
    provider_name?: string;
    display_name?: string;
    entity_id?: string;
    sso_url?: string;
    slo_url?: string;
    certificate?: string;
    metadata_url?: string;
    name_id_format?: string;
    attribute_mapping?: SamlAttributeMapping | string;
    is_active?: boolean;
    sort_order?: number;
    created_at?: string;
    updated_at?: string;
  };
}

interface IdentityProviderListEntry {
  id: string;
  workspace_id?: string;
  display_name: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

const coerceAttributeMapping = (
  raw: SamlAttributeMapping | string | undefined,
): SamlAttributeMapping => {
  const fallback: SamlAttributeMapping = {
    email: "email",
    first_name: "firstName",
    last_name: "lastName",
  };
  if (!raw) return fallback;
  if (typeof raw === "string") {
    try {
      return { ...fallback, ...(JSON.parse(raw) as SamlAttributeMapping) };
    } catch {
      return fallback;
    }
  }
  return { ...fallback, ...raw };
};

// ---------------------------------------------------------------------------
// RTK Query slice
// ---------------------------------------------------------------------------

export const samlApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSamlProviders: builder.query<ListSamlProvidersResponse, { workspace_id: string }>({
      query: () => "/authsec/identity-providers?provider_type=saml",
      transformResponse: (providers: IdentityProviderListEntry[], _meta, arg) => ({
        success: true,
        providers: providers.map((provider, index) => ({
          id: provider.id,
          workspace_id: provider.workspace_id ?? arg.workspace_id,
          // The list endpoint stays minimal — populated fields come from the
          // detail Get. The list page only renders display_name + status.
          provider_name: provider.display_name.toLowerCase().replace(/\s+/g, "-"),
          display_name: provider.display_name,
          entity_id: "",
          sso_url: "",
          certificate: "",
          name_id_format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
          attribute_mapping: {
            email: "email",
            first_name: "firstName",
            last_name: "lastName",
          },
          is_active: provider.status !== "disabled",
          sort_order: index,
          created_at: provider.created_at || "",
          updated_at: provider.updated_at || "",
        })),
      }),
      providesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    getSamlProvider: builder.query<GetSamlProviderResponse, GetSamlProviderRequest>({
      query: ({ provider_id }) => `/authsec/identity-providers/${provider_id}`,
      transformResponse: (
        response: IdentityProviderGetResponse,
        _meta,
        arg,
      ) => {
        const config = response.config ?? {};
        return {
          success: true,
          provider: {
            id: response.id,
            workspace_id: response.workspace_id ?? arg.workspace_id,
            provider_name: config.provider_name || "",
            display_name: response.display_name || config.display_name || "",
            entity_id: config.entity_id || "",
            sso_url: config.sso_url || "",
            slo_url: config.slo_url || "",
            certificate: config.certificate || "",
            metadata_url: config.metadata_url || "",
            name_id_format:
              config.name_id_format ||
              "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            attribute_mapping: coerceAttributeMapping(config.attribute_mapping),
            is_active:
              config.is_active !== undefined
                ? config.is_active
                : response.status !== "disabled",
            sort_order: config.sort_order ?? 0,
            created_at: response.created_at || config.created_at || "",
            updated_at: response.updated_at || config.updated_at || "",
          },
        };
      },
      providesTags: (_result, _error, arg) => [
        { type: "IdentityProvider", id: arg.provider_id },
      ],
    }),

    updateSamlProvider: builder.mutation<{ id: string }, UpdateSamlProviderRequest>({
      query: (body) => ({
        url: `/authsec/identity-providers/${body.provider_id}`,
        method: "PUT",
        body: {
          provider_type: "saml",
          display_name: body.display_name,
          config: {
            provider_name: body.provider_name,
            entity_id: body.entity_id,
            sso_url: body.sso_url,
            slo_url: body.slo_url,
            certificate: body.certificate,
            name_id_format: body.name_id_format,
            attribute_mapping: body.attribute_mapping,
          },
        },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "IdentityProvider", id: "LIST" },
        { type: "IdentityProvider", id: arg.provider_id },
      ],
    }),

    updateSamlProviderStatus: builder.mutation<
      { status: string },
      { provider_id: string; is_active: boolean }
    >({
      query: ({ provider_id, is_active }) => ({
        url: `/authsec/identity-providers/${provider_id}/status`,
        method: "PUT",
        body: { status: is_active ? "configured" : "disabled" },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "IdentityProvider", id: "LIST" },
        { type: "IdentityProvider", id: arg.provider_id },
      ],
    }),

    deleteSamlProvider: builder.mutation<{ success: boolean }, DeleteSamlProviderRequest>({
      query: (body) => ({
        url: `/authsec/identity-providers/${body.provider_id || body.id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    /** GET /saml/metadata/:workspace_id — fetches the SP metadata XML and
     *  parses out the values to display in the create form. */
    getSamlSPMetadata: builder.query<SamlSPMetadata, SamlSPMetadataRequest>({
      query: ({ workspaceId }) => ({
        url: `/saml/metadata/${workspaceId}`,
        method: "GET",
        responseHandler: async (response) => {
          const xml = await response.text();
          const parsed = parseMetadataXml(xml);
          return {
            xml,
            entity_id: parsed.entity_id || samlEntityId(workspaceId),
            acs_url: parsed.acs_url || samlAcsUrl(workspaceId),
          };
        },
      }),
      providesTags: ["SamlMetadata"],
    }),
  }),
});

export const {
  useListSamlProvidersQuery,
  useGetSamlProviderQuery,
  useUpdateSamlProviderMutation,
  useUpdateSamlProviderStatusMutation,
  useDeleteSamlProviderMutation,
  useGetSamlSPMetadataQuery,
  useLazyGetSamlSPMetadataQuery,
} = samlApi;
