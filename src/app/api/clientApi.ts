import { baseApi } from "./baseApi";
import type { Client } from "../../types/entities";
import type { AuthMethod } from "../../features/authentication/types";

// AuthSec API specific interfaces
export interface GetClientsRequest {
  workspace_id: string;
  active_only?: boolean;
  filters?: Record<string, any>;
  page?: number;
  limit?: number;
}

export interface ClientData {
  id: string;
  client_id: string;
  workspace_id: string;
  project_id: string;
  owner_id?: string | null;
  org_id?: string | null;
  name: string;
  status?: string;
  email?: string | null;
  tags?: string[] | null;
  active: boolean;
  mfa_enabled?: boolean;
  mfa_method?: string | null;
  mfa_verified?: boolean;
  roles?: string[] | null;
  oidc_enabled?: boolean;
  hydra_client_id?: string | null;
  client_type?: "application" | "ai_agent" | string;
  agent_type?: string | null;
  platform?: string | null;
  platform_config?: ClientPlatformConfig | null;
  secret_id?: string | null;
  spiffe_id?: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ClientsFilters {
  email?: string;
  name?: string;
  status?: string;
  tags?: string[];
  client_type?: "application" | "ai_agent" | "claw_auth";
  [key: string]: unknown;
}

export interface ClientsPagination {
  limit: number;
  page: number;
  total: number;
  total_pages?: number;
  [key: string]: unknown;
}

export interface GetClientsResponse {
  clients: ClientData[];
  filters?: ClientsFilters;
  pagination?: ClientsPagination;
}

// Enhanced client data with authentication methods for /clients/all endpoint
export interface EnhancedClientData extends ClientData {
  authentication_methods?:
    | Array<{
        id: string;
        name: string;
        type: string;
        is_default?: boolean;
        enabled: boolean;
        provider?: string;
        metadata?: Record<string, any>;
      }>
    | string; // Can be string from API or array of objects
  auth_methods_count?: number;
  client_name?: string; // Alternative name field
  description?: string;
  user_count?: number; // From actual API response
  enabled?: boolean; // From actual API response
}

export interface GetAllClientsResponse {
  clients: EnhancedClientData[];
  total: number;
  filters?: ClientsFilters;
  pagination?: ClientsPagination;
  hydra_public_url?: string;
}

export interface RegisterClientRequest {
  workspace_id: string;
  name: string;
  email: string;
  project_id?: string;
  react_app_url?: string;
  client_type?: "application";
  agent_type?: "mcp-agent";
  platform?: string;
  platform_config?: Partial<ClientPlatformConfig>;
}

export interface ClientPlatformConfig {
  namespace: string;
  service_account: string;
}

export interface GetPlatformSelectorsRequest {
  workspace_id: string;
  platform: string;
}

export interface PlatformSelectorsResponse {
  platform: string;
  selector_keys: string[];
}

export interface RegisterAiAgentClientRequest {
  workspace_id: string;
  name: string;
  email: string;
  client_type: "ai_agent";
  agent_type?: "mcp-agent";
  platform: string;
  selectors: Record<string, string>;
}

export interface RegisterClawAuthClientRequest {
  workspace_id: string;
  name: string;
  email: string;
  project_id?: string;
  react_app_url?: string;
  client_type: "claw_auth";
  agent_type: "claw_auth";
  redirect_url: string;
}

export interface RegisterClientResponse {
  id: string;
  client_id: string;
  workspace_id: string;
  project_id: string;
  name: string;
  secret_id?: string;
  spiffe_id?: string;
  email: string;
  active: boolean;
  created_at: string;
  message: string;
}

export interface DeleteClientRequest {
  workspace_id: string;
  client_id: string;
}

export interface DeleteClientResponse {
  client_id: string;
  message: string;
  workspace_id: string;
}

export interface SetClientStatusRequest {
  workspace_id: string;
  client_id: string;
  active: boolean;
}

export interface SetClientStatusResponse {
  message: string;
  success: boolean;
  data: {
    active: boolean;
    client: ClientData;
    client_id: string;
    workspace_id: string;
  };
  timestamp: string;
}

export interface OIDCProvider {
  provider_name: string;
  display_name: string;
  client_id: string;
  client_secret: string;
  auth_url: string;
  token_url: string;
  user_info_url: string;
  scopes: string[];
  is_active: boolean;
}

export interface AddProviderRequest {
  workspace_id: string;
  client_id: string;
  provider: OIDCProvider;
  created_by: string;
}

export interface AddProviderResponse {
  message: string;
  success: boolean;
  data: {
    callback_url: string;
    client_id: string;
    created_at: string;
    display_name: string;
    is_active: boolean;
    provider_name: string;
    workspace_id: string;
  };
  timestamp: string;
}

export interface GetConfigRequest {
  workspace_id: string;
}

export interface GetConfigResponse {
  message: string;
  success: boolean;
  data: {
    oidc_providers: Array<{
      callback_url: string;
      client_id: string;
      created_at: string;
      display_name: string;
      is_active: boolean;
      provider_config: {
        additional_params: any;
        auth_url: string;
        client_id: string;
        client_secret: string;
        issuer_url: string;
        jwks_url: string;
        scopes: string[];
        token_url: string;
        user_info_url: string;
      };
      provider_name: string;
      sort_order: number;
    }>;
    org_id: string;
    provider_count: number;
    tenant_client: {
      client_id: string;
      client_name: string;
      created_at: string;
      redirect_uris: string[];
      scopes: string[];
    };
    workspace_id: string;
  };
  timestamp: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeClientsResponse = (response: unknown): GetClientsResponse => {
  if (Array.isArray(response)) {
    return {
      clients: response.map((item: any) => ({
        ...item,
        id: item.id,
        client_id: item.client_id || item.id,
        workspace_id: item.workspace_id || "",
        project_id: item.project_id || item.workspace_id || "",
        name: item.name || item.client_name || "Unnamed application",
        active: item.active ?? true,
        status: item.status || (item.active === false ? "inactive" : "active"),
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString(),
        client_type: item.application_type || item.client_type || "application",
      })) as ClientData[],
    };
  }

  if (!isRecord(response)) {
    return { clients: [] };
  }

  // TEMP WORKAROUND: Handle broken API response format
  // The API is returning: { client_name, user_count, authentication_methods: "password", enabled }
  // But we need full ClientData with client_id, workspace_id, etc.
  if (Array.isArray(response.clients)) {
    const hasClientId =
      response.clients.length > 0 && "client_id" in response.clients[0];

    if (!hasClientId && response.clients.length > 0) {
      // API is returning broken format - transform it
      console.warn(
        "⚠️ CRITICAL: API returning incomplete client data. Generating placeholder IDs.",
      );
      console.warn(
        "⚠️ This will break authentication provider dropdown and other features!",
      );
      console.warn(
        "⚠️ Backend team needs to fix /clients/getClients endpoint ASAP!",
      );

      const transformedClients = response.clients.map(
        (client: any, index: number) => {
          // Generate a deterministic ID from client_name to maintain consistency
          const deterministicId = `client-${client.client_name?.toLowerCase().replace(/\s+/g, "-") || index}`;

          return {
            id: deterministicId,
            client_id: deterministicId, // This is WRONG but API doesn't provide real UUID
            workspace_id: "", // API doesn't provide this
            project_id: "", // API doesn't provide this
            owner_id: null,
            org_id: null,
            name: client.client_name || "Unnamed Client",
            status: client.enabled ? "active" : "inactive",
            email: null,
            tags: null,
            active: client.enabled ?? true,
            mfa_enabled: true, // Default to ON as per requirement
            mfa_method: "password",
            mfa_verified: false,
            roles: null,
            oidc_enabled: false,
            hydra_client_id: null,
            client_type:
              typeof client.client_type === "string"
                ? client.client_type
                : undefined,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Store original minimal data for reference
            _original_api_data: client,
          } as ClientData;
        },
      );

      return {
        clients: transformedClients,
        filters: isRecord(response.filters)
          ? (response.filters as ClientsFilters)
          : undefined,
        pagination: isRecord(response.pagination)
          ? (response.pagination as ClientsPagination)
          : undefined,
      };
    }

    return {
      clients: response.clients as ClientData[],
      filters: isRecord(response.filters)
        ? (response.filters as ClientsFilters)
        : undefined,
      pagination: isRecord(response.pagination)
        ? (response.pagination as ClientsPagination)
        : undefined,
    };
  }

  const data = response.data;
  if (isRecord(data)) {
    const clients = Array.isArray(data.clients)
      ? (data.clients as ClientData[])
      : [];

    let filters: ClientsFilters | undefined;
    if (isRecord(data.filters)) {
      filters = data.filters as ClientsFilters;
    } else if (isRecord(response.filters)) {
      filters = response.filters as ClientsFilters;
    }

    let pagination: ClientsPagination | undefined;
    if (isRecord(data.pagination)) {
      pagination = data.pagination as ClientsPagination;
    } else if (isRecord(response.pagination)) {
      pagination = response.pagination as ClientsPagination;
    } else {
      const limitValue =
        typeof data.limit === "number"
          ? data.limit
          : typeof data.page_size === "number"
            ? data.page_size
            : undefined;
      const pageValue = typeof data.page === "number" ? data.page : undefined;
      const totalValue =
        typeof data.count === "number" ? data.count : undefined;
      const totalPagesValue =
        typeof data.total_pages === "number" ? data.total_pages : undefined;

      if (
        limitValue !== undefined ||
        totalValue !== undefined ||
        pageValue !== undefined ||
        totalPagesValue !== undefined
      ) {
        pagination = {
          limit: limitValue ?? clients.length ?? 0,
          page: pageValue ?? 1,
          total: totalValue ?? clients.length ?? 0,
          total_pages: totalPagesValue,
        };
      }
    }

    return {
      clients,
      filters,
      pagination,
    };
  }

  return {
    clients: [],
    filters: isRecord(response.filters)
      ? (response.filters as ClientsFilters)
      : undefined,
    pagination: isRecord(response.pagination)
      ? (response.pagination as ClientsPagination)
      : undefined,
  };
};

/**
 * Parses backend responses that may contain multiple concatenated JSON objects
 * Takes the first valid JSON object and ignores subsequent ones
 */
const parseFirstValidJSON = <T>(response: unknown): T => {
  // If response is already an object, return it
  if (isRecord(response)) {
    return response as T;
  }

  // If response is a string, try to parse multiple JSON objects
  if (typeof response === "string") {
    // Split on pattern }{ or }\n{ to detect multiple JSON objects
    const jsonPattern = /\}\s*\{/g;
    const matches = response.match(jsonPattern);

    if (matches && matches.length > 0) {
      // Multiple JSON objects detected - extract the first one
      const firstJsonEnd = response.indexOf(matches[0]) + 1;
      const firstJsonStr = response.substring(0, firstJsonEnd);

      try {
        return JSON.parse(firstJsonStr) as T;
      } catch (e) {
        console.error("Failed to parse first JSON object:", e);
        throw new Error("Invalid JSON response from server");
      }
    }

    // No multiple objects, parse normally
    try {
      return JSON.parse(response) as T;
    } catch (e) {
      console.error("Failed to parse JSON response:", e);
      throw new Error("Invalid JSON response from server");
    }
  }

  // Unknown type, return as-is
  return response as T;
};

const getStringOrFallback = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const normalizeRegisterClientResponse = (
  response: unknown,
): RegisterClientResponse => {
  const parsed = parseFirstValidJSON<unknown>(response);

  if (!isRecord(parsed)) {
    throw new Error("Invalid client registration response from server");
  }

  const id = getStringOrFallback(parsed.id);
  const workspaceId = getStringOrFallback(parsed.workspace_id);

  return {
    id,
    client_id: getStringOrFallback(parsed.client_id, id),
    workspace_id: workspaceId,
    project_id: getStringOrFallback(parsed.project_id, workspaceId),
    name: getStringOrFallback(parsed.name),
    secret_id:
      typeof parsed.secret_id === "string" ? parsed.secret_id : undefined,
    spiffe_id:
      typeof parsed.spiffe_id === "string" ? parsed.spiffe_id : undefined,
    email: getStringOrFallback(parsed.email),
    active: typeof parsed.active === "boolean" ? parsed.active : true,
    created_at: getStringOrFallback(parsed.created_at),
    message: getStringOrFallback(
      parsed.message,
      "Client registered successfully",
    ),
  };
};

export const clientApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Delete a client completely
    deleteClientComplete: builder.mutation<
      DeleteClientResponse,
      DeleteClientRequest
    >({
      query: ({ workspace_id, client_id }) => ({
        url: `/authsec/applications/${client_id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Client", id: "LIST" }],
    }),

    // Set client status (activate/deactivate)
    setClientStatus: builder.mutation<
      SetClientStatusResponse,
      SetClientStatusRequest
    >({
      query: (data) => ({
        url: `/authsec/applications/${data.client_id}`,
        method: "PUT",
        body: { active: data.active },
      }),
      invalidatesTags: [{ type: "Client", id: "LIST" }],
    }),

    // Get all clients for a tenant (query for automatic fetching)
    getClients: builder.query<GetClientsResponse, GetClientsRequest>({
      query: (data) => {
        const params: Record<string, any> = {};

        if (data.active_only !== undefined) {
          params.active_only = data.active_only;
        }

        if (data.filters) {
          for (const [key, value] of Object.entries(data.filters)) {
            if (
              value === undefined ||
              value === null ||
              (typeof value === "string" && value.trim() === "") ||
              (Array.isArray(value) && value.length === 0)
            ) {
              continue;
            }
            params[key] = value;
          }
        }

        return {
          url: "/authsec/applications",
          method: "GET",
          params,
        };
      },
      transformResponse: (response: unknown) => {
        const parsed = parseFirstValidJSON<unknown>(response);

        return normalizeClientsResponse(parsed);
      },
      providesTags: (result) =>
        result?.clients && result.clients.length
          ? [
              ...result.clients.map((client) => ({
                type: "Client" as const,
                id: client.client_id ?? client.id ?? "UNKNOWN",
              })),
              { type: "Client" as const, id: "LIST" },
            ]
          : [{ type: "Client" as const, id: "LIST" }],
    }),

    // Get all clients with enhanced data including authentication methods
    // Note: Using /clients/getClients since /clients/all endpoint doesn't exist on backend
    getAllClients: builder.query<GetAllClientsResponse, GetClientsRequest>({
      query: (data) => {
        const params: Record<string, any> = {};

        if (data.active_only !== undefined) {
          params.active_only = data.active_only;
        }

        if (data.page !== undefined) {
          params.page = data.page;
        }

        if (data.limit !== undefined) {
          params.limit = data.limit;
        }

        if (data.filters) {
          for (const [key, value] of Object.entries(data.filters)) {
            if (
              value === undefined ||
              value === null ||
              (typeof value === "string" && value.trim() === "") ||
              (Array.isArray(value) && value.length === 0)
            ) {
              continue;
            }
            params[key] = value;
          }
        }

        return {
          url: "/authsec/applications",
          method: "GET",
          params,
        };
      },
      transformResponse: (response: unknown) => {
        try {
          // Parse the regular clients response and transform it to enhanced format
          const parsed = parseFirstValidJSON<any>(response);
          console.log("Raw API response after parsing:", parsed);

          // Handle the actual API response structure which has different fields
          if (parsed.clients && Array.isArray(parsed.clients)) {
            const enhancedClients: EnhancedClientData[] = parsed.clients.map(
              (client: any, index: number) => {
                console.log("Processing client in API transform:", client);

                // Handle authentication_methods - can be string, array of strings, or array of objects
                let authMethodsArray: Array<{
                  id: string;
                  name: string;
                  type: string;
                  is_default: boolean;
                  enabled: boolean;
                }> = [];

                if (typeof client.authentication_methods === "string") {
                  // String format: "password" or "password,oidc"
                  authMethodsArray = client.authentication_methods
                    .split(",")
                    .map((method: string, methodIndex: number) => ({
                      id: `auth-${index}-${methodIndex}`,
                      name: method.trim(),
                      type: method.trim(),
                      is_default: methodIndex === 0, // First method is default
                      enabled: client.active ?? true,
                    }));
                } else if (Array.isArray(client.authentication_methods)) {
                  // Check if array contains strings or objects
                  authMethodsArray = client.authentication_methods.map(
                    (method: any, methodIndex: number) => {
                      if (typeof method === "string") {
                        // Array of strings: ["password", "oidc"]
                        return {
                          id: `auth-${index}-${methodIndex}`,
                          name: method,
                          type: method,
                          is_default: methodIndex === 0,
                          enabled: client.active ?? true,
                        };
                      } else if (
                        typeof method === "object" &&
                        method !== null
                      ) {
                        // Array of objects: [{id, name, type, ...}]
                        return {
                          id: method.id || `auth-${index}-${methodIndex}`,
                          name: method.name || method.type || "Unknown",
                          type: method.type || method.name || "Unknown",
                          is_default: method.is_default ?? methodIndex === 0,
                          enabled: method.enabled ?? client.active ?? true,
                        };
                      }
                      return {
                        id: `auth-${index}-${methodIndex}`,
                        name: "Unknown",
                        type: "Unknown",
                        is_default: methodIndex === 0,
                        enabled: client.active ?? true,
                      };
                    },
                  );
                }

                return {
                  // Map from actual API response fields
                  id: client.id || client.client_id || `client-${index}`,
                  client_id: client.client_id || `client-${index}`,
                  workspace_id: client.workspace_id || "",
                  project_id: client.project_id || "",
                  owner_id: client.owner_id || null,
                  org_id: client.org_id || null,
                  name: client.name || client.client_name || "Unnamed Client",
                  status:
                    client.status || (client.active ? "Active" : "Inactive"),
                  email: client.email || null,
                  tags: client.tags || null,
                  active: client.active ?? true,
                  mfa_enabled: client.mfa_enabled ?? true, // Default to true as per requirement
                  mfa_method: client.mfa_method || null,
                  mfa_verified: client.mfa_verified ?? false,
                  roles: client.roles || null,
                  oidc_enabled: client.oidc_enabled ?? false,
                  hydra_client_id: client.hydra_client_id || null,
                  client_type: client.client_type,
                  created_at: client.created_at || new Date().toISOString(),
                  updated_at: client.updated_at || new Date().toISOString(),

                  // Enhanced fields
                  authentication_methods: authMethodsArray,
                  auth_methods_count: authMethodsArray.length,
                  client_name:
                    client.name || client.client_name || "Unnamed Client",
                  description: `Client: ${client.name || client.client_name || "Unnamed Client"}`,
                  user_count: client.user_count || 0,
                  enabled: client.active ?? true,
                } as EnhancedClientData;
              },
            );

            console.log("Enhanced clients after :", enhancedClients);

            return {
              clients: enhancedClients,
              total: parsed.pagination?.total || enhancedClients.length,
              filters: parsed.filters,
              pagination: parsed.pagination,
              hydra_public_url: parsed.hydra_public_url,
            };
          }

          // Fallback for old response format
          const normalizedResponse = normalizeClientsResponse(parsed);
          console.log("Normalized response (fallback):", normalizedResponse);
          console.log(
            "First client in normalized response:",
            normalizedResponse.clients?.[0],
          );

          const enhancedClients: EnhancedClientData[] =
            normalizedResponse.clients.map((client) => {
              console.log(
                "Processing client in API transform (fallback):",
                client,
              );
              return {
                ...client,
                authentication_methods: [],
                auth_methods_count: 0,
                client_name: client.name,
                description: `Client: ${client.name}`,
              };
            });

          return {
            clients: enhancedClients,
            total: enhancedClients.length,
            filters: normalizedResponse.filters,
            pagination: normalizedResponse.pagination,
            hydra_public_url: parsed.hydra_public_url,
          };
        } catch (error) {
          console.error("Failed to parse getAllClients response:", error);
          return {
            clients: [],
            total: 0,
            filters: {},
            pagination: { limit: 10, page: 1, total: 0 },
          };
        }
      },
      providesTags: (result) =>
        result?.clients && result.clients.length
          ? [
              ...result.clients.map((client) => ({
                type: "Client" as const,
                id: client.client_id ?? client.id ?? "UNKNOWN",
              })),
              { type: "Client" as const, id: "ALL" },
            ]
          : [{ type: "Client" as const, id: "ALL" }],
    }),

    // Register a new client (Tenant-scoped)
    registerClient: builder.mutation<
      RegisterClientResponse,
      RegisterClientRequest
    >({
      query: (data) => {
        return {
          url: "/authsec/applications",
          method: "POST",
          body: {
            name: data.name,
            public_base_url: data.react_app_url || "https://example.com",
            protected_base_path: "/mcp",
            registration_modes: ["dynamic"],
            scopes_supported: [],
          },
        };
      },
      transformResponse: (response: unknown) => {
        return normalizeRegisterClientResponse(response);
      },
      invalidatesTags: [
        { type: "Client", id: "LIST" },
        { type: "Client", id: "ALL" },
      ],
    }),

    registerAiAgentClient: builder.mutation<
      RegisterClientResponse,
      RegisterAiAgentClientRequest
    >({
      query: ({ workspace_id: _workspace_id, selectors, ...body }) => ({
        url: "/authsec/applications",
        method: "POST",
        body: {
          name: body.name,
          public_base_url: "https://example.com",
          protected_base_path: "/mcp",
          application_type: "ai_agent",
          registration_modes: ["dynamic"],
          scopes_supported: [],
          selectors,
        },
      }),
      transformResponse: (response: unknown) => {
        return normalizeRegisterClientResponse(response);
      },
      invalidatesTags: [
        { type: "Client", id: "LIST" },
        { type: "Client", id: "ALL" },
      ],
    }),

    registerClawAuthClient: builder.mutation<
      RegisterClientResponse,
      RegisterClawAuthClientRequest
    >({
      query: ({ workspace_id: _workspace_id, ...body }) => ({
        url: "/authsec/applications",
        method: "POST",
        body: {
          name: body.name,
          public_base_url: body.redirect_url || body.react_app_url || "https://example.com",
          protected_base_path: "/mcp",
          application_type: "claw_auth",
          registration_modes: ["dynamic"],
          scopes_supported: [],
        },
      }),
      transformResponse: (response: unknown) => {
        return normalizeRegisterClientResponse(response);
      },
      invalidatesTags: [
        { type: "Client", id: "LIST" },
        { type: "Client", id: "ALL" },
      ],
    }),

    // Add OIDC provider to a client
    addOIDCProvider: builder.mutation<AddProviderResponse, AddProviderRequest>({
      query: (data) => ({
        url: "/authsec/oocmgr/oidc/add-provider",
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["Client", "OIDCProvider"],
    }),

    // Get OIDC configuration for a tenant
    getOIDCConfig: builder.mutation<GetConfigResponse, GetConfigRequest>({
      query: (data) => ({
        url: "/authsec/oocmgr/oidc/get-config",
        method: "POST",
        body: data,
      }),
      invalidatesTags: ["OIDCProvider"],
    }),

    // Legacy endpoints for backward compatibility
    createClient: builder.mutation<Client, Partial<Client>>({
      queryFn: async () => {
        return { error: { status: 501, data: "Use registerClient instead" } };
      },
      invalidatesTags: ["Client"],
    }),

    updateClient: builder.mutation<
      Client,
      { id: string; updates: Partial<Client> }
    >({
      queryFn: async () => {
        return {
          error: { status: 501, data: "Not implemented in AuthSec API" },
        };
      },
      invalidatesTags: ["Client"],
    }),

    deleteClient: builder.mutation<void, { id: string }>({
      queryFn: async () => {
        return {
          error: { status: 501, data: "Not implemented in AuthSec API" },
        };
      },
      invalidatesTags: ["Client"],
    }),

    attachAuthMethod: builder.mutation<
      void,
      { clientId: string; authMethodId: string; isDefault?: boolean }
    >({
      queryFn: async () => {
        return { error: { status: 501, data: "Use addOIDCProvider instead" } };
      },
      invalidatesTags: ["Client"],
    }),

    detachAuthMethod: builder.mutation<
      void,
      { clientId: string; authMethodId: string }
    >({
      queryFn: async () => {
        return {
          error: { status: 501, data: "Not implemented in AuthSec API" },
        };
      },
      invalidatesTags: ["Client"],
    }),

    setDefaultAuthMethod: builder.mutation<
      void,
      { clientId: string; authMethodId: string }
    >({
      queryFn: async () => {
        return {
          error: { status: 501, data: "Not implemented in AuthSec API" },
        };
      },
      invalidatesTags: ["Client"],
    }),

    getClientAuthMethods: builder.query<AuthMethod[], { clientId: string }>({
      queryFn: async () => {
        return { data: [] };
      },
      providesTags: ["Client"],
    }),

    getPlatformSelectors: builder.query<
      PlatformSelectorsResponse,
      GetPlatformSelectorsRequest
    >({
      queryFn: async ({ platform }) => ({
        data: { platform, selector_keys: [] },
      }),
    }),
  }),
});

export const {
  useGetClientsQuery,
  useGetAllClientsQuery,
  useRegisterClientMutation,
  useRegisterAiAgentClientMutation,
  useRegisterClawAuthClientMutation,
  useDeleteClientCompleteMutation,
  useSetClientStatusMutation,
  useAddOIDCProviderMutation,
  useGetOIDCConfigMutation,

  // Legacy hooks for backward compatibility
  useCreateClientMutation,
  useUpdateClientMutation,
  useDeleteClientMutation,
  useAttachAuthMethodMutation,
  useDetachAuthMethodMutation,
  useSetDefaultAuthMethodMutation,
  useGetClientAuthMethodsQuery,
  useGetPlatformSelectorsQuery,
  useLazyGetPlatformSelectorsQuery,
} = clientApi;
// Force rebuild
