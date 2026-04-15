import config from "@/config";
import type {
  CreateResourceServerRequest,
  ResourceServer,
} from "@/app/api/resourceServersApi";

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
	authsecsdk "github.com/authsec-ai/sdk-authsec/packages/go-sdk"
)`;

const GO_WRAP = (server: ResourceServer) => `cfg := authsecsdk.Config{
	Issuer:                    "${config.VITE_OAUTH_BASE_URL}",
	AuthorizationServer:       "${config.VITE_OAUTH_BASE_URL}",
	JWKSURL:                   "${config.VITE_API_URL}/oauth/jwks",
	IntrospectionURL:          "${config.VITE_API_URL}/oauth/introspect",
	IntrospectionClientID:     "<resource-server-client-id>",
	IntrospectionClientSecret: "<one-time-introspection-secret>",
	ResourceURI:               "${server.resource_uri}",
	ResourceName:              "${server.name}",
	SupportedScopes:           []string{${server.scopes_supported.map((scope) => `"${scope}"`).join(", ")}},
	Policy: authsecsdk.StaticPolicy{
		"tools/list": {AnyOfScopes: []string{"${server.scopes_supported[0] ?? "tools:read"}"}},
	},
}

protected, err := authsecsdk.WrapMCPHTTP(existingMCPHandler, cfg)
if err != nil {
	log.Fatal(err)
}

mux := http.NewServeMux()
mux.Handle("${server.protected_base_path}", protected)
mux.Handle("${server.protected_base_path}/", protected)`;

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
  const intro = [
    "AuthSec owns protected-resource metadata, OAuth discovery/challenges, token validation, RBAC-backed scope enforcement, and auditability.",
    "Your MCP server still owns tool registration, upstream service credentials, tool execution, and any domain-specific authorization logic beyond scope-to-tool gating.",
    "The access token presented to your MCP server is an AuthSec user token. It is not your upstream service credential and must not be forwarded to GitHub or any other provider.",
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
          title: "Wrap the MCP handler",
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
- Supported scopes: ${(server.scopes_supported ?? []).join(", ") || "none declared"}
- Registration modes: ${(server.registration_modes ?? []).join(", ") || "none declared"}
- OAuth issuer / authorization server: ${config.VITE_OAUTH_BASE_URL}
- JWKS endpoint: ${config.VITE_API_URL}/oauth/jwks
- Introspection endpoint: ${config.VITE_API_URL}/oauth/introspect
- Resource server registry endpoint: ${config.VITE_API_URL}/authsec/resource-servers

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
1. Wrap the MCP HTTP handler with the AuthSec SDK runtime instead of hand-writing MCP protected-resource metadata.
2. Configure issuer, authorization server, JWKS URL, introspection URL, resource URI, resource name, and the one-time introspection secret from AuthSec.
3. Define tool-to-scope policy rules for the server's actual tool names.
4. Keep the upstream service credential separate from AuthSec tokens.
5. Expose the protected MCP path at ${server.protected_base_path}.
6. Verify unauthenticated requests receive a Bearer challenge pointing clients to AuthSec metadata.
7. Verify authenticated requests can only see tools permitted by granted scopes.

Validation checklist:
- tools/list hides unauthorized tools
- tools/call returns insufficient_scope for blocked tools
- the server emits protected-resource metadata without custom manual route wiring
- tokens are validated against AuthSec
- upstream provider calls still use server-side credentials only
- the configured resource URI remains ${server.resource_uri}

Generate production-grade integration code, not pseudocode.`;
}
