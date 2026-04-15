import config from "../../../config";
import type { SDKHubModule } from "../utils/hub-routing";

export type SDKCodeLanguage = "bash" | "typescript" | "python" | "go" | "json";
export type SDKId = "typescript" | "python" | "go";

export interface SDKHubSnippet {
  id: string;
  label: string;
  language: SDKCodeLanguage;
  code: string;
}

export interface SDKHubSection {
  key: SDKHubModule;
  title: string;
  summary: string;
  highlights: string[];
  snippets: SDKHubSnippet[];
}

export interface SDKCatalogItem {
  id: SDKId;
  name: string;
  packageName: string;
  runtime: string;
  version: string;
  packagePath: string;
  installCommand: string;
  docsUrl: string;
  repoUrl: string;
  sections: SDKHubSection[];
}

export const SDK_MODULE_LABELS: Record<SDKHubModule, string> = {
  overview: "Overview",
  "mcp-oauth": "MCP OAuth",
  rbac: "RBAC",
  "service-access": "Service Access",
  ciba: "CIBA",
  spiffe: "SPIFFE",
  env: "Environment",
};

const typescriptSections: SDKHubSection[] = [
  {
    key: "overview",
    title: "TypeScript SDK Overview",
    summary:
      "Use @authsec/sdk to secure MCP tools, enforce RBAC, access external services, run CIBA flows, and integrate SPIFFE workload identity.",
    highlights: [
      "Package: @authsec/sdk",
      "Node >= 18",
      "Exports MCP, RBAC, ServiceAccessSDK, CIBAClient, and SPIFFE helpers",
    ],
    snippets: [
      {
        id: "ts-install",
        label: "Install TypeScript SDK",
        language: "bash",
        code: "npm install @authsec/sdk",
      },
      {
        id: "ts-imports",
        label: "Core imports",
        language: "typescript",
        code: `import {
  mcpTool,
  protectedByAuthSec,
  runMcpServerWithOAuth,
  ServiceAccessSDK,
  CIBAClient,
  QuickStartSVID,
} from "@authsec/sdk";`,
      },
    ],
  },
  {
    key: "mcp-oauth",
    title: "MCP OAuth (TypeScript)",
    summary:
      "Protect tools with protectedByAuthSec(...) and run your MCP server with OAuth delegated upstream.",
    highlights: [
      "Use mcpTool for public tools",
      "Use protectedByAuthSec for guarded tools",
      "Start server with runMcpServerWithOAuth",
    ],
    snippets: [
      {
        id: "ts-mcp-server",
        label: "Protected MCP server",
        language: "typescript",
        code: `import {
  mcpTool,
  protectedByAuthSec,
  runMcpServerWithOAuth,
} from "@authsec/sdk";

const ping = mcpTool(
  {
    name: "ping",
    description: "Health check",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  async () => [{ type: "text", text: "pong" }],
);

const deleteInvoice = protectedByAuthSec(
  {
    toolName: "delete_invoice",
    roles: ["admin"],
    scopes: ["write"],
    requireAll: true,
    description: "Delete invoice by id",
    inputSchema: {
      type: "object",
      properties: { invoice_id: { type: "string" } },
      required: ["invoice_id"],
    },
  },
  async (args) => [{ type: "text", text: "Deleted " + args.invoice_id }],
);

runMcpServerWithOAuth({
  tools: [ping, deleteInvoice],
  clientId: process.env.AUTHSEC_CLIENT_ID,
  appName: "my-ts-mcp",
  host: "127.0.0.1",
  port: 3005,
});`,
      },
      {
        id: "ts-mcp-env",
        label: "Runtime environment",
        language: "bash",
        code: `AUTHSEC_CLIENT_ID="YOUR_CLIENT_ID" \\
AUTHSEC_AUTH_SERVICE_URL="${config.VITE_API_URL}/oauth" \\
AUTHSEC_RESOURCE_SERVERS_URL="${config.VITE_API_URL}/authsec/resource-servers" \\
node dist/server.js`,
      },
    ],
  },
  {
    key: "rbac",
    title: "RBAC (TypeScript)",
    summary:
      "Attach roles/scopes/resources/permissions per tool and let AuthSec enforce access.",
    highlights: [
      "Supports roles, groups, resources, scopes, permissions",
      "OR and requireAll matching modes",
      "RBAC checks remain centralized upstream",
    ],
    snippets: [
      {
        id: "ts-rbac-tool",
        label: "RBAC-protected tool",
        language: "typescript",
        code: `import { protectedByAuthSec } from "@authsec/sdk";

export const adminTool = protectedByAuthSec(
  {
    toolName: "manage_users",
    roles: ["admin", "security_admin"],
    resources: ["users"],
    scopes: ["write"],
    permissions: ["users:write"],
    requireAll: false,
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string" },
        user_id: { type: "string" },
      },
      required: ["action", "user_id"],
    },
  },
  async (args, session) => [{
    type: "text",
    text: JSON.stringify({ actor: session.userInfo?.email_id, args }),
  }],
);`,
      },
      {
        id: "ts-rbac-map",
        label: "Tool role map",
        language: "json",
        code: `{
  "create_entities": ["admin"],
  "delete_entities": ["admin"],
  "list_entities": ["viewer", "admin"]
}`,
      },
    ],
  },
  {
    key: "service-access",
    title: "Service Access (TypeScript)",
    summary:
      "Use ServiceAccessSDK with a session to fetch service credentials and access tokens.",
    highlights: [
      "Session-bound credential retrieval",
      "Supports credentials, tokens, and service user-details",
      "Best for external services and secret-backed integrations",
    ],
    snippets: [
      {
        id: "ts-service-access",
        label: "Get service credentials",
        language: "typescript",
        code: `import { ServiceAccessSDK } from "@authsec/sdk";

async function fetchServiceToken(args) {
  const sdk = new ServiceAccessSDK({ sessionId: args.session_id });
  const token = await sdk.getServiceToken("github");
  return [{ type: "text", text: "token length=" + token.length }];
}`,
      },
    ],
  },
  {
    key: "ciba",
    title: "CIBA + TOTP (TypeScript)",
    summary:
      "Run passwordless app approval and fallback TOTP verification in voice or agent flows.",
    highlights: [
      "CIBA push approval",
      "Tenant flow via clientId",
      "Retry-aware TOTP fallback",
    ],
    snippets: [
      {
        id: "ts-ciba",
        label: "CIBA approval flow",
        language: "typescript",
        code: `import { CIBAClient } from "@authsec/sdk";

const client = new CIBAClient({
  clientId: process.env.AUTHSEC_CLIENT_ID,
  baseUrl: "` + config.VITE_API_URL + `",
});

const init = await client.initiateAppApproval("user@example.com");
const approval = await client.pollForApproval(
  "user@example.com",
  init.auth_req_id,
  { interval: 5, timeout: 60 },
);

if (approval.status === "approved") {
  console.log("approved", approval.token);
}`,
      },
      {
        id: "ts-totp",
        label: "TOTP fallback",
        language: "typescript",
        code: `const result = await client.verifyTotp("user@example.com", "123456");
if (!result.success) {
  console.log("remaining retries", result.remaining);
}`,
      },
    ],
  },
  {
    key: "spiffe",
    title: "SPIFFE (TypeScript)",
    summary:
      "Bootstrap SVID from SPIRE, then use generated TLS options for client/server mTLS.",
    highlights: [
      "QuickStartSVID singleton",
      "Automatic renewal support",
      "Server and client TLS option helpers",
    ],
    snippets: [
      {
        id: "ts-spiffe",
        label: "Initialize SVID",
        language: "typescript",
        code: `import { QuickStartSVID } from "@authsec/sdk";
import https from "node:https";

const svid = await QuickStartSVID.initialize("/run/spire/sockets/agent.sock");
const server = https.createServer(svid.createTlsOptionsForServer(), (_req, res) => {
  res.end("secure");
});
server.listen(8443);`,
      },
    ],
  },
  {
    key: "env",
    title: "Environment (TypeScript)",
    summary:
      "Runtime variables and quick checks for MCP auth/service endpoints.",
    highlights: [
      "AUTHSEC_AUTH_SERVICE_URL and AUTHSEC_SERVICES_URL",
      "AUTHSEC_CLIENT_ID for runtime client binding",
      "Timeout and retry controls for reliability",
    ],
    snippets: [
      {
        id: "ts-env",
        label: "Environment variables",
        language: "bash",
        code: `AUTHSEC_AUTH_SERVICE_URL="${config.VITE_API_URL}/oauth"
AUTHSEC_RESOURCE_SERVERS_URL="${config.VITE_API_URL}/authsec/resource-servers"
AUTHSEC_TIMEOUT_SECONDS=15
AUTHSEC_RETRIES=2
AUTHSEC_TOOLS_LIST_TIMEOUT_SECONDS=8
AUTHSEC_CLIENT_ID="YOUR_CLIENT_ID"`,
      },
    ],
  },
];

