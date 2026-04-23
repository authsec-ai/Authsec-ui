import config from "@/config";
import type {
  CreateResourceServerRequest,
  ResourceServer,
} from "@/app/api/resourceServersApi";

const PROTECTED_RESOURCE_PREFIX = "/.well-known/oauth-protected-resource";

export type ResourceServerFormState = {
  name: string;
  public_base_url: string;
  protected_base_path: string;
  scopes_supported: string;
  registration_modes: string;
  active: boolean;
};

export type ResourceServerSecretState = {
  value: string;
  source: "created" | "rotated";
  resourceServerId?: string;
};

export type IntegrationLanguage = "go" | "typescript" | "python";

export const INTEGRATION_LANGUAGE_LABELS: Record<IntegrationLanguage, string> = {
  go: "Go",
  typescript: "TypeScript",
  python: "Python",
};

export const DEFAULT_FORM: ResourceServerFormState = {
  name: "",
  public_base_url: "",
  protected_base_path: "/mcp",
  scopes_supported: "tools:read\ntools:write",
  registration_modes: "dcr\nprereg\ncimd",
  active: true,
};

export function parseLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function summarizeList(items: string[], max = 2): string {
  if (items.length === 0) return "None";
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} +${items.length - max}`;
}

export function formatTimestamp(value?: string): string {
  if (!value || value === "0001-01-01T00:00:00Z") return "Not recorded";
  return new Date(value).toLocaleString();
}

export function computeResourceURI(
  publicBaseURL: string,
  protectedBasePath: string,
): string {
  const base = publicBaseURL.trim().replace(/\/$/, "");
  const path = protectedBasePath.trim() || "/mcp";
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path;
}

export function computeMetadataPath(resourceURI: string): string {
  try {
    const parsed = new URL(resourceURI);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      return PROTECTED_RESOURCE_PREFIX;
    }
    return `${PROTECTED_RESOURCE_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
  } catch {
    return PROTECTED_RESOURCE_PREFIX;
  }
}

export function computeMetadataURL(resourceURI: string): string {
  try {
    const parsed = new URL(resourceURI);
    return `${parsed.origin}${computeMetadataPath(resourceURI)}`;
  } catch {
    return computeMetadataPath(resourceURI);
  }
}

export function computeMcpEndpointURL(server: ResourceServer): string {
  return server.resource_uri || computeResourceURI(server.public_base_url, server.protected_base_path);
}

export function computeOAuthIssuerURL(): string {
  return config.VITE_OAUTH_BASE_URL.replace(/\/+$/, "");
}

export function computeJwksURL(): string {
  return `${config.VITE_API_URL.replace(/\/+$/, "")}/oauth/jwks`;
}

export function computeIntrospectionURL(): string {
  return `${config.VITE_API_URL.replace(/\/+$/, "")}/oauth/introspect`;
}

export function computeResourceServerRegistryURL(): string {
  return `${config.VITE_API_URL.replace(/\/+$/, "")}/authsec/resource-servers`;
}

export function computeAuthorizeURL(): string {
  return `${computeOAuthIssuerURL()}/oauth/authorize`;
}

export function computeTokenURL(): string {
  return `${config.VITE_API_URL.replace(/\/+$/, "")}/oauth/token`;
}

export function formFromServer(server: ResourceServer): ResourceServerFormState {
  return {
    name: server.name,
    public_base_url: server.public_base_url,
    protected_base_path: server.protected_base_path,
    scopes_supported: (server.scopes_supported ?? []).join("\n"),
    registration_modes: (server.registration_modes ?? []).join("\n"),
    active: server.active,
  };
}

export function buildResourceServerPayload(
  form: ResourceServerFormState,
): CreateResourceServerRequest & { active?: boolean } {
  return {
    name: form.name.trim(),
    public_base_url: form.public_base_url.trim(),
    protected_base_path: form.protected_base_path.trim() || "/mcp",
    scopes_supported: parseLines(form.scopes_supported),
    registration_modes: parseLines(form.registration_modes),
    active: form.active,
  };
}

type IntegrationSnippet = {
  title: string;
  code: string;
};

type ResourceServerSDKContent = {
  intro: string[];
  snippets: IntegrationSnippet[];
};

const GO_IMPORT = `import (
	"log"
	"net/http"

	authsecsdk "github.com/authsec-ai/sdk-authsec/packages/go-sdk"
)`;

