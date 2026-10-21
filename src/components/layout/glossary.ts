/**
 * The words the consoles use, in plain language. Shown by the Glossary
 * button in the header, and (the first four AuthSec terms) on Home.
 */
export interface GlossaryTerm {
  term: string;
  meaning: string;
}

export const AUTHSEC_TERMS: GlossaryTerm[] = [
  { term: "MCP server", meaning: "A server that gives AI agents tools to call." },
  { term: "Agent", meaning: "AI software acting for a signed-in person." },
  { term: "Permission", meaning: "Allows one action, such as reading tickets. Written as server:action." },
  { term: "Role", meaning: "A named set of permissions you give out." },
  {
    term: "Service account",
    meaning: "A caller that acts on its own, with no person signed in: a CI pipeline or a backend job.",
  },
  { term: "Voice agent", meaning: "Answers phone calls and uses tools for the caller." },
  { term: "Other client", meaning: "An app that registered itself through OAuth. You approve or revoke it." },
  { term: "End user", meaning: "A person who uses your MCP servers through an agent. They can't open this console." },
  { term: "Team member", meaning: "A person who manages this console." },
  { term: "Identity provider", meaning: "Where people sign in with their company account, such as Okta or Entra ID." },
  { term: "User provisioning", meaning: "Creating and removing people automatically, with SCIM or Directory Sync." },
  { term: "Trusted issuer", meaning: "An outside token issuer whose tokens AuthSec accepts." },
  { term: "Machine token", meaning: "A token a service account gets to call an MCP server." },
  { term: "Workspace", meaning: "Your organization's space in AuthSec. Everything here belongs to one workspace." },
];

export const IGA_TERMS: GlossaryTerm[] = [
  { term: "Account", meaning: "A cloud or code account AuthSec scans: an AWS account, a Kubernetes cluster, a GitHub organization." },
  { term: "Discovery", meaning: "What a scan found: the agents and workloads running in your accounts." },
  { term: "Identity", meaning: "What a workload acts as: an IAM role, a Kubernetes ServiceAccount, a GitHub App." },
  { term: "Resource", meaning: "Something an identity can reach: a bucket, a secret, a repository." },
  { term: "Access graph", meaning: "Read left to right: agent → identity → resource type → resource, with the privilege on each link." },
  { term: "Wildcard permission", meaning: "A permission that matches everything of a kind, such as s3:*. Outlined in red on the graph." },
  { term: "Policy", meaning: "Rules about which access is allowed. Coming soon." },
];

/** Opens the header's Glossary drawer from anywhere (e.g. Home's "Open glossary"). */
export const OPEN_GLOSSARY_EVENT = "authsec:open-glossary";
export function openGlossary() {
  window.dispatchEvent(new Event(OPEN_GLOSSARY_EVENT));
}