const pythonSections: SDKHubSection[] = [
  {
    key: "overview",
    title: "Python SDK Overview",
    summary:
      "Use authsec-sdk (authsec_sdk) to secure Python MCP tools with OAuth + RBAC and access CIBA/SPIFFE helpers.",
    highlights: [
      "Package: authsec-sdk",
      "Import path: authsec_sdk",
      "Python >= 3.10.11",
    ],
    snippets: [
      {
        id: "py-install",
        label: "Install Python SDK",
        language: "bash",
        code: "python3 -m pip install authsec-sdk",
      },
      {
        id: "py-import",
        label: "Core imports",
        language: "python",
        code: `from authsec_sdk import (
    mcp_tool,
    protected_by_AuthSec,
    run_mcp_server_with_oauth,
    ServiceAccessSDK,
    CIBAClient,
    QuickStartSVID,
)`,
      },
    ],
  },
  {
    key: "mcp-oauth",
    title: "MCP OAuth (Python)",
    summary:
      "Protect Python MCP tools with decorators and run with OAuth delegated to AuthSec.",
    highlights: [
      "@mcp_tool for public tools",
      "@protected_by_AuthSec for guarded tools",
      "run_mcp_server_with_oauth for server bootstrap",
    ],
    snippets: [
      {
        id: "py-mcp-server",
        label: "Protected MCP server",
        language: "python",
        code: `from authsec_sdk import mcp_tool, protected_by_AuthSec, run_mcp_server_with_oauth

@mcp_tool(
    name="ping",
    description="Health check tool",
    inputSchema={"type": "object", "properties": {}, "required": []},
)
async def ping(arguments: dict) -> list:
    return [{"type": "text", "text": "pong"}]

@protected_by_AuthSec(
    tool_name="delete_invoice",
    roles=["admin"],
    scopes=["write"],
    require_all=True,
    inputSchema={
        "type": "object",
        "properties": {"invoice_id": {"type": "string"}},
        "required": ["invoice_id"],
    },
)
async def delete_invoice(arguments: dict) -> list:
    invoice_id = arguments.get("invoice_id")
    return [{"type": "text", "text": "Deleted invoice " + str(invoice_id)}]

if __name__ == "__main__":
    import __main__

    run_mcp_server_with_oauth(
        user_module=__main__,
        client_id="YOUR_CLIENT_ID",
        app_name="my-python-mcp",
        host="127.0.0.1",
        port=3005,
    )`,
      },
      {
        id: "py-mcp-env",
        label: "Runtime environment",
        language: "bash",
        code: `AUTHSEC_AUTH_SERVICE_URL="${config.VITE_API_URL}/oauth" \\
AUTHSEC_RESOURCE_SERVERS_URL="${config.VITE_API_URL}/authsec/resource-servers" \\
python3 server.py`,
      },
    ],
  },
  {
    key: "rbac",
    title: "RBAC (Python)",
    summary:
      "Declare role/scope/resource requirements in the decorator and keep authorization centralized.",
    highlights: [
      "supports roles, groups, resources, scopes, permissions",
      "require_all for strict AND checks",
      "claims available via arguments['_user_info']",
    ],
    snippets: [
      {
        id: "py-rbac",
        label: "RBAC-protected handler",
        language: "python",
        code: `from authsec_sdk import protected_by_AuthSec

@protected_by_AuthSec(
    tool_name="manage_users",
    roles=["admin", "security_admin"],
    resources=["users"],
    scopes=["write"],
    permissions=["users:write"],
    require_all=False,
)
async def manage_users(arguments: dict, session) -> list:
    user_info = arguments.get("_user_info") or {}
    actor = user_info.get("email_id", "unknown")
    return [{"type": "text", "text": f"authorized actor: {actor}"}]`,
      },
    ],
  },
  {
    key: "service-access",
    title: "Service Access (Python)",
    summary:
      "Fetch external service credentials/tokens through ServiceAccessSDK(session).",
    highlights: [
      "session-aware service access",
      "token and credentials helpers",
      "good fit for secret-backed external integrations",
    ],
    snippets: [
      {
        id: "py-service-access",
        label: "Fetch service token",
        language: "python",
        code: `from authsec_sdk import ServiceAccessSDK, protected_by_AuthSec

@protected_by_AuthSec("fetch_github_token", scopes=["read"])
async def fetch_github_token(arguments: dict, session) -> list:
    services = ServiceAccessSDK(session)
    token = await services.get_service_token("github")
    return [{"type": "text", "text": f"Token length: {len(token)}"}]`,
      },
    ],
  },
  {
    key: "ciba",
    title: "CIBA + TOTP (Python)",
    summary:
      "Use CIBAClient for app-approval authentication with TOTP fallback and retry handling.",
    highlights: [
      "tenant flow with client_id",
      "admin flow without client_id",
      "polling, timeout, and cancellation controls",
    ],
    snippets: [
      {
        id: "py-ciba",
        label: "CIBA approval flow",
        language: "python",
        code: `from authsec_sdk import CIBAClient

client = CIBAClient(client_id="YOUR_CLIENT_ID")
result = client.initiate_app_approval("user@example.com")
auth_req_id = result["auth_req_id"]
approval = client.poll_for_approval("user@example.com", auth_req_id, timeout=60)

if approval["status"] == "approved":
    print("approved", approval["token"])`,
      },
      {
        id: "py-ciba-totp",
        label: "TOTP fallback",
        language: "python",
        code: `result = client.verify_totp("user@example.com", "123456")
if result.get("success"):
    print("authenticated", result.get("token"))
else:
    print("invalid code, remaining", result.get("remaining"))`,
      },
    ],
  },
  {
    key: "spiffe",
    title: "SPIFFE (Python)",
    summary:
      "Initialize QuickStartSVID from SPIRE and derive SSL contexts for mTLS server/client traffic.",
    highlights: [
      "QuickStartSVID singleton",
      "writes cert/key/ca files for runtime use",
      "server and client SSL context helpers",
    ],
    snippets: [
      {
        id: "py-spiffe",
        label: "Initialize SVID",
        language: "python",
        code: `from authsec_sdk import QuickStartSVID

svid = await QuickStartSVID.initialize(
    socket_path="/run/spire/sockets/agent.sock"
)

server_ssl = svid.create_ssl_context_for_server()
client_ssl = svid.create_ssl_context_for_client()
print("SPIFFE ID", svid.spiffe_id)`,
      },
    ],
  },
  {
    key: "env",
    title: "Environment (Python)",
    summary:
      "Set runtime URLs/timeouts and validate service connectivity quickly during integration.",
    highlights: [
      "AUTHSEC_AUTH_SERVICE_URL and AUTHSEC_SERVICES_URL",
      "AUTHSEC_TIMEOUT_SECONDS and AUTHSEC_RETRIES",
      "use MCP Inspector for quick end-to-end verification",
    ],
    snippets: [
      {
        id: "py-env",
        label: "Environment variables",
        language: "bash",
        code: `AUTHSEC_AUTH_SERVICE_URL="${config.VITE_API_URL}/oauth"
AUTHSEC_RESOURCE_SERVERS_URL="${config.VITE_API_URL}/authsec/resource-servers"
AUTHSEC_TIMEOUT_SECONDS=15
AUTHSEC_RETRIES=2
AUTHSEC_TOOLS_LIST_TIMEOUT_SECONDS=8`,
      },
      {
        id: "py-inspector",
        label: "MCP Inspector",
        language: "bash",
        code: "npx @modelcontextprotocol/inspector http://127.0.0.1:3005",
      },
    ],
  },
];