const GO_WRAP = (server: ResourceServer) => `cfg := authsecsdk.Config{
	Issuer:                    "${computeOAuthIssuerURL()}",
	AuthorizationServer:       "${computeOAuthIssuerURL()}",
	JWKSURL:                   "${computeJwksURL()}",
	IntrospectionURL:          "${computeIntrospectionURL()}",
	IntrospectionClientID:     "${server.id}",
	IntrospectionClientSecret: "<one-time-introspection-secret>",
	ResourceServerID:          "${server.id}",
	ResourceURI:               "${server.resource_uri}",
	ResourceName:              "${server.name}",
	SupportedScopes:           []string{${server.scopes_supported.map((scope) => `"${scope}"`).join(", ")}},
	PolicyMode:                authsecsdk.PolicyModeRemoteRequired,
	ValidationMode:            authsecsdk.ValidationModeJWTAndIntrospect,
}

// MountMCP is the canonical integration path. It registers the MCP route and
// the protected-resource metadata route derived from ResourceURI.
mux := http.NewServeMux()
if err := authsecsdk.MountMCP(mux, "${server.protected_base_path}", existingMCPHandler, cfg); err != nil {
	log.Fatal(err)
}

log.Fatal(http.ListenAndServe(":8080", mux))`;

const TS_WRAP = (server: ResourceServer) => `import { runMcpServerWithOAuth, protectedByAuthSec } from "@authsec/sdk";

const tools = [
  protectedByAuthSec(
    {
      toolName: "list_repositories",
      scopes: ["${server.scopes_supported[0] ?? "tools:read"}"],
      description: "Example protected MCP tool",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async () => [{ type: "text", text: "ok" }],
  ),
];

runMcpServerWithOAuth({
  tools,
  clientId: "<resource-server-client-id>",
  appName: "${server.name}",
  host: "0.0.0.0",
  port: 8080,
  issuer: "${config.VITE_OAUTH_BASE_URL}",
  resource: "${server.resource_uri}",
});`;

const PY_WRAP = (server: ResourceServer) => `from authsec_sdk import run_mcp_server_with_oauth, protected_by_authsec

tools = [
    protected_by_authsec(
        {
            "tool_name": "list_repositories",
            "scopes": ["${server.scopes_supported[0] ?? "tools:read"}"],
            "description": "Example protected MCP tool",
            "input_schema": {"type": "object", "properties": {}, "required": []},
        },
        lambda *_args, **_kwargs: [{"type": "text", "text": "ok"}],
    )
]

run_mcp_server_with_oauth(
    tools=tools,
    client_id="<resource-server-client-id>",
    app_name="${server.name}",
    host="0.0.0.0",
    port=8080,
    issuer="${config.VITE_OAUTH_BASE_URL}",
    resource="${server.resource_uri}",
)`;

export function buildSDKContent(
  language: IntegrationLanguage,
  server: ResourceServer,
): ResourceServerSDKContent {
  const metadataURL = computeMetadataURL(server.resource_uri);
  const metadataPath = computeMetadataPath(server.resource_uri);
  const intro = [
    "AuthSec owns protected-resource metadata, OAuth discovery/challenges, token validation, RBAC-backed scope enforcement, and auditability.",
    "Your MCP server still owns tool registration, upstream service credentials, tool execution, and any domain-specific authorization logic beyond scope-to-tool gating.",
    "The access token presented to your MCP server is an AuthSec user token. It is not your upstream service credential and must not be forwarded to GitHub or any other provider.",
    `For this protected resource, clients discover metadata at ${metadataURL}. Path-based resources use the alias-only route ${metadataPath}.`,
  ];

  if (language === "go") {
    return {
      intro,
      snippets: [
        {
          title: "Install",
          code: "go get github.com/authsec-ai/sdk-authsec/packages/go-sdk",
        },
        {
          title: "Imports",
          code: GO_IMPORT,
        },
        {
          title: "Mount the MCP handler",
          code: GO_WRAP(server),
        },
      ],
    };
  }

  if (language === "typescript") {
    return {
      intro,
      snippets: [
        {
          title: "Install",
          code: "npm install @authsec/sdk",
        },
        {
          title: "Protected server bootstrap",
          code: TS_WRAP(server),
        },
      ],
    };
  }

  return {
    intro,
    snippets: [
      {
        title: "Install",
        code: "python3 -m pip install authsec-sdk",
      },
      {
        title: "Protected server bootstrap",
        code: PY_WRAP(server),
      },
    ],
  };
}

