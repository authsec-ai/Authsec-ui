/**
 * The words the consoles use, in plain language, grouped by what they are
 * about. Shown in the Glossary panel (user menu → Glossary).
 *
 * `example` is shown in code style; `where` links to the page the word is
 * used on, so a reader can go from the word to the thing.
 */
export interface GlossaryTerm {
  term: string;
  meaning: string;
  example?: string;
  where?: { label: string; to: string };
}

export interface GlossaryGroup {
  title: string;
  terms: GlossaryTerm[];
}

export type GlossaryProduct = "authsec" | "iga";

export const GLOSSARY: Record<GlossaryProduct, GlossaryGroup[]> = {
  authsec: [
    {
      title: "MCP servers",
      terms: [
        {
          term: "MCP server",
          meaning: "A server that gives AI agents tools to call. AuthSec checks every tool request before the tool runs.",
          example: "support-mcp",
          where: { label: "MCP", to: "/applications" },
        },
        {
          term: "Enforcing",
          meaning: "The MCP server requires a valid AuthSec token. A request without one never reaches the tool.",
          where: { label: "MCP", to: "/applications" },
        },
        {
          term: "Needs setup",
          meaning: "The MCP server is added but not checking tokens yet. Finish setup to start enforcing.",
          where: { label: "MCP", to: "/applications" },
        },
        {
          term: "Tool request",
          meaning: "An agent asking an MCP server to run one tool. AuthSec allows or denies it.",
          example: "support-assistant → support-mcp → search_docs",
        },
      ],
    },
    {
      title: "Access",
      terms: [
        {
          term: "Scope",
          meaning: "What a token allows: one kind of action on one MCP server.",
          example: "support-mcp:read",
          where: { label: "Policies → Scopes", to: "/access/scopes" },
        },
        {
          term: "Role",
          meaning: "A named set of permissions you give to people, agents and service accounts.",
          example: "viewer",
          where: { label: "Policies → Roles", to: "/access/roles" },
        },
        {
          term: "Permission",
          meaning: "One thing a role allows. A role's permissions decide which scopes its holders get.",
          where: { label: "Policies → Roles", to: "/access/roles" },
        },
        {
          term: "Policy",
          meaning: "A sign-in rule, such as which identity providers an MCP server accepts.",
          where: { label: "Policies → Authentication", to: "/policies/authentication" },
        },
      ],
    },
    {
      title: "Callers",
      terms: [
        {
          term: "Agent",
          meaning: "AI software acting for a signed-in person. It never gets more access than that person.",
          example: "claude-desktop",
          where: { label: "Agents", to: "/agents" },
        },
        {
          term: "Voice agent",
          meaning: "Answers phone calls and uses tools for the caller.",
          where: { label: "Agents → Voice agents", to: "/agents?type=voice" },
        },
        {
          term: "Service account",
          meaning: "A caller that acts on its own, with no person signed in: a CI pipeline or a backend job.",
          example: "ci-pipeline",
          where: { label: "Agents → Service accounts", to: "/agents?type=service" },
        },
        {
          term: "Other client",
          meaning: "An app that registered itself through OAuth. You approve or revoke it.",
          where: { label: "Agents → Other clients", to: "/agents?type=other" },
        },
        {
          term: "Machine token",
          meaning: "A token a service account gets to call an MCP server.",
          where: { label: "Logs → Machine tokens", to: "/logs?type=machine-token" },
        },
      ],
    },
    {
      title: "People and sign-in",
      terms: [
        {
          term: "End user",
          meaning: "A person who uses your MCP servers through an agent. They can't open this console.",
          where: { label: "Users → End users", to: "/end-users" },
        },
        {
          term: "Team member",
          meaning: "A person who manages this console.",
          where: { label: "Users → Team", to: "/settings/team" },
        },
        {
          term: "Identity provider",
          meaning: "Where people sign in with their company account.",
          example: "Okta, Microsoft Entra ID",
          where: { label: "Users → Identity providers", to: "/identity-providers" },
        },
        {
          term: "User provisioning",
          meaning: "Creating and removing people automatically, with SCIM or Directory Sync.",
          where: { label: "Settings → User provisioning", to: "/scim-connections" },
        },
        {
          term: "Trusted issuer",
          meaning: "An outside token issuer whose tokens AuthSec accepts.",
          where: { label: "Settings → Trusted issuers", to: "/settings/trusted-issuers" },
        },
      ],
    },
    {
      title: "Workspace",
      terms: [
        {
          term: "Workspace",
          meaning: "Your organization's space in AuthSec. Everything here belongs to one workspace.",
          where: { label: "Settings → Workspace", to: "/settings" },
        },
        {
          term: "Issuer URL",
          meaning: "The address your SDK uses to get and check AuthSec tokens.",
          example: "https://<workspace>.app.authsec.ai",
          where: { label: "Home → Developer details", to: "/dashboard" },
        },
      ],
    },
  ],
  iga: [
    {
      title: "Where AuthSec looks",
      terms: [
        {
          term: "Account",
          meaning: "A cloud or code account AuthSec scans.",
          example: "AWS account, Kubernetes cluster, GitHub organization",
          where: { label: "Accounts", to: "/iga/connections" },
        },
        {
          term: "Discovery",
          meaning: "What a scan found: the agents and workloads running in your accounts.",
          where: { label: "Discovery", to: "/iga/discovery" },
        },
      ],
    },
    {
      title: "What it finds",
      terms: [
        {
          term: "Identity",
          meaning: "What a workload acts as.",
          example: "IAM role, Kubernetes ServiceAccount, GitHub App",
          where: { label: "Discovery", to: "/iga/discovery" },
        },
        {
          term: "Resource",
          meaning: "Something an identity can reach.",
          example: "S3 bucket, secret, repository",
          where: { label: "Discovery", to: "/iga/discovery" },
        },
      ],
    },
    {
      title: "Reading the access graph",
      terms: [
        {
          term: "Access graph",
          meaning: "Read left to right, with the privilege on each link.",
          example: "agent → identity → resource type → resource",
        },
        {
          term: "Wildcard permission",
          meaning: "A permission that matches everything of a kind. Outlined in red on the graph.",
          example: "s3:*",
        },
      ],
    },
    {
      title: "Rules",
      terms: [
        {
          term: "Policy",
          meaning: "Rules about which access is allowed. Coming soon.",
          where: { label: "Policy", to: "/iga/policy" },
        },
      ],
    },
  ],
};

/** Opens the Glossary panel from anywhere (the user menu's "Glossary"). */
export const OPEN_GLOSSARY_EVENT = "authsec:open-glossary";
export function openGlossary() {
  window.dispatchEvent(new Event(OPEN_GLOSSARY_EVENT));
}
