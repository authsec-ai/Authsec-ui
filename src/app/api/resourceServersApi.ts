import { baseApi } from "./baseApi";

export interface ResourceServer {
  id: string;
  tenant_id: string;
  name: string;
  public_base_url: string;
  protected_base_path: string;
  resource_uri: string;
  scopes_supported: string[];
  registration_modes: string[];
  introspection_secret?: string;
  introspection_secret_hash?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateResourceServerRequest {
  name: string;
  public_base_url: string;
  protected_base_path?: string;
  scopes_supported?: string[];
  registration_modes?: string[];
}

export interface ResourceServerCreateResponse {
  id: string;
  issuer_url: string;
  resource_url: string;
  jwks_uri: string;
  introspection_endpoint: string;
  introspection_secret?: string;
  validation_mode: string;
  scopes_supported: string[];
}

export interface ResourceServerClientRegistration {
  client_id: string;
  client_name: string;
  registration_type: string;
  status: string;
}

export interface PreRegisterResourceServerClientRequest {
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

export interface PreRegisterResourceServerClientResponse {
  client_id: string;
  client_name: string;
}

export const resourceServersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listResourceServers: builder.query<ResourceServer[], void>({
      query: () => ({
        url: "/authsec/resource-servers",
        method: "GET",
      }),
      providesTags: [{ type: "ResourceServer", id: "LIST" }],
    }),

    getResourceServer: builder.query<ResourceServer, string>({
      query: (id) => ({
        url: `/authsec/resource-servers/${id}`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [{ type: "ResourceServer", id }],
    }),

    createResourceServer: builder.mutation<
      ResourceServerCreateResponse,
      CreateResourceServerRequest
    >({
      query: (body) => ({
        url: "/authsec/resource-servers",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "ResourceServer", id: "LIST" }],
    }),

    updateResourceServer: builder.mutation<
      ResourceServer,
      { id: string; body: Partial<CreateResourceServerRequest> & { active?: boolean } }
    >({
      query: ({ id, body }) => ({
        url: `/authsec/resource-servers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "ResourceServer", id },
        { type: "ResourceServer", id: "LIST" },
      ],
    }),

    deleteResourceServer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/authsec/resource-servers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "ResourceServer", id: "LIST" }],
    }),

    rotateResourceServerSecret: builder.mutation<
      { introspection_secret: string },
      string
    >({
      query: (id) => ({
        url: `/authsec/resource-servers/${id}/rotate-introspection-secret`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, id) => [{ type: "ResourceServer", id }],
    }),

    listResourceServerClients: builder.query<
      ResourceServerClientRegistration[],
      string
    >({
      query: (id) => ({
        url: `/authsec/resource-servers/${id}/clients`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [
        { type: "ResourceServerClient", id },
      ],
    }),

    preRegisterResourceServerClient: builder.mutation<
      PreRegisterResourceServerClientResponse,
      { id: string; body: PreRegisterResourceServerClientRequest }
    >({
      query: ({ id, body }) => ({
        url: `/authsec/resource-servers/${id}/clients`,
        method: "POST",
        body: {
          client_name: body.client_name,
          redirect_uris: body.redirect_uris,
          grant_types: body.grant_types ?? ["authorization_code"],
          response_types: body.response_types ?? ["code"],
          token_endpoint_auth_method:
            body.token_endpoint_auth_method ?? "none",
        },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "ResourceServerClient", id },
      ],
    }),

    revokeResourceServerClient: builder.mutation<
      { status: string },
      { id: string; clientId: string }
    >({
      query: ({ id, clientId }) => ({
        url: `/authsec/resource-servers/${id}/clients/${encodeURIComponent(clientId)}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "ResourceServerClient", id },
      ],
    }),
  }),
});

export const {
  useListResourceServersQuery,
  useGetResourceServerQuery,
  useCreateResourceServerMutation,
  useUpdateResourceServerMutation,
  useDeleteResourceServerMutation,
  useRotateResourceServerSecretMutation,
  useListResourceServerClientsQuery,
  usePreRegisterResourceServerClientMutation,
  useRevokeResourceServerClientMutation,
} = resourceServersApi;