export function buildIntegrationPrompt(
  language: IntegrationLanguage,
  server: ResourceServer,
): string {
  const metadataPath = computeMetadataPath(server.resource_uri);
  const metadataURL = computeMetadataURL(server.resource_uri);
  const mcpEndpointURL = computeMcpEndpointURL(server);
  const installLine =
    language === "go"
      ? "Install the SDK with: go get github.com/authsec-ai/sdk-authsec/packages/go-sdk"
      : language === "typescript"
        ? "Install the SDK with: npm install @authsec/sdk"
        : "Install the SDK with: python3 -m pip install authsec-sdk";

  const importGuidance =
    language === "go"
      ? GO_IMPORT
      : language === "typescript"
        ? 'import { runMcpServerWithOAuth, protectedByAuthSec } from "@authsec/sdk";'
        : "from authsec_sdk import run_mcp_server_with_oauth, protected_by_authsec";

  return `You are integrating AuthSec into an MCP server in ${INTEGRATION_LANGUAGE_LABELS[language]}.

Use these exact AuthSec and resource server values:
- Resource server name: ${server.name}
- Public base URL: ${server.public_base_url}
- Protected base path: ${server.protected_base_path}
- Resource URI: ${server.resource_uri}
- MCP endpoint URL: ${mcpEndpointURL}
- Metadata path: ${metadataPath}
- Metadata URL: ${metadataURL}
- Supported scopes: ${(server.scopes_supported ?? []).join(", ") || "none declared"}
- Registration modes: ${(server.registration_modes ?? []).join(", ") || "none declared"}
- OAuth issuer / authorization server: ${computeOAuthIssuerURL()}
- Authorization endpoint: ${computeAuthorizeURL()}
- Token endpoint: ${computeTokenURL()}
- JWKS endpoint: ${computeJwksURL()}
- Introspection endpoint: ${computeIntrospectionURL()}
- Resource server registry endpoint: ${computeResourceServerRegistryURL()}

AuthSec responsibilities:
- Serve the authorization server for MCP OAuth and PAR-backed login flows
- Issue and validate user tokens
- Enforce RBAC and granted scopes
- Provide protected-resource metadata and bearer challenges through the SDK
- Maintain consent, auditability, and resource server registration

MCP server responsibilities:
- Keep upstream service credentials server-side only
- Execute the actual tools
- Map tools to scopes/policy rules
- Never forward AuthSec user tokens to upstream systems such as GitHub

${installLine}

Use this import baseline:
${importGuidance}

Implement the integration in this order:
1. Use the Go SDK's MountMCP path as the canonical integration path for Go servers. Do not hand-wire protected-resource metadata when the SDK can mount it.
2. Configure issuer, authorization server, JWKS URL, introspection URL, resource server ID, resource URI, resource name, and the one-time introspection secret from AuthSec.
3. Preserve existing non-AuthSec server behavior unless AuthSec mode is explicitly enabled.
4. Keep the upstream service credential separate from AuthSec tokens.
5. Expose the protected MCP path at ${server.protected_base_path} and let the SDK derive metadata from ${server.resource_uri}.
6. Treat ${metadataURL} as the discovery URL. For this path-based resource, the bare /.well-known/oauth-protected-resource path is not the canonical metadata route.
7. Verify unauthenticated requests receive a Bearer challenge pointing clients to AuthSec metadata.
8. Verify authenticated requests can only see tools permitted by granted scopes.

Validation checklist:
- tools/list hides unauthorized tools
- tools/call returns insufficient_scope for blocked tools
- the server emits protected-resource metadata at ${metadataURL}
- the server uses MountMCP as the default setup path; use WrapMCPHTTP only for advanced manual mux wiring
- tokens are validated against AuthSec
- upstream provider calls still use server-side credentials only
- the configured resource URI remains ${server.resource_uri}

If the resource server is a GitHub MCP server, keep the GitHub PAT or installation token server-side. The AuthSec principal should only decide whether the tool is allowed; it should not replace the upstream GitHub credential.

Generate production-grade integration code, not pseudocode.`;
}
