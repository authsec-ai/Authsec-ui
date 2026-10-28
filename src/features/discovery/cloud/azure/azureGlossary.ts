/**
 * Short explanations of the Azure terms Discovery shows, said when a reader
 * hovers the term (AzureTerm, HoverExplain). Where Microsoft defines the term,
 * the text follows Microsoft Learn's definition in plain words (checked
 * 2026-10-23: Entra Agent ID, Foundry, Entra identity platform, Azure RBAC,
 * Azure AI services); AuthSec's own terms (All agents, Found in, the review
 * statuses) say what AuthSec means by them. Each stays under 170 characters.
 * Facts only: nothing here rates or judges.
 */

export const AZURE_GLOSSARY = {
  /* Discovery tabs */
  "Entra Agent ID": "Microsoft Entra's identity and security for AI agents: it gives each agent its own identity, created from a blueprint, with access, governance and logs.",
  "All agents": "Every AI agent AuthSec found in this tenant from all sources, including agents inferred from how identities behave.",
  Identities: "Everything in Microsoft Entra ID that can sign in or be given access: users, groups, apps, service principals, managed identities and agent identities.",
  Resources: "The Azure resources in your connected subscriptions, and the API permissions apps expose, that identities can be given access to.",
  Workloads: "Azure resources that run software and sign in with a managed identity, such as Foundry projects, App Service, Functions, virtual machines and AI Search.",

  /* Entra Agent ID views and columns */
  "Agent identities": "The accounts AI agents use to sign in. Each is a special service principal created from a blueprint, with no credentials of its own.",
  "Agent identity blueprints": "Templates for a kind of agent. A blueprint holds the credentials that get tokens for every agent identity made from it.",
  "Agent identity": "The account an AI agent uses to sign in and reach resources: a special service principal, created from a blueprint, with no credentials of its own.",
  "AI agent": "The account an AI agent uses to sign in and reach resources: a special service principal, created from a blueprint, with no credentials of its own.",
  "Agent identity blueprint": "The template this agent was made from. It holds the credentials that get the agent's tokens. Disabling it stops all its agent identities.",
  "Agent template": "The template this agent was made from. It holds the credentials that get the agent's tokens. Disabling it stops all its agent identities.",
  "Agent identity blueprint principal": "The blueprint's presence in this tenant. It requests tokens and creates agent identities; audit logs show it as the actor.",
  "Agent user": "An optional user account paired with one agent identity, for systems that need a user, such as a mailbox. It has no password.",
  "User account of an AI agent": "An optional user account paired with one agent identity, for systems that need a user, such as a mailbox. It has no password.",
  "Microsoft Foundry": "Azure's platform for building AI agents and apps from models and tools. Foundry creates an agent identity for its agents automatically.",
  Sponsors: "The people accountable for the agent's business purpose. They can disable it but can't change its settings. Microsoft requires one when an agent is created.",
  Owners: "Technical admins of the agent or app. They can change its settings and credentials. Only owners can re-enable or restore an agent.",
  Status: "Active means it can sign in and get tokens. Disabled means it can't.",
  Created: "When it was created in Microsoft Entra ID, and which app or person created it.",
  "Created by": "The app or person Microsoft Entra ID records as creating it. Foundry creates agent identities through a Microsoft service app.",
  "Azure Machine Learning": "The Microsoft service app Entra records as creating this. Microsoft Foundry runs on it and creates agent identities for its agents automatically.",
  "Last sign-in": "The last sign-in Microsoft Entra sign-in logs record. Reading it needs Microsoft Entra ID P1 or P2; without them it can't be shown.",
  "Publisher domain": "The domain shown as the app's publisher when people are asked to consent to it.",

  /* All agents */
  "Found in": "Where AuthSec found this agent: Entra Agent ID, a Foundry project, the Microsoft 365 agent registry, Teams, or inferred from what the identity does.",
  "Entra identity": "The object ID of the Microsoft Entra identity this agent signs in as: its agent identity, or for an inferred agent, its service principal or managed identity.",
  Tenant: "Your organization's own instance of Microsoft Entra ID, holding its users, groups, apps and agents. Identified by a tenant ID.",
  "Last seen": "When AuthSec's latest scan of Azure still found it.",
  "Deleted from Azure": "AuthSec found it before, but Azure no longer has it. The record is kept to show it existed.",
  "Not in latest scan": "The latest scan could not find it. It may have been deleted, or AuthSec could not read that part of Azure.",
  "Active in the last 7 days": "Microsoft records it as used in the last 7 days, but gives no sign-in time.",
  "No sign-in recorded": "Microsoft Entra sign-in logs record no sign-in. It may never have signed in, or reading sign-ins needs Microsoft Entra ID P1 or P2.",
  "Doesn't sign in": "Groups and app registrations don't sign in themselves. An app signs in through its service principal, listed separately.",
  "Foundry agent application": "A Foundry agent published as an agent application, with its own endpoint, agent identity and blueprint. Microsoft is replacing this older model.",
  "Microsoft 365 agent registry": "The list of every agent available to your organization, in the Microsoft 365 admin center. It includes agents with no Entra identity.",
  "Teams app catalog": "Your organization's own Microsoft Teams apps. An app that includes a bot is listed as an agent.",
  "Azure Bot Service": "An Azure resource that hosts a bot and connects it to channels such as Microsoft Teams.",
  "Logic Apps": "An Azure Logic Apps workflow that runs an AI agent loop.",
  "Listed by Microsoft": "Microsoft lists it as an agent in your tenant.",
  "Inferred by AuthSec": "Microsoft doesn't list it as an agent. AuthSec inferred it from the identity's sign-ins, permissions and federation.",

  /* Review statuses (AuthSec) and what was last seen */
  Unregistered: "Found by AuthSec but not yet reviewed by your team.",
  Registered: "Confirmed by your team as a known agent.",
  Quarantined: "Set aside by your team for investigation.",
  Ignored: "Marked by your team as not an agent to track.",
  Running: "Signed in or used in the last 7 days.",
  Stopped: "Seen before, but no sign-in or use in the last 7 days.",
  Gone: "No longer found in Azure.",
  Unknown: "Not enough has been seen to say.",
  Enabled: "It can sign in: the account is enabled in Microsoft Entra ID.",
  Disabled: "It can't sign in or get tokens: the account is disabled in Microsoft Entra ID.",

  /* Identity types */
  "Person (user)": "A person's account in Microsoft Entra ID: a member of your organization or an invited guest.",
  "Team (group)": "A set of users, apps or agents managed together. Access given to a group applies to every member.",
  "App definition (app registration)": "An app's definition in its home tenant: how it gets tokens and which APIs it needs. Its service principals are made from it.",
  "Service principal": "An app's identity in one tenant: what it can do there and who can use it. Shown under Enterprise applications in Entra.",
  "App login (service principal)": "An app's identity in one tenant: what it can do there and who can use it. Shown under Enterprise applications in Entra.",
  "Managed identity": "An identity Azure manages for a resource, so there are no credentials to handle. The resource signs in to other Azure services with it.",
  "Azure-run login (managed identity)": "An identity Azure manages for a resource, so there are no credentials to handle. The resource signs in to other Azure services with it.",

  /* Identity facts */
  "Object ID": "The unique ID of this object in your Microsoft Entra tenant. For an agent identity it equals its application ID.",
  "Account enabled": "Yes means it can sign in and get tokens. No means Microsoft Entra ID blocks it.",
  "Disabled by Microsoft": "Microsoft itself disabled it, for example for abuse. It can't sign in until Microsoft lifts that.",
  "Application (client) ID": "The ID an app uses when it asks Microsoft Entra ID for tokens. The same for the app registration and its service principals.",
  "Microsoft app": "Yes means it's one of Microsoft's own apps, such as a Microsoft 365 or Azure service, not one your organization made.",
  "Last sign-in as itself": "The last time it signed in on its own, with no user, using its own credentials or managed identity.",
  "Last sign-in for a user": "The last time it signed in on behalf of a signed-in user (delegated access).",
  "Who can sign in": "Which accounts can use this app: only your organization, any Microsoft Entra organization, or personal Microsoft accounts too.",
  "Client secrets": "Password-like strings the app can use to prove who it is. Certificates and federated credentials are safer.",
  Certificates: "Key pairs the app can use to prove who it is. Safer than client secrets.",
  "Managed identity type": "System-assigned lives and dies with one resource. User-assigned is a standalone identity that several resources can share.",
  "Azure resource": "The Azure resource this managed identity belongs to.",
  "User principal name": "The name the user signs in with, usually like an email address.",
  Email: "The user's email address, as recorded in Microsoft Entra ID.",
  "User type": "Member: part of your organization. Guest: invited from outside it.",
  "Guest invitation": "Whether the invited guest has accepted the invitation to your organization.",
  Description: "The description recorded in Microsoft Entra ID.",
  Members: "How many users, apps or agents are in this group.",
  "Can hold Microsoft Entra roles": "Yes means this group can be given Microsoft Entra admin roles, which its members then hold.",

  /* Azure resource facts */
  "Resource ID": "The full path that identifies an Azure resource: subscription, resource group, type and name.",
  Subscription: "A billing and access boundary in Azure that holds resource groups. Each subscription trusts one Microsoft Entra tenant.",
  "Resource group": "A container for related resources in a subscription. A role given on it applies to every resource inside.",
  Region: "The Azure location where the resource is deployed and its data is stored.",
  "Foundry resource": "The top-level Azure resource for Microsoft Foundry, where networking, security and model deployments are managed.",
  "Foundry project": "A workspace inside a Foundry resource where a team builds and tests agents. It holds the team's agents, files and evaluations.",
  "Foundry or Azure AI services account": "A Microsoft Foundry resource (or Azure AI services account): where models are deployed and Foundry projects live.",
  "Azure AI Search service": "An Azure service that indexes content for keyword and vector search. Agents use it to look up knowledge.",
  "Storage account": "An Azure Storage account holding blobs, files, queues or tables.",
  "Key Vault": "An Azure service that stores secrets, keys and certificates.",
  Endpoint: "The web address apps and agents call to use this resource.",
  "Pricing tier": "The resource's SKU: the plan that sets its features, limits and price.",
  "Public network access": "Whether the resource accepts traffic from the internet. When off, it's reachable only through private endpoints or allowed networks.",
  "Network rules": "Which networks may reach the resource when public access is on: all networks, or only selected ones.",
  "API key access": "Whether API keys work. When off, every caller must sign in with Microsoft Entra ID instead.",
  "Outbound network restricted": "Yes means the resource can only call out to destinations you've allowed.",
  "Default project": "The project Foundry uses when none is named.",
  "Model deployments": "Models made available in this Foundry resource, each under a name callers use. The deployment type sets where data is processed and billing.",
  Connections: "Saved details a Foundry project uses to reach another service, such as Azure AI Search or Storage, and how it signs in there.",
  "Agent applications": "Agents published from this project as agent applications, each with its own endpoint and agent identity. An older Foundry model.",
  "Agent blueprints that trust it": "Agent identity blueprints whose federated credential trusts this managed identity, so this resource can get their agents' tokens.",
  Projects: "The Foundry projects inside this Foundry resource.",
  "The app's own password or certificate": "The secrets and certificates of its app registration, which can get this service principal's tokens.",

  /* Roles, permissions and who can act as an identity */
  "Directory role": "Permissions to manage Microsoft Entra ID itself (users, groups, apps), such as Global Administrator.",
  "Azure permission": "Access to Azure resources, given on a management group, subscription, resource group or resource. Lower levels inherit it.",
  "Granted to the app itself": "Lets an app act as itself with no user, over all data the permission covers. Only an admin can grant it.",
  "Granted by a person": "Lets an app act for a signed-in user. It can never do more than that user can.",
  "Key Vault access list": "An older, per-vault way to give access to a vault's keys, secrets and certificates. Microsoft recommends Azure roles instead.",
  Inherited: "Granted once on its agent identity blueprint and passed down to this agent identity automatically (inheritable permissions).",
  "Federated credential": "A trust rule that lets an outside or Azure identity get this identity's tokens without a secret, such as a managed identity or GitHub.",
  "Trusted outside sign-in": "A trust rule that lets an outside or Azure identity get this identity's tokens without a secret, such as a managed identity or GitHub.",
  Owner: "Can change this app's settings and add credentials, so it can effectively act as it.",
  "The agent's user account": "The agent's paired user account. It signs in only through its agent identity.",
} as const;

export type AzureGlossaryTerm = keyof typeof AZURE_GLOSSARY;

/** The explanation of a term, or undefined when the glossary has none. */
export function azureExplain(term: string): string | undefined {
  return (AZURE_GLOSSARY as Record<string, string>)[term];
}
