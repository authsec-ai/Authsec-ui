// samlApi — SAML helpers for the workspace IDP flow (v4)
//
// SAML provider CRUD now lives on the unified /authsec/identity-providers
// endpoints (see authMethodApi). This file only exposes:
//
//   1. The workspace-scoped Service Provider metadata URL helper — what to
//      paste into your Identity Provider (Okta, Azure AD, OneLogin, etc).
//   2. A lazy query that fetches the SP metadata XML so we can display the
//      Entity ID + ACS URL on the create form.
//
// The metadata route on the backend is /saml/metadata/:workspace_id and the
// ACS route is /saml/acs/:workspace_id — both workspace-scoped, no client_id.

import { baseApi } from "./baseApi";

// ---------------------------------------------------------------------------
// Service Provider metadata
// ---------------------------------------------------------------------------

export interface SamlSPMetadataRequest {
  workspaceId: string;
}

export interface SamlSPMetadata {
  xml: string;
  entity_id: string;
  acs_url: string;
}

export interface ListSamlProvidersRequest {
  workspace_id: string;
  client_id?: string;
}

export interface SamlProviderResponseRow {
  id: string;
  workspace_id: string;
  client_id?: string;
  provider_name: string;
  display_name: string;
  entity_id: string;
  sso_url: string;
  slo_url?: string;
  certificate: string;
  metadata_url?: string;
  name_id_format: string;
  attribute_mapping: {
    email: string;
    first_name: string;
    last_name: string;
    [key: string]: string;
  };
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
  provider_id?: string;
  id?: string;
  provider_name?: string;
  display_name?: string;
  entity_id?: string;
  sso_url?: string;
  slo_url?: string;
  certificate?: string;
  metadata_url?: string;
  name_id_format?: string;
  attribute_mapping?: Record<string, string>;
  is_active?: boolean;
  sort_order?: number;
}

export interface DeleteSamlProviderRequest {
  workspace_id?: string;
  provider_id?: string;
  id?: string;
}

export interface SamlMetadataRequest {
  metadata_url: string;
}

// ---------------------------------------------------------------------------
// URL helpers — paste into your IdP admin console
// ---------------------------------------------------------------------------

/** SP Entity ID / Audience URI — paste in your IdP's Audience field. */
export const samlEntityId = (workspaceId: string): string =>
  `${window.location.origin}/saml/metadata/${workspaceId}`;

/** Assertion Consumer Service URL — paste in your IdP's ACS / Reply URL. */
export const samlAcsUrl = (workspaceId: string): string =>
  `${window.location.origin}/saml/acs/${workspaceId}`;

/** SP metadata XML URL — IdPs that import metadata XML can fetch this. */
export const samlMetadataUrl = (workspaceId: string): string =>
  `${window.location.origin}/saml/metadata/${workspaceId}`;

// ---------------------------------------------------------------------------
// Metadata XML parser (used to preview the values we'll show in the IdP)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// RTK Query slice
// ---------------------------------------------------------------------------

export const samlApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listSamlProviders: builder.query<ListSamlProvidersResponse, ListSamlProvidersRequest>({
      query: () => "/authsec/identity-providers?provider_type=saml",
      transformResponse: (providers: Array<{
        id: string;
        workspace_id?: string;
        display_name: string;
        config_ref?: string;
        status?: string;
        created_at?: string;
        updated_at?: string;
      }>, _meta, arg) => ({
        success: true,
        providers: providers.map((provider, index) => ({
          id: provider.id,
          workspace_id: arg.workspace_id,
          client_id: arg.client_id,
          provider_name: provider.display_name.toLowerCase().replace(/\s+/g, "-"),
          display_name: provider.display_name,
          entity_id: provider.config_ref || provider.id,
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
      transformResponse: (provider: {
        id: string;
        workspace_id?: string;
        display_name: string;
        config_ref?: string;
        status?: string;
        created_at?: string;
        updated_at?: string;
      }, _meta, arg) => ({
        success: true,
        provider: {
          id: provider.id,
          workspace_id: arg.workspace_id,
          provider_name: provider.display_name.toLowerCase().replace(/\s+/g, "-"),
          display_name: provider.display_name,
          entity_id: provider.config_ref || provider.id,
          sso_url: "",
          certificate: "",
          name_id_format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
          attribute_mapping: {
            email: "email",
            first_name: "firstName",
            last_name: "lastName",
          },
          is_active: provider.status !== "disabled",
          sort_order: 0,
          created_at: provider.created_at || "",
          updated_at: provider.updated_at || "",
        },
      }),
      providesTags: (_result, _error, arg) => [{ type: "IdentityProvider", id: arg.provider_id }],
    }),

    updateSamlProvider: builder.mutation<{ success: boolean }, UpdateSamlProviderRequest>({
      query: (body) => ({
        url: `/authsec/identity-providers/${body.provider_id || body.id}/status`,
        method: "PUT",
        body: { status: body.is_active === false ? "disabled" : "configured" },
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    deleteSamlProvider: builder.mutation<{ success: boolean }, DeleteSamlProviderRequest>({
      query: (body) => ({
        url: `/authsec/identity-providers/${body.provider_id || body.id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "IdentityProvider", id: "LIST" }],
    }),

    getSamlMetadata: builder.query<{ entity_id: string; acs_url: string }, SamlMetadataRequest>({
      query: ({ metadata_url }) => ({
        url: metadata_url,
        method: "GET",
        responseHandler: async (response) => {
          const xml = await response.text();
          return parseMetadataXml(xml);
        },
      }),
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
  useDeleteSamlProviderMutation,
  useGetSamlMetadataQuery,
  useLazyGetSamlMetadataQuery,
  useGetSamlSPMetadataQuery,
  useLazyGetSamlSPMetadataQuery,
} = samlApi;