const goSections: SDKHubSection[] = [
  {
    key: "overview",
    title: "Go SDK Overview",
    summary:
      "Use the AuthSec Go SDK to wrap an existing MCP HTTP handler with protected-resource metadata, token validation, and scope-aware tool filtering.",
    highlights: [
      "Package: github.com/authsec-ai/sdk-authsec/packages/go-sdk",
      "Designed for wrapping an existing MCP HTTP handler",
      "Keeps protected-resource metadata and bearer challenges inside the SDK runtime",
    ],
    snippets: [
      {
        id: "go-install",
        label: "Install Go SDK",
        language: "bash",
        code: "go get github.com/authsec-ai/sdk-authsec/packages/go-sdk",
      },
      {
        id: "go-imports",
        label: "Core imports",
        language: "go",
        code: `import (
	authsecsdk "github.com/authsec-ai/sdk-authsec/packages/go-sdk"
)`,
      },
    ],
  },
  {
    key: "mcp-oauth",
    title: "MCP OAuth (Go)",
    summary:
      "Wrap the MCP handler once and let the SDK own protected-resource metadata, bearer challenges, token validation, and scope-gated tool filtering.",
    highlights: [
      "Mount the wrapped handler on the MCP path",
      "Provide issuer, introspection, and resource metadata values",
      "Use StaticPolicy or OverrideToolPolicy for tool-to-scope mapping",
    ],
    snippets: [
      {
        id: "go-wrap",
        label: "Wrap the MCP handler",
        language: "go",
        code: `protected, err := authsecsdk.WrapMCPHTTP(existingMCPHandler, authsecsdk.Config{
	Issuer:                    "${config.VITE_OAUTH_BASE_URL}",
	AuthorizationServer:       "${config.VITE_OAUTH_BASE_URL}",
	JWKSURL:                   "${config.VITE_API_URL}/oauth/jwks",
	IntrospectionURL:          "${config.VITE_API_URL}/oauth/introspect",
	IntrospectionClientID:     "<resource-server-client-id>",
	IntrospectionClientSecret: "<introspection-secret>",
	ResourceURI:               "https://mcp.example.com/mcp",
	ResourceName:              "My MCP Server",
	SupportedScopes:           []string{"tools:read", "tools:write"},
	Policy: authsecsdk.StaticPolicy{
		"tools/list": {AnyOfScopes: []string{"tools:read"}},
	},
})
if err != nil {
	log.Fatal(err)
}`,
      },
      {
        id: "go-mux",
        label: "Mount the wrapped route",
        language: "go",
        code: `mux := http.NewServeMux()
mux.Handle("/mcp", protected)
mux.Handle("/mcp/", protected)

log.Fatal(http.ListenAndServe(":8080", mux))`,
      },
    ],
  },
  {
    key: "rbac",
    title: "Policy (Go)",
    summary:
      "Keep the root SDK generic. Define tool rules with StaticPolicy or extend a base policy with OverrideToolPolicy.",
    highlights: [
      "Generic root package primitives only",
      "No GitHub-specific helpers required for the common path",
      "Map your actual tool names to resource-server scopes",
    ],
    snippets: [
      {
        id: "go-policy",
        label: "Static policy",
        language: "go",
        code: `policy := authsecsdk.StaticPolicy{
	"list_repositories": {AnyOfScopes: []string{"repos:read"}},
	"create_issue":      {AnyOfScopes: []string{"issues:write"}},
}`,
      },
      {
        id: "go-policy-override",
        label: "Override an existing policy",
        language: "go",
        code: `policy := authsecsdk.OverrideToolPolicy(
	authsecsdk.StaticPolicy{
		"tools/list": {AnyOfScopes: []string{"tools:read"}},
	},
	map[string]authsecsdk.ToolRule{
		"delete_issue": {AnyOfScopes: []string{"issues:write"}},
	},
)`,
      },
    ],
  },
  {
    key: "env",
    title: "Environment (Go)",
    summary:
      "Keep AuthSec URLs and the one-time introspection secret outside code so the server can move from local to dev and prod without rewrites.",
    highlights: [
      "Issuer and authorization server should point at AuthSec",
      "Use the resource URI registered in AuthSec",
      "Store the introspection secret in a secure environment variable",
    ],
    snippets: [
      {
        id: "go-env",
        label: "Environment variables",
        language: "bash",
        code: `AUTHSEC_ISSUER="${config.VITE_OAUTH_BASE_URL}"
AUTHSEC_AUTHORIZATION_SERVER="${config.VITE_OAUTH_BASE_URL}"
AUTHSEC_JWKS_URL="${config.VITE_API_URL}/oauth/jwks"
AUTHSEC_INTROSPECTION_URL="${config.VITE_API_URL}/oauth/introspect"
AUTHSEC_INTROSPECTION_CLIENT_ID="resource-server"
AUTHSEC_INTROSPECTION_CLIENT_SECRET="<one-time-secret>"`,
      },
    ],
  },
];

