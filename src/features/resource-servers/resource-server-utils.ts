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

export type EnvShell = "dotenv" | "bash" | "pwsh" | "cmd";

export const ENV_SHELL_LABELS: Record<EnvShell, string> = {
  dotenv: ".env file",
  bash: "macOS / Linux (bash · zsh)",
  pwsh: "Windows · PowerShell",
  cmd: "Windows · CMD",
};

const ENV_SECRET_PLACEHOLDER = "<paste the one-time introspection secret>";
const ENV_UPSTREAM_PLACEHOLDER =
  "<your upstream service credential, e.g. GitHub PAT>";

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

export type ResourceServerReadinessItem = {
  key: "configured" | "discovered" | "default_access" | "client_ready" | "validated";
  label: string;
  ready: boolean;
};

export function getDeclaredScopes(server: Pick<ResourceServer, "scopes_supported">): string[] {
  return Array.isArray(server.scopes_supported) ? server.scopes_supported : [];
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

export function computeAuthSecAPIOrigin(): string {
  return config.VITE_API_URL.replace(/\/+$/, "");
}

export function computeJwksURL(): string {
  return `${computeAuthSecAPIOrigin()}/oauth/jwks`;
}

export function computeIntrospectionURL(): string {
  return `${computeAuthSecAPIOrigin()}/oauth/introspect`;
}

export function computeResourceServerRegistryURL(): string {
  return `${computeAuthSecAPIOrigin()}/authsec/resource-servers`;
}

export function computeAuthorizeURL(): string {
  return `${computeOAuthIssuerURL()}/oauth/authorize`;
}

export function computeTokenURL(): string {
  return `${computeAuthSecAPIOrigin()}/oauth/token`;
}

export function buildReadinessItems(server: ResourceServer): ResourceServerReadinessItem[] {
  return [
    {
      key: "configured",
      label: "Configured",
      ready: Boolean(server.active && server.resource_uri),
    },
    {
      key: "discovered",
      label: "Discovered",
      ready: Number(server.last_successful_generation || 0) > 0,
    },
    {
      key: "default_access",
      label: "Default Access",
      ready: Boolean(server.access_policy_enabled),
    },
    {
      key: "client_ready",
      label: "Client Ready",
      ready: Number(server.client_count || 0) > 0,
    },
    {
      key: "validated",
      label: "Validated",
      ready: server.last_validation_status === "passed",
    },
  ];
}

export function formFromServer(server: ResourceServer): ResourceServerFormState {
  return {
    name: server.name,
    public_base_url: server.public_base_url,
    protected_base_path: server.protected_base_path,
    scopes_supported: getDeclaredScopes(server).join("\n"),
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

const GO_WRAP = (server: ResourceServer) => {
  const scopes = getDeclaredScopes(server);
  return `cfg := authsecsdk.Config{
	Issuer:                    "${computeOAuthIssuerURL()}",
	AuthorizationServer:       "${computeAuthSecAPIOrigin()}",
	JWKSURL:                   "${computeJwksURL()}",
	IntrospectionURL:          "${computeIntrospectionURL()}",
	IntrospectionClientID:     "${server.id}",
	IntrospectionClientSecret: "<one-time-introspection-secret>",
	ResourceServerID:          "${server.id}",
	ResourceURI:               "${server.resource_uri}",
	ResourceName:              "${server.name}",
	SupportedScopes:           []string{${scopes.map((scope) => `"${scope}"`).join(", ")}},
	PolicyMode:                authsecsdk.PolicyModeRemoteRequired,
	ValidationMode:            authsecsdk.ValidationModeJWTAndIntrospect,
	PublishManifest:           true,
}

// MountMCP is the canonical integration path. It registers the MCP route and
// the protected-resource metadata route derived from ResourceURI.
mux := http.NewServeMux()
if err := authsecsdk.MountMCP(mux, "${server.protected_base_path}", existingMCPHandler, cfg); err != nil {
	log.Fatal(err)
}

log.Fatal(http.ListenAndServe(":8080", mux))`;
};

const TS_WRAP = (server: ResourceServer) => `import { runMcpServerWithOAuth, protectedByAuthSec } from "@authsec/sdk";

const tools = [
  protectedByAuthSec(
    {
      toolName: "list_repositories",
      scopes: ["${getDeclaredScopes(server)[0] ?? "tools:read"}"],
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
            "scopes": ["${getDeclaredScopes(server)[0] ?? "tools:read"}"],
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

/**
 * Canonical AuthSec env-var block as an array of [key, value, comment?] tuples.
 * The shell only decides serialization — values come from here.
 */
export function getEnvPairs(
  server: Pick<ResourceServer, "id" | "resource_uri" | "name">,
  secret: string | null,
): Array<{ key: string; value: string; comment?: string }> {
  const isGitHub = server.name.toLowerCase().includes("github");
  const secretValue = secret ?? ENV_SECRET_PLACEHOLDER;
  const upstreamKey = isGitHub ? "AUTHSEC_UPSTREAM_GITHUB_TOKEN" : "UPSTREAM_API_TOKEN";
  return [
    { key: "AUTHSEC_RESOURCE_SERVER_ID", value: server.id },
    { key: "AUTHSEC_RESOURCE_URI", value: server.resource_uri },
    { key: "AUTHSEC_RESOURCE_NAME", value: server.name },
    { key: "AUTHSEC_ISSUER", value: computeOAuthIssuerURL() },
    { key: "AUTHSEC_AUTHORIZATION_SERVER", value: computeAuthSecAPIOrigin() },
    { key: "AUTHSEC_JWKS_URL", value: computeJwksURL() },
    { key: "AUTHSEC_INTROSPECTION_URL", value: computeIntrospectionURL() },
    { key: "AUTHSEC_INTROSPECTION_CLIENT_ID", value: server.id },
    { key: "AUTHSEC_INTROSPECTION_CLIENT_SECRET", value: secretValue },
    { key: "AUTHSEC_INTROSPECTION_SECRET", value: secretValue },
    { key: "AUTHSEC_POLICY_MODE", value: "remote_required" },
    { key: "AUTHSEC_PUBLISH_MANIFEST", value: "true" },
    {
      key: upstreamKey,
      value: ENV_UPSTREAM_PLACEHOLDER,
      comment:
        "Upstream service credential — DO NOT confuse with the AuthSec user token. AuthSec validates the user; the upstream credential stays server-side and authenticates this MCP to its provider.",
    },
  ];
}

const ENV_HEADER_BY_SHELL: Record<EnvShell, string> = {
  dotenv: "# AuthSec — protected resource configuration",
  bash: "# AuthSec — paste into your bash / zsh shell",
  pwsh: "# AuthSec — paste into Windows PowerShell",
  cmd: "REM AuthSec — paste into Windows Command Prompt",
};

function escapePwshValue(value: string): string {
  return value.replace(/`/g, "``").replace(/"/g, '`"');
}

function serializeEnvPair(
  shell: EnvShell,
  key: string,
  value: string,
): string {
  switch (shell) {
    case "dotenv":
      return `${key}=${value}`;
    case "bash":
      return /[\s"'$`\\]/.test(value)
        ? `export ${key}='${value.replace(/'/g, "'\\''")}'`
        : `export ${key}=${value}`;
    case "pwsh":
      return `$Env:${key} = "${escapePwshValue(value)}"`;
    case "cmd":
      return `set ${key}=${value}`;
  }
}

function serializeComment(shell: EnvShell, comment: string): string {
  const lines = comment.match(/.{1,72}(\s|$)/g)?.map((l) => l.trim()) ?? [comment];
  const prefix = shell === "cmd" ? "REM " : "# ";
  return lines.map((line) => `${prefix}${line}`).join("\n");
}

/**
 * Serialize the canonical env pairs into the chosen shell flavor.
 */
export function buildEnvSnippet(
  server: Pick<ResourceServer, "id" | "resource_uri" | "name">,
  secret: string | null,
  shell: EnvShell,
): string {
  const pairs = getEnvPairs(server, secret);
  const lines: string[] = [ENV_HEADER_BY_SHELL[shell]];
  let upstreamCommentEmitted = false;
  for (const pair of pairs) {
    if (pair.comment && !upstreamCommentEmitted) {
      lines.push("");
      lines.push(serializeComment(shell, pair.comment));
      upstreamCommentEmitted = true;
    }
    lines.push(serializeEnvPair(shell, pair.key, pair.value));
  }
  return lines.join("\n");
}

/**
 * Best-effort default shell guess from the user's platform — used only as the
 * initial value of the URL-param-backed selector. The user can override.
 */
export function getOSDefaultShell(): EnvShell {
  if (typeof navigator === "undefined") return "bash";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "pwsh";
  return "bash";
}

/** Per-language SDK terminology so the prompt body matches the language tab. */
type LanguagePromptProfile = {
  installLine: string;
  importGuidance: string;
  /** Sentence used in step 1 ("Use the ... SDK's ... as the canonical integration path"). */
  canonicalPathSentence: string;
  /** Validation-checklist line describing the default setup primitive. */
  validationDefaultPathLine: string;
  /** Language-specific deep-link under docs.authsec.dev. */
  sdkDocsURL: string;
};

const PROMPT_PROFILES: Record<IntegrationLanguage, LanguagePromptProfile> = {
  go: {
    installLine:
      "Install the SDK with: go get github.com/authsec-ai/sdk-authsec/packages/go-sdk",
    importGuidance: GO_IMPORT,
    canonicalPathSentence:
      "Use the Go SDK's `authsecsdk.MountMCP(mux, path, handler, cfg)` as the canonical integration path. Reach for `authsecsdk.WrapMCPHTTP` only when you must hand-wire an existing mux. Do not hand-wire protected-resource metadata when the SDK can mount it.",
    validationDefaultPathLine:
      "the server uses `MountMCP` as the default setup path; use `WrapMCPHTTP` only for advanced manual mux wiring",
    sdkDocsURL: "https://docs.authsec.dev/sdk/go",
  },
  typescript: {
    installLine: "Install the SDK with: npm install @authsec/sdk",
    importGuidance:
      'import { runMcpServerWithOAuth, protectedByAuthSec } from "@authsec/sdk";',
    canonicalPathSentence:
      "Use the TypeScript SDK's `runMcpServerWithOAuth({ tools, ... })` as the canonical bootstrap, and wrap each tool handler with `protectedByAuthSec({ toolName, scopes, ... }, handler)`. Do not hand-wire protected-resource metadata or bearer challenges — the SDK emits them.",
    validationDefaultPathLine:
      "the server uses `runMcpServerWithOAuth` to bootstrap and `protectedByAuthSec` to gate each tool; never short-circuit either with raw HTTP plumbing",
    sdkDocsURL: "https://docs.authsec.dev/sdk/typescript",
  },
  python: {
    installLine: "Install the SDK with: python3 -m pip install authsec-sdk",
    importGuidance:
      "from authsec_sdk import run_mcp_server_with_oauth, protected_by_authsec",
    canonicalPathSentence:
      "Use the Python SDK's `run_mcp_server_with_oauth(tools=..., ...)` as the canonical bootstrap, and wrap each tool handler with `protected_by_authsec({...}, handler)`. Do not hand-wire protected-resource metadata or bearer challenges — the SDK emits them.",
    validationDefaultPathLine:
      "the server uses `run_mcp_server_with_oauth` to bootstrap and `protected_by_authsec` to gate each tool; never short-circuit either with raw ASGI/WSGI plumbing",
    sdkDocsURL: "https://docs.authsec.dev/sdk/python",
  },
};

export function buildIntegrationPrompt(
  language: IntegrationLanguage,
  server: ResourceServer,
): string {
  const metadataPath = computeMetadataPath(server.resource_uri);
  const metadataURL = computeMetadataURL(server.resource_uri);
  const mcpEndpointURL = computeMcpEndpointURL(server);
  const profile = PROMPT_PROFILES[language];

  return `You are integrating AuthSec into an MCP server in ${INTEGRATION_LANGUAGE_LABELS[language]}.

Authoritative references (read these first, then implement):
- Getting started: https://docs.authsec.dev/getting-started
- ${INTEGRATION_LANGUAGE_LABELS[language]} SDK guide: ${profile.sdkDocsURL}

Use these exact AuthSec and resource server values:
- Resource server name: ${server.name}
- Public base URL: ${server.public_base_url}
- Protected base path: ${server.protected_base_path}
- Resource URI: ${server.resource_uri}
- MCP endpoint URL: ${mcpEndpointURL}
- Metadata path: ${metadataPath}
- Metadata URL: ${metadataURL}
- Supported scopes: ${getDeclaredScopes(server).join(", ") || "none declared"}
- Registration modes: ${(server.registration_modes ?? []).join(", ") || "none declared"}
- OAuth issuer: ${computeOAuthIssuerURL()}
- AuthSec API / SDK policy server: ${computeAuthSecAPIOrigin()}
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

${profile.installLine}

Use this import baseline:
${profile.importGuidance}

Implement the integration in this order:
1. ${profile.canonicalPathSentence}
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
- ${profile.validationDefaultPathLine}
- tokens are validated against AuthSec
- upstream provider calls still use server-side credentials only
- the configured resource URI remains ${server.resource_uri}

If the resource server is a GitHub MCP server, keep the GitHub PAT or installation token server-side. The AuthSec principal should only decide whether the tool is allowed; it should not replace the upstream GitHub credential.

When in doubt, defer to ${profile.sdkDocsURL} and https://docs.authsec.dev/getting-started rather than improvising.

Generate production-grade integration code, not pseudocode.`;
}