export const SDK_CATALOG: SDKCatalogItem[] = [
  {
    id: "go",
    name: "Go SDK",
    packageName: "github.com/authsec-ai/sdk-authsec/packages/go-sdk",
    runtime: "Go 1.22+",
    version: "4.0.0",
    packagePath: "/Users/pc/Desktop/authnull/sdk-authsec/packages/go-sdk",
    installCommand: "go get github.com/authsec-ai/sdk-authsec/packages/go-sdk",
    docsUrl: "https://docs.authsec.dev/sdk/clients/mcp-servers",
    repoUrl: "https://github.com/authsec-ai/sdk-authsec/tree/main/packages/go-sdk",
    sections: goSections,
  },
  {
    id: "typescript",
    name: "TypeScript SDK",
    packageName: "@authsec/sdk",
    runtime: "Node 18+",
    version: "4.0.0",
    packagePath: "/Users/pc/Desktop/authnull/sdk-authsec/packages/typescript-sdk",
    installCommand: "npm install @authsec/sdk",
    docsUrl: "https://docs.authsec.dev/sdk/clients/mcp-servers",
    repoUrl: "https://github.com/authsec-ai/sdk-authsec/tree/main/packages/typescript-sdk",
    sections: typescriptSections,
  },
  {
    id: "python",
    name: "Python SDK",
    packageName: "authsec-sdk",
    runtime: "Python 3.10.11+",
    version: "4.0.0",
    packagePath: "/Users/pc/Desktop/authnull/sdk-authsec/packages/python-sdk",
    installCommand: "python3 -m pip install authsec-sdk",
    docsUrl: "https://docs.authsec.dev/sdk/clients/mcp-servers",
    repoUrl: "https://github.com/authsec-ai/sdk-authsec/tree/main/packages/python-sdk",
    sections: pythonSections,
  },
];

export const SDK_CATALOG_MAP: Record<SDKId, SDKCatalogItem> = SDK_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<SDKId, SDKCatalogItem>,
);
